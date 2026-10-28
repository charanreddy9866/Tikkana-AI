import io

import pytest
from fastapi.testclient import TestClient
from reportlab.pdfgen import canvas

from app.documents import DocumentStore, chunk_pages
from app.llm import get_llm
from app.main import app


class FakeLLM:
    """Deterministic stand-in: embeds by keyword presence, echoes the system prompt length."""

    KEYWORDS = ["mahabharata", "telugu", "poet", "weather"]
    last_messages: list[dict] = []

    async def embed(self, texts):
        return [[float(k in t.lower()) + 0.01 for k in self.KEYWORDS] for t in texts]

    async def stream_chat(self, messages):
        FakeLLM.last_messages = messages
        for token in ["Namaskaram", " from", " Tikkana"]:
            yield token


@pytest.fixture
def client():
    app.dependency_overrides[get_llm] = lambda: FakeLLM()
    yield TestClient(app)
    app.dependency_overrides.clear()


def make_pdf(*pages: str) -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf)
    for text in pages:
        c.drawString(72, 720, text)
        c.showPage()
    c.save()
    return buf.getvalue()


def test_health(client):
    assert client.get("/health").json()["status"] == "ok"


def test_chat_streams(client):
    r = client.post("/chat", json={"messages": [{"role": "user", "content": "hi"}]})
    assert r.status_code == 200
    assert r.text == "Namaskaram from Tikkana"


def test_chat_rejects_assistant_last(client):
    r = client.post("/chat", json={"messages": [{"role": "assistant", "content": "hi"}]})
    assert r.status_code == 400


def test_upload_and_grounded_chat(client):
    pdf = make_pdf("Tikkana translated the Mahabharata into Telugu.", "The weather was sunny.")
    r = client.post("/upload", files={"file": ("poet.pdf", pdf, "application/pdf")})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["pages"] == 2 and body["chunks"] == 2

    r = client.post(
        "/chat",
        json={"messages": [{"role": "user", "content": "Who translated the Mahabharata?"}], "doc_id": body["doc_id"]},
    )
    assert r.status_code == 200
    system = FakeLLM.last_messages[0]["content"]
    assert "poet.pdf" in system and "[page 1]" in system


def test_upload_rejects_non_pdf(client):
    r = client.post("/upload", files={"file": ("notes.txt", b"hello", "text/plain")})
    assert r.status_code == 415


def test_unknown_doc(client):
    r = client.post("/chat", json={"messages": [{"role": "user", "content": "x"}], "doc_id": "nope"})
    assert r.status_code == 404


def test_chunking_overlap():
    chunks = chunk_pages(["a" * 2500], size=1000, overlap=150)
    assert [len(c.text) for c in chunks] == [1000, 1000, 800]


def test_store_eviction():
    store = DocumentStore(max_documents=2)
    ids = [store.add("f", 1, chunk_pages(["x"], 10, 0), [[1.0, 0.0]]).id for _ in range(3)]
    assert store.get(ids[0]) is None and store.get(ids[2]) is not None
