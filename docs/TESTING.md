# TESTING.md - Quality Verification & Benchmarks

This document details the quality assurance processes, automated testing commands, and verification criteria enforced in Salvus across both frontend and backend.

---

## 1. Quality Assurance Suite

### Frontend Quality Verification

```bash
# 1. Automated code formatting verification (Prettier)
npm run format:check

# 2. Automated code formatting fix
npm run format

# 3. ESLint syntax and rule verification
npm run lint

# 4. Production build compilation (Vite)
npm run build
```

### Backend Quality Verification

```bash
# Navigate to backend directory
cd backend

# 1. Run Ruff Linter
ruff check app tests

# 2. Check Python code formatting (Ruff)
ruff format --check app tests

# 3. Run Pytest Test Suite
python -m pytest -v
```

---

## 2. Realtime Two-Browser Core Loop Test

This end-to-end verification confirms live bidirectional synchronization across Citizen and Authority clients:

### Test Prerequisites:

1. Start backend server:
   ```bash
   cd backend
   venv\Scripts\uvicorn.exe app.main:combined_asgi_app --host 127.0.0.1 --port 8000 --reload
   ```
2. Start frontend dev server:
   ```bash
   npm run dev
   ```

### Verification Flow (WITHOUT PAGE RELOAD):

1. **Window A (Citizen)**: Open `http://localhost:5173/citizen`.
2. **Window B (Authority)**: Open `http://localhost:5173/authority`.
3. In **Window A**, click "SEND SOS" and hold/confirm to transmit the beacon.
4. Observe in **Window B** (Authority):
   - Incident appears instantly at the top of the queue with `#SV-XXXX` ticket number.
   - Live marker appears on the tactical radar map at the reported GPS coordinates.
   - Active Incidents count increments.
5. In **Window B**, select the incident and click **"Verify Incident"** (`NEW` $\rightarrow$ `VERIFIED`).
6. Observe in **Window A** (Citizen):
   - Emergency page status immediately switches to **"Request Reviewed & Approved"** (`VERIFIED` phase) with zero page reload.
7. In **Window B**, click **"✓ RESOLVE & CLOSE INCIDENT"** (`VERIFIED` $\rightarrow$ `RESOLVED`).
8. Observe in **Window A** (Citizen):
   - Citizen screen immediately transitions to **"Rescue & Evacuation Complete"** (`RESOLVED` phase) with zero page reload.

---

## 3. Verification Benchmarks

- **Frontend Build Performance:** Production build compiles in under **500ms** with Vite.
- **Frontend Lint Integrity:** 0 ESLint errors and 0 ESLint warnings.
- **Backend Lint Integrity:** 0 Ruff errors, 100% formatted.
- **Backend Test Suite:** 100% pass rate across state machine and REST API tests (35/35 passing).
- **Zero Page Reload:** Realtime incident creation, map marker plotting, and status lifecycle progression update across browsers in sub-second time.
- **Offline Gracefulness:** Connection health transitions between `CONNECTED`, `RECONNECTING`, and `OFFLINE` without dashboard disruption.
