"""The loop: the model searches your mail itself, then answers from what it found.

Usage: python agent.py "did I ever write to arman"
"""

import json
import os
import sys

from langchain.agents import create_agent
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from langchain_openai import ChatOpenAI
from langgraph.errors import GraphRecursionError

from config import MAX_ROUNDS, MODEL
from prompts import SYSTEM
from tools import TOOLS

client = ChatOpenAI(
    model=MODEL,
    api_key=os.environ["OPENAI_API_KEY"],
    use_responses_api=True,
)

# Built once at import, not per question: it compiles a graph, and the questions
# differ only in the messages handed to it.
AGENT = create_agent(client, TOOLS, system_prompt=SYSTEM)


def _replay(history: list[dict]) -> list:
    """Earlier turns as plain conversation — what was asked, what was answered."""
    turns = []
    for turn in history:
        turns.append(HumanMessage(turn["request"]))
        turns.append(AIMessage(turn["answer"]))
    return turns


def _searches(messages: list) -> list[dict]:
    """What the agent actually searched, read back out of the tool results.

    The loop belongs to LangChain now, so the searches are no longer collected as
    they happen — they are recovered afterwards from the transcript it returns.
    """
    found = []
    for message in messages:
        if not isinstance(message, ToolMessage) or message.name != "search_emails":
            continue
        try:
            result = json.loads(message.content)
        except (TypeError, ValueError):
            continue
        # A query the normalizer rejected never reached Gmail; it isn't a search.
        if "error" not in result:
            found.append({"query": result["query"], "count": result["count"]})
    return found


def ask(request: str, history: list[dict] | None = None) -> dict:
    conversation = _replay(history or []) + [HumanMessage(request)]

    try:
        # One superstep per node, so a round of "think, then call tools" costs two.
        state = AGENT.invoke(
            {"messages": conversation},
            config={"recursion_limit": MAX_ROUNDS * 2},
        )
    except GraphRecursionError:
        # Same surrender as before, but the transcript is gone with the exception,
        # so there are no searches left to report.
        return {
            "text": "I searched several times and could not settle on an answer.",
            "searches": [],
            "count": 0,
        }

    searches = _searches(state["messages"])
    return {
        "text": state["messages"][-1].text.strip(),
        "searches": searches,
        "count": sum(s["count"] for s in searches),
    }


def main():
    if len(sys.argv) < 2:
        sys.exit('usage: python agent.py "did I ever write to arman"')

    result = ask(" ".join(sys.argv[1:]))
    for search in result["searches"]:
        print(f"searched: {search['query']}  ->  {search['count']}")
    print()
    print(result["text"])


if __name__ == "__main__":
    main()
