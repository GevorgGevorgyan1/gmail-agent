"""Fetch and parse many messages in as few round-trips as possible.

Usage: python gmail.py ["gmail search query"] [limit]
"""

import sys

from auth import get_service
from clean import parse_message

DEFAULT_QUERY = "newer_than:2d -in:chats"
BATCH_SIZE = 50  # Google's cap on sub-requests per batch


def _list_ids(users, query: str, limit: int) -> list[str]:
    """messages.list returns IDs only — page through until we have enough."""
    ids: list[str] = []
    page_token = None

    while len(ids) < limit:
        response = users.messages().list(
            userId="me",
            q=query,
            maxResults=min(500, limit - len(ids)),
            pageToken=page_token,
        ).execute()

        ids.extend(m["id"] for m in response.get("messages", []))
        page_token = response.get("nextPageToken")
        if not page_token:
            break

    return ids[:limit]


def fetch(query: str = DEFAULT_QUERY, limit: int = 50) -> list[dict]:
    """Parsed messages matching `query`, newest first."""
    service = get_service()
    users = service.users()

    ids = _list_ids(users, query, limit)
    if not ids:
        return []

    parsed: list[dict] = []
    failures: list[str] = []

    def collect(request_id, response, exception):
        if exception:
            failures.append(request_id)
        else:
            parsed.append(parse_message(response))

    for start in range(0, len(ids), BATCH_SIZE):
        batch = service.new_batch_http_request(callback=collect)
        for message_id in ids[start:start + BATCH_SIZE]:
            batch.add(
                users.messages().get(userId="me", id=message_id, format="full"),
                request_id=message_id,
            )
        batch.execute()

    if failures:
        print(f"warning: {len(failures)} message(s) failed to fetch", file=sys.stderr)

    # Batch responses arrive out of order; restore the order Gmail gave us.
    rank = {message_id: i for i, message_id in enumerate(ids)}
    parsed.sort(key=lambda m: rank[m["id"]])
    return parsed


def fetch_thread(thread_id: str) -> list[dict]:
    """Every message in one conversation, oldest first — both sides of it."""
    thread = get_service().users().threads().get(
        userId="me", id=thread_id, format="full"
    ).execute()

    return [parse_message(message) for message in thread.get("messages", [])]


def main():
    query = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_QUERY
    limit = int(sys.argv[2]) if len(sys.argv) > 2 else 50

    messages = fetch(query, limit)
    print(f"query={query!r}  ->  {len(messages)} message(s)\n")

    for m in messages:
        marker = ">" if m["direction"] == "sent" else "<"
        clip = "+" if m["attachments"] else " "
        bulk = "!" if m["bulk"] else " "
        print(
            f"{marker}{clip}{bulk} {m['category']:<10} {m['from'][:32]:<32} "
            f"{m['subject'][:42]:<42} {len(m['body']):>6}b"
        )


if __name__ == "__main__":
    main()
