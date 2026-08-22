# TESTING.md - Quality Verification & Benchmarks

This document details the quality assurance processes, automated testing commands, and verification criteria enforced in Salvus.

---

## 1. Quality Assurance Suite

Run the following commands to verify code quality and build integrity:

```bash
# 1. Automated code formatting verification
npm run format:check

# 2. Automated code formatting fix
npm run format

# 3. ESLint syntax and rule verification
npm run lint

# 4. Production build compilation
npm run build
```

---

## 2. Verification Benchmarks

- **Build Performance:** Production build compiles in under **500ms** with Vite.
- **Lint Integrity:** 0 ESLint errors and 0 ESLint warnings.
- **Responsive Layout:** Tested across viewport widths from **360px (mobile)** to **1720px (ultra-wide desktop)**.
- **Zero Dead UI:** Every visible button, card, tab, and icon must trigger a real in-app interaction, modal drawer, or route.
- **State Determinism:** Emergency flow transitions deterministically through all 8 lifecycle states without UI collision or cognitive overload.
