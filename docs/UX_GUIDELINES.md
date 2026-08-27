# UX_GUIDELINES.md — Calm Intelligence Design System & UI Guidelines

This document details the user experience philosophy, design system tokens, color budgets, typography, and accessibility standards implemented across the Salvus platform.

---

## 1. Core Philosophy: CALM INTELLIGENCE DURING CHAOS

Disaster interfaces operate under extreme environmental stress:

- **For Citizens:** Experiencing acute danger, panic, low battery, and cognitive overload. Every extra button or cluttered card increases confusion.
- **For Dispatchers:** Managing multiple simultaneous crises over 8-to-12-hour shifts. Visual fatigue and false alarm noise impair life-safety decision-making.

**Guiding Rule:** _When everything is highlighted, nothing is urgent._ Salvus enforces strict visual hierarchy, progressive disclosure, and restrained semantic color budgets.

---

## 2. Citizen UX: Low-Bandwidth Reassurance & Progressive Disclosure

### 2.1 Design Principles:

1. **2-Second Comprehension:** Citizens must understand their current safety tier and advisory level within 2 seconds of landing on `/citizen`.
2. **Large Tactile Targets:** All primary buttons and emergency triggers have minimum tap dimensions of $48\text{px} \times 48\text{px}$ to accommodate shaking or wet hands.
3. **Continuous Reassurance:** During network drops or server reconnects, the interface prominently displays comforting status banners (_"Emergency request remains active in dispatcher queue"_).
4. **State-Focused Progressive Disclosure:** Only the single most actionable component is elevated per lifecycle state:

```
[SOS_ACTIVE] ──► Focus: Distress Telemetry + Ticket ID + High-Ground Protocol
[TRIAGING]   ──► Focus: AI Triage In-Progress + Urgency Classification Breakdown
[VERIFIED]   ──► Focus: Central Command Verification Stamp + Dispatcher Identity
[ASSIGNED]   ──► Focus: Allocated Unit Profile + VHF Radio Link + Craft Class
[EN_ROUTE]   ──► Focus: Tactical Rescue Radar + Animated Vessel + Real-Time ETA
[NEARBY]     ──► Focus: Urgent Amber Proximity Beacon ("Wave Torch / Whistle")
[ON_SCENE]   ──► Focus: Arrival Confirmation & Safe Evacuation Handoff Protocol
[RESOLVED]   ──► Focus: Resolution Summary (Response Time) + Shelter Reception Info
```

---

## 3. Authority UX: 85–90% Neutral Slate Budget

### 3.1 Visual Hierarchy & Spatial Anchor:

The Authority Command Center (`/authority`) uses a disciplined 3-column operational layout:

1. **Left Column (Incident Queue):** Dense, scan-friendly triage list sorted by urgency.
2. **Center Column (Tactical Map):** Full-screen Leaflet radar acting as the spatial anchor.
3. **Right Column (Command Inspector & Logistics Tabs):** Contextual inspector with AI rationale, deterministic dispatch recommendations, fleet matrix, and shelter logistics.

### 3.2 Restrained Semantic Color Palette:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        85–90% NEUTRAL SLATE BASE                       │
│    Background: #080C12  │  Cards: #0C121B  │  Borders: #182332         │
├────────────────────────────────────────────────────────────────────────┤
│                       STRICT SEMANTIC ACCENT BUDGET                    │
├─────────────────┬──────────────────────────────────────────────────────┤
│ 🔴 RED (#EF4444) │ Critical Threat | Active SOS Beacon | Immediate Peril │
├─────────────────┼──────────────────────────────────────────────────────┤
│ 🟡 AMBER(#F59E0B)│ Triage Pending | Proximity Beacon (<100m) | Warning  │
├─────────────────┼──────────────────────────────────────────────────────┤
│ 🔵 BLUE (#3B82F6)│ Selected Item | Verified Dispatch | Active Telemetry  │
├─────────────────┼──────────────────────────────────────────────────────┤
│ 🟢 GREEN(#10B981)│ Safe Status | Resolved Evacuation | Open Bed Capacity │
└─────────────────┴──────────────────────────────────────────────────────┘
```

---

## 4. Typography & Layout Tokens

### 4.1 Type Hierarchy:

- **Primary Font:** Inter, system sans-serif fallback.
- **Monospace Font:** JetBrains Mono / Fira Code (used for ticket IDs `#SV-2048`, coordinates `22.5726° N, 88.3639° E`, and VHF channels `VHF-14`).
- **Headings:**
  - `H1` (Page Headers): `text-xl font-bold tracking-tight text-white`
  - `H2` (Card Headers): `text-sm font-semibold uppercase tracking-wider text-slate-300`
  - `H3` (Inspector Labels): `text-xs font-medium text-slate-400`
- **Body Text:** `text-sm text-slate-300 leading-relaxed`

### 4.2 Surface & Elevation Tokens:

- `Surface 0 (App Canvas)`: `#080C12`
- `Surface 1 (Card Background)`: `#0C121B`
- `Surface 2 (Elevated Panels)`: `#121B27`
- `Surface 3 (Hover States)`: `#182332`
- `Borders & Dividers`: `#1E293B`

---

## 5. Accessibility & Defensive Design

1. **Dual Visual Cues (Never Color Alone):** Status indicators always pair color badges with explicit text labels and SVG icons (e.g. Red Circle + "CRITICAL" + AlertTriangle icon).
2. **WCAG 2.1 AA Contrast Compliance:** Text against neutral slate backgrounds maintains a contrast ratio $\ge 4.5:1$ for standard text and $\ge 3:1$ for large headings.
3. **Screen Reader Semantic Hierarchy:** Proper HTML5 landmark regions (`<header>`, `<main>`, `<nav>`, `<aside>`, `<section>`) and descriptive `aria-labels` on interactive map controls.
4. **Motion Safeguards:** High-frequency animations (such as radar halos or vessel pulses) use subtle CSS transitions and respect `prefers-reduced-motion` settings.
