# DEPLOYMENT.md - Deployment Strategy & Checklist (PLANNED)

This document tracks planned build and deploy configurations for the Salvus platform.

---

## 1. Planned Infrastructure Architecture

### Frontend: Vercel / Netlify
* **Trigger:** Auto-builds on commits pushed to `main` branch.
* **Pipeline:** Checks formatting, runs build validation, and deploys build assets to CDN.

### Backend: Railway / Render
* **Environment:** Containerized environment deploying the Express service via Docker.
* **Health Check Endpoint:** `GET /api/health` checking database and socket responsiveness.

### Database: Supabase Cloud Instance
* **Configuration:** Relational PostgreSQL DB hosting PostGIS extensions.
* **Access Rules:** Custom row-level security (RLS) policies defining read/write scopes for citizens and dispatchers.

---

## 2. Production Checklist
Before launching the platform live:
* [ ] Verify `.env` parameters matches Vercel production keys.
* [ ] Check PostgreSQL database contains PostGIS GIST indexes.
* [ ] Verify the backend container runs over HTTPS.
* [ ] Confirm Gemini API has billing enabled or backup Groq API endpoints are functional.
* [ ] Test connection latencies on Leaflet OSM base tile layers.
