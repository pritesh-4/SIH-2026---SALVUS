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

# 3. Auto-fix Ruff lint and format issues
ruff check --fix app tests
ruff format app tests

# 4. Run Pytest Test Suite
python -m pytest -v
```

---

## 2. CI Quality Gate (.github/workflows/ci.yml)

Every `push` and `pull_request` to `main` executes the automated CI quality gate:

1. **Frontend Gate (`frontend-quality`)**:
   - Prettier formatting check
   - ESLint static analysis
   - Vite production build
2. **Backend Gate (`backend-quality`)**:
   - Ruff linting (`ruff check`)
   - Ruff formatting validation (`ruff format --check`)
   - Pytest unit & integration test suite (`pytest -v`)

---

## 3. Verification Benchmarks

- **Frontend Build Performance:** Production build compiles in under **500ms** with Vite.
- **Frontend Lint Integrity:** 0 ESLint errors and 0 ESLint warnings.
- **Backend Lint Integrity:** 0 Ruff errors, 100% formatted.
- **Backend Test Suite:** 100% pass rate across state machine and REST API tests.
- **Zero Dead UI:** Every visible button, card, tab, and icon triggers a real in-app interaction, modal drawer, or route.
- **State Determinism:** Emergency flow transitions deterministically through all lifecycle states.
