from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .routers import chat, upload

settings = get_settings()

app = FastAPI(title="Tikkana AI", version="1.0.0", description="Chat + chat-with-your-PDF API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

app.include_router(chat.router)
app.include_router(upload.router)


@app.get("/health", tags=["meta"])
def health() -> dict:
    return {"status": "ok", "model": settings.chat_model, "llm_configured": bool(settings.openai_api_key)}
