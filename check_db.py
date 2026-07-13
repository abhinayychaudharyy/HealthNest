"""
check_db.py — Finds correct PostgreSQL password and creates the database.
Run: .venv\Scripts\python.exe check_db.py
"""
import psycopg2
from psycopg2 import OperationalError
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT

ATTEMPTS = [
    "postgres",
    "root@123",
    "admin",
    "root",
    "1234",
    "postgres123",
    "",
]

DB_NAME = "healthcare_ai_db"
working_password = None

print("=" * 50)
print("  PostgreSQL Connection Test")
print("=" * 50)

for pwd in ATTEMPTS:
    try:
        conn = psycopg2.connect(
            host="localhost",
            port=5432,
            user="postgres",
            password=pwd,
            dbname="postgres",
            connect_timeout=3,
        )
        working_password = pwd
        print(f"[OK] Connected! Password is: '{pwd}'")

        # Now create the database
        conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
        cur = conn.cursor()

        # Check if DB already exists
        cur.execute(f"SELECT 1 FROM pg_database WHERE datname='{DB_NAME}';")
        if cur.fetchone():
            print(f"[OK] Database '{DB_NAME}' already exists.")
        else:
            cur.execute(f"CREATE DATABASE {DB_NAME};")
            print(f"[OK] Database '{DB_NAME}' created successfully!")

        cur.close()
        conn.close()
        print(f"\nUpdate your .env DATABASE_URL:")
        print(f"DATABASE_URL=postgresql://postgres:{pwd}@localhost:5432/{DB_NAME}")
        break

    except OperationalError as e:
        err = str(e).split("\n")[0].strip()
        print(f"[FAIL] password='{pwd}': {err}")

if working_password is None:
    print("\n[ERROR] Could not connect with any common password.")
    print("Please run this manually in pgAdmin or psql:")
    print(f"  CREATE DATABASE {DB_NAME};")
    print("Then update DATABASE_URL in .env with your actual password.")
