"""
models.py — SQLAlchemy/SQLModel Database Schemas
Defines all ORM models for the Family Health Manager.
Tables: users, patients, medication_schedules, vitals_bp, vitals_sugar
"""

from datetime import datetime
from typing import Optional, List
from sqlmodel import Field, SQLModel, Relationship


# ---------------------------------------------------------------------------
# User Model — created automatically on first Google OAuth login
# ---------------------------------------------------------------------------

class UserBase(SQLModel):
    google_sub: Optional[str] = Field(
        default=None,
        unique=True,
        index=True,
        description="Google's unique subject identifier",
    )
    email: str = Field(unique=True, index=True, max_length=320)
    name: str = Field(max_length=255)
    picture: Optional[str] = Field(default=None, description="Profile picture URL")
    phone_number: Optional[str] = Field(
        default=None,
        max_length=20,
        description="Mobile number in E.164 format for SMS reminders (e.g., +919876543210)",
    )
    hashed_password: Optional[str] = Field(default=None, description="Hashed password for manual auth")


class User(UserBase, table=True):
    __tablename__ = "users"

    id: Optional[int] = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    # Relationships
    patients: list["Patient"] = Relationship(back_populates="owner")


class UserRead(SQLModel):
    """Response schema for returning user profile info. Does NOT include hashed_password."""
    id: int
    email: str
    name: str
    picture: Optional[str] = None
    phone_number: Optional[str] = None
    google_sub: Optional[str] = None
    created_at: datetime


class UserUpdate(SQLModel):
    """Request schema for updating a user."""
    phone_number: Optional[str] = Field(
        default=None,
        description="Must be valid E.164 format if provided."
    )


class UserRegister(SQLModel):
    """Request schema for manual registration."""
    name: str
    email: str
    password: str


class UserLogin(SQLModel):
    """Request schema for manual login."""
    email: str
    password: str


# ---------------------------------------------------------------------------
# Patient Model
# ---------------------------------------------------------------------------

class PatientBase(SQLModel):
    name: str = Field(index=True, min_length=1, max_length=255)
    age: int = Field(ge=0, le=150)
    relationship_to_user: Optional[str] = Field(
        default=None,
        max_length=100,
        description="How this person is related to you, e.g. 'Dad', 'Mom', 'Wife'",
    )
    baseline_medical_conditions: Optional[str] = Field(
        default=None,
        description="Comma-separated list of pre-existing conditions (e.g., 'Diabetes, Hypertension')",
    )
    phone_number: Optional[str] = Field(
        default=None,
        max_length=20,
        description="Mobile number in E.164 format for SMS reminders (e.g., +919876543210)",
    )


class Patient(PatientBase, table=True):
    __tablename__ = "patients"

    id: Optional[int] = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    # FK — every patient belongs to exactly one user (family member)
    user_id: int = Field(foreign_key="users.id", index=True)

    # Relationships
    owner: Optional[User] = Relationship(back_populates="patients")
    medication_schedules: list["MedicationSchedule"] = Relationship(back_populates="patient")
    vitals_bp: list["VitalsBP"] = Relationship(back_populates="patient")
    vitals_sugar: list["VitalsSugar"] = Relationship(back_populates="patient")
    custom_tests: list["CustomTest"] = Relationship(back_populates="patient")


class PatientCreate(PatientBase):
    """Request schema for creating a new patient (family member)."""
    pass


class PatientRead(PatientBase):
    """Response schema for reading patient data."""
    id: int
    user_id: int
    created_at: datetime


class PatientUpdate(SQLModel):
    """Request schema for updating an existing patient's details."""
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    age: Optional[int] = Field(default=None, ge=0, le=150)
    relationship_to_user: Optional[str] = Field(default=None, max_length=100)
    baseline_medical_conditions: Optional[str] = Field(default=None)
    phone_number: Optional[str] = Field(default=None, max_length=20)


# ---------------------------------------------------------------------------
# Medication Schedule Model
# ---------------------------------------------------------------------------

class MedicationScheduleBase(SQLModel):
    medicine_name: str = Field(min_length=1, max_length=255)
    dosage: str = Field(
        description="e.g., '500mg', '1 tablet'",
        max_length=100,
    )
    time_of_day: str = Field(
        description="24-hour format HH:MM — e.g., '08:00', '14:30'",
    )
    is_recurring: bool = Field(
        default=True,
        description="If True, reminder resets daily at midnight and fires every day",
    )
    instructions: Optional[str] = Field(
        default=None,
        max_length=500,
        description="Additional instructions, e.g., 'Before food'",
    )
    notification_status: str = Field(default="pending", max_length=20)


class MedicationSchedule(MedicationScheduleBase, table=True):
    __tablename__ = "medication_schedules"

    id: Optional[int] = Field(default=None, primary_key=True)
    patient_id: int = Field(foreign_key="patients.id", index=True)

    # Relationship
    patient: Optional[Patient] = Relationship(back_populates="medication_schedules")


class MedicationScheduleCreate(MedicationScheduleBase):
    """Request schema for creating a medication schedule."""
    patient_id: int


class MedicationScheduleRead(MedicationScheduleBase):
    """Response schema for reading a medication schedule."""
    id: int
    patient_id: int


class MedicationScheduleUpdate(SQLModel):
    """Request schema for updating a medication schedule."""
    medicine_name: Optional[str] = None
    dosage: Optional[str] = None
    time_of_day: Optional[str] = None
    is_recurring: Optional[bool] = None
    instructions: Optional[str] = None


# ---------------------------------------------------------------------------
# Blood Pressure Vitals Model
# ---------------------------------------------------------------------------

class VitalsBPBase(SQLModel):
    systolic: int = Field(
        ge=50,
        le=300,
        description="Systolic blood pressure in mmHg",
    )
    diastolic: int = Field(
        ge=30,
        le=200,
        description="Diastolic blood pressure in mmHg",
    )


class VitalsBP(VitalsBPBase, table=True):
    __tablename__ = "vitals_bp"

    id: Optional[int] = Field(default=None, primary_key=True)
    patient_id: int = Field(foreign_key="patients.id", index=True)
    recorded_at: datetime = Field(default_factory=datetime.utcnow)

    # Relationship
    patient: Optional[Patient] = Relationship(back_populates="vitals_bp")


class VitalsBPCreate(VitalsBPBase):
    """Request schema for logging a blood pressure reading."""
    patient_id: int
    recorded_at: Optional[datetime] = Field(default=None, description="Optional custom timestamp")


class VitalsBPRead(VitalsBPBase):
    """Response schema for reading a blood pressure record."""
    id: int
    patient_id: int
    recorded_at: datetime


class VitalsBPUpdate(SQLModel):
    """Request schema for updating a blood pressure record."""
    systolic: Optional[int] = Field(default=None, ge=50, le=300)
    diastolic: Optional[int] = Field(default=None, ge=30, le=200)
    recorded_at: Optional[datetime] = None


# ---------------------------------------------------------------------------
# Blood Sugar Vitals Model
# ---------------------------------------------------------------------------

class VitalsSugarBase(SQLModel):
    fasting_sugar: float = Field(
        ge=0.0,
        le=1000.0,
        description="Fasting blood glucose level in mg/dL",
    )
    post_meal_sugar: float = Field(
        ge=0.0,
        le=1500.0,
        description="Post-meal (postprandial) blood glucose in mg/dL",
    )


class VitalsSugar(VitalsSugarBase, table=True):
    __tablename__ = "vitals_sugar"

    id: Optional[int] = Field(default=None, primary_key=True)
    patient_id: int = Field(foreign_key="patients.id", index=True)
    recorded_at: datetime = Field(default_factory=datetime.utcnow)

    # Relationship
    patient: Optional[Patient] = Relationship(back_populates="vitals_sugar")


class VitalsSugarCreate(VitalsSugarBase):
    """Request schema for logging a sugar reading."""
    patient_id: int
    recorded_at: Optional[datetime] = Field(default=None, description="Optional custom timestamp")


class VitalsSugarRead(VitalsSugarBase):
    """Response schema for reading a sugar record."""
    id: int
    patient_id: int
    recorded_at: datetime


class VitalsSugarUpdate(SQLModel):
    """Request schema for updating a sugar record."""
    fasting_sugar: Optional[float] = Field(default=None, ge=0.0, le=1000.0)
    post_meal_sugar: Optional[float] = Field(default=None, ge=0.0, le=1500.0)
    recorded_at: Optional[datetime] = None


# ---------------------------------------------------------------------------
# Custom Home Tests Model
# ---------------------------------------------------------------------------

class CustomTestBase(SQLModel):
    test_name: str = Field(max_length=100, description="e.g., 'Weight', 'SpO2'")
    value: float = Field(description="The numeric value of the test")
    unit: str = Field(max_length=20, description="e.g., 'kg', '%'")


class CustomTest(CustomTestBase, table=True):
    __tablename__ = "custom_tests"

    id: Optional[int] = Field(default=None, primary_key=True)
    patient_id: int = Field(foreign_key="patients.id", index=True)
    recorded_at: datetime = Field(default_factory=datetime.utcnow)

    patient: Optional[Patient] = Relationship(back_populates="custom_tests")


class CustomTestCreate(CustomTestBase):
    """Request schema for logging a custom test."""
    patient_id: int
    recorded_at: Optional[datetime] = None


class CustomTestRead(CustomTestBase):
    """Response schema for reading a custom test record."""
    id: int
    patient_id: int
    recorded_at: datetime


class CustomTestUpdate(SQLModel):
    """Request schema for updating a custom test record."""
    test_name: Optional[str] = None
    value: Optional[float] = None
    unit: Optional[str] = None
    recorded_at: Optional[datetime] = None


# ---------------------------------------------------------------------------
# Medical Report Model — for uploaded PDF reports + AI analysis
# ---------------------------------------------------------------------------

class MedicalReport(SQLModel, table=True):
    __tablename__ = "medical_reports"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    patient_id: Optional[int] = Field(default=None, foreign_key="patients.id", index=True)
    filename: str = Field(max_length=500)
    filepath: str = Field(max_length=1000)
    file_size_kb: Optional[float] = Field(default=None)
    ai_summary: Optional[str] = Field(default=None)
    uploaded_at: datetime = Field(default_factory=datetime.utcnow)


class MedicalReportRead(SQLModel):
    """Response schema for reading a medical report."""
    id: int
    user_id: int
    patient_id: Optional[int]
    filename: str
    file_size_kb: Optional[float]
    ai_summary: Optional[str]
    uploaded_at: datetime
