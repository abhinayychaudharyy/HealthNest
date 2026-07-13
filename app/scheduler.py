"""
scheduler.py — APScheduler Background Worker (Care Coordinator)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LLM used: groq/gemma2-9b-it
Why: Lightweight, fast instruction-following model — perfect for composing
short, personalized medication reminder messages. No need for a 70B model
to write a 2-sentence notification.

Polls medication_schedules every minute. If time matches, it:
  1. Uses Gemma 2 9B to compose a warm, personalized notification message.
  2. Fires send_alert() with the AI-composed message.
  3. Marks the schedule as "sent" to prevent duplicate alerts.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

import logging
from datetime import datetime

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger
from sqlmodel import Session, select

from app.config import settings
from app.database import engine
from app.models import MedicationSchedule, Patient, User

logger = logging.getLogger(__name__)


# ============================================================================
# Notification LLM — groq/gemma2-9b-it (lazy singleton)
# ============================================================================

_notification_llm = None

def get_notification_llm():
    """
    Returns a ChatGroq instance using gemma2-9b-it.
    Initialized lazily on first medication alert.
    This is a SEPARATE LLM from the ones used in the agent graph.
    """
    global _notification_llm
    if _notification_llm is None:
        from langchain_groq import ChatGroq
        _notification_llm = ChatGroq(
            model=settings.NOTIFICATION_MODEL,        # gemma2-9b-it
            api_key=settings.GROQ_API_KEY,
            temperature=settings.NOTIFICATION_TEMPERATURE,
            max_tokens=150,   # notification messages should be concise
        )
        logger.info(
            "[Scheduler] Notification LLM initialized: %s",
            settings.NOTIFICATION_MODEL,
        )
    return _notification_llm


NOTIFICATION_SYSTEM_PROMPT = """
You are a warm, caring healthcare assistant composing a medication reminder notification.
Write a SHORT (2-3 sentences max), friendly, and encouraging medication reminder.
Include the medicine name and dosage. Be empathetic — the patient may be elderly or unwell.
If there are any special instructions (like 'before food' or 'with milk'), clearly mention them in a natural way.
Do NOT include any medical advice, dosage changes, or diagnoses.
Output ONLY the notification message text — nothing else.
"""


def compose_notification_message(
    patient_name: str,
    medicine_name: str,
    dosage: str,
    scheduled_time: str,
    instructions: str = None,
) -> str:
    """
    Uses groq/gemma2-9b-it to generate a warm, personalized notification message.
    Falls back to a default template if the LLM call fails.
    """
    try:
        from langchain_core.messages import HumanMessage, SystemMessage
        from langchain_core.output_parsers import StrOutputParser

        instruction_text = f"\nInstructions: {instructions}" if instructions else ""
        messages = [
            SystemMessage(content=NOTIFICATION_SYSTEM_PROMPT),
            HumanMessage(
                content=(
                    f"Patient name: {patient_name}\n"
                    f"Medicine: {medicine_name}\n"
                    f"Dosage: {dosage}\n"
                    f"Scheduled time: {scheduled_time}{instruction_text}"
                )
            ),
        ]
        message = (get_notification_llm() | StrOutputParser()).invoke(messages)
        return message.strip()

    except Exception as exc:
        logger.warning(
            "[Scheduler] Gemma notification compose failed (%s) — using fallback template.", exc
        )
        # Safe fallback template if LLM is unavailable
        instruction_str = f" ({instructions})" if instructions else ""
        return (
            f"💊 Medication Reminder for {patient_name}: "
            f"It's time to take your {medicine_name} ({dosage}). "
            f"Scheduled at {scheduled_time}.{instruction_str} Please take your medication as prescribed. 🙏"
        )


# ============================================================================
# Notification Dispatcher
# ============================================================================

def send_alert(
    patient_id: int,
    patient_name: str,
    medicine_name: str,
    dosage: str,
    scheduled_time: str,
    ai_message: str,
    phone_number: str = None,
) -> None:
    """
    Sends the notification message to the patient or caregiver via SMS using Twilio.
    """
    border = "=" * 65
    logger.warning(
        "🔔 [MEDICATION ALERT] Patient: %s (ID: %s) | %s %s @ %s",
        patient_name, patient_id, medicine_name, dosage, scheduled_time,
    )
    print(
        f"\n{border}\n"
        f"  💊  MEDICATION REMINDER  [{datetime.now().strftime('%H:%M:%S')}]\n"
        f"{border}\n"
        f"  Patient   : {patient_name} (ID: {patient_id})\n"
        f"  Medicine  : {medicine_name}\n"
        f"  Dosage    : {dosage}\n"
        f"  Scheduled : {scheduled_time}\n"
        f"  Phone     : {phone_number or 'None'}\n"
        f"{border}\n"
        f"  📝 AI Message (via {settings.NOTIFICATION_MODEL}):\n"
        f"  {ai_message}\n"
        f"{border}\n"
    )

    if settings.TWILIO_ENABLED and phone_number:
        try:
            from twilio.rest import Client
            client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
            message = client.messages.create(
                body=ai_message,
                from_=settings.TWILIO_FROM_NUMBER,
                to=phone_number
            )
            logger.info("[Scheduler] ✅ Twilio SMS sent to %s (SID: %s)", phone_number, message.sid)
        except Exception as exc:
            logger.error("[Scheduler] ❌ Failed to send Twilio SMS to %s: %s", phone_number, exc)
    elif settings.TWILIO_ENABLED and not phone_number:
        logger.warning("[Scheduler] ⚠️ Twilio is enabled but no phone number found for patient %s (ID: %s)", patient_name, patient_id)


# ============================================================================
# Core Polling Job
# ============================================================================

def check_medication_schedules() -> None:
    """
    Runs every SCHEDULER_POLL_INTERVAL_SECONDS.

    Steps:
      1. Get current HH:MM time.
      2. Query medication_schedules for matching pending rows.
      3. Fetch the patient's name for personalization.
      4. Use gemma2-9b-it to compose a warm notification message.
      5. Dispatch the alert via send_alert().
      6. Mark row as "sent" to prevent re-firing.
    """
    current_time = datetime.now().strftime("%H:%M")
    logger.info("[Scheduler] Checking medication schedules at %s...", current_time)

    try:
        with Session(engine) as session:
            due_meds = session.exec(
                select(MedicationSchedule).where(
                    MedicationSchedule.time_of_day == current_time,
                    MedicationSchedule.notification_status == "pending",
                )
            ).all()

            if not due_meds:
                logger.info("[Scheduler] No medications due at %s.", current_time)
                return

            logger.info("[Scheduler] %d medication(s) due at %s.", len(due_meds), current_time)

            for med in due_meds:
                # Fetch patient name for personalized message
                patient = session.get(Patient, med.patient_id)
                patient_name = patient.name if patient else f"Patient #{med.patient_id}"

                # Fetch caregiver/user phone number or fallback to patient's phone number
                user = session.get(User, patient.user_id) if patient else None
                phone_number = None
                if user and user.phone_number:
                    phone_number = user.phone_number
                elif patient and patient.phone_number:
                    phone_number = patient.phone_number

                # Compose AI-generated notification via gemma2-9b-it
                ai_message = compose_notification_message(
                    patient_name=patient_name,
                    medicine_name=med.medicine_name,
                    dosage=med.dosage,
                    scheduled_time=med.time_of_day,
                    instructions=med.instructions,
                )

                # Dispatch the notification
                send_alert(
                    patient_id=med.patient_id,
                    patient_name=patient_name,
                    medicine_name=med.medicine_name,
                    dosage=med.dosage,
                    scheduled_time=med.time_of_day,
                    ai_message=ai_message,
                    phone_number=phone_number,
                )

                # Mark as sent
                med.notification_status = "sent"
                session.add(med)

            session.commit()
            logger.info("[Scheduler] ✅ Sent %d notification(s).", len(due_meds))

    except Exception as exc:
        logger.error("[Scheduler] ❌ Error: %s", exc, exc_info=True)


# ============================================================================
# Daily Midnight Reset — Recurring Medications
# ============================================================================

def reset_recurring_medications() -> None:
    """
    Runs every day at midnight (00:00 UTC).

    Resets notification_status back to 'pending' for all medications
    where is_recurring=True. This ensures recurring daily medications
    fire a reminder every day, not just the first time.
    """
    logger.info("[Scheduler] 🌙 Midnight reset — resetting recurring medication statuses...")
    try:
        with Session(engine) as session:
            recurring_meds = session.exec(
                select(MedicationSchedule).where(
                    MedicationSchedule.is_recurring == True,        # noqa: E712
                    MedicationSchedule.notification_status == "sent",
                )
            ).all()

            count = 0
            for med in recurring_meds:
                med.notification_status = "pending"
                session.add(med)
                count += 1

            session.commit()
            logger.info(
                "[Scheduler] ✅ Reset %d recurring medication(s) to 'pending'.", count
            )

    except Exception as exc:
        logger.error("[Scheduler] ❌ Midnight reset error: %s", exc, exc_info=True)


# ============================================================================
# Scheduler Factory
# ============================================================================

def create_scheduler() -> BackgroundScheduler:
    from apscheduler.triggers.cron import CronTrigger

    scheduler = BackgroundScheduler(
        job_defaults={
            "coalesce": True,
            "max_instances": 1,
            "misfire_grace_time": 30,
        },
        timezone="UTC",
    )

    # ── Job 1: Check & fire medication reminders every N seconds ────────────
    scheduler.add_job(
        func=check_medication_schedules,
        trigger=IntervalTrigger(seconds=settings.SCHEDULER_POLL_INTERVAL_SECONDS),
        id="medication_check",
        name=f"Medication Checker (AI: {settings.NOTIFICATION_MODEL})",
        replace_existing=True,
    )

    # ── Job 2: Daily midnight reset for recurring medications ────────────────
    scheduler.add_job(
        func=reset_recurring_medications,
        trigger=CronTrigger(hour=0, minute=0, second=0, timezone="UTC"),
        id="midnight_reset",
        name="Daily Midnight Reset (recurring medications → pending)",
        replace_existing=True,
    )

    return scheduler
