"""
main.py — FastAPI Application Entry Point
Wires together:
  - Database initialisation (SQLModel)
  - Google OAuth2 + JWT authentication
  - APScheduler background worker (Care Coordinator)
  - REST API endpoints for family patients, vitals, and AI chat

Authentication flow:
  1. GET /auth/google            → redirects to Google consent
  2. GET /auth/callback?code=... → issues JWT token
  3. All /api/v1/* endpoints     → require Bearer <JWT> header
"""

import logging
import os
from contextlib import asynccontextmanager
from typing import Annotated, Optional

from fastapi import Depends, FastAPI, File, HTTPException, Query, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from langchain_core.messages import HumanMessage
from pydantic import BaseModel
from sqlmodel import Session, select

from app.auth import (
    create_access_token,
    exchange_code_for_user_info,
    get_current_user,
    get_google_auth_url,
    get_or_create_user,
    get_password_hash,
    verify_password,
)
from app.config import settings
from app.database import create_db_and_tables, engine, get_session
from app.graph import AgentState, healthcare_graph
from app.models import (
    MedicationSchedule,
    MedicationScheduleCreate,
    MedicationScheduleRead,
    MedicationScheduleUpdate,
    MedicalReport,
    MedicalReportRead,
    Patient,
    PatientCreate,
    PatientRead,
    PatientUpdate,
    User,
    UserRead,
    UserUpdate,
    UserRegister,
    UserLogin,
    VitalsBP, VitalsBPCreate, VitalsBPRead, VitalsBPUpdate,
    VitalsSugar, VitalsSugarCreate, VitalsSugarRead, VitalsSugarUpdate,
    CustomTest, CustomTestCreate, CustomTestRead, CustomTestUpdate,
)
from app.analytics import (
    compute_bp_stats, compute_sugar_stats, compute_custom_stats,
    format_bp_chart_data, format_sugar_chart_data, format_custom_chart_data
)
from app.scheduler import create_scheduler
from app.graph import analyze_report_text

# ---------------------------------------------------------------------------
# Logging Configuration
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Lifespan Manager
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Handles startup and shutdown events."""
    # ── Startup ─────────────────────────────────────────────────────────────
    logger.info("🚀 Starting %s v%s", settings.APP_NAME, settings.APP_VERSION)

    logger.info("📦 Initialising database tables...")
    create_db_and_tables()
    logger.info("✅ Database tables ready.")

    logger.info("⏰ Starting APScheduler Care Coordinator...")
    scheduler = create_scheduler()
    scheduler.start()
    logger.info(
        "✅ Scheduler started — polling every %ds.",
        settings.SCHEDULER_POLL_INTERVAL_SECONDS,
    )

    yield  # Application is running

    # ── Shutdown ─────────────────────────────────────────────────────────────
    logger.info("🛑 Shutting down scheduler...")
    scheduler.shutdown(wait=False)
    logger.info("👋 %s shut down cleanly.", settings.APP_NAME)


# ---------------------------------------------------------------------------
# FastAPI Application Instance
# ---------------------------------------------------------------------------

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description=(
        "Personal family healthcare management system. "
        "Log in with Gmail, add your family members, track vitals, "
        "manage medications, and chat with an AI health assistant. "
        "Built with FastAPI + LangGraph + Groq + PostgreSQL."
    ),
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# ── CORS Middleware ──────────────────────────────────────────────────────────
# NOTE: allow_origins=["*"] with allow_credentials=True is INVALID per the CORS spec
# and causes browsers to throw "Failed to fetch". Must list explicit origins.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",   # Vite dev server
        "http://localhost:3000",   # fallback CRA / other dev ports
        "http://127.0.0.1:5173",
        os.getenv("FRONTEND_URL", "http://localhost:5173"), # Production Vercel URL
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Convenience Type Aliases ─────────────────────────────────────────────────
DBSession = Annotated[Session, Depends(get_session)]
CurrentUser = Annotated[User, Depends(get_current_user)]


# ===========================================================================
# HEALTH CHECK
# ===========================================================================

@app.get("/health", tags=["Health"])
def health_check():
    """Simple liveness check. Returns service status and version."""
    return {
        "status": "healthy",
        "service": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "llm_models": {
            "supervisor": settings.SUPERVISOR_MODEL,
            "vitals_analyzer": settings.VITALS_ANALYZER_MODEL,
            "generator": settings.GENERATOR_MODEL,
            "notifications": settings.NOTIFICATION_MODEL,
        },
        "vector_backend": settings.VECTOR_DB_BACKEND,
    }


# ===========================================================================
# AUTH ENDPOINTS
# ===========================================================================

@app.get(
    "/auth/google",
    tags=["Authentication"],
    summary="Start Google OAuth login",
    include_in_schema=True,
)
def google_login():
    """
    Redirects the user to Google's consent screen.
    After granting permission, Google redirects back to /auth/callback.
    """
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env",
        )
    url = get_google_auth_url()
    return RedirectResponse(url=url)


@app.get(
    "/auth/callback",
    tags=["Authentication"],
    summary="Google OAuth callback — issues JWT token",
)
async def google_callback(code: str, db: DBSession):
    """
    Google redirects the browser here with an authorization code.
    Exchanges the code for user info, creates/fetches the user account,
    then redirects the browser to the frontend with the JWT token in query params.
    """
    import json, urllib.parse

    try:
        google_info = await exchange_code_for_user_info(code)
    except Exception as exc:
        logger.error("[Auth] Google token exchange failed: %s", exc)
        frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")
        return RedirectResponse(
            url=f"{frontend_url}/auth/callback?error=google_auth_failed",
            status_code=302,
        )

    user = get_or_create_user(db, google_info)
    token = create_access_token(user.id, user.email)

    user_json = urllib.parse.quote(json.dumps({
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "picture": user.picture,
    }))

    logger.info("✅ User %s authenticated successfully via Google.", user.email)

    # Redirect browser to frontend with token embedded in URL
    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")
    return RedirectResponse(
        url=f"{frontend_url}/auth/callback?token={token}&user={user_json}",
        status_code=302,
    )


@app.post("/auth/register", tags=["Authentication"], summary="Register with email and password")
def register_user(user_in: UserRegister, db: DBSession):
    """Registers a new user with an email and password."""
    # Check if user already exists
    existing_user = db.exec(select(User).where(User.email == user_in.email)).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )
    
    new_user = User(
        email=user_in.email,
        name=user_in.name,
        hashed_password=get_password_hash(user_in.password),
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    token = create_access_token(new_user.id, new_user.email)
    logger.info("✅ New user registered manually: %s", new_user.email)
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": new_user.id,
            "name": new_user.name,
            "email": new_user.email,
            "picture": new_user.picture,
        },
    }


@app.post("/auth/login", tags=["Authentication"], summary="Login with email and password")
def login_user(user_in: UserLogin, db: DBSession):
    """Authenticates a user via email and password."""
    user = db.exec(select(User).where(User.email == user_in.email)).first()
    if not user or not user.hashed_password:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )
    
    if not verify_password(user_in.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )
        
    token = create_access_token(user.id, user.email)
    logger.info("✅ User %s logged in manually.", user.email)
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "picture": user.picture,
        },
    }



@app.get(
    "/auth/me",
    response_model=UserRead,
    tags=["Authentication"],
    summary="Get your profile",
)
def get_my_profile(current_user: CurrentUser):
    """Returns the currently logged-in user's profile information."""
    return current_user


@app.patch(
    "/auth/me",
    response_model=UserRead,
    tags=["Authentication"],
    summary="Update your profile",
)
def update_my_profile(update_in: UserUpdate, current_user: CurrentUser, db: DBSession):
    """Updates the logged-in user's profile information."""
    update_data = update_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(current_user, field, value)
    
    db.add(current_user)
    db.commit()
    db.refresh(current_user)
    logger.info("✅ User %s updated profile.", current_user.email)
    return current_user


# ===========================================================================
# FAMILY MEMBER (PATIENT) ENDPOINTS
# ===========================================================================

@app.get(
    "/api/v1/patients/",
    response_model=list[PatientRead],
    tags=["Family Members"],
    summary="List all your family members",
)
def list_patients(current_user: CurrentUser, db: DBSession):
    """Returns all family members belonging to the logged-in user."""
    patients = db.exec(
        select(Patient).where(Patient.user_id == current_user.id)
    ).all()
    return patients


@app.post(
    "/api/v1/patients/",
    response_model=PatientRead,
    status_code=status.HTTP_201_CREATED,
    tags=["Family Members"],
    summary="Add a family member",
)
def create_patient(patient_in: PatientCreate, current_user: CurrentUser, db: DBSession):
    """
    Adds a new family member to your account.

    - **name**: Full name (e.g., 'Dad', 'Ravi Sharma')
    - **age**: Age in years
    - **relationship_to_user**: How they relate to you (e.g., 'Dad', 'Mom', 'Wife')
    - **baseline_medical_conditions**: Pre-existing conditions (e.g., 'Diabetes, Hypertension')
    """
    patient_data = {**patient_in.model_dump(), "user_id": current_user.id}
    patient = Patient.model_validate(patient_data)
    db.add(patient)
    db.commit()
    db.refresh(patient)
    logger.info(
        "✅ User %s added family member: %s (id=%s)",
        current_user.email, patient.name, patient.id,
    )
    return patient


@app.get(
    "/api/v1/patients/{patient_id}",
    response_model=PatientRead,
    tags=["Family Members"],
    summary="Get a family member's profile",
)
def get_patient(patient_id: int, current_user: CurrentUser, db: DBSession):
    """Retrieves a single family member's profile. Only accessible by the owner."""
    patient = _get_patient_or_404(patient_id, current_user, db)
    return patient


@app.patch(
    "/api/v1/patients/{patient_id}",
    response_model=PatientRead,
    tags=["Family Members"],
    summary="Update a family member's details",
)
def update_patient(
    patient_id: int,
    update_in: PatientUpdate,
    current_user: CurrentUser,
    db: DBSession,
):
    """
    Updates an existing family member's details (partial update).
    You can update any combination of: name, age, relationship, conditions, phone.
    """
    patient = _get_patient_or_404(patient_id, current_user, db)
    update_data = update_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(patient, field, value)
    db.add(patient)
    db.commit()
    db.refresh(patient)
    logger.info(
        "✅ User %s updated patient %s (id=%s)",
        current_user.email, patient.name, patient.id,
    )
    return patient


@app.delete(
    "/api/v1/patients/{patient_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["Family Members"],
    summary="Remove a family member",
)
def delete_patient(patient_id: int, current_user: CurrentUser, db: DBSession):
    """Permanently deletes a family member and all their health data."""
    patient = _get_patient_or_404(patient_id, current_user, db)
    
    from sqlmodel import delete
    # Manually cascade delete dependent records to avoid IntegrityErrors
    db.exec(delete(MedicationSchedule).where(MedicationSchedule.patient_id == patient_id))
    db.exec(delete(VitalsBP).where(VitalsBP.patient_id == patient_id))
    db.exec(delete(VitalsSugar).where(VitalsSugar.patient_id == patient_id))
    db.exec(delete(CustomTest).where(CustomTest.patient_id == patient_id))
    db.exec(delete(MedicalReport).where(MedicalReport.patient_id == patient_id))
    
    db.delete(patient)
    db.commit()
    logger.info("🗑️ User %s deleted patient: %s", current_user.email, patient.name)



# ===========================================================================
# MEDICATION SCHEDULE ENDPOINTS
# ===========================================================================

@app.post(
    "/api/v1/patients/{patient_id}/medications/",
    response_model=MedicationScheduleRead,
    status_code=status.HTTP_201_CREATED,
    tags=["Medications"],
    summary="Add a medication schedule",
)
def add_medication_schedule(
    patient_id: int,
    schedule_in: MedicationScheduleCreate,
    current_user: CurrentUser,
    db: DBSession,
):
    """
    Adds a medication reminder for a family member.
    The scheduler polls every 60s and fires a reminder at the scheduled time.

    Set **is_recurring=true** for daily medications (resets at midnight).
    Set **is_recurring=false** for one-time medications.
    """
    patient = _get_patient_or_404(patient_id, current_user, db)

    schedule = MedicationSchedule.model_validate(
        {**schedule_in.model_dump(), "patient_id": patient.id}
    )
    db.add(schedule)
    db.commit()
    db.refresh(schedule)
    logger.info(
        "✅ Added medication: patient=%s, medicine=%s @ %s (recurring=%s)",
        patient.name, schedule.medicine_name, schedule.time_of_day, schedule.is_recurring,
    )
    return schedule


@app.get(
    "/api/v1/patients/{patient_id}/medications/",
    response_model=list[MedicationScheduleRead],
    tags=["Medications"],
    summary="List all medications for a family member",
)
def list_medication_schedules(
    patient_id: int,
    current_user: CurrentUser,
    db: DBSession,
):
    """Returns all medication schedules for the specified family member."""
    patient = _get_patient_or_404(patient_id, current_user, db)
    schedules = db.exec(
        select(MedicationSchedule).where(MedicationSchedule.patient_id == patient.id)
    ).all()
    return schedules


@app.patch(
    "/api/v1/patients/{patient_id}/medications/{med_id}",
    response_model=MedicationScheduleRead,
    tags=["Medications"],
    summary="Update a medication schedule",
)
def update_medication_schedule(
    patient_id: int,
    med_id: int,
    update_in: MedicationScheduleUpdate,
    current_user: CurrentUser,
    db: DBSession,
):
    """Updates an existing medication schedule (partial update)."""
    patient = _get_patient_or_404(patient_id, current_user, db)
    schedule = db.get(MedicationSchedule, med_id)
    if not schedule or schedule.patient_id != patient.id:
        raise HTTPException(status_code=404, detail=f"Medication schedule {med_id} not found.")

    update_data = update_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(schedule, field, value)

    db.add(schedule)
    db.commit()
    db.refresh(schedule)
    return schedule


@app.delete(
    "/api/v1/patients/{patient_id}/medications/{med_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["Medications"],
    summary="Delete a medication schedule",
)
def delete_medication_schedule(
    patient_id: int,
    med_id: int,
    current_user: CurrentUser,
    db: DBSession,
):
    """Permanently removes a medication schedule."""
    patient = _get_patient_or_404(patient_id, current_user, db)
    schedule = db.get(MedicationSchedule, med_id)
    if not schedule or schedule.patient_id != patient.id:
        raise HTTPException(status_code=404, detail=f"Medication schedule {med_id} not found.")
    db.delete(schedule)
    db.commit()
    logger.info("🗑️ Deleted medication: id=%s", med_id)


# ===========================================================================
# VITALS — BLOOD PRESSURE ENDPOINTS
# ===========================================================================

@app.post(
    "/api/v1/vitals/bp/",
    response_model=VitalsBPRead,
    status_code=status.HTTP_201_CREATED,
    tags=["Vitals"],
    summary="Log a blood pressure reading",
)
def log_blood_pressure(vitals_in: VitalsBPCreate, current_user: CurrentUser, db: DBSession):
    """
    Logs a blood pressure reading for a family member.

    - **systolic**: Systolic pressure in mmHg (50–300)
    - **diastolic**: Diastolic pressure in mmHg (30–200)
    """
    patient = _get_patient_or_404(vitals_in.patient_id, current_user, db)

    record = VitalsBP.model_validate(vitals_in)
    if vitals_in.recorded_at is None:
        record.recorded_at = datetime.utcnow()
    db.add(record)
    db.commit()
    db.refresh(record)
    logger.info(
        "✅ BP logged: %s → %s/%s mmHg",
        patient.name, record.systolic, record.diastolic,
    )
    return record


@app.get(
    "/api/v1/vitals/bp/{patient_id}",
    response_model=list[VitalsBPRead],
    tags=["Vitals"],
    summary="Get blood pressure history",
)
def get_blood_pressure_history(
    patient_id: int,
    current_user: CurrentUser,
    db: DBSession,
    limit: int = Query(default=20, ge=1, le=100),
):
    """Returns the last N blood pressure readings, newest first."""
    _get_patient_or_404(patient_id, current_user, db)
    records = db.exec(
        select(VitalsBP)
        .where(VitalsBP.patient_id == patient_id)
        .order_by(VitalsBP.recorded_at.desc())
        .limit(limit)
    ).all()
    return records


@app.patch(
    "/api/v1/vitals/bp/{patient_id}/{record_id}",
    response_model=VitalsBPRead,
    tags=["Vitals"],
    summary="Update a blood pressure record",
)
def update_blood_pressure(
    patient_id: int, record_id: int, vitals_update: VitalsBPUpdate, current_user: CurrentUser, db: DBSession
):
    _get_patient_or_404(patient_id, current_user, db)
    record = db.get(VitalsBP, record_id)
    if not record or record.patient_id != patient_id:
        raise HTTPException(status_code=404, detail="BP record not found")
    update_data = vitals_update.model_dump(exclude_unset=True)
    for key, val in update_data.items():
        setattr(record, key, val)
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@app.delete(
    "/api/v1/vitals/bp/{patient_id}/{record_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["Vitals"],
    summary="Delete a blood pressure record",
)
def delete_blood_pressure(
    patient_id: int, record_id: int, current_user: CurrentUser, db: DBSession
):
    _get_patient_or_404(patient_id, current_user, db)
    record = db.get(VitalsBP, record_id)
    if not record or record.patient_id != patient_id:
        raise HTTPException(status_code=404, detail="BP record not found")
    db.delete(record)
    db.commit()


# ===========================================================================
# VITALS — BLOOD SUGAR ENDPOINTS
# ===========================================================================

@app.post(
    "/api/v1/vitals/sugar/",
    response_model=VitalsSugarRead,
    status_code=status.HTTP_201_CREATED,
    tags=["Vitals"],
    summary="Log a blood sugar reading",
)
def log_blood_sugar(vitals_in: VitalsSugarCreate, current_user: CurrentUser, db: DBSession):
    """
    Logs a blood sugar reading for a family member.

    - **fasting_sugar**: Fasting blood glucose in mg/dL
    - **post_meal_sugar**: Post-meal blood glucose in mg/dL
    """
    patient = _get_patient_or_404(vitals_in.patient_id, current_user, db)

    record = VitalsSugar.model_validate(vitals_in)
    if vitals_in.recorded_at is None:
        record.recorded_at = datetime.utcnow()
    db.add(record)
    db.commit()
    db.refresh(record)
    logger.info(
        "✅ Sugar logged: %s → fasting=%s, post_meal=%s mg/dL",
        patient.name, record.fasting_sugar, record.post_meal_sugar,
    )
    return record


@app.get(
    "/api/v1/vitals/sugar/{patient_id}",
    response_model=list[VitalsSugarRead],
    tags=["Vitals"],
    summary="Get blood sugar history",
)
def get_blood_sugar_history(
    patient_id: int,
    current_user: CurrentUser,
    db: DBSession,
    limit: int = Query(default=20, ge=1, le=100),
):
    """Returns the last N blood sugar readings, newest first."""
    _get_patient_or_404(patient_id, current_user, db)
    records = db.exec(
        select(VitalsSugar)
        .where(VitalsSugar.patient_id == patient_id)
        .order_by(VitalsSugar.recorded_at.desc())
        .limit(limit)
    ).all()
    return records


@app.patch(
    "/api/v1/vitals/sugar/{patient_id}/{record_id}",
    response_model=VitalsSugarRead,
    tags=["Vitals"],
    summary="Update a blood sugar record",
)
def update_blood_sugar(
    patient_id: int, record_id: int, vitals_update: VitalsSugarUpdate, current_user: CurrentUser, db: DBSession
):
    _get_patient_or_404(patient_id, current_user, db)
    record = db.get(VitalsSugar, record_id)
    if not record or record.patient_id != patient_id:
        raise HTTPException(status_code=404, detail="Sugar record not found")
    update_data = vitals_update.model_dump(exclude_unset=True)
    for key, val in update_data.items():
        setattr(record, key, val)
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@app.delete(
    "/api/v1/vitals/sugar/{patient_id}/{record_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["Vitals"],
    summary="Delete a blood sugar record",
)
def delete_blood_sugar(
    patient_id: int, record_id: int, current_user: CurrentUser, db: DBSession
):
    _get_patient_or_404(patient_id, current_user, db)
    record = db.get(VitalsSugar, record_id)
    if not record or record.patient_id != patient_id:
        raise HTTPException(status_code=404, detail="Sugar record not found")
    db.delete(record)
    db.commit()


# ===========================================================================
# VITALS — CUSTOM TESTS ENDPOINTS
# ===========================================================================

@app.post(
    "/api/v1/vitals/custom/",
    response_model=CustomTestRead,
    status_code=status.HTTP_201_CREATED,
    tags=["Vitals"],
    summary="Log a custom test reading",
)
def log_custom_test(vitals_in: CustomTestCreate, current_user: CurrentUser, db: DBSession):
    patient = _get_patient_or_404(vitals_in.patient_id, current_user, db)
    record = CustomTest.model_validate(vitals_in)
    if vitals_in.recorded_at is None:
        record.recorded_at = datetime.utcnow()
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@app.get(
    "/api/v1/vitals/custom/{patient_id}",
    response_model=list[CustomTestRead],
    tags=["Vitals"],
    summary="Get custom tests history",
)
def get_custom_tests_history(
    patient_id: int,
    current_user: CurrentUser,
    db: DBSession,
    limit: int = Query(default=20, ge=1, le=100),
):
    _get_patient_or_404(patient_id, current_user, db)
    records = db.exec(
        select(CustomTest)
        .where(CustomTest.patient_id == patient_id)
        .order_by(CustomTest.recorded_at.desc())
        .limit(limit)
    ).all()
    return records


@app.patch(
    "/api/v1/vitals/custom/{patient_id}/{record_id}",
    response_model=CustomTestRead,
    tags=["Vitals"],
    summary="Update a custom test record",
)
def update_custom_test(
    patient_id: int, record_id: int, vitals_update: CustomTestUpdate, current_user: CurrentUser, db: DBSession
):
    _get_patient_or_404(patient_id, current_user, db)
    record = db.get(CustomTest, record_id)
    if not record or record.patient_id != patient_id:
        raise HTTPException(status_code=404, detail="Record not found")
    update_data = vitals_update.model_dump(exclude_unset=True)
    for key, val in update_data.items():
        setattr(record, key, val)
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@app.delete(
    "/api/v1/vitals/custom/{patient_id}/{record_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["Vitals"],
    summary="Delete a custom test record",
)
def delete_custom_test(
    patient_id: int, record_id: int, current_user: CurrentUser, db: DBSession
):
    _get_patient_or_404(patient_id, current_user, db)
    record = db.get(CustomTest, record_id)
    if not record or record.patient_id != patient_id:
        raise HTTPException(status_code=404, detail="Record not found")
    db.delete(record)
    db.commit()


# ===========================================================================
# VITALS ANALYTICS — Statistics & Trend Summaries
# ===========================================================================

# ── Reusable days query param ────────────────────────────────────────────────
_DAYS_DESCRIPTION = (
    "Lookback window in days. Use 7, 14, 30, 90, or omit for all-time history."
)


@app.get(
    "/api/v1/vitals/bp/{patient_id}/stats",
    tags=["Vitals Analytics"],
    summary="Blood pressure statistics & trend summary",
)
def get_bp_stats(
    patient_id: int,
    current_user: CurrentUser,
    db: DBSession,
    days: Optional[int] = Query(
        default=30,
        ge=1,
        le=3650,
        description=_DAYS_DESCRIPTION,
    ),
):
    """
    Returns statistical summaries for a patient's blood pressure readings
    over the selected time window.

    **Returned metrics per reading type (systolic & diastolic):**
    - Average, min, max, standard deviation
    - Trend direction: `improving` / `worsening` / `stable`

    **Overall risk levels:** `NORMAL` | `ELEVATED` | `ELEVATED_HIGH` | `HIGH` | `HYPERTENSIVE_CRISIS`

    Set `days=null` to query all-time history (not supported via Swagger — omit the param).
    """
    _get_patient_or_404(patient_id, current_user, db)
    records = db.exec(
        select(VitalsBP)
        .where(VitalsBP.patient_id == patient_id)
        .order_by(VitalsBP.recorded_at.asc())
    ).all()

    result = compute_bp_stats(records, days=days)
    return {"patient_id": patient_id, **result}


@app.get(
    "/api/v1/vitals/sugar/{patient_id}/stats",
    tags=["Vitals Analytics"],
    summary="Blood sugar statistics & trend summary",
)
def get_sugar_stats(
    patient_id: int,
    current_user: CurrentUser,
    db: DBSession,
    days: Optional[int] = Query(
        default=30,
        ge=1,
        le=3650,
        description=_DAYS_DESCRIPTION,
    ),
):
    """
    Returns statistical summaries for a patient's blood sugar readings
    over the selected time window.

    **Returned metrics per reading type (fasting & post-meal):**
    - Average, min, max, standard deviation
    - Trend direction: `improving` / `worsening` / `stable`

    **Overall risk levels:** `NORMAL` | `PRE_DIABETIC` | `DIABETIC_RANGE` | `CRITICAL`
    """
    _get_patient_or_404(patient_id, current_user, db)
    records = db.exec(
        select(VitalsSugar)
        .where(VitalsSugar.patient_id == patient_id)
        .order_by(VitalsSugar.recorded_at.asc())
    ).all()

    result = compute_sugar_stats(records, days=days)
    return {"patient_id": patient_id, **result}


@app.get(
    "/api/v1/vitals/bp/{patient_id}/chart",
    tags=["Vitals Analytics"],
    summary="Blood pressure time-series chart data",
)
def get_bp_chart_data(
    patient_id: int,
    current_user: CurrentUser,
    db: DBSession,
    days: Optional[int] = Query(
        default=30,
        ge=1,
        le=3650,
        description=_DAYS_DESCRIPTION,
    ),
):
    """
    Returns blood pressure readings as **time-series chart data**,
    sorted chronologically. Ideal for plotting line/area charts in a frontend.

    Each data point includes:
    - `date` — ISO 8601 timestamp
    - `date_label` — Human-readable label (e.g., `Jul 04`)
    - `systolic`, `diastolic` — Reading values in mmHg
    - `status` — `NORMAL` or `ELEVATED` per-reading classification

    Also includes `reference_lines` with clinical threshold values for chart annotations.
    """
    _get_patient_or_404(patient_id, current_user, db)
    records = db.exec(
        select(VitalsBP)
        .where(VitalsBP.patient_id == patient_id)
        .order_by(VitalsBP.recorded_at.asc())
    ).all()

    result = format_bp_chart_data(records, days=days)
    return {"patient_id": patient_id, **result}


@app.get(
    "/api/v1/vitals/sugar/{patient_id}/chart",
    tags=["Vitals Analytics"],
    summary="Blood sugar time-series chart data",
)
def get_sugar_chart_data(
    patient_id: int,
    current_user: CurrentUser,
    db: DBSession,
    days: Optional[int] = Query(
        default=30,
        ge=1,
        le=3650,
        description=_DAYS_DESCRIPTION,
    ),
):
    """
    Returns blood sugar readings as **time-series chart data**,
    sorted chronologically. Ideal for plotting line/area charts in a frontend.

    Each data point includes:
    - `date` — ISO 8601 timestamp
    - `date_label` — Human-readable label (e.g., `Jul 04`)
    - `fasting_sugar`, `post_meal_sugar` — Reading values in mg/dL
    - `fasting_status`, `post_meal_status` — Per-reading classification

    Also includes `reference_lines` with clinical threshold values for chart annotations.
    """
    _get_patient_or_404(patient_id, current_user, db)
    records = db.exec(
        select(VitalsSugar)
        .where(VitalsSugar.patient_id == patient_id)
        .order_by(VitalsSugar.recorded_at.asc())
    ).all()

    result = format_sugar_chart_data(records, days=days)
    return {"patient_id": patient_id, **result}


@app.get(
    "/api/v1/vitals/custom/{patient_id}/stats",
    tags=["Vitals Analytics"],
    summary="Custom tests statistics",
)
def get_custom_test_stats(
    patient_id: int,
    current_user: CurrentUser,
    db: DBSession,
    test_name: str,
    days: Optional[int] = Query(default=30, description=_DAYS_DESCRIPTION),
):
    _get_patient_or_404(patient_id, current_user, db)
    records = db.exec(
        select(CustomTest).where(
            CustomTest.patient_id == patient_id,
            CustomTest.test_name == test_name
        )
    ).all()
    return compute_custom_stats(records, days, test_name)


@app.get(
    "/api/v1/vitals/custom/{patient_id}/chart",
    tags=["Vitals Analytics"],
    summary="Custom tests chart data",
)
def get_custom_test_chart(
    patient_id: int,
    current_user: CurrentUser,
    db: DBSession,
    test_name: str,
    days: Optional[int] = Query(default=30, description=_DAYS_DESCRIPTION),
):
    _get_patient_or_404(patient_id, current_user, db)
    records = db.exec(
        select(CustomTest).where(
            CustomTest.patient_id == patient_id,
            CustomTest.test_name == test_name
        ).order_by(CustomTest.recorded_at.asc())
    ).all()
    return format_custom_chart_data(records, days, test_name)


# ===========================================================================
# DASHBOARD — All family members + latest vitals in one call
# ===========================================================================

@app.get(
    "/api/v1/dashboard/",
    tags=["Dashboard"],
    summary="Your family health dashboard",
)
def get_dashboard(current_user: CurrentUser, db: DBSession):
    """
    Returns a summary of all your family members with their latest vitals.
    Ideal as the main data source for a frontend home screen.
    """
    patients = db.exec(
        select(Patient).where(Patient.user_id == current_user.id)
    ).all()

    dashboard = []
    for patient in patients:
        # Latest BP
        latest_bp = db.exec(
            select(VitalsBP)
            .where(VitalsBP.patient_id == patient.id)
            .order_by(VitalsBP.recorded_at.desc())
            .limit(1)
        ).first()

        # Latest Sugar
        latest_sugar = db.exec(
            select(VitalsSugar)
            .where(VitalsSugar.patient_id == patient.id)
            .order_by(VitalsSugar.recorded_at.desc())
            .limit(1)
        ).first()

        # Upcoming medications
        meds = db.exec(
            select(MedicationSchedule)
            .where(MedicationSchedule.patient_id == patient.id)
        ).all()

        dashboard.append({
            "patient": {
                "id": patient.id,
                "name": patient.name,
                "age": patient.age,
                "relationship": patient.relationship_to_user,
                "conditions": patient.baseline_medical_conditions,
            },
            "latest_bp": {
                "id": latest_bp.id if latest_bp else None,
                "systolic": latest_bp.systolic if latest_bp else None,
                "diastolic": latest_bp.diastolic if latest_bp else None,
                "recorded_at": latest_bp.recorded_at.isoformat() if latest_bp else None,
                "status": (
                    "ELEVATED"
                    if latest_bp and (latest_bp.systolic > 140 or latest_bp.diastolic > 90)
                    else ("NORMAL" if latest_bp else "NO_DATA")
                ),
            },
            "latest_sugar": {
                "id": latest_sugar.id if latest_sugar else None,
                "fasting": latest_sugar.fasting_sugar if latest_sugar else None,
                "post_meal": latest_sugar.post_meal_sugar if latest_sugar else None,
                "recorded_at": latest_sugar.recorded_at.isoformat() if latest_sugar else None,
                "status": (
                    "ELEVATED"
                    if latest_sugar and (latest_sugar.fasting_sugar > 126 or latest_sugar.post_meal_sugar > 180)
                    else ("NORMAL" if latest_sugar else "NO_DATA")
                ),
            },
            "medications": [
                {
                    "id": m.id,
                    "medicine": m.medicine_name,
                    "dosage": m.dosage,
                    "time": m.time_of_day,
                    "recurring": m.is_recurring,
                    "status": m.notification_status,
                }
                for m in meds
            ],
        })

    return {
        "user": current_user.name,
        "family_members": len(patients),
        "family": dashboard,
    }


# ===========================================================================
# NOTIFICATIONS ENDPOINT
# ===========================================================================

from datetime import datetime

@app.get(
    "/api/v1/notifications/",
    tags=["Notifications"],
    summary="Get all medication notifications for the current user",
)
def get_notifications(current_user: CurrentUser, db: DBSession):
    """
    Returns all medication schedules for the current user's family members,
    grouped by status (pending, sent). Used for the notification center.
    """
    patients = db.exec(
        select(Patient).where(Patient.user_id == current_user.id)
    ).all()

    current_time = datetime.now().strftime("%H:%M")
    notifications = []

    for patient in patients:
        meds = db.exec(
            select(MedicationSchedule).where(
                MedicationSchedule.patient_id == patient.id
            )
        ).all()

        for med in meds:
            is_due = med.time_of_day == current_time and med.notification_status == "pending"
            is_upcoming = med.notification_status == "pending"
            notifications.append({
                "id": med.id,
                "patient_id": patient.id,
                "patient_name": patient.name,
                "medicine_name": med.medicine_name,
                "dosage": med.dosage,
                "time_of_day": med.time_of_day,
                "instructions": med.instructions,
                "status": med.notification_status,
                "is_recurring": med.is_recurring,
                "is_due_now": is_due,
                "is_upcoming": is_upcoming,
            })

    # Sort: due now first, then pending, then sent
    notifications.sort(key=lambda n: (
        0 if n["is_due_now"] else (1 if n["status"] == "pending" else 2),
        n["time_of_day"]
    ))

    pending_count = sum(1 for n in notifications if n["status"] == "pending")
    due_now_count = sum(1 for n in notifications if n["is_due_now"])

    return {
        "notifications": notifications,
        "pending_count": pending_count,
        "due_now_count": due_now_count,
        "total": len(notifications),
    }


# ===========================================================================
# AI CHAT ENDPOINT (LangGraph Multi-Agent Pipeline)
# ===========================================================================

class ChatRequest(BaseModel):
    patient_id: str
    query: str
    document_summary: Optional[str] = None

    class Config:
        json_schema_extra = {
            "example": {
                "patient_id": "1",
                "query": "Can Dad eat an apple? His sugar has been high lately.",
                "document_summary": "Patient has elevated blood pressure..."
            }
        }


class ChatResponse(BaseModel):
    patient_id: str
    query: str
    response: str
    agent_used: str


@app.post(
    "/api/v1/chat/",
    response_model=ChatResponse,
    tags=["AI Health Assistant"],
    summary="Ask the AI about a family member's health",
)
async def chat_with_ai(request: ChatRequest, current_user: CurrentUser, db: DBSession):
    """
    Routes your health question through the LangGraph multi-agent pipeline:

    1. **Supervisor** routes to the best specialist node.
    2. **RAG_Node** retrieves context from uploaded medical reports.
    3. **Vitals_Node** fetches and analyses structured vitals data.
    4. **Generator_Node** synthesises a safe, empathetic response.

    **Safety Guardrails:**
    - Will never prescribe medication or change dosages.
    - Outputs ⚠️ ALERT for dangerous vital readings.
    - Appends medical disclaimers to all dietary advice.
    """
    try:
        patient_id_int = int(request.patient_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="patient_id must be a valid integer string.",
        )

    # Verify patient belongs to this user
    patient = _get_patient_or_404(patient_id_int, current_user, db)
    patient_context = (
        f"Patient: {patient.name}, Age: {patient.age}, "
        f"Relationship: {patient.relationship_to_user or 'Family member'}, "
        f"Conditions: {patient.baseline_medical_conditions or 'None listed'}"
    )

    # ── Fetch ALL stored report summaries for this user (persistent context) ──
    stored_reports = db.exec(
        select(MedicalReport).where(
            MedicalReport.user_id == current_user.id
        ).order_by(MedicalReport.uploaded_at.desc())
    ).all()

    report_summaries_text = ""
    if stored_reports:
        report_parts = []
        for rpt in stored_reports:
            patient_name = "Unknown"
            if rpt.patient_id:
                p = db.get(Patient, rpt.patient_id)
                if p:
                    patient_name = p.name
            if rpt.ai_summary:
                report_parts.append(
                    f"--- Report: {rpt.filename} (Patient: {patient_name}, "
                    f"Uploaded: {rpt.uploaded_at.strftime('%Y-%m-%d')}) ---\n"
                    f"{rpt.ai_summary[:2000]}"
                )
        report_summaries_text = "\n\n".join(report_parts)

    logger.info(
        "🤖 Chat: user=%s, patient=%s, query='%s', context_mode=%s, stored_reports=%d",
        current_user.email, patient.name, request.query,
        bool(request.document_summary), len(stored_reports)
    )

    if request.document_summary:
        # Document Context Mode: bypass standard RAG and Vitals nodes
        from langchain_core.messages import SystemMessage
        from app.graph import get_generator_llm
        from langchain_core.output_parsers import StrOutputParser

        doc_system_prompt = f"""You are a healthcare AI assistant in 'Document Context Mode'.
Answer the user's question ONLY using the provided document summary and stored report data below.
Be CONCISE and DIRECT — answer only what was asked, no extra padding or unsolicited advice.
If the answer is not in the provided data, say so clearly.

DOCUMENT SUMMARY:
{request.document_summary}

STORED REPORT SUMMARIES:
{report_summaries_text or 'No stored reports available.'}"""
        
        messages = [
            SystemMessage(content=doc_system_prompt),
            * [HumanMessage(content=f"[Context] {patient_context}")],
            HumanMessage(content=request.query)
        ]
        
        try:
            response_text = (get_generator_llm() | StrOutputParser()).invoke(messages)
            return ChatResponse(
                patient_id=request.patient_id,
                query=request.query,
                response=response_text,
                agent_used="Document_Context_Agent",
            )
        except Exception as exc:
            logger.error("❌ Document Context Chat error: %s", exc, exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"The AI encountered an error: {str(exc)}"
            )

    initial_state: AgentState = {
        "patient_id": request.patient_id,
        "user_query": request.query,
        "chat_history": [
            HumanMessage(content=f"[Context] {patient_context}"),
        ],
        "structured_data_context": {},
        "unstructured_data_context": "",
        "report_summaries_context": report_summaries_text,
        "current_agent": "Supervisor",
        "final_response": "",
    }

    try:
        final_state: AgentState = await healthcare_graph.ainvoke(initial_state)
        response_text = final_state.get("final_response", "")
        agent_used = final_state.get("current_agent", "Unknown")

        if not response_text:
            raise ValueError("Graph returned an empty response.")

        logger.info("✅ Chat complete: patient=%s, agent=%s", patient.name, agent_used)
        return ChatResponse(
            patient_id=request.patient_id,
            query=request.query,
            response=response_text,
            agent_used=agent_used,
        )

    except Exception as exc:
        logger.error("❌ LangGraph pipeline error: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=(
                f"The AI pipeline encountered an error: {str(exc)}. "
                "Please ensure your GROQ_API_KEY and NVIDIA_API_KEY are set in .env."
            ),
        )

import base64

@app.post(
    "/api/v1/chat/upload_context/",
    tags=["AI Health Assistant"],
    summary="Upload a document or image for chat context",
)
async def upload_chat_context(
    patient_id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
):
    """
    Uploads a document (PDF or Image) to be analyzed by the vision model.
    Returns the AI-generated summary to be used in the chat context.
    """
    _get_patient_or_404(patient_id, current_user, db)
    
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file uploaded.")
    
    file_content = await file.read()
    ext = file.filename.lower().split('.')[-1]
    
    images_base64 = []
    
    if ext in ['png', 'jpg', 'jpeg']:
        # Standalone image
        images_base64.append(base64.b64encode(file_content).decode('utf-8'))
    elif ext == 'pdf':
        try:
            import fitz
            with fitz.open(stream=file_content, filetype="pdf") as doc:
                for page in doc:
                    pix = page.get_pixmap()
                    img_bytes = pix.tobytes("jpeg")
                    images_base64.append(base64.b64encode(img_bytes).decode('utf-8'))
        except ImportError:
            raise HTTPException(status_code=500, detail="PyMuPDF (fitz) is not installed. Required for PDF image extraction.")
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Failed to process PDF: {str(exc)}")
    else:
        raise HTTPException(status_code=400, detail="Unsupported file format. Please upload PDF, PNG, or JPG.")
        
    from app.graph import analyze_document_vision
    
    try:
        summary = await analyze_document_vision(images_base64)
        return {"filename": file.filename, "summary": summary}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Vision analysis failed: {str(exc)}")



# ===========================================================================
# MEDICAL REPORTS ENDPOINTS
# ===========================================================================

import os
import shutil


@app.post(
    "/api/v1/reports/upload/",
    response_model=MedicalReportRead,
    status_code=status.HTTP_201_CREATED,
    tags=["Medical Reports"],
    summary="Upload a PDF medical report and get AI analysis",
)
async def upload_report(
    patient_id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
):
    """
    Upload a PDF medical report for a family member.
    The report is saved to disk, ingested into the vector database,
    and analyzed by the AI Report Analyzer (Agent 5 — llama-3.3-70b-versatile).
    Returns a structured clinical summary.
    """
    # Validate patient ownership
    patient = _get_patient_or_404(patient_id, current_user, db)

    # Validate file type
    ext = file.filename.lower().split('.')[-1] if file.filename else ""
    if not file.filename or ext not in ['pdf', 'png', 'jpg', 'jpeg']:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only PDF, PNG, and JPG files are accepted."
        )

    # Ensure upload directory exists
    upload_dir = os.path.abspath(settings.UPLOAD_DIR)
    os.makedirs(upload_dir, exist_ok=True)

    # Save the file
    safe_filename = f"user{current_user.id}_patient{patient_id}_{file.filename.replace(' ', '_')}"
    filepath = os.path.join(upload_dir, safe_filename)

    file_content = await file.read()
    with open(filepath, "wb") as f:
        f.write(file_content)

    file_size_kb = round(len(file_content) / 1024, 2)
    logger.info("[Reports] Saved '%s' (%.1f KB) for patient %s", safe_filename, file_size_kb, patient.name)

    # Extract text from PDF (if it's a PDF)
    raw_text = ""
    if ext == 'pdf':
        try:
            import fitz  # PyMuPDF
            with fitz.open(filepath) as doc:
                for page in doc:
                    raw_text += page.get_text() or ""
            logger.info("[Reports] Extracted %d chars from PDF (PyMuPDF).", len(raw_text))
        except ImportError:
            try:
                import io
                import pypdf
                with open(filepath, "rb") as f:
                    reader = pypdf.PdfReader(f)
                    for page in reader.pages:
                        raw_text += page.extract_text() or ""
                logger.info("[Reports] Extracted %d chars from PDF (pypdf).", len(raw_text))
            except ImportError:
                logger.warning("[Reports] Neither fitz nor pypdf installed.")
        except Exception as exc:
            logger.error("[Reports] PDF text extraction failed: %s", exc)

    # Try to ingest into vector store for future RAG queries (only if PDF and has text)
    if ext == 'pdf' and len(raw_text.strip()) > 50:
        try:
            from app.vector_store import ingest_pdf_documents
            ingest_pdf_documents([filepath])
            logger.info("[Reports] Ingested into vector store.")
        except Exception as exc:
            logger.warning("[Reports] Vector store ingestion skipped: %s", exc)

    # AI Report Analysis
    ai_summary = ""
    if ext in ['png', 'jpg', 'jpeg'] or (ext == 'pdf' and len(raw_text.strip()) < 50):
        # Use vision model for images or scanned PDFs
        from app.graph import analyze_document_vision
        import base64
        images_base64 = []
        if ext == 'pdf':
            try:
                import fitz
                with fitz.open(filepath) as doc:
                    for page in doc:
                        pix = page.get_pixmap()
                        img_bytes = pix.tobytes("jpeg")
                        images_base64.append(base64.b64encode(img_bytes).decode('utf-8'))
            except Exception as e:
                logger.error("Failed to convert PDF to image for vision analysis: %s", e)
        else:
            with open(filepath, "rb") as img_f:
                images_base64.append(base64.b64encode(img_f.read()).decode('utf-8'))
        
        logger.info("[Reports] Using Vision Model for analysis.")
        ai_summary = await analyze_document_vision(images_base64)
    else:
        # Use text model for text-heavy PDFs
        logger.info("[Reports] Using Text Model for analysis.")
        ai_summary = await analyze_report_text(raw_text, patient_name=patient.name)

    # Upload to Supabase Storage
    public_url = filepath
    if settings.SUPABASE_URL and settings.SUPABASE_PUBLIC_API_KEY:
        try:
            from supabase import create_client, Client
            supabase_client: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_PUBLIC_API_KEY)
            
            storage_path = f"{current_user.id}/{safe_filename}"
            supabase_client.storage.from_("reports").upload(
                path=storage_path,
                file=file_content,
                file_options={"content-type": file.content_type}
            )
            
            public_url = supabase_client.storage.from_("reports").get_public_url(storage_path)
            logger.info("[Reports] Uploaded to Supabase Storage: %s", public_url)
            
            # Clean up local file
            if os.path.exists(filepath):
                os.remove(filepath)
                logger.info("[Reports] Cleaned up local temporary file.")
        except Exception as exc:
            logger.error("[Reports] Failed to upload to Supabase: %s", exc)

    # Save to database
    report = MedicalReport(
        user_id=current_user.id,
        patient_id=patient_id,
        filename=file.filename,
        filepath=public_url,
        file_size_kb=file_size_kb,
        ai_summary=ai_summary,
    )
    db.add(report)
    db.commit()
    db.refresh(report)

    logger.info("[Reports] ✅ Report saved: id=%d, patient=%s", report.id, patient.name)
    return report


@app.get(
    "/api/v1/reports/",
    response_model=list[MedicalReportRead],
    tags=["Medical Reports"],
    summary="List all uploaded reports for the current user",
)
def list_reports(
    patient_id: Optional[int] = Query(default=None, description="Filter by patient ID"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
):
    """Returns all uploaded medical reports, optionally filtered by patient."""
    query = select(MedicalReport).where(MedicalReport.user_id == current_user.id)
    if patient_id is not None:
        query = query.where(MedicalReport.patient_id == patient_id)
    query = query.order_by(MedicalReport.uploaded_at.desc())
    reports = db.exec(query).all()
    return reports


@app.post(
    "/api/v1/reports/{report_id}/analyze/",
    tags=["Medical Reports"],
    summary="Re-analyze an existing report with the AI",
)
async def reanalyze_report(
    report_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
):
    """Re-runs AI analysis on an existing uploaded report."""
    report = db.get(MedicalReport, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found.")
    if report.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied.")

    ext = report.filename.lower().split('.')[-1]
    
    raw_text = ""
    if ext == 'pdf':
        try:
            import fitz  # PyMuPDF
            with fitz.open(report.filepath) as doc:
                for page in doc:
                    raw_text += page.get_text() or ""
        except ImportError:
            try:
                import pypdf
                with open(report.filepath, "rb") as f:
                    reader = pypdf.PdfReader(f)
                    for page in reader.pages:
                        raw_text += page.extract_text() or ""
            except Exception as exc:
                raw_text = f"Re-extraction failed: {exc}"
        except Exception as exc:
            raw_text = f"Re-extraction failed: {exc}"

    patient_name = "the patient"
    if report.patient_id:
        p = db.get(Patient, report.patient_id)
        if p:
            patient_name = p.name

    ai_summary = ""
    if ext in ['png', 'jpg', 'jpeg'] or (ext == 'pdf' and len(raw_text.strip()) < 50):
        # Use vision model
        from app.graph import analyze_document_vision
        import base64
        images_base64 = []
        if ext == 'pdf':
            try:
                import fitz
                with fitz.open(report.filepath) as doc:
                    for page in doc:
                        pix = page.get_pixmap()
                        img_bytes = pix.tobytes("jpeg")
                        images_base64.append(base64.b64encode(img_bytes).decode('utf-8'))
            except Exception as e:
                logger.error("Failed to convert PDF to image for vision analysis: %s", e)
        else:
            with open(report.filepath, "rb") as img_f:
                images_base64.append(base64.b64encode(img_f.read()).decode('utf-8'))
        
        logger.info("[Reports] Re-analyzing using Vision Model.")
        ai_summary = await analyze_document_vision(images_base64)
    else:
        # Use text model
        logger.info("[Reports] Re-analyzing using Text Model.")
        ai_summary = await analyze_report_text(raw_text, patient_name=patient_name)

    report.ai_summary = ai_summary
    db.add(report)
    db.commit()
    db.refresh(report)

    logger.info("[Reports] Re-analyzed report id=%d", report_id)
    return {"report_id": report_id, "ai_summary": ai_summary}


@app.delete(
    "/api/v1/reports/{report_id}/",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["Medical Reports"],
    summary="Delete an uploaded medical report",
)
def delete_report(
    report_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
):
    """Deletes a report record (and its file from disk)."""
    report = db.get(MedicalReport, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found.")
    if report.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied.")

    # Remove file from disk
    try:
        if os.path.exists(report.filepath):
            os.remove(report.filepath)
    except Exception as exc:
        logger.warning("[Reports] Could not delete file %s: %s", report.filepath, exc)

    db.delete(report)
    db.commit()
    logger.info("[Reports] Deleted report id=%d", report_id)


# ===========================================================================
# DOCUMENT INGESTION ENDPOINT (Admin)
# ===========================================================================

class IngestRequest(BaseModel):
    pdf_paths: list[str]

    class Config:
        json_schema_extra = {
            "example": {"pdf_paths": ["/data/reports/dad_report.pdf"]}
        }


@app.post(
    "/api/v1/admin/ingest-documents/",
    tags=["Admin"],
    summary="Ingest PDF medical reports into the vector database",
)
def ingest_documents(request: IngestRequest, current_user: CurrentUser):
    """
    Loads PDF medical reports into ChromaDB/Pinecone for RAG retrieval.
    Run this after uploading new patient reports.
    """
    from app.vector_store import ingest_pdf_documents

    try:
        count = ingest_pdf_documents(request.pdf_paths)
        return JSONResponse(
            content={
                "status": "success",
                "chunks_ingested": count,
                "backend": settings.VECTOR_DB_BACKEND,
                "uploaded_by": current_user.email,
            }
        )
    except Exception as exc:
        logger.error("❌ Ingestion error: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))


# ===========================================================================
# PRIVATE HELPERS
# ===========================================================================

def _get_patient_or_404(patient_id: int, current_user: User, db: Session) -> Patient:
    """
    Fetches a patient by ID and verifies they belong to the current user.
    Raises 404 if not found, 403 if owned by someone else.
    """
    patient = db.get(Patient, patient_id)
    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Family member with id={patient_id} not found.",
        )
    if patient.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this family member's data.",
        )
    return patient
