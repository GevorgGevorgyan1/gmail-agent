"""Smoke test: print From/Subject for the 10 most recent messages."""

from auth import get_service


def header(message, name):
    for h in message["payload"]["headers"]:
        if h["name"].lower() == name.lower():
            return h["value"]
    return "(none)"


def main():
    service = get_service()
    users = service.users()

    profile = users.getProfile(userId="me").execute()
    print(f"Mailbox: {profile['emailAddress']}  ({profile['messagesTotal']} messages)\n")

    listing = users.messages().list(userId="me", maxResults=10).execute()
    for item in listing.get("messages", []):
        msg = users.messages().get(
            userId="me",
            id=item["id"],
            format="metadata",
            metadataHeaders=["From", "Subject"],
        ).execute()
        print(f"{item['id']}: {header(msg, 'From')[:45]:<45}  {header(msg, 'Subject')[:60]}")


if __name__ == "__main__":
    main()
