from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from ..config import Settings, get_settings
from ..documents import DocumentStore, get_store
from ..llm import SYSTEM_PROMPT, LLMClient, get_llm

router = APIRouter(prefix="/chat", tags=["chat"])


class Message(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=20_000)


class ChatRequest(BaseModel):
    messages: list[Message] = Field(min_length=1)
    doc_id: str | None = None


@router.post("")
async def chat(
    req: ChatRequest,
    settings: Settings = Depends(get_settings),
    store: DocumentStore = Depends(get_store),
    llm: LLMClient = Depends(get_llm),
) -> StreamingResponse:
    if req.messages[-1].role != "user":
        raise HTTPException(status_code=400, detail="The last message must come from the user.")

    system = SYSTEM_PROMPT
    if req.doc_id:
        doc = store.get(req.doc_id)
        if doc is None:
            raise HTTPException(status_code=404, detail="Document expired. Please upload it again.")
        [query_vec] = await llm.embed([req.messages[-1].content])
        hits = store.search(doc, query_vec, settings.top_k)
        context = "\n\n".join(f"[page {c.page}] {c.text}" for c in hits)
        system += (
            f"\n\nThe user attached '{doc.filename}' ({doc.pages} pages). Answer using the excerpts below, "
            "cite pages like (p. 3), and say so plainly if the excerpts don't contain the answer.\n\n"
            f"<excerpts>\n{context}\n</excerpts>"
        )

    history = [m.model_dump() for m in req.messages[-settings.max_history :]]
    messages = [{"role": "system", "content": system}, *history]

    # Fail fast (e.g. missing API key) before the 200 streaming response starts.
    stream = llm.stream_chat(messages)
    try:
        first = await anext(stream)
    except StopAsyncIteration:
        first = ""

    async def body():
        yield first
        async for token in stream:
            yield token

    return StreamingResponse(body(), media_type="text/plain; charset=utf-8", headers={"Cache-Control": "no-cache"})
