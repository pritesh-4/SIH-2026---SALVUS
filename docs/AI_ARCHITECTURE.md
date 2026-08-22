# AI_ARCHITECTURE.md - Operational AI Triage & Verification Architecture

This document specifies the operational AI intelligence pipeline, classification criteria, and human-in-the-loop verification model used in Salvus.

---

## 1. Operational Role of AI in Salvus

In disaster coordination, AI is utilized strictly as an **intelligence extraction and prioritization assistant**, never as an autonomous decision-maker.

The AI Layer performs:

1. **Unstructured Data Parsing:** Ingests raw citizen messages, audio transcripts, or distress signals.
2. **Hazard Categorization & Entity Extraction:** Identifies specific disaster threats (e.g., Flash Flood, Downed Power Lines, Structural Collapse) and trapped victim counts.
3. **Urgency Scoring (1–10 Scale):** Evaluates depth estimates, water flow velocity, non-ambulatory medical notes, and immediate life-safety peril.
4. **Specialized Craft & Equipment Recommendation:** Matches required rescue capabilities (e.g., Zodiac inflatable boat Mk-II, high-clearance 4x4 ambulance).
5. **Confidence Rating (0–100%):** Exposes model certainty to dispatchers for transparent human evaluation.

---

## 2. AI Triage Data Structure

```json
{
  "incidentId": "INC-8492",
  "citizenTicket": "SV-2048",
  "hazardType": "Flash Flood & Surge Inundation",
  "depthEstimate": "1.4m Rising",
  "confidence": "94%",
  "urgencyScore": 9.4,
  "recommendedUnit": "NDRF Unit 4 — Alpha Team",
  "recommendedCraft": "Zodiac Rescue Boat Mk-II",
  "priorityReasoning": "High water velocity detected. Submerged ground floor structure with 3 individuals trapped on balcony.",
  "reporterNotes": {
    "name": "Aditi Roy",
    "phone": "+91 98301 24890",
    "medicalConditions": "Asthma (Inhaler Required)"
  }
}
```

---

## 3. Human-in-the-Loop Safeguard Protocol

```
[Citizen Distress Signal]
         │
         ▼
[AI Parsing & Classification Engine]
         │
         ▼
[AI Triage Recommendation + Confidence Score]
         │
         ▼
[Human Dispatcher Verification at Central Command]
   ├── [APPROVE & DISPATCH] ──► [Responder Vessel Tracks toward Coordinates]
   └── [MANUAL OVERRIDE]    ──► [Dispatcher Modifies Unit or Priority]
```

- **Zero Autonomous Dispatch:** Rescue vessels are never deployed without explicit dispatcher authorization.
- **Fail-Safe Processing:** If the primary LLM is unreachable, the system applies deterministic keyword matching rules and presents the raw report with a `[RULE-BASED TRIAGE]` badge.
