# SECURITY.md — Security, RBAC & Privacy Governance

This document details the authentication protocols, role-based access controls (RBAC), middleware security hardening, location privacy protections, PII sanitization, and compliance boundaries in Salvus.

---

## 1. Authentication Architecture

Salvus uses stateless, cryptographically signed JSON Web Tokens (JWT) powered by HMAC-SHA256:

- **Token Handler:** `backend/app/auth/jwt_handler.py`
- **Algorithm:** `HS256` (HMAC with SHA-256)
- **Token Validity:** Configurable (default 24 hours / 1,440 minutes)
- **Token Claims Payload:**
  ```json
  {
    "sub": "auth-user-id",
    "role": "AUTHORITY",
    "name": "Central Dispatcher Alok",
    "scoped_incident_id": null,
    "scoped_responder_id": null,
    "iat": 1787832000,
    "exp": 1787918400
  }
  ```

---

## 2. Role-Based Access Control (RBAC) Matrix

Salvus defines four explicit operational roles:

| Permission / Action                                                  |  `CITIZEN`  |  `RESPONDER`  | `AUTHORITY` | `SYSTEM` |
| :------------------------------------------------------------------- | :---------: | :-----------: | :---------: | :------: |
| **Create Distress SOS Beacon** (`POST /api/incidents`)               |     ✅      |      ✅       |     ✅      |    ✅    |
| **Cancel Own Active Incident** (`PATCH /api/incidents/{id}/status`)  |  ✅ (Own)   |      ❌       |     ✅      |    ✅    |
| **Verify / Resolve Incidents** (`PATCH /api/incidents/{id}/status`)  |     ❌      |      ❌       |     ✅      |    ✅    |
| **Trigger AI Triage Analysis** (`POST /api/triage/analyze/{id}`)     |     ❌      |      ❌       |     ✅      |    ✅    |
| **Approve / Adjust AI Triage** (`POST /api/triage/verify/{id}`)      |     ❌      |      ❌       |     ✅      |    ✅    |
| **Create Responder Assignment** (`POST /api/assignments`)            |     ❌      |      ❌       |     ✅      |    ✅    |
| **Advance Assignment Status** (`PATCH /api/assignments/{id}/status`) |     ❌      | ✅ (Own Unit) |     ✅      |    ✅    |
| **Update GPS Telemetry** (`POST /api/responders/{id}/location`)      |     ❌      | ✅ (Own Unit) |     ✅      |    ✅    |
| **Mutate Shelter Bed Capacity** (`PATCH /api/shelters/{id}`)         |     ❌      |      ❌       |     ✅      |    ✅    |
| **Subscribe to `authorities` Socket Room**                           |     ❌      |      ❌       |     ✅      |    ✅    |
| **Subscribe to `incident:{id}` Socket Room**                         | ✅ (Scoped) |  ✅ (Scoped)  |     ✅      |    ✅    |
| **Execute Fleet Simulation Controls** (`/api/simulation/*`)          |     ❌      |      ❌       |     ✅      |    ✅    |

---

## 3. Realtime Socket.IO Room Authorization

Socket connections and room subscriptions enforce strict cryptographic verification:

1. **Handshake Verification:** Clients transmit JWT tokens via `auth: { token: "..." }` or query strings.
2. **Authority Room Shield:** Only clients with validated `AUTHORITY` or `SYSTEM` role claims can join the `authorities` room. Unauthorized attempts emit a `403 FORBIDDEN` error and are logged.
3. **Cross-Incident Subscription Guards:** When a `CITIZEN` attempts to join an `incident:{id}` room, the server verifies that `token.scoped_incident_id == {id}`. Attempts to snoop on another citizen's distress channel are strictly blocked.

---

## 4. Defensive Middleware Hardening

```
Client Request
      ↓
[CorrelationIdMiddleware]    ──► Injects / Propagates 'X-Request-ID'
      ↓
[RequestLoggingMiddleware]  ──► Logs Client IP, Method, Route & Latency
      ↓
[PayloadLimitMiddleware]     ──► Rejects payloads > 5 MB (HTTP 413)
      ↓
[SecurityHeadersMiddleware]  ──► Injects HSTS, CSP, X-Frame-Options, etc.
      ↓
[CORSMiddleware]             ──► Enforces validated CORS origins
      ↓
FastAPI Router Handlers
```

### Injected Security Headers:

- `X-Content-Type-Options: nosniff` (Prevents MIME-sniffing exploits)
- `X-Frame-Options: DENY` (Mitigates clickjacking attacks)
- `X-XSS-Protection: 1; mode=block` (Enforces legacy browser XSS filters)
- `Referrer-Policy: strict-origin-when-cross-origin` (Prevents referrer leaks)
- `Strict-Transport-Security: max-age=31536000; includeSubDomains` (Enforces HTTPS in production)

---

## 5. Location Privacy & Telemetry Bounds

Salvus adheres to a strict emergency-only location tracking principle (`src/lib/location.js`):

- **On-Demand Only for Hazards:** Standard hazard reporting uses a single, one-off location query. Continuous GPS background polling is strictly forbidden.
- **Emergency-Only High Precision:** Continuous high-accuracy GPS tracking (`watchEmergencyLocation()`) is activated **strictly upon explicit user SOS confirmation**.
- **Instant Teardown on Resolution:** When an incident transitions to `RESOLVED` or `CANCELLED`, all browser geolocation watch handles are immediately unregistered.
- **Human-Readable Accuracy Tiers:** Raw meter errors are translated into operational ratings (`High Precision ±15m`, `Good Accuracy ±50m`, `Approximate ±200m`, `Cell Triangulation >200m`).

---

## 6. PII Sanitization & AI Data Minimization

Before any distress text is processed by external AI providers (Google Gemini or Groq Cloud), `sanitize_incident_for_ai` strips:

- Government ID numbers (12-digit grouped sequences)
- Citizen phone numbers
- Email addresses
- Explicit citizen surnames

Only generalized threat context, affected headcounts, and coordinates are processed.

---

## 7. Status of Security Controls

| Security Control                                  | Implementation Status | Notes                                                      |
| :------------------------------------------------ | :-------------------- | :--------------------------------------------------------- |
| **HMAC-SHA256 JWT Token Issuance & Verification** | **IMPLEMENTED ✅**    | Cryptographically verified in `app/auth/jwt_handler.py`.   |
| **FastAPI Dependency RBAC Guards**                | **IMPLEMENTED ✅**    | Enforced via `require_authority`, `require_responder`.     |
| **Socket.IO Room Join Authorization**             | **IMPLEMENTED ✅**    | Enforced in `socket_manager.py:join_room`.                 |
| **Security Headers Middleware**                   | **IMPLEMENTED ✅**    | Active across all HTTP responses.                          |
| **5MB Payload Body Size Limits**                  | **IMPLEMENTED ✅**    | Active via `PayloadLimitMiddleware`.                       |
| **Correlation ID & Structured Logging**           | **IMPLEMENTED ✅**    | Propagated via `CorrelationIdMiddleware`.                  |
| **PII Redaction Regex Pipeline**                  | **IMPLEMENTED ✅**    | Active in `services/ai/base.py`.                           |
| **Database Encryption at Rest**                   | **PLANNED 🔮**        | Planned for PostgreSQL migration with SQLCipher / AWS KMS. |
| **Hardware Security Token (FIDO2 / WebAuthn)**    | **PLANNED 🔮**        | Planned for official agency dispatcher logins.             |
| **CAP / EDXL Interoperability Auth**              | **PLANNED 🔮**        | Planned for national disaster authority gateways.          |
