from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel

from ..config import Settings, get_settings
from ..documents import DocumentStore, chunk_pages, extract_pages, get_store
from ..llm import LLMClient, get_llm

router = APIRouter(prefix="/upload", tags=["upload"])


class UploadResponse(BaseModel):
    doc_id: str
    filename: str
    pages: int
    chunks: int
    characters: int


@router.post("", response_model=UploadResponse)
async def upload_pdf(
    file: UploadFile = File(...),
    settings: Settings = Depends(get_settings),
    store: DocumentStore = Depends(get_store),
    llm: LLMClient = Depends(get_llm),
) -> UploadResponse:
    filename = file.filename or "document.pdf"
    if file.content_type != "application/pdf" and not filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=415, detail="Only PDF files are supported.")

    data = await file.read()
    if len(data) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(status_code=413, detail=f"File is larger than {settings.max_upload_mb} MB.")

    try:
        pages = extract_pages(data)
    except Exception as exc:
        raise HTTPException(status_code=422, detail="Could not read this PDF.") from exc

    chunks = chunk_pages(pages, settings.chunk_size, settings.chunk_overlap)
    if not chunks:
        raise HTTPException(status_code=422, detail="No selectable text found (scanned PDFs aren't supported yet).")

    vectors = await llm.embed([c.text for c in chunks])
    doc = store.add(filename, len(pages), chunks, vectors)

    return UploadResponse(
        doc_id=doc.id,
        filename=filename,
        pages=len(pages),
        chunks=len(chunks),
        characters=sum(len(p) for p in pages),
    )
