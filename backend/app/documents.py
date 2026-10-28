"""PDF text extraction, chunking, and an in-memory vector store for retrieval."""

import io
import uuid
from collections import OrderedDict
from dataclasses import dataclass, field

import numpy as np
import pdfplumber
from pypdf import PdfReader


@dataclass
class Chunk:
    text: str
    page: int


@dataclass
class Document:
    id: str
    filename: str
    pages: int
    chunks: list[Chunk]
    embeddings: np.ndarray = field(repr=False)


def extract_pages(pdf_bytes: bytes) -> list[str]:
    """Return text per page. Uses pdfplumber, falls back to pypdf for odd files."""
    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            return [page.extract_text() or "" for page in pdf.pages]
    except Exception:
        reader = PdfReader(io.BytesIO(pdf_bytes))
        return [page.extract_text() or "" for page in reader.pages]


def chunk_pages(pages: list[str], size: int, overlap: int) -> list[Chunk]:
    chunks: list[Chunk] = []
    step = max(size - overlap, 1)
    for page_no, raw in enumerate(pages, start=1):
        text = " ".join(raw.split())
        for start in range(0, len(text), step):
            piece = text[start : start + size]
            if piece.strip():
                chunks.append(Chunk(text=piece, page=page_no))
            if start + size >= len(text):
                break
    return chunks


class DocumentStore:
    """Bounded LRU store; good enough for a single-instance demo deployment."""

    def __init__(self, max_documents: int) -> None:
        self._docs: OrderedDict[str, Document] = OrderedDict()
        self._max = max_documents

    def add(self, filename: str, pages: int, chunks: list[Chunk], vectors: list[list[float]]) -> Document:
        matrix = np.asarray(vectors, dtype=np.float32)
        matrix /= np.linalg.norm(matrix, axis=1, keepdims=True) + 1e-12
        doc = Document(id=uuid.uuid4().hex, filename=filename, pages=pages, chunks=chunks, embeddings=matrix)
        self._docs[doc.id] = doc
        while len(self._docs) > self._max:
            self._docs.popitem(last=False)
        return doc

    def get(self, doc_id: str) -> Document | None:
        doc = self._docs.get(doc_id)
        if doc:
            self._docs.move_to_end(doc_id)
        return doc

    @staticmethod
    def search(doc: Document, query_vector: list[float], top_k: int) -> list[Chunk]:
        q = np.asarray(query_vector, dtype=np.float32)
        q /= np.linalg.norm(q) + 1e-12
        scores = doc.embeddings @ q
        best = np.argsort(scores)[::-1][:top_k]
        return [doc.chunks[i] for i in sorted(best, key=lambda i: (doc.chunks[i].page, i))]


_store: DocumentStore | None = None


def get_store() -> DocumentStore:
    global _store
    if _store is None:
        from .config import get_settings

        _store = DocumentStore(get_settings().max_documents)
    return _store
