"""Thin wrapper around the OpenAI client so routers stay simple and tests can swap it."""

from collections.abc import AsyncIterator

from fastapi import HTTPException
from openai import AsyncOpenAI

from .config import get_settings

SYSTEM_PROMPT = (
    "You are Tikkana, a thoughtful AI assistant named after the 13th-century Telugu poet "
    "Tikkana Somayaji. Be clear, warm and concise. Use Markdown (headings, lists, code blocks) "
    "when it helps readability. If the user writes in Telugu, reply in Telugu."
)


class LLMClient:
    def __init__(self) -> None:
        settings = get_settings()
        self._settings = settings
        self._client = AsyncOpenAI(api_key=settings.openai_api_key) if settings.openai_api_key else None

    def _require_client(self) -> AsyncOpenAI:
        if self._client is None:
            raise HTTPException(status_code=503, detail="OPENAI_API_KEY is not configured on the server.")
        return self._client

    async def embed(self, texts: list[str]) -> list[list[float]]:
        client = self._require_client()
        vectors: list[list[float]] = []
        for i in range(0, len(texts), 96):  # batch to stay under request limits
            resp = await client.embeddings.create(model=self._settings.embedding_model, input=texts[i : i + 96])
            vectors.extend(d.embedding for d in resp.data)
        return vectors

    async def stream_chat(self, messages: list[dict]) -> AsyncIterator[str]:
        client = self._require_client()
        stream = await client.chat.completions.create(
            model=self._settings.chat_model,
            messages=messages,
            temperature=0.4,
            stream=True,
        )
        async for event in stream:
            if event.choices and event.choices[0].delta.content:
                yield event.choices[0].delta.content


_llm: LLMClient | None = None


def get_llm() -> LLMClient:
    global _llm
    if _llm is None:
        _llm = LLMClient()
    return _llm
