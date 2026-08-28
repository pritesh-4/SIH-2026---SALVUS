# DEVELOPMENT.md — Developer Guide, Workflows & Definition of Done

This document outlines local environment setup, code style conventions, CI/CD quality gates, testing workflows, and the Definition of Done (DoD) for the Salvus platform.

---

## 1. Local Environment Setup

### 1.1 Prerequisites:

- **Node.js:** `20.x LTS` or higher
- **npm:** `10.x` or higher
- **Python:** `3.11` or `3.12`

### 1.2 Frontend Setup:

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

### 1.3 Backend Setup (Option A: Docker — Recommended for Instant Reproducibility):

```bash
# 1. Build container image
docker compose build

# 2. Start container in foreground (or add -d for background)
docker compose up

# 3. Follow logs
docker compose logs -f salvus-backend

# 4. Stop containers
docker compose down

# 5. Full clean rebuild (no-cache)
docker compose down
docker compose build --no-cache
docker compose up
```

- **Health Probe:** `http://localhost:8000/health`
- **Interactive OpenAPI Documentation:** `http://localhost:8000/docs`
- **Database Persistence:** Local `./backend/data` is mounted to container `/app/data`, ensuring SQLite/WAL state survives container recreations.

---

### 1.4 Backend Setup (Option B: Native Python Virtualenv):

```bash
# 1. Navigate to backend directory
cd backend

# 2. Create virtual environment
python -m venv venv
# On Windows:
.\venv\Scripts\activate
# On Linux/macOS:
source venv/bin/activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Copy backend environment configuration
cp .env.example .env

# 5. Start development ASGI server (FastAPI + Socket.IO)
uvicorn app.main:combined_asgi_app --reload --host 0.0.0.0 --port 8000

# 6. Run full backend test suite (268 automated tests)
pytest -v

# 7. Run Ruff linter and formatter checks
ruff check app tests
ruff format --check app tests
```

---

## 2. Code Quality & Architectural Conventions

- **Frontend Code Formatting:** Prettier is enforced across JavaScript, JSX, CSS, JSON, and Markdown. Run `npm run format` before submitting PRs.
- **Frontend Linting:** ESLint 10 with React Hooks rules. 0 warnings and 0 errors are permitted.
- **Backend Quality Standards:** Python code is checked with Ruff. All routes must use Pydantic v2 schemas for request/response serialization.
- **Authority Command Center Color Budget (85–90% Neutral Slate):**
  - Surfaces use `#080C12` (canvas), `#0C121B` (cards), `#182332` (borders).
  - Colors are strictly semantic:
    - `Red` (`#EF4444`): Active SOS distress beacons, critical severity threats.
    - `Amber` (`#F59E0B`): Triage pending, proximity beacons (<100m), warnings.
    - `Blue` (`#3B82F6`): Verified incidents, active selection rings, primary buttons, fleet telemetry.
    - `Green` (`#10B981`): Safe status, open shelter capacity, resolved evacuations.
- **Accessible Design:** Never rely solely on color for status. Always pair colors with icons, labels, or explanatory descriptions.
- **Environment & Secrets:** Never commit `.env` files to git. Use `.env.example` templates with empty placeholders for secrets.

---

## 3. Definition of Done (DoD)

A task or Pull Request is considered complete only when:

- [x] Code passes `npm run lint` with 0 warnings and 0 errors.
- [x] Code passes `npm run format:check` with 0 formatting discrepancies.
- [x] Production frontend build compiles cleanly via `npm run build`.
- [x] Backend test suite passes **all 268 automated tests** (`pytest -v`) with 0 regressions.
- [x] Python code passes Ruff linting (`ruff check app tests`).
- [x] Dockerfile builds cleanly (`docker compose build` / `docker build backend/`).
- [x] Every visible button triggers a real in-app action, modal drawer, or route (no dead UI).
- [x] Emergency state transitions follow the deterministic state machine rules.
- [x] Responsive layout is verified on mobile (360px–414px) and desktop (1024px–1760px).
- [x] All related architectural and API documentation files in `docs/` are updated.
