# SALVUS - Engineering & GitHub Workflow Guide

This document defines the team engineering policies, CI/CD quality gates, branch protection rules, and local development standards for the **Salvus** repository (AI-powered Disaster Intelligence & Rescue Coordination Platform).

---

## 1. Core Engineering Policy

> **Golden Rule:** No broken code is merged into `main`. The `main` branch must always remain deployable and stable.

To enforce this, all changes must pass through a Pull Request (PR) where automated GitHub Actions validate code quality, linting standards, and production build integrity before merging.

---

## 2. Branching Strategy

We follow a **Feature-Branch Workflow**:

```
 main (Protected - Production Stable)
   │
   ├── feature/ai-triage-panel ──── (PR + CI) ────► Merge to main
   ├── fix/mapbox-render-glitch ─── (PR + CI) ────► Merge to main
   └── feat/rescue-coordination ─── (PR + CI) ────► Merge to main
```

### Branch Naming Conventions

- `feature/<feature-name>`: New user-facing or platform features (e.g., `feature/sos-alert-feed`)
- `feat/<feature-name>`: Shorter alias for feature branches (e.g., `feat/triage-agent`)
- `fix/<bug-name>`: Bug fixes or patches (e.g., `fix/router-hydration`)
- `chore/<task>`: Dependency updates, CI changes, refactoring (e.g., `chore/ci-caching`)
- `docs/<doc-name>`: Documentation updates (e.g., `docs/api-spec`)

### Developer Workflow: Creating a Feature Branch

```bash
# 1. Ensure your local main is up-to-date
git checkout main
git pull origin main

# 2. Create and switch to your feature branch
git checkout -b feature/disaster-map-view

# 3. Work and commit locally (lint-staged will automatically check staged files)
git add .
git commit -m "feat: integrate disaster map view container"

# 4. Push to remote
git push -u origin feature/disaster-map-view

# 5. Open a Pull Request against `main` on GitHub
```

---

## 3. GitHub Actions CI Pipeline

The continuous integration pipeline is defined in [`.github/workflows/ci.yml`](../.github/workflows/ci.yml).

### Workflow Triggers

- **Pull Requests** targeting `main`
- **Pushes** directly to `main`

### Concurrency Management

If multiple commits are pushed in rapid succession to the same PR, any active, outdated CI run is automatically cancelled (`cancel-in-progress: true`) to save GitHub Action minutes.

### Automated Checks Performed

1. **Clean Installation (`npm ci`)**: Verifies strict lockfile (`package-lock.json`) integrity and resolves all dependencies.
2. **ESLint Validation (`npm run lint`)**: Validates JavaScript/JSX syntax, React 19 hooks rules, and code quality standards.
3. **Production Build (`npm run build`)**: Executes the Vite compiler to ensure production bundles compile with zero build errors.

---

## 4. GitHub Repository Configuration (Required Admin Setup)

Repository administrators must configure branch protection in GitHub Settings to ensure CI checks are enforced before merges.

### Step-by-Step GitHub Branch Protection Setup

1. Open your repository on GitHub: `https://github.com/<owner>/<repo>`
2. Click **Settings** (top tab navigation)
3. In the left sidebar, click **Branches** (under _Code and automation_)
4. Click **Add branch protection rule** (or **Add rule** under Rulesets)
5. Set **Branch name pattern**: `main`
6. Check the following options:

| Setting                                                              | Configuration                                   | Reason                                                 |
| :------------------------------------------------------------------- | :---------------------------------------------- | :----------------------------------------------------- |
| **Require a pull request before merging**                            | ✅ **Enabled**                                  | Prevents direct pushes to `main`.                      |
| **Require approvals**                                                | ✅ Set to `1` (or `0` if solo hackathon sprint) | Ensures peer or team visibility before merging.        |
| **Dismiss stale pull request approvals when new commits are pushed** | ✅ **Enabled**                                  | Re-verifies approval if code changes after review.     |
| **Require status checks to pass before merging**                     | ✅ **Enabled**                                  | Blocks merging if CI fails.                            |
| **Status check search**                                              | Search and select `Lint & Build Validation`     | Matches the job name in `ci.yml`.                      |
| **Require branches to be up to date before merging**                 | ✅ **Enabled**                                  | Guarantees the code was tested against current `main`. |
| **Do not allow bypassing the above settings**                        | ✅ **Enabled**                                  | Enforces rules even for repository admins.             |
| **Block force pushes**                                               | ✅ **Enabled**                                  | Prevents history rewrites on `main`.                   |
| **Block deletions**                                                  | ✅ **Enabled**                                  | Prevents accidental deletion of the `main` branch.     |

7. Click **Create** / **Save changes**.

---

## 5. Local Quality Gates & Commands

To avoid CI failures, developers should run the following commands locally before pushing:

### Useful Local Commands

| Command            | Description                                   |
| :----------------- | :-------------------------------------------- |
| `npm run lint`     | Run ESLint across all files.                  |
| `npm run lint:fix` | Automatically fix auto-fixable ESLint issues. |
| `npm run build`    | Test production bundle compilation with Vite. |
| `npm run dev`      | Start the local Vite development server.      |
| `npm run preview`  | Preview the local production build.           |

### Pre-Commit Hooks (Husky + lint-staged)

The repository is configured with **Husky** and **lint-staged**. Whenever you run `git commit`, only the modified `.js`/`.jsx` files staged for commit will automatically be checked by ESLint.

---

## 6. What to Do When CI Fails

If your PR displays a red ❌ failure on the GitHub Actions check:

1. Click on **Details** next to the failed check in your GitHub PR.
2. Expand the failed step in the log output (e.g., _Run ESLint_ or _Run Production Build_).
3. Identify the error:
   - **ESLint error**: Run `npm run lint:fix` locally or resolve the unused variable / missing dependency.
   - **Build error**: Run `npm run build` locally to reproduce and resolve JSX/import errors.
   - **Dependency mismatch**: Run `npm ci` locally to verify `package-lock.json` consistency.
4. Commit the fix and push to your feature branch; CI will automatically trigger and re-validate.

---

## 7. Recommended Testing Roadmap

The project currently does not have test suites configured. As AI agent pipelines and critical rescue logic are developed, we recommend adopting a lightweight, fast testing stack:

- **Runner**: [Vitest](https://vitest.dev/) (native Vite integration, ultra-fast)
- **DOM Testing**: `@testing-library/react` + `@testing-library/jest-dom`
- **Future CI Hook**: Adding `npm test` to `.github/workflows/ci.yml` will take only one additional step once tests are written.
