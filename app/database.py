"""
database.py — Database Engine & Session Management
Configures SQLModel/SQLAlchemy async-compatible engine with PostgreSQL.
"""

from sqlmodel import SQLModel, Session, create_engine
from app.config import settings

# ---------------------------------------------------------------------------
# Connection Configuration
# ---------------------------------------------------------------------------

# Uses settings.DATABASE_URL from .env (via Pydantic BaseSettings)
engine = create_engine(settings.DATABASE_URL, echo=settings.DEBUG)


# ---------------------------------------------------------------------------
# Session Factory
# ---------------------------------------------------------------------------

def get_session():
    """FastAPI dependency that yields a database session."""
    with Session(engine) as session:
        yield session


# ---------------------------------------------------------------------------
# Table Initialization
# ---------------------------------------------------------------------------

def create_db_and_tables():
    """Creates all database tables defined in models.py."""
    SQLModel.metadata.create_all(engine)
