"""
auth.py — Google OAuth2 + JWT Authentication
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Flow:
  1. Frontend redirects user to GET /auth/google
  2. Backend redirects to Google consent screen
  3. Google redirects back to GET /auth/callback?code=...
  4. Backend exchanges code → gets user's email, name, picture from Google
  5. If user doesn't exist → create User record automatically
  6. Issue a signed JWT (7-day expiry)
  7. All protected endpoints validate the JWT via `get_current_user` dependency

JWT Payload:
  { "sub": "<user_id>", "email": "<email>", "exp": <timestamp> }
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlmodel import Session, select

from app.config import settings
from app.database import get_session
from app.models import User

logger = logging.getLogger(__name__)

# ── JWT bearer scheme ────────────────────────────────────────────────────────
_bearer = HTTPBearer(auto_error=False)

# ── Google OAuth endpoints ───────────────────────────────────────────────────
GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"
GOOGLE_SCOPES = "openid email profile"


# ============================================================================
# Password Hashing
# ============================================================================
import bcrypt

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))
    except Exception:
        return False

def get_password_hash(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')

# ============================================================================
# JWT Utilities
# ============================================================================

def create_access_token(user_id: int, email: str) -> str:
    """Creates a signed JWT token for the given user."""
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.JWT_EXPIRE_MINUTES)
    payload = {
        "sub": str(user_id),
        "email": email,
        "exp": expire,
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> dict:
    """Decodes and validates a JWT token. Raises JWTError on failure."""
    return jwt.decode(
        token,
        settings.JWT_SECRET_KEY,
        algorithms=[settings.JWT_ALGORITHM],
    )


# ============================================================================
# FastAPI Dependency — get_current_user
# ============================================================================

def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
    db: Session = Depends(get_session),
) -> User:
    """
    FastAPI dependency that validates the JWT Bearer token and returns the User.

    Usage in any endpoint:
        @app.get("/api/v1/something")
        def endpoint(current_user: User = Depends(get_current_user)):
            ...
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated. Please log in at /auth/google",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if credentials is None:
        raise credentials_exception

    try:
        payload = decode_access_token(credentials.credentials)
        user_id_str: str = payload.get("sub")
        if user_id_str is None:
            raise credentials_exception
        user_id = int(user_id_str)
    except (JWTError, ValueError):
        raise credentials_exception

    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account not found. Please log in again.",
        )

    return user


# ============================================================================
# Google OAuth Helpers
# ============================================================================

def get_google_auth_url() -> str:
    """Builds the Google OAuth consent screen URL."""
    params = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": settings.GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": GOOGLE_SCOPES,
        "access_type": "offline",
        "prompt": "select_account",  # always show account chooser
    }
    query = "&".join(f"{k}={v}" for k, v in params.items())
    return f"{GOOGLE_AUTH_URL}?{query}"


async def exchange_code_for_user_info(code: str) -> dict:
    """
    Exchanges the OAuth authorization code for Google user info.
    Returns dict with: sub, email, name, picture
    """
    async with httpx.AsyncClient() as client:
        # Step 1: exchange code for tokens
        token_resp = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "redirect_uri": settings.GOOGLE_REDIRECT_URI,
                "grant_type": "authorization_code",
            },
        )
        token_resp.raise_for_status()
        tokens = token_resp.json()

        # Step 2: fetch user info using the access token
        userinfo_resp = await client.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {tokens['access_token']}"},
        )
        userinfo_resp.raise_for_status()
        return userinfo_resp.json()


def get_or_create_user(db: Session, google_info: dict) -> User:
    """
    Fetches an existing user by their Google sub, or creates a new one.
    This is the auto-registration step on first login.
    """
    google_sub = google_info["sub"]
    email = google_info.get("email", "")
    name = google_info.get("name", email.split("@")[0])
    picture = google_info.get("picture")

    # Check if user already exists
    existing = db.exec(
        select(User).where(User.google_sub == google_sub)
    ).first()

    if existing:
        # Update name/picture in case they changed on Google
        existing.name = name
        existing.picture = picture
        db.add(existing)
        db.commit()
        db.refresh(existing)
        logger.info("[Auth] Returning user logged in: %s (id=%s)", email, existing.id)
        return existing

    # First-time login — create account automatically
    new_user = User(
        google_sub=google_sub,
        email=email,
        name=name,
        picture=picture,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    logger.info("[Auth] ✨ New user registered: %s (id=%s)", email, new_user.id)
    return new_user
