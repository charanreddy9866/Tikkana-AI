"""Runtime configuration, read once from environment variables."""

import os
from functools import lru_cache

from dotenv import load_dotenv

load_dotenv()


class Settings:
    def __init__(self) -> None:
        self.openai_api_key: str | None = os.getenv("OPENAI_API_KEY") or None
        self.chat_model: str = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
        self.embedding_model: str = os.getenv("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small")
        self.allowed_origins: list[str] = [
            o.strip()
            for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
            if o.strip()
        ]
        self.max_upload_mb: int = int(os.getenv("MAX_UPLOAD_MB", "10"))
        self.max_documents: int = int(os.getenv("MAX_DOCUMENTS", "50"))
        self.chunk_size: int = 1000
        self.chunk_overlap: int = 150
        self.top_k: int = 4
        self.max_history: int = 20


@lru_cache
def get_settings() -> Settings:
    return Settings()
