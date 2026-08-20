# TESTING.md - Verification & Testing Blueprint

This document tracks local verification scripts and the testing strategy roadmap.

---

## 1. Implemented Quality Checks

Our project enforces verification checks on both local commit and remote pull requests:

- **Linting:** Runs ESLint on flat rules:
  ```bash
  npm run lint
  ```
  Auto-fixable violations can be resolved using:
  ```bash
  npm run lint:fix
  ```
- **Production Build Validation:** Verifies bundler compilation:
  ```bash
  npm run build
  ```

---

## 2. Testing Roadmap (Planned)

### Framework: Vitest & React Testing Library

We plan to introduce Vitest to run unit and logic tests.

### Target Test Suites:

1. **Allocation Engine Unit Tests (`/tests/allocation.test.js`):**
   - Asserts mathematical ranking scores.
   - Verifies nearest responder is placed first.
   - Verifies busy status excludes responder from active dispatches.
2. **AI Fallback Integrations (`/tests/ai.test.js`):**
   - Verifies the mock parser takes over when API timeout errors are returned.
   - Verifies unstructured inputs are correctly parsed.
3. **Route Parsing (`/tests/routing.test.js`):**
   - Asserts Nominatim input validations.
   - Validates OSRM response parsing and ETA formulas.
