"""
setup_pinecone.py — One-Time Pinecone Index Setup Script
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Creates the Pinecone index 'healthcarechatbot' with:
  - dimension = 1024  (matches nvidia/nv-embedqa-e5-v5 output size)
  - metric    = cosine (best for semantic/RAG similarity search)
  - spec      = serverless (free-tier — no pod cost)

Run ONCE before starting the FastAPI server:
    python setup_pinecone.py

If the index already exists, the script safely skips creation.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

import logging
import sys
import time

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

# ── Embedding dimension for nvidia/nv-embedqa-e5-v5 ──────────────────────────
EMBEDDING_DIM = 1024
METRIC = "cosine"


def create_pinecone_index():
    from pinecone import Pinecone, ServerlessSpec
    from app.config import settings

    if not settings.PINECONE_API_KEY:
        logger.error("❌ PINECONE_API_KEY is not set in your .env file.")
        sys.exit(1)

    logger.info("🔗 Connecting to Pinecone...")
    pc = Pinecone(api_key=settings.PINECONE_API_KEY)

    index_name = settings.PINECONE_INDEX_NAME   # 'healthcarechatbot'
    existing = [idx.name for idx in pc.list_indexes()]

    logger.info("📋 Existing indexes: %s", existing)

    if index_name in existing:
        logger.info("✅ Index '%s' already exists — skipping creation.", index_name)
        # Show index stats
        idx = pc.Index(index_name)
        stats = idx.describe_index_stats()
        logger.info("📊 Index stats: %s", stats)
        return

    logger.info(
        "🚀 Creating Pinecone index '%s' (dim=%d, metric=%s)...",
        index_name, EMBEDDING_DIM, METRIC,
    )

    pc.create_index(
        name=index_name,
        dimension=EMBEDDING_DIM,
        metric=METRIC,
        spec=ServerlessSpec(
            cloud="aws",       # free-tier serverless is on AWS us-east-1
            region="us-east-1",
        ),
    )

    # Wait for the index to be ready (Pinecone can take 30-60s)
    logger.info("⏳ Waiting for index to become ready...")
    for attempt in range(30):
        status = pc.describe_index(index_name).status
        if status.get("ready", False):
            break
        logger.info("   Still initializing... (%ds)", (attempt + 1) * 5)
        time.sleep(5)
    else:
        logger.warning("⚠️  Index may not be ready yet — check your Pinecone dashboard.")

    logger.info(
        "✅ Pinecone index '%s' is ready!\n"
        "   Dimension : %d\n"
        "   Metric    : %s\n"
        "   Cloud     : AWS us-east-1 (Serverless Free Tier)\n",
        index_name, EMBEDDING_DIM, METRIC,
    )


def verify_nvidia_embeddings():
    """Quick sanity check — verifies NVIDIA NIM returns 1024-dim vectors."""
    from app.config import settings

    if not settings.NVIDIA_API_KEY:
        logger.warning("⚠️  NVIDIA_API_KEY not set — skipping embedding verification.")
        return

    logger.info("🔍 Verifying NVIDIA NIM embeddings (model: %s)...", settings.NVIDIA_EMBED_MODEL)
    try:
        from langchain_nvidia_ai_endpoints import NVIDIAEmbeddings

        embed = NVIDIAEmbeddings(
            model=settings.NVIDIA_EMBED_MODEL,
            api_key=settings.NVIDIA_API_KEY,
            truncate="NONE",
        )
        test_vec = embed.embed_query("Test medical report embedding.")
        dim = len(test_vec)

        if dim != EMBEDDING_DIM:
            logger.error(
                "❌ Embedding dimension mismatch! Got %d, expected %d. "
                "Update EMBEDDING_DIM in this script and recreate the index.",
                dim, EMBEDDING_DIM,
            )
            sys.exit(1)

        logger.info(
            "✅ NVIDIA NIM embeddings OK — dimension: %d (matches Pinecone index)", dim
        )
    except Exception as exc:
        logger.error("❌ NVIDIA NIM embedding test failed: %s", exc)
        sys.exit(1)


def verify_groq_connection():
    """Quick sanity check — verifies Groq API key works."""
    from app.config import settings

    if not settings.GROQ_API_KEY:
        logger.error("❌ GROQ_API_KEY is not set in your .env file.")
        sys.exit(1)

    logger.info("🔍 Verifying Groq API connection (model: %s)...", settings.SUPERVISOR_MODEL)
    try:
        from langchain_groq import ChatGroq
        from langchain_core.messages import HumanMessage

        llm = ChatGroq(
            model=settings.SUPERVISOR_MODEL,
            api_key=settings.GROQ_API_KEY,
            max_tokens=10,
        )
        response = llm.invoke([HumanMessage(content="Say: OK")])
        logger.info("✅ Groq API OK — response: '%s'", response.content.strip())
    except Exception as exc:
        logger.error("❌ Groq API connection failed: %s", exc)
        sys.exit(1)


if __name__ == "__main__":
    logger.info("=" * 60)
    logger.info("  Healthcare AI Backend — Setup Script")
    logger.info("=" * 60)

    # 1. Verify Groq API
    verify_groq_connection()

    # 2. Verify NVIDIA NIM embeddings + confirm dimension
    verify_nvidia_embeddings()

    # 3. Create Pinecone index
    create_pinecone_index()

    logger.info("\n🎉 All checks passed! You can now start the server:")
    logger.info("   .venv\\Scripts\\uvicorn app.main:app --reload --port 8000")
