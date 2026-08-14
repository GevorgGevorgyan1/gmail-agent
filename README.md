# Gmail Agent
> **Status: in development.**

Ask questions about your Gmail(currently) in plain language and get a written answer,
with links back to the actual threads.

## How it works

A LangChain agent (`agent.py`) lets the model search your mailbox itself
via Gmail search syntax, judge what came back, and search again if the first
attempt was too narrow — then answer from the messages it found. `server.py`
puts a FastAPI front on it; `web/` is the React UI. Access is **read-only**:
the OAuth scope is `gmail.readonly`, so nothing can be sent, deleted or changed.

## Setup

1. Create a Google Cloud OAuth client (Desktop app), enable the Gmail API,
   and save the client secret as `credentials.json` in the project root.
2. Put `OPENAI_API_KEY=...` in `.env` (optionally `MODEL_NAME=...`).
3. Install and build:

   ```bash
   python -m venv .venv && .venv/bin/pip install -r requirements.txt
   cd web && npm install && npm run build
   ```

4. Run `python server.py` and open http://localhost:8000. The first run opens
   a browser for Google consent and caches the token in `token.json`.

For frontend work, `npm run dev` in `web/` serves the UI and proxies `/api`
to the server.

## Command line

```bash
python agent.py "did I ever write to arman"   # the agent loop
python gmail.py "from:stripe.com" 20          # raw fetch and parse
```

## Layout

| File | Role |
|---|---|
| `agent.py` | the LangChain agent — builds it, runs it, reads the transcript back |
| `tools.py` | what the model can do: search, read a thread, shape the results |
| `prompts.py` | the system prompt |
| `config.py` | model name, limits, budgets, and the `.env` load |
| `gmail.py` / `clean.py` | batched fetch, HTML stripping, parsing |
| `sessions.py` | per-conversation history, in process |
| `server.py` | HTTP API and static hosting |
| `web/` | React + Vite + Tailwind UI |
