"""
graph.py — LangGraph Multi-Agent Workflow
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Each agent node uses a DIFFERENT, purpose-selected LLM:

  ┌─────────────────────────────────────────────────────────────────────┐
  │  Agent Node          │ LLM Used                  │ Role             │
  ├──────────────────────┼───────────────────────────┼──────────────────┤
  │  Supervisor          │ groq/llama3-8b-8192        │ Fast routing     │
  │  RAG Node            │ nvidia/nv-embedqa-e5-v5   │ Embeddings only  │
  │  Vitals Analyzer     │ groq/mixtral-8x7b-32768   │ Trend reasoning  │
  │  Generator           │ groq/llama3-70b-8192      │ Best quality resp│
  └─────────────────────────────────────────────────────────────────────┘

  (Notification composer uses groq/gemma2-9b-it — see scheduler.py)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Any, Literal, TypedDict

from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage
from langchain_core.output_parsers import StrOutputParser
from langgraph.graph import END, StateGraph

from app.config import settings
from app.database import engine
from app.models import VitalsBP, VitalsSugar
from app.vector_store import get_vector_store

logger = logging.getLogger(__name__)


# ============================================================================
# 1. Shared Agent State (TypedDict)
# ============================================================================

class AgentState(TypedDict):
    """Shared memory object passed between every node in the LangGraph."""

    patient_id: str
    user_query: str
    chat_history: list[BaseMessage]
    structured_data_context: dict[str, Any]
    """Holds SQL vitals query results + LLM-generated trend analysis text."""

    unstructured_data_context: str
    """Holds RAG retrieval results from the vector database."""

    report_summaries_context: str
    """Holds AI summaries from all previously uploaded reports for this user."""

    current_agent: str
    final_response: str


# ============================================================================
# 2. Per-Agent LLM Factory — Each Agent Gets Its Own Model
# ============================================================================

def _make_groq_llm(model: str, temperature: float, max_tokens: int = 1024):
    """Creates a ChatGroq instance for a specific agent."""
    from langchain_groq import ChatGroq
    return ChatGroq(
        model=model,
        api_key=settings.GROQ_API_KEY,
        temperature=temperature,
        max_tokens=max_tokens,
    )


def _make_nvidia_embeddings():
    """Creates NVIDIA NIM embeddings for the RAG Node."""
    from langchain_nvidia_ai_endpoints import NVIDIAEmbeddings
    return NVIDIAEmbeddings(
        model=settings.NVIDIA_EMBED_MODEL,
        api_key=settings.NVIDIA_API_KEY,
        truncate="NONE",
    )


# ── Lazy singletons — each agent's LLM is initialized only once ─────────────

_supervisor_llm = None      # groq/llama3-8b-8192      — fast routing
_vitals_llm = None          # groq/mixtral-8x7b-32768  — trend analysis
_generator_llm = None       # groq/llama3-70b-8192     — best quality response
_embeddings = None          # nvidia/nv-embedqa-e5-v5  — RAG embeddings
_report_llm = None          # groq/llama3-70b           — report analysis (Agent 5)


def get_supervisor_llm():
    """llama3-8b — fast, deterministic JSON router."""
    global _supervisor_llm
    if _supervisor_llm is None:
        _supervisor_llm = _make_groq_llm(
            model=settings.SUPERVISOR_MODEL,
            temperature=settings.SUPERVISOR_TEMPERATURE,
            max_tokens=64,   # routing output is tiny — just {"route": "X"}
        )
        logger.info("[LLM Init] Supervisor LLM: %s", settings.SUPERVISOR_MODEL)
    return _supervisor_llm


def get_vitals_llm():
    """mixtral-8x7b — strong reasoning for multi-step vitals trend analysis."""
    global _vitals_llm
    if _vitals_llm is None:
        _vitals_llm = _make_groq_llm(
            model=settings.VITALS_ANALYZER_MODEL,
            temperature=settings.VITALS_ANALYZER_TEMPERATURE,
            max_tokens=512,
        )
        logger.info("[LLM Init] Vitals LLM: %s", settings.VITALS_ANALYZER_MODEL)
    return _vitals_llm


def get_generator_llm():
    """llama3-70b — highest quality for patient-facing empathetic responses."""
    global _generator_llm
    if _generator_llm is None:
        _generator_llm = _make_groq_llm(
            model=settings.GENERATOR_MODEL,
            temperature=settings.GENERATOR_TEMPERATURE,
            max_tokens=settings.GENERATOR_MAX_TOKENS,
        )
        logger.info("[LLM Init] Generator LLM: %s", settings.GENERATOR_MODEL)
    return _generator_llm


def get_embeddings():
    """nvidia/nv-embedqa-e5-v5 — purpose-built for RAG retrieval."""
    global _embeddings
    if _embeddings is None:
        _embeddings = _make_nvidia_embeddings()
        logger.info("[LLM Init] Embeddings: %s", settings.NVIDIA_EMBED_MODEL)
    return _embeddings


def get_report_llm():
    """llama-3.3-70b — Agent 5: PDF report analysis and clinical summary."""
    global _report_llm
    if _report_llm is None:
        _report_llm = _make_groq_llm(
            model=settings.REPORT_ANALYZER_MODEL,
            temperature=settings.REPORT_ANALYZER_TEMPERATURE,
            max_tokens=2048,
        )
        logger.info("[LLM Init] Report Analyzer LLM: %s", settings.REPORT_ANALYZER_MODEL)
    return _report_llm


# ============================================================================
# 3. Safety Guardrails (enforced in Generator system prompt)
# ============================================================================

SAFETY_RULES = """
ABSOLUTE SAFETY RULES — YOU MUST FOLLOW THESE WITHOUT EXCEPTION:
1. NEVER prescribe new medications or suggest changes to existing medication dosages.
2. NEVER provide a definitive medical diagnosis.
3. If blood sugar levels are dangerously high (fasting > 126 mg/dL or post-meal > 180 mg/dL):
   You MUST output: ⚠️  ALERT: Sugar levels are in a dangerous range. Schedule an IMMEDIATE doctor's appointment.
4. If blood pressure is dangerously high (systolic > 140 mmHg or diastolic > 90 mmHg):
   You MUST output: ⚠️  ALERT: Blood pressure is elevated. Immediate medical review strongly recommended.
5. Any dietary suggestion MUST be followed by:
   📋 Disclaimer: This is general guidance only and does not replace personalised advice from a qualified healthcare professional.
6. Always respond in a calm, empathetic, and professional tone.
7. If uncertain: say "I recommend consulting a licensed physician for this concern."
"""

SUPERVISOR_SYSTEM_PROMPT = """
You are a healthcare AI supervisor. Your ONLY job is to output a routing JSON.

Agents available:
- "RAG_Node": queries about medical reports, clinical knowledge, medication details, drug interactions, general health questions.
- "Vitals_Node": queries about blood pressure, sugar, glucose, vital trends, or historical readings.

Output ONLY valid JSON. No explanation. No extra text.
Example: {"route": "RAG_Node"}
"""

VITALS_ANALYSIS_SYSTEM_PROMPT = """
You are a clinical data analyst AI. You receive raw structured vitals data (blood pressure and blood sugar readings).
Your job is to:
1. Identify trends (improving, worsening, stable).
2. Flag any readings that are outside the normal range.
3. Provide a brief, factual 3-4 sentence clinical summary of what the data shows.
4. Do NOT suggest medications or diagnoses.
5. Be precise and clinical. This summary will be passed to another AI for the final patient-facing response.
"""

GENERATOR_SYSTEM_PROMPT = f"""
You are a healthcare AI assistant helping caregivers and clinicians.

{SAFETY_RULES}

CRITICAL RESPONSE RULES:
1. Answer ONLY what the user asked. Be concise and direct.
2. If it's a yes/no question, answer yes or no FIRST, then briefly explain.
3. If the user asks for a specific value (e.g. "what was the sugar level?"), give the value directly.
4. Do NOT add unsolicited advice, long explanations, or padding.
5. Do NOT repeat the question back to the user.
6. Keep responses under 150 words for simple questions, under 300 words for complex ones.
7. Only include safety alerts (⚠️ ALERT) if vitals are in dangerous ranges — include these VERBATIM at the TOP.
8. Only add the dietary disclaimer if the user specifically asked about food/diet.
9. Be warm but brief. No essay-style responses.
10. Use the provided report summaries and vitals data to give accurate, data-backed answers.

You will receive: user query, vitals analysis, clinical document context, stored report summaries, and safety alerts.
"""


# ============================================================================
# 4. Danger Level Detector (deterministic — no LLM)
# ============================================================================

def _check_vitals_danger(structured_data: dict[str, Any]) -> list[str]:
    """Returns hard-coded alert strings for dangerous vitals — no LLM involved."""
    alerts: list[str] = []

    bp_readings = structured_data.get("blood_pressure", [])
    if bp_readings:
        latest = bp_readings[-1]
        if latest.get("systolic", 0) > 140 or latest.get("diastolic", 0) > 90:
            alerts.append(
                f"⚠️  ALERT: Blood pressure is elevated "
                f"({latest.get('systolic')}/{latest.get('diastolic')} mmHg). "
                "Immediate medical review strongly recommended."
            )

    sugar_readings = structured_data.get("blood_sugar", [])
    if sugar_readings:
        latest = sugar_readings[-1]
        if latest.get("fasting_sugar", 0) > 126 or latest.get("post_meal_sugar", 0) > 180:
            alerts.append(
                f"⚠️  ALERT: Sugar levels are in a dangerous range "
                f"(Fasting: {latest.get('fasting_sugar')} mg/dL, "
                f"Post-Meal: {latest.get('post_meal_sugar')} mg/dL). "
                "Please schedule an IMMEDIATE doctor's appointment."
            )
    return alerts


# ============================================================================
# 5. NODE 1 — Supervisor (groq/llama3-8b-8192)
#    Role: Route the query to the right specialist agent. Ultra-fast, tiny output.
# ============================================================================

def supervisor_node(state: AgentState) -> AgentState:
    logger.info(
        "[Supervisor | %s] Routing: '%s'",
        settings.SUPERVISOR_MODEL, state["user_query"]
    )

    messages = [
        SystemMessage(content=SUPERVISOR_SYSTEM_PROMPT),
        HumanMessage(content=f"Query: {state['user_query']}"),
    ]

    raw = (get_supervisor_llm() | StrOutputParser()).invoke(messages)

    try:
        cleaned = raw.strip().strip("```json").strip("```").strip()
        route = json.loads(cleaned).get("route", "RAG_Node")
        if route not in ("RAG_Node", "Vitals_Node"):
            raise ValueError(f"Unknown route: {route}")
    except Exception:
        logger.warning("[Supervisor] JSON parse failed — using keyword fallback.")
        query_lower = state["user_query"].lower()
        route = "Vitals_Node" if any(
            kw in query_lower for kw in
            ["blood pressure", "sugar", "glucose", "bp", "vitals", "reading", "level", "mmhg", "mg/dl"]
        ) else "RAG_Node"

    logger.info("[Supervisor] → Routing to: %s", route)
    return {**state, "current_agent": route}


def supervisor_router(state: AgentState) -> Literal["RAG_Node", "Vitals_Node"]:
    return state["current_agent"]  # type: ignore[return-value]


# ============================================================================
# 6. NODE 2 — RAG Node (nvidia/nv-embedqa-e5-v5 embeddings)
#    Role: Embed query → search ChromaDB/Pinecone → retrieve clinical context.
#    No chat LLM here — purely embedding-based retrieval.
# ============================================================================

def rag_node(state: AgentState) -> AgentState:
    logger.info(
        "[RAG Node | %s] Retrieving docs for: '%s'",
        settings.NVIDIA_EMBED_MODEL, state["user_query"]
    )

    retrieved_context = ""
    try:
        vector_store = get_vector_store(get_embeddings())
        retriever = vector_store.as_retriever(
            search_type="similarity",
            search_kwargs={"k": 4},
        )
        docs = retriever.invoke(state["user_query"])
        if docs:
            retrieved_context = "\n\n---\n\n".join([
                f"Source: {doc.metadata.get('source', 'Medical Report')}\n{doc.page_content}"
                for doc in docs
            ])
            logger.info("[RAG Node] Retrieved %d chunks.", len(docs))
        else:
            retrieved_context = "No relevant medical documents found in the knowledge base."
            logger.info("[RAG Node] No matching documents found.")
    except Exception as exc:
        logger.warning("[RAG Node] Retrieval unavailable (falling back): %s", exc)
        retrieved_context = (
            "Medical document retrieval is temporarily unavailable. "
            "Responding based on general medical knowledge."
        )

    return {
        **state,
        "unstructured_data_context": retrieved_context,
        "current_agent": "Generator_Node",
    }


# ============================================================================
# 7. NODE 3 — Vitals Analyzer (groq/mixtral-8x7b-32768)
#    Role: Fetch SQL data + use Mixtral (large context, strong reasoning) to
#    generate a CLINICAL SUMMARY of vitals trends before the generator responds.
# ============================================================================

def vitals_node(state: AgentState) -> AgentState:
    logger.info(
        "[Vitals Node | SQL + %s] Fetching & analyzing vitals for patient: %s",
        settings.VITALS_ANALYZER_MODEL, state["patient_id"]
    )

    patient_id = int(state["patient_id"])
    raw_vitals: dict[str, Any] = {}

    # ── Step 1: Fetch raw data from PostgreSQL (no LLM) ──────────────────────
    try:
        from sqlmodel import Session, select

        with Session(engine) as session:
            bp_records = session.exec(
                select(VitalsBP)
                .where(VitalsBP.patient_id == patient_id)
                .order_by(VitalsBP.recorded_at.desc())
                .limit(10)
            ).all()

            sugar_records = session.exec(
                select(VitalsSugar)
                .where(VitalsSugar.patient_id == patient_id)
                .order_by(VitalsSugar.recorded_at.desc())
                .limit(10)
            ).all()

        bp_data = [
            {"systolic": r.systolic, "diastolic": r.diastolic,
             "recorded_at": r.recorded_at.isoformat()}
            for r in reversed(bp_records)
        ]
        sugar_data = [
            {"fasting_sugar": r.fasting_sugar, "post_meal_sugar": r.post_meal_sugar,
             "recorded_at": r.recorded_at.isoformat()}
            for r in reversed(sugar_records)
        ]

        raw_vitals = {
            "blood_pressure": bp_data,
            "blood_sugar": sugar_data,
            "retrieval_timestamp": datetime.utcnow().isoformat(),
        }

        # Deterministic trend stats
        if bp_data:
            avg_sys = sum(r["systolic"] for r in bp_data) / len(bp_data)
            avg_dia = sum(r["diastolic"] for r in bp_data) / len(bp_data)
            raw_vitals["bp_trend"] = {
                "avg_systolic": round(avg_sys, 1),
                "avg_diastolic": round(avg_dia, 1),
                "status": "ELEVATED" if avg_sys > 140 or avg_dia > 90 else "NORMAL",
            }

        if sugar_data:
            avg_fast = sum(r["fasting_sugar"] for r in sugar_data) / len(sugar_data)
            avg_post = sum(r["post_meal_sugar"] for r in sugar_data) / len(sugar_data)
            raw_vitals["sugar_trend"] = {
                "avg_fasting": round(avg_fast, 1),
                "avg_post_meal": round(avg_post, 1),
                "status": "ELEVATED" if avg_fast > 126 or avg_post > 180 else "NORMAL",
            }

    except Exception as exc:
        logger.error("[Vitals Node] DB query failed: %s", exc)
        raw_vitals = {"error": str(exc)}

    # ── Step 2: Ask Mixtral to generate a clinical trends summary ─────────────
    clinical_summary = ""
    if raw_vitals and "error" not in raw_vitals and (bp_data or sugar_data):
        try:
            messages = [
                SystemMessage(content=VITALS_ANALYSIS_SYSTEM_PROMPT),
                HumanMessage(
                    content=(
                        f"Patient query context: {state['user_query']}\n\n"
                        f"Raw vitals data:\n{json.dumps(raw_vitals, indent=2)}"
                    )
                ),
            ]
            clinical_summary = (get_vitals_llm() | StrOutputParser()).invoke(messages)
            logger.info(
                "[Vitals Node | %s] Clinical summary generated.",
                settings.VITALS_ANALYZER_MODEL,
            )
        except Exception as exc:
            logger.error("[Vitals Node] LLM analysis failed: %s", exc)
            clinical_summary = "Clinical summary unavailable due to an error."

    # Merge raw data + clinical summary into structured_data_context
    raw_vitals["clinical_summary"] = clinical_summary

    return {
        **state,
        "structured_data_context": raw_vitals,
        "current_agent": "Generator_Node",
    }


# ============================================================================
# 8. NODE 4 — Generator (groq/llama3-70b-8192)
#    Role: Highest-quality LLM synthesises ALL context into a final safe response.
#    Receives: vitals clinical summary + RAG docs + user query + safety alerts.
# ============================================================================

def generator_node(state: AgentState) -> AgentState:
    logger.info(
        "[Generator | %s] Synthesising final response.",
        settings.GENERATOR_MODEL,
    )

    # Deterministic danger check (no LLM — hard safety layer)
    danger_alerts = _check_vitals_danger(state.get("structured_data_context", {}))
    alerts_text = "\n".join(danger_alerts) if danger_alerts else "None."

    # Extract the Mixtral-generated clinical summary (if available)
    structured_ctx = state.get("structured_data_context", {})
    clinical_summary = structured_ctx.get(
        "clinical_summary",
        "No vitals analysis available."
    )

    unstructured_ctx = state.get("unstructured_data_context", "") or (
        "No clinical document context available."
    )

    # Stored report summaries (from DB — persistent across sessions)
    report_summaries = state.get("report_summaries_context", "") or (
        "No stored report summaries available."
    )

    messages = [
        SystemMessage(content=GENERATOR_SYSTEM_PROMPT),
        *state.get("chat_history", []),
        HumanMessage(
            content=(
                f"## User Query\n{state['user_query']}\n\n"
                f"## Safety Alerts (include VERBATIM at top if not 'None.')\n{alerts_text}\n\n"
                f"## Vitals Clinical Analysis (from Mixtral AI)\n{clinical_summary}\n\n"
                f"## Clinical Document Context (from Medical Reports via RAG)\n{unstructured_ctx}\n\n"
                f"## Stored Report Summaries (from previously uploaded reports)\n{report_summaries}\n\n"
                "Now compose your concise, direct response. Answer ONLY what was asked."
            )
        ),
    ]

    final_response = (get_generator_llm() | StrOutputParser()).invoke(messages)

    # Hard-inject alerts if LLaMA 70B missed them (non-negotiable safety layer)
    for alert in danger_alerts:
        if alert not in final_response:
            final_response = f"{alert}\n\n{final_response}"

    logger.info("[Generator | %s] Response ready.", settings.GENERATOR_MODEL)
    return {**state, "final_response": final_response, "current_agent": "END"}


# ============================================================================
# 9. Build & Compile the LangGraph StateGraph
# ============================================================================

def build_healthcare_graph() -> Any:
    """
    Graph topology:
        START
          ↓
      [Supervisor]  ← groq/llama3-8b-8192 (routing only)
          ↓ (conditional)
    ┌─────┴──────┐
    │            │
  [RAG]      [Vitals]
  nvidia       groq/
  embed        mixtral
    │            │
    └─────┬──────┘
          ↓
      [Generator]  ← groq/llama3-70b-8192 (best quality)
          ↓
         END
    """
    workflow = StateGraph(AgentState)

    workflow.add_node("Supervisor", supervisor_node)
    workflow.add_node("RAG_Node", rag_node)
    workflow.add_node("Vitals_Node", vitals_node)
    workflow.add_node("Generator_Node", generator_node)

    workflow.set_entry_point("Supervisor")

    workflow.add_conditional_edges(
        "Supervisor",
        supervisor_router,
        {"RAG_Node": "RAG_Node", "Vitals_Node": "Vitals_Node"},
    )

    workflow.add_edge("RAG_Node", "Generator_Node")
    workflow.add_edge("Vitals_Node", "Generator_Node")
    workflow.add_edge("Generator_Node", END)

    return workflow.compile()


# Singleton — import this in main.py
healthcare_graph = build_healthcare_graph()


# ============================================================================
# 10. Standalone Report Analysis (Agent 5 — Report Analyzer)
#     Called directly from the /api/v1/reports/upload endpoint.
#     Does NOT go through the LangGraph pipeline — this is a direct LLM call
#     on raw extracted PDF text.
# ============================================================================

REPORT_ANALYSIS_PROMPT = """
You are a clinical report analyst AI. You have been given raw text extracted from a medical report (PDF).

Your job is to produce a STRUCTURED clinical summary with the following sections:

## 📋 Report Overview
Brief 1-2 sentence description of what kind of report this is.

## 🔬 Key Findings
Bullet points of the most important findings from the report.

## ⚠️ Abnormal Values / Concerns
List any values that are outside normal ranges or need attention. If none, say "No abnormal values found."

## 💊 Medications Mentioned
List any medications referenced in the report.

## 📌 Doctor's Recommendations
Any recommendations made by the doctor in this report.

## 📅 Next Steps
What the patient/caregiver should do next based on this report.

---
IMPORTANT RULES:
- Do NOT diagnose or prescribe. Always recommend consulting the treating physician.
- Be factual and concise. Use plain language a caregiver can understand.
- If the text is too short or unclear to analyze, say so clearly.
"""


async def analyze_report_text(raw_text: str, patient_name: str = "the patient") -> str:
    """
    Agent 5 — Report Analyzer (llama-3.3-70b-versatile).
    Takes raw PDF text and returns a structured clinical summary.
    """
    import logging
    _logger = logging.getLogger(__name__)

    if not raw_text or len(raw_text.strip()) < 50:
        return "⚠️ The uploaded document appears to be empty or too short to analyze."

    # Truncate to avoid token limits (keep first ~6000 chars)
    text_to_analyze = raw_text[:6000]
    if len(raw_text) > 6000:
        text_to_analyze += "\n\n[... document truncated for analysis ...]"

    try:
        from langchain_core.output_parsers import StrOutputParser
        messages = [
            SystemMessage(content=REPORT_ANALYSIS_PROMPT),
            HumanMessage(
                content=(
                    f"Patient: {patient_name}\n\n"
                    f"--- REPORT TEXT ---\n{text_to_analyze}\n--- END OF REPORT ---\n\n"
                    "Please provide your structured clinical summary now."
                )
            ),
        ]
        summary = await (get_report_llm() | StrOutputParser()).ainvoke(messages)
        _logger.info("[Report Analyzer] Summary generated (%d chars).", len(summary))
        return summary
    except Exception as exc:
        _logger.error("[Report Analyzer] Failed: %s", exc)
        return f"⚠️ Report analysis failed: {str(exc)}. Please try again or contact support."

# ============================================================================
# 11. Multimodal Document Analysis (Agent 6 — Vision Analyzer)
#     Called directly from the /api/v1/chat/upload_context endpoint.
# ============================================================================

VISION_ANALYSIS_PROMPT = """
You are a clinical document vision analyst AI. You have been given images of a medical document (e.g. a PDF report or an image of lab results).

Your job is to read the document and produce a comprehensive summary.
Extract all key medical findings, lab values, abnormal results, diagnoses, or notes.
This summary will be used by another AI assistant to answer the patient's questions, so include all relevant clinical details, numbers, and context.

Do NOT diagnose or prescribe. Be factual and clear.
"""


async def analyze_document_vision(images_base64: list[str]) -> str:
    """
    Takes a list of base64 encoded images (e.g. PDF pages or raw images)
    and returns a structured clinical summary using a multimodal vision model.
    
    Processes ONE image at a time (NVIDIA API limit: 1 image per request).
    For multi-page PDFs, analyzes each page separately and merges results.
    """
    import logging
    from langchain_core.messages import HumanMessage
    from langchain_nvidia_ai_endpoints import ChatNVIDIA
    from langchain_core.output_parsers import StrOutputParser

    _logger = logging.getLogger(__name__)

    if not images_base64:
        return "⚠️ No images provided for analysis."

    # Use NVIDIA's hosted Llama 3.2 Vision model
    vision_llm = ChatNVIDIA(
        model="meta/llama-3.2-90b-vision-instruct",
        api_key=settings.NVIDIA_API_KEY,
        temperature=0.1,
        max_tokens=2048,
    )

    # NVIDIA API only allows 1 image per request — process pages one at a time
    # Limit to first 5 pages to avoid excessive API calls
    pages_to_process = images_base64[:5]
    total_pages = len(images_base64)
    page_summaries = []

    _logger.info(
        "[Vision Analyzer] Processing %d of %d page(s) one at a time.",
        len(pages_to_process), total_pages
    )

    for page_num, b64_img in enumerate(pages_to_process, start=1):
        try:
            page_prompt = VISION_ANALYSIS_PROMPT
            if total_pages > 1:
                page_prompt += f"\n\nNote: This is page {page_num} of {total_pages} total pages."

            content = [
                {"type": "text", "text": page_prompt},
                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64_img}"}},
            ]
            messages = [HumanMessage(content=content)]
            page_text = await (vision_llm | StrOutputParser()).ainvoke(messages)
            page_summaries.append(
                f"--- Page {page_num} ---\n{page_text.strip()}"
            )
            _logger.info("[Vision Analyzer] Page %d analyzed (%d chars).", page_num, len(page_text))
        except Exception as exc:
            _logger.warning("[Vision Analyzer] Page %d failed: %s", page_num, exc)
            page_summaries.append(f"--- Page {page_num} --- [Analysis failed: {exc}]")

    if not page_summaries:
        return "⚠️ Document analysis failed — no pages could be processed."

    # If single page, return directly; if multi-page, merge
    if len(page_summaries) == 1:
        summary = page_summaries[0].replace("--- Page 1 ---\n", "").strip()
    else:
        # Combine all page summaries
        combined = "\n\n".join(page_summaries)
        if total_pages > 5:
            combined += f"\n\n[Note: Only first 5 of {total_pages} pages were analyzed.]"
        summary = combined

    _logger.info("[Vision Analyzer] Final summary ready (%d chars).", len(summary))
    return summary



