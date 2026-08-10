"""HTTP front for the inbox digest: answers the web UI's questions and serves it.

Usage: python server.py            (http://localhost:8000)
"""

from pathlib import Path

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from auth import get_service
from digest import digest

DIST = Path(__file__).parent / "web" / "dist"

app = FastAPI(title="Gmail Assistant")


class Ask(BaseModel):
    request: str = Field(min_length=1, max_length=500)


@app.post("/api/ask")
def ask(body: Ask) -> dict:
    """One question in, one written answer plus the mail it came from out.

    Defined with `def`, not `async def`: digest() blocks for seconds on Gmail and
    the model, and FastAPI gives sync handlers a worker thread instead of letting
    them stall the event loop for everyone else.
    """
    try:
        result = digest(body.request.strip())
    except Exception as error:
        raise HTTPException(status_code=502, detail=str(error)) from error

    # Markdown and nothing else: the links live inside the prose now, so there is
    # no second payload of card data for the UI to lay out.
    return {"query": result["query"], "count": result["count"], "text": result["text"]}


@app.get("/api/account")
def account() -> dict:
    """Which mailbox the answers are coming from — the UI shouldn't have to guess."""
    try:
        profile = get_service().users().getProfile(userId="me").execute()
    except Exception as error:
        raise HTTPException(status_code=502, detail=str(error)) from error

    return {"email": profile["emailAddress"]}


# Only mounted once the frontend has been built; in development Vite serves it
# instead and proxies /api back here.
if DIST.is_dir():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{path:path}")
    def index(path: str) -> FileResponse:
        return FileResponse(DIST / "index.html")


def main():
    uvicorn.run("server:app", host="127.0.0.1", port=8000, reload=True)


if __name__ == "__main__":
    main()
