"""What was said earlier, per conversation.

In process and nothing more: a restart forgets everything, which is the right
default for mail. Persistence is a decision to make deliberately, not by accident.
"""

MAX_TURNS = 6

_conversations: dict[str, list[dict]] = {}


def history(session_id: str) -> list[dict]:
    return _conversations.get(session_id, [])


def remember(session_id: str, request: str, query: str, answer: str) -> None:
    turns = _conversations.setdefault(session_id, [])
    turns.append({"request": request, "query": query, "answer": answer})
    del turns[:-MAX_TURNS]


def forget(session_id: str) -> None:
    _conversations.pop(session_id, None)
