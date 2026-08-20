# AI_ARCHITECTURE.md - Artificial Intelligence & Triage Specs

This document defines how LLMs orchestrate incident structuring, classification, and safety overrides in Salvus.

---

## 1. Approved AI Operational Scope

To ensure public safety, AI in Salvus acts exclusively as a **data structuring advisor**. It does not possess authority to execute dispatch calls.

```
 Citizen Report (Text/Image)
   │
   ├── Ingest to Backend
   │
   ├── AI Triage Node (Gemini/Groq API)
   │     ├── 1. Classify incident type
   │     ├── 2. Extract entities (people trapped, water height)
   │     └── 3. Score severity (Critical, High, Moderate, Low)
   │
   └── structured incident payload ──► Dispatcher Dashboard (Human Approval Required)
```

---

## 2. LLM Orchestration & Fail-Safe Architecture

### Primary Engine: Gemini (models: `gemini-2.5-flash` / `gemini-1.5-flash`)

- Used for high-efficiency multi-modal parsing (image inputs + text classification).

### Fallback Engine: Groq (models: `llama-3.3-70b`)

- Invoked automatically if Gemini queries time out (threshold: 3000ms) or hit API rate limits.

### Hard Fallback Parser

- If both external AI connections fail, the backend applies local Regex patterns matching key emergency keywords (e.g. _trapped_, _injured_, _fire_, _flood_) to assign a baseline classification and triage rating.

---

## 3. Human-in-the-Loop Policy

The allocation algorithm Suggests dispatches; it does not issue them.

- **Dispatch Check:** All dispatches require physical button verification by a dispatcher operator inside the dashboard.
- **Triage Correction:** Dispatchers can manually override incident categories or severities if the LLM misclassifies an entry.

---

## 4. Structured Output Format

All AI prompts are configured to return JSON matching this schema:

```json
{
  "category": "Flood" | "Fire" | "Medical" | "Hazard" | "Other",
  "severity": "Critical" | "High" | "Moderate" | "Low",
  "confidence": 0.0,
  "summary": "Brief summary of the citizen report text.",
  "entities": {
    "injured_count": 0,
    "hazard_detected": true
  }
}
```

If the API returns unstructured text, a validator utility parses and forces mapping to this JSON footprint before inserting into PostgreSQL.
