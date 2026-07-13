"""
config.py — Application Configuration
Each agent in the multi-agent pipeline uses a DIFFERENT LLM,
purpose-selected for speed, quality, or specialization.
"""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # ── Database ──────────────────────────────────────────────────────────
    DATABASE_URL: str = "postgresql://postgres:root@123@localhost:5432/healthcare_ai_db"

    # =========================================================================
    # Google OAuth2 (get credentials at https://console.cloud.google.com/)
    # =========================================================================
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_REDIRECT_URI: str = "http://localhost:8000/auth/callback"

    # =========================================================================
    # JWT Token Settings
    # =========================================================================
    JWT_SECRET_KEY: str = "change-this-to-a-long-random-secret-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 10080  # 7 days

    # =========================================================================
    # GROQ API (Free-Tier — https://console.groq.com/keys)
    # One API key, multiple specialized models for each agent role
    # =========================================================================
    GROQ_API_KEY: str = ""

    # ── Agent 1: Supervisor Node ──────────────────────────────────────────
    # Task: Read query → output a routing JSON decision FAST
    # Model: llama3-8b-8192 — smallest, fastest, generous rate limits
    # Why: Simple classification task, no deep reasoning needed
    SUPERVISOR_MODEL: str = "llama-3.1-8b-instant"
    SUPERVISOR_TEMPERATURE: float = 0.0     # fully deterministic routing

    # ── Agent 2: Vitals Analyzer Node ────────────────────────────────────
    # Task: Interpret numerical vitals trends, detect patterns
    # Model: mixtral-8x7b-32768 — best reasoning + 32k context window
    # Why: Handles long vitals histories and does multi-step trend analysis
    VITALS_ANALYZER_MODEL: str = "llama-3.3-70b-versatile"
    VITALS_ANALYZER_TEMPERATURE: float = 0.1

    # ── Agent 3: Generator Node (Final Response) ──────────────────────────
    # Task: Compose final empathetic, safe, medically-aware response
    # Model: llama3-70b-8192 — highest quality on Groq free tier
    # Why: Patient-facing output must be highest quality & safest
    GENERATOR_MODEL: str = "llama-3.3-70b-versatile"
    GENERATOR_TEMPERATURE: float = 0.2      # slight creativity for empathy
    GENERATOR_MAX_TOKENS: int = 1024

    # ── Agent 4: Notification Composer (Care Coordinator) ─────────────────
    # Task: Write concise, clear medication reminder messages
    # Model: gemma2-9b-it — lightweight, fast, excellent instruction-following
    # Why: Short-form text generation — no need for a heavy model
    NOTIFICATION_MODEL: str = "gemma2-9b-it"
    NOTIFICATION_TEMPERATURE: float = 0.3   # some variation in phrasing

    # —— Agent 5: Report Analyzer ——————————————————————————————
    # Task: Read raw PDF text and generate a structured clinical summary
    # Model: llama-3.3-70b-versatile — best quality for long document analysis
    # Why: Medical reports need high comprehension + structured output
    REPORT_ANALYZER_MODEL: str = "llama-3.3-70b-versatile"
    REPORT_ANALYZER_TEMPERATURE: float = 0.1

    # =========================================================================
    # NVIDIA NIM API (Free-Tier — https://build.nvidia.com/)
    # Used exclusively for embeddings (RAG Node)
    # =========================================================================
    NVIDIA_API_KEY: str = ""

    # ── Agent 2: RAG Node Embeddings ──────────────────────────────────────
    # Task: Convert text to vectors for similarity search in ChromaDB/Pinecone
    # Model: nvidia/nv-embedqa-e5-v5 — purpose-built for RAG Q&A retrieval
    # Why: Domain-specific embedding model outperforms generic ones for medical RAG
    # Alternative: baai/bge-m3 (multilingual, also free on NVIDIA NIM)
    NVIDIA_EMBED_MODEL: str = "nvidia/nv-embedqa-e5-v5"

    # Optional: NVIDIA NIM chat model (fallback if Groq is unavailable)
    NVIDIA_CHAT_MODEL: str = "meta/llama-3.1-8b-instruct"

    # =========================================================================
    # Vector Database
    # =========================================================================
    VECTOR_DB_BACKEND: str = "chroma"   # "chroma" (local) or "pinecone" (cloud)

    CHROMA_PERSIST_DIR: str = "./chroma_db"
    CHROMA_COLLECTION_NAME: str = "medical_reports"

    PINECONE_API_KEY: str = ""
    PINECONE_INDEX_NAME: str = "medical-reports"
    PINECONE_ENV: str = "gcp-starter"

    # =========================================================================
    # APScheduler
    # =========================================================================
    SCHEDULER_POLL_INTERVAL_SECONDS: int = 60

    # =========================================================================
    # File Uploads (Medical Reports)
    # =========================================================================
    UPLOAD_DIR: str = "./uploads"

    # =========================================================================
    # Twilio SMS (for medication reminders)
    # =========================================================================
    # Sign up free at: https://www.twilio.com/try-twilio
    # Free trial gives you $15 credit + 1 verified phone number for testing
    TWILIO_ACCOUNT_SID: str = ""
    TWILIO_AUTH_TOKEN: str = ""
    TWILIO_FROM_NUMBER: str = ""  # Your Twilio number e.g. +12025551234
    TWILIO_ENABLED: bool = False   # Set to True once credentials are filled in

    # =========================================================================
    # Application
    # =========================================================================
    APP_NAME: str = "HealthNest"
    APP_VERSION: str = "2.0.0"
    DEBUG: bool = False

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
