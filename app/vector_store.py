"""
vector_store.py — Vector Database Abstraction Layer
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Embeddings : NVIDIA NIM — nvidia/nv-embedqa-e5-v5 (dim=1024)
Primary    : Pinecone v5 (free-tier cloud — index: healthcarechatbot)
Fallback   : ChromaDB (local, zero cost)

Pinecone v3+ API — uses `from pinecone import Pinecone` (NOT pinecone.init())
"""

import logging
from typing import Any

from langchain_core.vectorstores import VectorStore
from app.config import settings

logger = logging.getLogger(__name__)


# ============================================================================
# Pinecone Backend (Primary — Free-Tier Cloud)
# Uses Pinecone v5 modern client API
# ============================================================================

def _get_pinecone_store(embeddings: Any) -> VectorStore:
    """
    Returns a Pinecone vector store using the v3+ client API.
    Index: settings.PINECONE_INDEX_NAME (e.g. 'healthcarechatbot')
    Must be created with dimension=1024, metric=cosine before first use.
    """
    from pinecone import Pinecone
    from langchain_pinecone import PineconeVectorStore

    logger.info(
        "[VectorStore] Pinecone backend — index: %s",
        settings.PINECONE_INDEX_NAME,
    )

    # Initialize Pinecone v3+ client (no more pinecone.init())
    pc = Pinecone(api_key=settings.PINECONE_API_KEY)

    # Get or validate the index
    existing_indexes = [idx.name for idx in pc.list_indexes()]
    if settings.PINECONE_INDEX_NAME not in existing_indexes:
        raise RuntimeError(
            f"Pinecone index '{settings.PINECONE_INDEX_NAME}' does not exist. "
            f"Run setup_pinecone.py first to create it. "
            f"Available indexes: {existing_indexes}"
        )

    index = pc.Index(settings.PINECONE_INDEX_NAME)

    return PineconeVectorStore(
        index=index,
        embedding=embeddings,
        text_key="text",           # field name for document text in Pinecone metadata
    )


# ============================================================================
# ChromaDB Backend (Disabled — install chromadb package to re-enable)
# Uncomment chromadb in requirements.txt and re-run pip install to use locally.
# ============================================================================

def _get_chroma_store(embeddings: Any) -> VectorStore:
    """ChromaDB fallback — only works if chromadb is installed."""
    try:
        from langchain_community.vectorstores import Chroma
    except ImportError:
        raise RuntimeError(
            "ChromaDB is not installed. Either:\n"
            "  1. Use Pinecone: set VECTOR_DB_BACKEND=pinecone in .env\n"
            "  2. Install ChromaDB: uncomment chromadb in requirements.txt and run pip install"
        )
    logger.info(
        "[VectorStore] ChromaDB backend — dir: %s, collection: %s",
        settings.CHROMA_PERSIST_DIR,
        settings.CHROMA_COLLECTION_NAME,
    )
    return Chroma(
        collection_name=settings.CHROMA_COLLECTION_NAME,
        embedding_function=embeddings,
        persist_directory=settings.CHROMA_PERSIST_DIR,
    )


# ============================================================================
# Public Factory
# ============================================================================

def get_vector_store(embeddings: Any) -> VectorStore:
    """
    Returns the vector store selected by VECTOR_DB_BACKEND.
    Call this with get_embeddings() from graph.py.
    """
    backend = settings.VECTOR_DB_BACKEND.lower()

    if backend == "pinecone":
        return _get_pinecone_store(embeddings)
    elif backend == "chroma":
        return _get_chroma_store(embeddings)
    else:
        logger.warning(
            "[VectorStore] Unknown backend '%s', falling back to ChromaDB.", backend
        )
        return _get_chroma_store(embeddings)


# ============================================================================
# PDF Ingestion Utility — Vectorizes and Upserts to Pinecone/ChromaDB
# ============================================================================

def ingest_pdf_documents(pdf_paths: list[str]) -> int:
    """
    Loads PDFs, splits into chunks, embeds with NVIDIA NIM,
    and upserts into the configured vector store.

    Usage:
        python ingest_reports.py /path/to/report.pdf
        # or via admin API: POST /api/v1/admin/ingest-documents/
    """
    from langchain_community.document_loaders import PyPDFLoader
    from langchain.text_splitter import RecursiveCharacterTextSplitter
    from langchain_nvidia_ai_endpoints import NVIDIAEmbeddings

    embed = NVIDIAEmbeddings(
        model=settings.NVIDIA_EMBED_MODEL,
        api_key=settings.NVIDIA_API_KEY,
        truncate="NONE",
    )
    store = get_vector_store(embed)

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=500,
        chunk_overlap=50,
    )

    all_chunks = []
    for path in pdf_paths:
        try:
            chunks = splitter.split_documents(PyPDFLoader(path).load())
            all_chunks.extend(chunks)
            logger.info("[Ingest] %d chunks from: %s", len(chunks), path)
        except Exception as exc:
            logger.error("[Ingest] Failed '%s': %s", path, exc)

    if all_chunks:
        store.add_documents(all_chunks)
        logger.info("[Ingest] ✅ Total chunks upserted: %d", len(all_chunks))

    return len(all_chunks)
