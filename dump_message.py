"""Look at one raw message: its MIME part tree and a peek at the text body.

Usage: python dump_message.py [message_id]   (defaults to the newest message)
"""

import base64
import sys

from auth import get_service


def walk(part, depth=0):
    body = part.get("body", {})
    marker = f" file={part['filename']}" if part.get("filename") else ""
    print(f"{'  ' * depth}{part.get('mimeType')}  {body.get('size', 0)}b{marker}")
    for child in part.get("parts", []):
        walk(child, depth + 1)


def find(part, mime):
    if part.get("mimeType") == mime and part.get("body", {}).get("data"):
        return part["body"]["data"]
    for child in part.get("parts", []):
        if hit := find(child, mime):
            return hit
    return None


def main():
    users = get_service().users()

    if len(sys.argv) > 1:
        message_id = sys.argv[1]
    else:
        message_id = users.messages().list(userId="me", maxResults=1).execute()["messages"][0]["id"]

    msg = users.messages().get(userId="me", id=message_id, format="full").execute()

    print(f"id={message_id}  thread={msg['threadId']}  labels={msg.get('labelIds')}\n")
    print("--- headers ---")
    for h in msg["payload"]["headers"]:
        if h["name"].lower() in {"from", "to", "subject", "date"}:
            print(f"{h['name']}: {h['value']}")

    print("\n--- part tree ---")
    walk(msg["payload"])

    for mime in ("text/plain", "text/html"):
        if data := find(msg["payload"], mime):
            text = base64.urlsafe_b64decode(data).decode("utf-8", errors="replace")
            print(f"\n--- {mime} ({len(text)} chars, first 500) ---")
            print(text[:500])


if __name__ == "__main__":
    main()
