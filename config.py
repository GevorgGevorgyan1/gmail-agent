"""Every knob in one place, so tuning one doesn't mean reading the agent.

Imported for its side effect as much as its values: this is where .env is read,
so anything that needs OPENAI_API_KEY should import config first.
"""

import os

from dotenv import load_dotenv

load_dotenv()

MODEL = os.getenv("MODEL_NAME", "gpt-5.4-nano")

# What the model may spend per question.
MAX_ROUNDS = 6         # tool rounds before we stop and take whatever prose we have
SEARCH_LIMIT = 25      # emails per search; every one of them lands in the context
PER_MESSAGE = 1500     # chars of body per search result
THREAD_BUDGET = 8000   # chars of body per thread, newest messages served first

# Deep link back to a conversation in the Gmail web client.
THREAD_URL = "https://mail.google.com/mail/u/0/#all/{thread_id}"
