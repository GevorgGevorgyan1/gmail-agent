"""Turn a raw Gmail message into the text a human actually wrote.

Usage: python clean.py <message_id>   (shows before/after sizes and the result)
"""

import base64
import re
import sys

from bs4 import BeautifulSoup

# Lines that mark the start of a quoted reply chain — everything after is history.
# Matched structurally rather than by keyword: clients localize the wording, but the
# shape ("<date> <time>, Name <addr>:") survives translation.
QUOTE_MARKERS = [
    re.compile(r"<[^@\s>]+@[^@\s>]+>\s*:\s*$"),
    re.compile(r"^.{0,200}\b\d{1,2}:\d{2}\b.*<[^@\s>]+@[^@\s>]+>.*:\s*$"),
    re.compile(r"\bwrote:\s*$", re.I),
    re.compile(r"^-{2,}\s*(Original Message|Forwarded message)\s*-{2,}", re.I),
    re.compile(r"^\s*(From|De|Von):\s.+@", re.I),
    re.compile(r"^_{10,}$"),
]

SIGNATURE = re.compile(r"^--\s*$")

# A bare "--" only means "signature follows" near the end; mid-email it's a divider.
SIGNATURE_TAIL = 15


def _decode(data: str) -> str:
    return base64.urlsafe_b64decode(data).decode("utf-8", errors="replace")


def _find(part: dict, mime: str) -> str | None:
    """Depth-first search for the first part of `mime` that carries a body."""
    if part.get("mimeType") == mime and part.get("body", {}).get("data"):
        return part["body"]["data"]
    for child in part.get("parts", []):
        if hit := _find(child, mime):
            return hit
    return None


def html_to_text(html: str) -> str:
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "head", "title"]):
        tag.decompose()
    return soup.get_text(separator="\n")


def strip_quotes(text: str) -> str:
    """Drop quoted history and signature blocks, keeping only the new content."""
    lines = text.splitlines()
    kept = []
    for i, line in enumerate(lines):
        if any(m.search(line) for m in QUOTE_MARKERS):
            break
        if SIGNATURE.match(line) and len(lines) - i <= SIGNATURE_TAIL:
            break
        if line.lstrip().startswith(">"):
            continue
        kept.append(line)
    return "\n".join(kept)


def collapse(text: str) -> str:
    """Normalize the whitespace soup that HTML extraction leaves behind."""
    text = text.replace("‌", "").replace("\xa0", " ")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r" *\n *", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def extract_text(message: dict) -> str:
    payload = message["payload"]

    if data := _find(payload, "text/plain"):
        body = _decode(data)
    elif data := _find(payload, "text/html"):
        body = html_to_text(_decode(data))
    else:
        return ""

    return collapse(strip_quotes(body))


CATEGORY_LABELS = {
    "CATEGORY_PROMOTIONS": "promotions",
    "CATEGORY_SOCIAL": "social",
    "CATEGORY_UPDATES": "updates",
    "CATEGORY_FORUMS": "forums",
}


def _category(labels: list) -> str:
    """Gmail's own tab classification; 'primary' when it declined to sort it."""
    for label in labels:
        if label in CATEGORY_LABELS:
            return CATEGORY_LABELS[label]
    return "primary"


def _headers(payload: dict) -> dict:
    return {h["name"].lower(): h["value"] for h in payload.get("headers", [])}


def _attachments(part: dict, found: list | None = None) -> list:
    """Every part carrying a filename — attachments and inline images alike."""
    found = [] if found is None else found
    if part.get("filename"):
        body = part.get("body", {})
        found.append({
            "filename": part["filename"],
            "mime_type": part.get("mimeType"),
            "size": body.get("size", 0),
            "attachment_id": body.get("attachmentId"),
            "inline": bool(part.get("headers") and any(
                h["name"].lower() == "content-id" for h in part["headers"]
            )),
        })
    for child in part.get("parts", []):
        _attachments(child, found)
    return found


def parse_message(message: dict) -> dict:
    """The structured view of a message: who, when, what, and what came with it."""
    payload = message["payload"]
    head = _headers(payload)
    labels = message.get("labelIds", [])
    category = _category(labels)

    return {
        "id": message["id"],
        "thread_id": message["threadId"],
        "from": head.get("from", ""),
        "to": head.get("to", ""),
        "subject": head.get("subject", ""),
        "date": head.get("date", ""),
        "direction": "sent" if "SENT" in labels else "received",
        "labels": labels,
        "category": category,
        # Gmail's Updates tab is a catch-all for transactional mail, so it says
        # nothing about noise. An unsubscribe route does: only bulk senders offer one.
        "bulk": "list-unsubscribe" in head,
        "attachments": _attachments(payload),
        "body": extract_text(message),
    }


def main():
    from auth import get_service

    users = get_service().users()
    message_id = sys.argv[1] if len(sys.argv) > 1 else \
        users.messages().list(userId="me", maxResults=1).execute()["messages"][0]["id"]

    msg = users.messages().get(userId="me", id=message_id, format="full").execute()
    parsed = parse_message(msg)

    print(f"[{parsed['direction']}]  {parsed['date']}")
    print(f"From:    {parsed['from']}")
    print(f"To:      {parsed['to']}")
    print(f"Subject: {parsed['subject']}")
    for att in parsed["attachments"]:
        tag = "inline" if att["inline"] else "attached"
        print(f"  [{tag}] {att['filename']}  {att['mime_type']}  {att['size']}b")

    print(f"\n--- body ({len(parsed['body'])} chars) ---")
    print(parsed["body"])


if __name__ == "__main__":
    main()
