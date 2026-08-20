# DEVELOPMENT.md - Developer Guide & Code Conventions

This document outlines setup steps, coding standards, branch conventions, and Definition of Done (DoD) expectations.

---

## 1. Local Setup

Ensure you are using **Node.js 20 LTS** or higher.

```bash
# 1. Install dependencies strictly using package-lock.json
npm ci

# 2. Copy the configuration template
cp .env.example .env

# 3. Spin up the development server
npm run dev
```

---

## 2. General Git Workflows

- **Main Branch Stability:** Do not push directly to the `main` branch.
- **Feature Branches:** Use prefixed branch structures:
  - `feature/` or `feat/` for product features.
  - `fix/` for bug fixes.
  - `chore/` or `docs/` for setup and documentation.

---

## 3. Commit Guidelines

We use clean commit descriptions. Include the prefix type:

- `feat: added Leaflet map overlay for responder path`
- `fix: corrected API fallback timeout exception handler`
- `docs: updated real-time data table definitions`

---

## 4. Pull Request & Continuous Integration

Every PR targeting `main` automatically triggers the [ci.yml](.github/workflows/ci.yml) workflow which executes:

1. `npm ci` (lockfile integrity check)
2. `npm run lint` (syntax check)
3. `npm run build` (bundler compile check)

A PR can only merge after all actions successfully complete and at least one team approval is logged.

---

## 5. Definition of Done (DoD)

A task is completed only when it matches these benchmarks:

- [ ] Code conforms to standard ESLint rules (run `npm run lint` to verify).
- [ ] No React compiler warnings or unused variable declarations.
- [ ] Simulated telemetries are labeled in the UI.
- [ ] Local production builds compile successfully (`npm run build`).
- [ ] Any newly introduced tables, configurations, or endpoints are updated in `docs/`.
- [ ] No live secret keys exist in code.
