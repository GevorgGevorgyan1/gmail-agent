"""What the model can do to a mailbox, and how the results are shaped for it.

Each capability is a plain function — callable and testable on its own — with a
thin LangChain face below it whose docstring is the description the model reads.
"""

import json
import re
from email.utils import parsedate_to_datetime

from langchain_core.tools import tool

from config import PER_MESSAGE, SEARCH_LIMIT, THREAD_BUDGET, THREAD_URL
from gmail import fetch, fetch_thread

# Every operator Gmail actually understands. A query using anything else is the
# model inventing syntax, and Gmail would silently treat it as a keyword search.
OPERATORS = {
    "after", "before", "bcc", "category", "cc", "deliveredto", "filename", "from",
    "has", "in", "is", "label", "larger", "list", "newer_than", "older_than",
    "rfc822msgid", "size", "smaller", "subject", "to",
}

OPERATOR_TOKEN = re.compile(r"\b([a-z_]+):", re.I)


def _when(date_header: str) -> str:
    """The date as a person reads it — the raw header is a format, not a fact."""
    try:
        return parsedate_to_datetime(date_header).strftime("%B %-d, %Y at %-I:%M %p")
    except (TypeError, ValueError):
        return date_header


def _for_model(message: dict) -> dict:
    """A message as the model needs it: addressed, dated, linked, and trimmed."""
    return {
        "thread_id": message["thread_id"],
        "from": message["from"],
        "to": message["to"],
        "direction": "sent by this person" if message["direction"] == "sent" else "received",
        "date": _when(message["date"]),
        "subject": message["subject"] or "(no subject)",
        # Built here, not by the model: a URL assembled token by token is a URL
        # that eventually points at the wrong thread, or at nothing.
        "link": THREAD_URL.format(thread_id=message["thread_id"]),
        "attachments": [a["filename"] for a in message["attachments"]],
        "body": message["body"][:PER_MESSAGE],
    }


def normalize(query: str) -> str:
    """Add the invariants in code — a model retyping boilerplate eventually mistypes it."""
    query = query.strip().strip("`\"'")

    unknown = {m.group(1).lower() for m in OPERATOR_TOKEN.finditer(query)} - OPERATORS
    if unknown:
        raise ValueError(f"model used unknown operator(s): {', '.join(sorted(unknown))}")

    return query.strip()


def search_emails(query: str, limit: int = SEARCH_LIMIT) -> dict:
    try:
        query = normalize(query)
    except ValueError as error:
        # Handed back rather than raised: the model wrote it, so the model can fix it.
        return {"error": str(error)}

    messages = fetch(query, max(1, min(limit, SEARCH_LIMIT)))
    return {
        "query": query,
        "count": len(messages),
        "emails": [_for_model(m) for m in messages],
    }


def read_thread(thread_id: str) -> dict:
    try:
        messages = fetch_thread(thread_id)
    except Exception as error:
        return {"error": f"could not read thread {thread_id}: {error}"}

    if not messages:
        return {"thread_id": thread_id, "count": 0, "messages": []}

    # Spend the budget newest-first: the tail of a conversation is what a question
    # about it usually means, and the opening message is the most expendable.
    remaining = THREAD_BUDGET
    bodies = {}
    for message in reversed(messages):
        bodies[message["id"]] = message["body"][:remaining]
        remaining -= len(bodies[message["id"]])

    return {
        "thread_id": thread_id,
        "count": len(messages),
        "link": THREAD_URL.format(thread_id=thread_id),
        "messages": [
            {
                "from": m["from"],
                "to": m["to"],
                "direction": "sent by this person" if m["direction"] == "sent" else "received",
                "date": _when(m["date"]),
                "subject": m["subject"] or "(no subject)",
                "attachments": [a["filename"] for a in m["attachments"]],
                "body": bodies[m["id"]],
                "truncated": len(bodies[m["id"]]) < len(m["body"]),
            }
            for m in messages
        ],
    }


@tool("search_emails")
def _search_tool(query: str, limit: int = SEARCH_LIMIT) -> str:
    """Search the user's Gmail and return the matching messages.

    query uses Gmail search syntax: from: to: subject: is:unread is:starred
    has:attachment filename: label: in:sent in:inbox in:anywhere
    category:promotions|social|updates|forums newer_than:Nd|Nm|Ny older_than:Nd
    after:YYYY/MM/DD before:YYYY/MM/DD. Combine with spaces (AND), OR,
    parentheses, and - to negate. Prefer from:@domain.com over guessing keywords.
    limit is the maximum number of messages to return, 1-25.
    """
    return json.dumps(search_emails(query, limit), ensure_ascii=False)


@tool("read_thread")
def _read_thread_tool(thread_id: str) -> str:
    """Read a whole conversation: every message in it, oldest first, both the
    ones this person sent and the ones they received, with fuller text than
    search returns. Use it when the question is about what was actually said
    or whether someone replied — not to confirm an email exists.

    thread_id is the thread_id from a search result.
    """
    return json.dumps(read_thread(thread_id), ensure_ascii=False)


TOOLS = [_search_tool, _read_thread_tool]
