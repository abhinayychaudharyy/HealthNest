# 🏥 Family Health Manager
### Personal AI Health Assistant for Your Family

> Manage your family's health in one place — track vitals, set medication reminders, and get AI-powered health insights. Log in with Gmail. 100% private — only you see your family's data.

> Built with **FastAPI + LangGraph + Groq + PostgreSQL + Pinecone** — 100% Open-Source & Free-Tier Ready

---

## 💡 What This App Does

- 🔐 **Login with Gmail** — sign in once, your account is auto-created
- 👨‍👩‍👧 **Add Family Members** — "Dad (65, Diabetes)", "Mom (60, Hypertension)"
- 📊 **Track Vitals** — log blood pressure & blood sugar over time
- 💊 **Medication Reminders** — daily recurring reminders via AI-composed messages
- 🤖 **AI Health Assistant** — ask questions like *"Can Dad eat an apple? His sugar's been high"*
- 🔒 **100% Private** — your data is only visible to you

---

## 📐 Architecture Overview

```
User (Gmail Login → JWT)
  │
  ▼
┌─────────────────────────────────┐
│        FastAPI REST API          │
│  /auth /patients /vitals /chat  │
└────────────┬────────────────────┘
             │
┌────────────▼───────────────────────┐
│     LangGraph Multi-Agent AI       │
│  Supervisor → RAG | Vitals → Gen  │
│  (Groq: 4 models, NVIDIA embeds)   │
└────────────────────────────────────┘
             │
┌────────────▼───────────────────────┐
│   APScheduler (Care Coordinator)   │
│   Medication Reminders + Daily    │
│   Midnight Reset (recurring meds)  │
└────────────────────────────────────┘
```

---

## 📁 Project Structure

```
ailifetimeadmin/
├── app/
│   ├── __init__.py          # Package initializer
│   ├── auth.py              # Google OAuth2 + JWT authentication
│   ├── config.py            # Pydantic BaseSettings (.env loader)
│   ├── database.py          # SQLModel engine & session factory
│   ├── models.py            # ORM schemas: users, patients, vitals, medication
│   ├── graph.py             # LangGraph StateGraph + all 4 agent nodes
│   ├── vector_store.py      # ChromaDB / Pinecone abstraction layer
│   ├── scheduler.py         # APScheduler medication care coordinator
│   └── main.py              # FastAPI app, all REST endpoints
├── ingest_reports.py        # CLI utility: ingest PDFs into vector DB
├── requirements.txt         # All Python dependencies
├── .env.example             # Environment variable template (copy → .env)
└── README.md
```

---

## 🛠️ Tech Stack

| Layer | Technology | Why |
|---|---|---|
| **Web Framework** | FastAPI | Async, auto-docs, Pydantic validation |
| **Authentication** | Google OAuth2 + JWT | Login with Gmail, JWT for API access |
| **Agent Orchestration** | LangGraph + LangChain | Graph-based stateful multi-agent flow |
| **LLM (Supervisor)** | Groq / llama-3.1-8b-instant | Fast deterministic routing |
| **LLM (Vitals)** | Groq / llama-3.3-70b-versatile | Deep clinical trend analysis |
| **LLM (Generator)** | Groq / llama-3.3-70b-versatile | Highest quality patient-facing response |
| **LLM (Notifications)** | Groq / gemma2-9b-it | Concise medication reminder messages |
| **Embeddings** | NVIDIA NIM / nv-embedqa-e5-v5 | Medical-domain RAG retrieval |
| **Relational DB** | PostgreSQL + SQLModel | Typed ORM with Pydantic integration |
| **Vector DB (default)** | ChromaDB | Fully local, persistent, zero cost |
| **Vector DB (optional)** | Pinecone Free Tier | Cloud alternative with free index |
| **Background Jobs** | APScheduler | Medication reminders + daily reset |

---

## 🚀 Quick Start

### Prerequisites

| Tool | Install |
|---|---|
| Python 3.11+ | https://python.org |
| PostgreSQL | https://postgresql.org |

### 1. Clone & Install Dependencies

```bash
git clone <your-repo-url>
cd ailifetimeadmin

python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

pip install -r requirements.txt
```

### 2. Configure Google OAuth

1. Go to https://console.cloud.google.com/
2. Create a project → **APIs & Services → Credentials**
3. **Create Credentials → OAuth 2.0 Client ID**
4. Application type: **Web application**
5. Authorized redirect URIs: `http://localhost:8000/auth/callback`
6. Copy **Client ID** and **Client Secret**

### 3. Set Up PostgreSQL

```sql
CREATE DATABASE healthcare_ai_db;
```

### 4. Configure Environment

```bash
cp .env.example .env
# Edit .env and fill in:
#   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
#   DATABASE_URL, GROQ_API_KEY, NVIDIA_API_KEY
#   JWT_SECRET_KEY (generate: python -c "import secrets; print(secrets.token_hex(32))")
```

### 5. Run the Application

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The server will:
- Auto-create all database tables (users, patients, vitals, medications)
- Start the APScheduler medication checker
- Start the daily midnight medication reset job
- Serve the API at http://localhost:8000
- Serve Swagger docs at http://localhost:8000/docs

---

## 🔐 Authentication Flow

```
1. Open browser → http://localhost:8000/auth/google
2. Sign in with your Gmail account
3. You're redirected to /auth/callback — account auto-created!
4. Copy the access_token from the response
5. Use it for all API calls:
   Authorization: Bearer <your_token>
```

---

## 📡 API Endpoints

### Authentication

| Method | Endpoint | Description |
|---|---|---|
| GET | /auth/google | Start Gmail login |
| GET | /auth/callback | OAuth callback → returns JWT |
| GET | /auth/me | Get your profile |

### Family Members

| Method | Endpoint | Description |
|---|---|---|
| GET | /api/v1/patients/ | List all your family members |
| POST | /api/v1/patients/ | Add a family member |
| GET | /api/v1/patients/{id} | Get one family member |
| DELETE | /api/v1/patients/{id} | Remove a family member |

**Example: Add Family Member**
```bash
curl -X POST http://localhost:8000/api/v1/patients/ \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Dad", "age": 65, "relationship_to_user": "Father", "baseline_medical_conditions": "Type 2 Diabetes, Hypertension"}'
```

### Medications

| Method | Endpoint | Description |
|---|---|---|
| POST | /api/v1/patients/{id}/medications/ | Add medication schedule |
| GET | /api/v1/patients/{id}/medications/ | List all medications |
| PATCH | /api/v1/patients/{id}/medications/{med_id} | Update medication |
| DELETE | /api/v1/patients/{id}/medications/{med_id} | Delete medication |

### Vitals

| Method | Endpoint | Description |
|---|---|---|
| POST | /api/v1/vitals/bp/ | Log blood pressure |
| GET | /api/v1/vitals/bp/{patient_id} | Get BP history |
| POST | /api/v1/vitals/sugar/ | Log blood sugar |
| GET | /api/v1/vitals/sugar/{patient_id} | Get sugar history |

### Dashboard & AI

| Method | Endpoint | Description |
|---|---|---|
| GET | /api/v1/dashboard/ | All family members + latest vitals |
| POST | /api/v1/chat/ | Ask AI about a family member |
| POST | /api/v1/admin/ingest-documents/ | Load PDFs into vector DB |

**Example: AI Chat**
```bash
curl -X POST http://localhost:8000/api/v1/chat/ \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"patient_id": "1", "query": "Can Dad eat an apple? His sugar has been high lately."}'
```

---

## 💊 Medication Scheduler

Two background jobs run automatically:

1. **Reminder Checker** (every 60s): Fires AI-composed reminders when `time_of_day == HH:MM now`
2. **Midnight Reset** (00:00 UTC daily): Resets all `is_recurring=true` medications back to `pending`

This means if you set `is_recurring=true`, your family member gets a reminder **every single day**.

Set `is_recurring=false` for one-time medications.

---

## 🛡️ Safety Guardrails

1. **No Medication Changes** — AI never suggests dosage changes
2. **Danger Alerts** — auto-detects dangerous vitals:
   - Fasting sugar > 126 mg/dL or Post-meal > 180 mg/dL
   - Systolic BP > 140 mmHg or Diastolic > 90 mmHg
3. **Dietary Disclaimer** — appended to all food suggestions
4. **Data Privacy** — each user only sees their own family's data

---

## 📜 License

MIT License — Free to use, modify, and distribute.


---

## 📐 Architecture Overview

```
                         ┌─────────────────────────────────┐
                         │        FastAPI REST API          │
                         │  /patients  /vitals  /chat       │
                         └────────────┬────────────────────-┘
                                      │
                    ┌─────────────────▼──────────────────┐
                    │     LangGraph StateGraph           │
                    │                                    │
                    │    ┌──────────────────────┐        │
                    │    │   Supervisor Node    │        │
                    │    │  (ChatOllama Router) │        │
                    │    └──────┬───────┬───────┘        │
                    │           │       │                 │
                    │    ┌──────▼──┐  ┌─▼────────┐       │
                    │    │RAG_Node │  │Vitals_Node│      │
                    │    │ChromaDB │  │PostgreSQL │      │
                    │    │Ollama   │  │SQLModel   │      │
                    │    └──────┬──┘  └─┬─────────┘      │
                    │           └───┬───┘                 │
                    │         ┌─────▼──────────────┐      │
                    │         │  Generator_Node    │      │
                    │         │ (Safety Guardrails)│      │
                    │         └─────────────────---┘      │
                    └─────────────────────────────────────┘
                                      │
                    ┌─────────────────▼──────────────────┐
                    │   APScheduler Background Worker     │
                    │   (Medication Care Coordinator)     │
                    └─────────────────────────────────────┘
```

---

## 📁 Project Structure

```
ailifetimeadmin/
├── app/
│   ├── __init__.py          # Package initializer
│   ├── config.py            # Pydantic BaseSettings (.env loader)
│   ├── database.py          # SQLModel engine & session factory
│   ├── models.py            # ORM schemas: patients, vitals, medication
│   ├── graph.py             # LangGraph StateGraph + all 4 agent nodes
│   ├── vector_store.py      # ChromaDB / Pinecone abstraction layer
│   ├── scheduler.py         # APScheduler medication care coordinator
│   └── main.py              # FastAPI app, lifespan, all REST endpoints
├── ingest_reports.py        # CLI utility: ingest PDFs into vector DB
├── requirements.txt         # All Python dependencies (pinned)
├── .env.example             # Environment variable template
└── README.md
```

---

## 🛠️ Tech Stack

| Layer | Technology | Why |
|---|---|---|
| **Web Framework** | FastAPI | Async, auto-docs, Pydantic validation |
| **Agent Orchestration** | LangGraph + LangChain | Graph-based stateful multi-agent flow |
| **Local LLM** | Ollama (llama3 / mistral) | Free, private, no API key needed |
| **Local Embeddings** | Ollama (nomic-embed-text) | Free vector embeddings locally |
| **Relational DB** | PostgreSQL + SQLModel | Typed ORM with Pydantic integration |
| **Vector DB (default)** | ChromaDB | Fully local, persistent, zero cost |
| **Vector DB (optional)** | Pinecone Free Tier | Cloud alternative with free index |
| **Background Jobs** | APScheduler | Lightweight in-process cron |

---

## 🚀 Quick Start

### Prerequisites

| Tool | Install |
|---|---|
| Python 3.11+ | https://python.org |
| PostgreSQL | https://postgresql.org |
| Ollama | https://ollama.ai |

### 1. Clone & Install Dependencies

```bash
git clone <your-repo-url>
cd ailifetimeadmin

python -m venv venv
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

pip install -r requirements.txt
```

### 2. Set Up Ollama (Local LLM)

```bash
# Install Ollama from https://ollama.ai
# Then pull the required models:
ollama pull llama3                # Main LLM (~4.7GB)
ollama pull nomic-embed-text     # Embeddings (~270MB)

# Start the Ollama server:
ollama serve
```

### 3. Set Up PostgreSQL

```sql
-- Create the database
CREATE DATABASE healthcare_ai_db;
```

### 4. Configure Environment

```bash
# Copy the template
cp .env.example .env

# Edit .env with your actual PostgreSQL credentials
# The database tables are auto-created on startup via SQLModel
```

### 5. Run the Application

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The server will:
- Auto-create all database tables
- Start the APScheduler medication checker
- Serve the API at http://localhost:8000
- Serve Swagger docs at http://localhost:8000/docs

---

## 📡 API Endpoints

### Patients

| Method | Endpoint | Description |
|---|---|---|
| POST | /api/v1/patients/ | Create a new patient profile |
| GET | /api/v1/patients/{id} | Get patient by ID |
| POST | /api/v1/patients/{id}/medications/ | Add medication schedule |

**Example: Create Patient**
```bash
curl -X POST http://localhost:8000/api/v1/patients/ \
  -H "Content-Type: application/json" \
  -d '{"name": "Ravi Sharma", "age": 58, "baseline_medical_conditions": "Type 2 Diabetes, Hypertension"}'
```

### Vitals

| Method | Endpoint | Description |
|---|---|---|
| POST | /api/v1/vitals/bp/ | Log blood pressure reading |
| GET | /api/v1/vitals/bp/{patient_id} | Get BP history |
| POST | /api/v1/vitals/sugar/ | Log blood sugar reading |
| GET | /api/v1/vitals/sugar/{patient_id} | Get sugar history |

**Example: Log Blood Pressure**
```bash
curl -X POST http://localhost:8000/api/v1/vitals/bp/ \
  -H "Content-Type: application/json" \
  -d '{"patient_id": 1, "systolic": 145, "diastolic": 95}'
```

### AI Chat (Multi-Agent Pipeline)

| Method | Endpoint | Description |
|---|---|---|
| POST | /api/v1/chat/ | Run LangGraph healthcare AI workflow |
| POST | /api/v1/admin/ingest-documents/ | Load PDFs into vector DB |

**Example: Chat with AI**
```bash
curl -X POST http://localhost:8000/api/v1/chat/ \
  -H "Content-Type: application/json" \
  -d '{"patient_id": "1", "query": "Can he eat an apple? His sugar has been high lately."}'
```

---

## 🤖 LangGraph Agent Pipeline

### AgentState (Shared Memory)

```python
class AgentState(TypedDict):
    patient_id: str                    # Patient being queried
    user_query: str                    # Raw caregiver question
    chat_history: list[BaseMessage]    # Conversation context
    structured_data_context: dict      # SQL vitals query results
    unstructured_data_context: str     # RAG document retrieval results
    current_agent: str                 # Current node (for routing/debug)
    final_response: str                # Final safe response
```

### Agent Nodes

| Node | Role | LLM Used |
|---|---|---|
| **Supervisor** | Reads query, routes to RAG or Vitals node | ChatOllama |
| **RAG_Node** | OllamaEmbeddings, ChromaDB/Pinecone, retrieves clinical context | OllamaEmbeddings |
| **Vitals_Node** | SQLAlchemy queries, trend analysis on BP/Sugar | No LLM (pure SQL) |
| **Generator_Node** | Combines all context into safe empathetic response | ChatOllama |

---

## 🛡️ Safety Guardrails

The Generator_Node enforces these rules at the system prompt level:

1. **No Medication Changes** — Will never suggest dosage changes or new prescriptions
2. **Danger Alerts** — Auto-detects and hard-injects alerts for:
   - Fasting sugar > 126 mg/dL
   - Post-meal sugar > 180 mg/dL
   - Systolic BP > 140 mmHg
   - Diastolic BP > 90 mmHg
3. **Dietary Disclaimer** — Appended to all food/nutrition suggestions
4. **Uncertainty Handling** — Recommends consulting a physician when unsure

---

## 💊 Medication Scheduler (Care Coordinator)

The APScheduler worker runs every 60 seconds (configurable via .env):

1. Queries medication_schedules for rows where time_of_day == HH:MM now
2. Calls send_alert(patient_id, medicine_name, dosage, time) for each match
3. Updates notification_status to "sent" to prevent duplicate alerts

To extend notifications, replace send_alert() in scheduler.py with:
- Email: sendgrid-python or resend
- SMS: twilio
- Push: Firebase Admin SDK

---

## 📄 Ingesting Medical Reports (RAG Setup)

```bash
# Ingest individual PDFs
python ingest_reports.py /path/to/report1.pdf /path/to/report2.pdf

# Ingest all PDFs in a directory
python ingest_reports.py --dir /path/to/reports/

# Or via the admin API endpoint:
curl -X POST http://localhost:8000/api/v1/admin/ingest-documents/ \
  -H "Content-Type: application/json" \
  -d '{"pdf_paths": ["/data/reports/patient_report.pdf"]}'
```

---

## 🔄 Switching Vector DB Backends

**ChromaDB (Local, Default):**
```env
VECTOR_DB_BACKEND=chroma
CHROMA_PERSIST_DIR=./chroma_db
```

**Pinecone (Free-Tier Cloud):**
```env
VECTOR_DB_BACKEND=pinecone
PINECONE_API_KEY=your-key-here
PINECONE_INDEX_NAME=medical-reports
PINECONE_ENV=gcp-starter
```

---

## 🏗️ Production Checklist

- [ ] Set DEBUG=False in .env
- [ ] Restrict CORS allow_origins to your frontend domain
- [ ] Set a strong DATABASE_URL password
- [ ] Deploy Ollama on a GPU-enabled server for faster inference
- [ ] Replace mock send_alert() with real notification service
- [ ] Set up Alembic for database migrations
- [ ] Add authentication (JWT/OAuth2) to protect patient data
- [ ] Add rate limiting with slowapi
- [ ] Set up structured logging with CloudWatch / Datadog

---

## 📜 License

MIT License — Free to use, modify, and distribute.
