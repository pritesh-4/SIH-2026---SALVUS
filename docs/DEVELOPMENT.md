# DEVELOPMENT.md - Developer Guide & Code Conventions

This document outlines the local setup instructions, code conventions, CI/CD quality gates, and Definition of Done (DoD) for the Salvus platform.

---

## 1. Local Environment Setup

Ensure you are using **Node.js 20 LTS** or higher.

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

---

## 2. Code Quality & Formatting Conventions

- **Formatting:** We enforce Prettier formatting. Run `npm run format` before staging code.
- **Linting:** ESLint 10 rules are enforced. Zero warnings and zero errors are permitted.
- **Tailwind CSS:** Use Tailwind CSS utility classes aligned with our semantic dark palette (`#070D14`, `#0D1520`, `#111A24`, `#1A2634`, `#1E293B`).
- **Semantic Status Accents:**
  - `Emerald` (`#10B981`): Safe status, open shelters, incident resolution.
  - `Amber` (`#F59E0B`): Warnings, proximity beacons (<100m), moderate hazards.
  - `Rose` (`#EF4444`): Active SOS beacon, critical threats, cancellations.
  - `Cyan` (`#06B6D4`): Operational intelligence, data telemetry, AI triage metrics.
- **Accessible Design:** Never rely solely on color for status. Always pair colors with icons, labels, or explanatory descriptions.

---

## 3. Definition of Done (DoD)

A task or PR is considered complete only when:

- [x] Code passes `npm run lint` with 0 warnings and 0 errors.
- [x] Code passes `npm run format:check` with 0 formatting discrepancies.
- [x] Production build compiles cleanly via `npm run build` in under 500ms.
- [x] Every visible button triggers a real in-app action, modal drawer, or route (no dead UI).
- [x] Emergency state transitions follow the deterministic state machine rules.
- [x] Responsive layout is verified on mobile (360px–414px) and desktop (1024px–1720px).
- [x] All related architectural and API documentation files in `docs/` are updated.
