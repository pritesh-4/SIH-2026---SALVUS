# Salvus Production Deployment Guide (Render & Full-Stack)

This guide provides end-to-end instructions for deploying the **Salvus** platform (FastAPI + Socket.IO backend and React Vite frontend) to **Render** and modern edge static hosting platforms.

---

## 1. Fast Track: Render Blueprint (Infrastructure as Code)

The repository includes a ready-to-use [`render.yaml`](../render.yaml) blueprint configuring both the backend Web Service and an optional frontend Static Site.

### Steps:

1. Push your repository to GitHub / GitLab.
2. Log into [Render Dashboard](https://dashboard.render.com/).
3. Click **New +** → **Blueprint**.
4. Connect your Salvus repository.
5. Render will automatically read `render.yaml` and configure:
   - **`salvus-backend`** (Python Web Service with zero-downtime health checking on `/health`)
   - **`salvus-frontend`** (Static Site with SPA rewrite rules)
6. Set any secret API keys (e.g. `GEMINI_API_KEY`, `GROQ_API_KEY`) in the environment variables prompt.
7. Click **Apply**.

---

## 2. Manual Backend Deployment on Render

If you prefer to configure the backend web service manually in the Render dashboard:

### A. Create Web Service

1. In Render, click **New +** → **Web Service**.
2. Connect your Git repository.
3. Configure the following fields:

| Field              | Value                                                                                                      | Notes                                                   |
| ------------------ | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| **Name**           | `salvus-backend`                                                                                           | Or any preferred name                                   |
| **Region**         | `Oregon (US West)`                                                                                         | Or closest region                                       |
| **Branch**         | `main`                                                                                                     | Production branch                                       |
| **Root Directory** | `backend`                                                                                                  | **Important:** Points to the backend subfolder          |
| **Runtime**        | `Python 3`                                                                                                 | Uses Python 3.12 via `runtime.txt`                      |
| **Build Command**  | `pip install --upgrade pip && pip install -r requirements.txt`                                             | Installs dependencies                                   |
| **Start Command**  | `uvicorn app.main:combined_asgi_app --host 0.0.0.0 --port $PORT --proxy-headers --forwarded-allow-ips='*'` | Runs ASGI + Socket.IO app                               |
| **Plan**           | `Free` or `Starter`                                                                                        | Free tier spins down on idle; Starter runs continuously |

### B. Health Check Path

- Under **Advanced Settings**, set **Health Check Path** to:
  ```text
  /health
  ```
  _(Render will query `/health` to verify database readiness before routing live traffic.)_

### C. Environment Variables

Add the following key-value pairs in the **Environment** tab:

```env
ENVIRONMENT=production
PYTHON_VERSION=3.12.9
CORS_ORIGIN=*
DATABASE_PATH=data/salvus.db
AUTO_SEED=true
OSRM_BASE_URL=https://router.project-osrm.org

# Optional AI Triage Providers:
GEMINI_API_KEY=your_gemini_api_key_here
GROQ_API_KEY=your_groq_api_key_here
```

> [!TIP]
> **Production CORS Best Practice:**
> Replace `CORS_ORIGIN=*` with your specific frontend domain(s) separated by commas, for example:
> `CORS_ORIGIN=https://salvus.vercel.app,https://salvus-frontend.onrender.com,http://localhost:5173`

---

## 3. Database Persistence on Render

Salvus uses SQLite with `aiosqlite` in Write-Ahead Logging (`WAL`) mode for high concurrency.

- **Free Tier:** Render Free tier web services use ephemeral storage. Databases stored in `data/salvus.db` reset on service restart or redeploy. The `AUTO_SEED=true` setting guarantees that fresh instances automatically populate active Kolkata emergency response infrastructure, responders, and shelters.
- **Starter Plan (Persistent Disk):**
  If upgrading to Render Starter, add a **Persistent Disk**:
  1. Mount Path: `/var/data`
  2. Size: `1 GB`
  3. Set environment variable: `DATABASE_PATH=/var/data/salvus.db`
     All incidents, audit logs, and coordinates will permanently persist across deploys.

---

## 4. Frontend Deployment (Vercel / Netlify / Render)

Deploy the frontend React + Vite application to Vercel, Netlify, or Render Static Sites:

### Build Settings:

- **Build Command:** `npm run build`
- **Output Directory:** `dist`
- **Install Command:** `npm install`

### Environment Variables:

```env
VITE_API_URL=https://salvus-backend.onrender.com
VITE_WS_URL=https://salvus-backend.onrender.com
```

_(Replace with your actual Render backend URL without trailing slashes)._

### Single Page App (SPA) Routing:

Ensure client-side routing is configured so direct refreshes on routes like `/authority` or `/rescue` do not return 404:

- **Render Static Sites:** Configured in `render.yaml` with rewrite `/* -> /index.html`.
- **Vercel:** Configured via `vercel.json` rewrites.
- **Netlify:** `_redirects` file with `/* /index.html 200`.

---

## 5. Security & Reliability Highlights

- **Security Headers:** Injected on all endpoints (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `X-XSS-Protection: 1`, `Referrer-Policy: strict-origin-when-cross-origin`, `Strict-Transport-Security`).
- **Payload Guard:** Rejects requests larger than 5MB to prevent denial-of-service/memory exhaustion.
- **Reverse Proxy Support:** `--proxy-headers --forwarded-allow-ips='*'` enables accurate client IP and protocol detection behind Render's Cloudflare edge.
- **Multi-Origin CORS:** Flexible comma-separated origin parsing for staging, preview, and production domains.
- **Fallback AI Triage:** Automatic graceful degradation from Gemini → Groq → Deterministic Local Heuristics when API keys are omitted or rate-limited.
