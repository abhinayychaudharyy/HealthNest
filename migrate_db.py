import os
import sys
from sqlalchemy import create_engine, text
from app.config import settings

def migrate():
    # Force utf-8 encoding for stdout if possible, or just don't use emojis
    engine = create_engine(settings.DATABASE_URL)
    
    # We will use simple autocommit connections to avoid rollback on print errors
    with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
        print("Migrating database...")
        try:
            print("Adding phone_number to users table...")
            conn.execute(text("ALTER TABLE users ADD COLUMN phone_number VARCHAR(20);"))
            print("Successfully added phone_number to users.")
        except Exception as e:
            print(f"Could not add phone_number to users (it might already exist).")

        try:
            print("Adding instructions to medication_schedules table...")
            conn.execute(text("ALTER TABLE medication_schedules ADD COLUMN instructions VARCHAR(500);"))
            print("Successfully added instructions to medication_schedules.")
        except Exception as e:
            print(f"Could not add instructions to medication_schedules (it might already exist).")

        try:
            print("Adding phone_number to patients table...")
            conn.execute(text("ALTER TABLE patients ADD COLUMN phone_number VARCHAR(20);"))
            print("Successfully added phone_number to patients.")
        except Exception as e:
            print(f"Could not add phone_number to patients (it might already exist).")

        try:
            print("Creating medical_reports table...")
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS medical_reports (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL REFERENCES users(id),
                    patient_id INTEGER REFERENCES patients(id),
                    filename VARCHAR(500) NOT NULL,
                    filepath VARCHAR(1000) NOT NULL,
                    file_size_kb FLOAT,
                    ai_summary TEXT,
                    uploaded_at TIMESTAMP DEFAULT NOW()
                );
            """))
            print("Successfully created medical_reports table.")
        except Exception as e:
            print(f"Could not create medical_reports table: {e}")

if __name__ == "__main__":
    migrate()

