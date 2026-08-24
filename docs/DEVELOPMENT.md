# DEVELOPMENT.md - Developer Guide & Code Conventions

This document outlines the local setup instructions, code conventions, CI/CD quality gates, and Definition of Done (DoD) for the Salvus platform.

---

## 1. Local Environment Setup

### Frontend Setup (Node.js 20 LTS+)

```bash
# 1. Install dependencies strictly using package-lock.json
npm ci

# 2. Copy the environment configuration template
cp .env.example .env

# 3. Start the Vite development server
npm run dev

# 4. Run automated code formatting
npm run format

# 5. Verify ESLint rules
npm run lint

# 6. Verify production build compilation
npm run build
```

### Backend Setup (Python 3.11+ / FastAPI)

```bash
# 1. Navigate to backend directory
cd backend

# 2. Create virtual environment
python -m venv venv
# On Windows:
venv\Scripts\activate
# On Linux/macOS:
source venv/bin/activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Copy backend environment configuration
cp .env.example .env

# 5. Start development ASGI server
uvicorn app.main:combined_asgi_app --reload --host 0.0.0.0 --port 8000
```

---

## 2. Code Quality & Formatting Conventions

- **Formatting:** We enforce Prettier formatting. Run `npm run format` before staging code.
- **Linting:** ESLint 10 rules are enforced. Zero warnings and zero errors are permitted.
- **Tailwind CSS:** Use Tailwind CSS utility classes aligned with our semantic dark palette (`#080C12`, `#0C121B`, `#121B27`, `#182332`).
- **Authority Command Center Color Budget (85–90% Neutral):**
  - Surfaces should remain neutral slate.
  - Colors are strictly semantic:
    - `Rose` (`#EF4444`): Active SOS beacons, critical severity threats.
    - `Amber` (`#F59E0B`): Warnings, triage pending, proximity beacons (<100m).
    - `Blue` (`#3B82F6`): Verified tickets, active selection rings, primary buttons, fleet telemetry.
    - `Emerald` (`#10B981`): Safe status, open shelter capacity, incident resolution.
- **Accessible Design:** Never rely solely on color for status. Always pair colors with icons, labels, or explanatory descriptions.
- **Environment & Secrets:** Never commit `.env` files to git. Use `.env.example` templates with empty placeholders for secrets.

---

## 3. Definition of Done (DoD)

A task or PR is considered complete only when:

- [x] Code passes `npm run lint` with 0 warnings and 0 errors.
- [x] Code passes `npm run format:check` with 0 formatting discrepancies.
- [x] Production build compiles cleanly via `npm run build` in under 500ms.
- [x] Every visible button triggers a real in-app action, modal drawer, or route (no dead UI).
- [x] Emergency state transitions follow the deterministic state machine rules.
- [x] Responsive layout is verified on mobile (360px–414px) and desktop (1024px–1760px).
- [x] All related architectural and API documentation files in `docs/` are updated.
