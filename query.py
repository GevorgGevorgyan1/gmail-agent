"""Plain English -> Gmail search query.

Usage: python query.py "recruiters who wrote me last week"
"""

import datetime
import json
import os
import re
import sys

from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

MODEL = os.getenv("MODEL_NAME", "gpt-5.4-nano")
client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])

TOOLS = [{
    "type": "function",
    "name": "get_today",
    "description": (
        "Today's date, weekday and timezone. Call this before writing an "
        "after:/before: filter that depends on a named month or a specific day."
    ),
    "parameters": {"type": "object", "properties": {}, "additionalProperties": False},
    "strict": True,
}]

SYSTEM = """Translate the user's request into ONE Gmail search query.

Operators: from: to: subject: is:unread is:read is:starred has:attachment
label: in:sent in:inbox in:anywhere category:promotions|social|updates|forums
newer_than:Nd|Nm|Ny older_than:Nd after:YYYY/MM/DD before:YYYY/MM/DD
Combine with spaces (AND), OR, parentheses, and - to negate.

Rules:
- Prefer relative dates (newer_than:7d) over absolute ones.
- Add a date filter ONLY if the user implies a timeframe.
- Prefer from:@domain.com over guessing keywords for a known sender.
- Output ONLY the query string. No quotes, no explanation.

Examples:
what did I send in July -> in:sent after:2026/07/01 before:2026/08/01
linkedin job alerts -> from:@linkedin.com subject:(job OR jobs OR "job alert")
unread mail from my bank -> is:unread from:(bank OR statement)
anything with a pdf -> has:attachment filename:pdf
what came in yesterday -> newer_than:1d"""


OPERATORS = {
    "after", "before", "bcc", "category", "cc", "deliveredto", "filename", "from",
    "has", "in", "is", "label", "larger", "list", "newer_than", "older_than",
    "rfc822msgid", "size", "smaller", "subject", "to",
}

# DATE_OPERATORS = ("newer_than:", "older_than:", "after:", "before:")

OPERATOR_TOKEN = re.compile(r"\b([a-z_]+):", re.I)


def normalize(query: str) -> str:
    """Add the invariants in code — a model retyping boilerplate eventually mistypes it."""
    query = query.strip().strip("`\"'")

    unknown = {m.group(1).lower() for m in OPERATOR_TOKEN.finditer(query)} - OPERATORS
    if unknown:
        raise ValueError(f"model used unknown operator(s): {', '.join(sorted(unknown))}")

    # # Only default a timeframe when the model set none; otherwise the two contradict.
    # if not any(op in query for op in DATE_OPERATORS):
    #     query += " newer_than:7d"
    # if "in:chats" not in query:
    #     query += " -in:chats"

    return query.strip()


def get_today() -> dict:
    now = datetime.datetime.now().astimezone()
    return {
        "date": now.strftime("%Y/%m/%d"),
        "weekday": now.strftime("%A"),
        "timezone": now.strftime("%Z"),
    }


def to_query(text: str, history: list[dict] | None = None) -> str:
    """Ask the model for a query, serving any tool calls it makes along the way.

    Earlier turns come along so that "what about last week instead" reads as a
    change to the previous search, not as a search for the word "instead".
    """
    conversation = []

    if history:
        earlier = "\n".join(f"{turn['request']} -> {turn['query']}" for turn in history[-3:])
        conversation.append({
            "role": "user",
            "content": (
                f"Earlier in this conversation:\n{earlier}\n\n"
                "Use these only to resolve references in the request that follows."
            ),
        })

    conversation.append({"role": "user", "content": text})

    for _ in range(4):
        response = client.responses.create(
            model=MODEL,
            instructions=SYSTEM,
            input=conversation,
            tools=TOOLS,
        )

        calls = [item for item in response.output if item.type == "function_call"]
        if not calls:
            return normalize(response.output_text)

        conversation += response.output
        for call in calls:
            conversation.append({
                "type": "function_call_output",
                "call_id": call.call_id,
                "output": json.dumps(get_today()),
            })

    raise RuntimeError("model kept calling tools without producing a query")


def main():
    if len(sys.argv) < 2:
        sys.exit('usage: python query.py "what you are looking for"')

    request = " ".join(sys.argv[1:])
    print(f"{request!r}\n  -> {to_query(request)}")


if __name__ == "__main__":
    main()
