# MockPay — Payment Simulation API

> A developer-focused payment gateway simulator that mimics real-world payment systems like Stripe and Razorpay — with idempotent transactions, async webhook delivery, HMAC signing, fraud detection, and immutable audit trails.

[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=flat&logo=node.js&logoColor=white)](https://nodejs.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15+-4169E1?style=flat&logo=postgresql&logoColor=white)](https://postgresql.org)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED?style=flat&logo=docker&logoColor=white)](https://docker.com)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat)](LICENSE)

**Live API →** `https://mockpay.onrender.com`  
**GitHub →** `https://github.com/rohithpradeep/mockpay`

---

## Table of Contents

- [What is MockPay](#what-is-mockpay)
- [Why I Built This](#why-i-built-this)
- [System Architecture](#system-architecture)
- [Payment State Machine](#payment-state-machine)
- [Tech Stack](#tech-stack)
- [Features](#features)
- [API Reference](#api-reference)
- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [Database Migrations](#database-migrations)
- [Security Model](#security-model)
- [What I Learned](#what-i-learned)
- [Project Structure](#project-structure)

---

## What is MockPay

MockPay is a multi-tenant backend system that simulates real-world payment gateway behaviour. Developers can use it to test payment workflows without real money, KYC, or sandbox approval processes.

**The problem it solves:** Testing payment integrations is painful. Real sandboxes require account setup and offer limited control over failure scenarios. MockPay gives developers complete control — simulate any payment outcome, trigger fraud rules, test webhook retries, inspect dead-letter queues — all through a clean REST API.

**Who it's for:** Developers building checkout systems, fintech applications, or learning how production payment infrastructure works.

---

## Why I Built This

Most backend projects demonstrate CRUD operations. MockPay was built specifically to solve the engineering problems that payment systems face in production:

| Problem | Solution Built |
|---|---|
| Duplicate charges from client retries | Idempotency with Postgres advisory locks |
| Webhook delivery blocking API response | Async job queue with pg-boss |
| Unverified webhook payloads | HMAC-SHA256 signed delivery |
| Silent webhook failures | Dead-letter queue with admin replay |
| Fraudulent high-velocity transactions | Configurable fraud rules engine |
| Tampered audit records | WORM pattern via Postgres trigger |
| Unbounded API abuse | Per-tenant rate limiting |

Every feature maps to a real engineering challenge at companies like Razorpay, Stripe, and Cred.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Client Layer                         │
│              Developer client — Postman / SDK               │
└──────────────────────────┬──────────────────────────────────┘
                           │ POST /payments
┌──────────────────────────▼──────────────────────────────────┐
│                       Gateway Layer                         │
│   API Key Auth  │  Rate Limiter (100/15min)  │  Zod Schema  │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                        Engine Layer                         │
│  Fraud Engine  │  Idempotency Lock  │  State Machine (6)    │
└──────────────────────────┬──────────────────────────────────┘
                           │ boss.send()
┌──────────────────────────▼──────────────────────────────────┐
│                      Job Queue Layer                        │
│        pg-boss — persistent jobs, retry, backoff, DLQ       │
└─────────────┬──────────────────────────┬────────────────────┘
              │                          │
┌─────────────▼──────────┐  ┌────────────▼───────────────────┐
│     Storage Layer      │  │         Audit Layer             │
│  payments · users      │  │  audit_log (WORM protected)     │
│  webhook_logs          │  │  Postgres trigger blocks        │
│  fraud_rules           │  │  UPDATE / DELETE                │
└─────────────┬──────────┘  └────────────────────────────────┘
              │
┌─────────────▼──────────────────────────────────────────────┐
│                      Delivery Layer                        │
│   webhookWorker — HMAC-signed POST → client backend        │
│   X-MockPay-Signature: sha256=<hmac>                       │
└────────────────────────────────────────────────────────────┘
```

---

## Payment State Machine

```
                    ┌─────────┐
                    │ pending │ ◄── initial state on creation
                    └────┬────┘
           ┌─────────────┼─────────────┐
           │             │             │
    simulate         simulate       fraud rule
     success          failed         fires
           │             │             │
    ┌──────▼──────┐ ┌────▼────┐ ┌─────▼───┐
    │   success   │ │ failed  │ │ flagged │
    └──────┬──────┘ └─────────┘ └─────────┘
           │          terminal    terminal
     ┌─────┴──────┐
     │            │
  full         partial
  refund        refund
     │            │
┌────▼─────┐ ┌───▼──────────────┐
│ refunded │ │partially_refunded│
└──────────┘ └──────────────────┘
  terminal          terminal
```

**Rules:**
- Only `success` payments can be refunded
- `refund_amount` must be > 0 and ≤ original amount
- `refunded` = exact amount returned, `partially_refunded` = less than original
- `failed`, `flagged`, `refunded`, `partially_refunded` are all terminal states

---

## Tech Stack

| Category | Technology | Why |
|---|---|---|
| Runtime | Node.js 18+ | Async I/O, event loop for non-blocking webhook delivery |
| Framework | Express.js | Minimal, flexible, middleware-based |
| Database | PostgreSQL 15 | ACID transactions, advisory locks, triggers |
| Job Queue | pg-boss v9 | Persistent jobs on existing Postgres — no Redis needed |
| Validation | zod | Schema-first validation with coercion |
| Logging | pino | Structured JSON logs with child logger context |
| Cryptography | Node.js crypto | HMAC-SHA256 — no external dependency |
| Rate Limiting | express-rate-limit | Per-tenant request throttling |
| HTTP Client | axios | Webhook delivery with timeout control |
| Deployment | Docker + Render | Containerised, reproducible environment |

---

## Features

### Idempotent Payment Creation
Every payment creation requires an `Idempotency-Key` header. Duplicate requests with the same key return the original payment — no double charges. Implemented using `pg_advisory_xact_lock` inside a Postgres transaction, preventing race conditions under concurrent load.

```
The problem without this:
  Request A: SELECT (0 rows) → INSERT ─┐
  Request B: SELECT (0 rows) → INSERT ─┘ → 2 payments created (double charge)

The fix:
  Request A: acquires advisory lock → SELECT → INSERT → COMMIT → releases lock
  Request B: blocks at lock → SELECT (finds row) → returns existing → releases lock
```

### Async Webhook Delivery
Webhook delivery is fully decoupled from the HTTP response. When a payment status changes, a job is persisted to `pgboss.job` before the response returns. A background worker picks it up independently.

```
Without decoupling: API response time = DB write time + webhook delivery time (up to 7s)
With pg-boss:       API response time = DB write time only (~15ms)
                    Webhook delivery happens asynchronously, survives server crashes
```

### HMAC-SHA256 Signed Webhooks
Every webhook POST carries an `X-MockPay-Signature` header — a SHA256 HMAC of the payload using the tenant's `webhook_secret`. Receivers can verify authenticity without the secret ever being transmitted.

```javascript
// MockPay signs:
const signature = crypto
  .createHmac('sha256', webhookSecret)
  .update(payloadString)
  .digest('hex');
// Header: X-MockPay-Signature: sha256=<signature>

// Client verifies:
const expected = computeHmac(payload, secret);
const isValid  = crypto.timingSafeEqual(
  Buffer.from(expected),
  Buffer.from(received)
); // timingSafeEqual prevents timing attacks
```

### Dead Letter Queue + Replay
When all 3 retry attempts fail, jobs move to a failed state in `pgboss.job` — never silently dropped. Admins can inspect and replay failed webhooks through the admin API. On replay, the current `webhook_url` from the payments table is used — not the stale URL from the failed job.

### Configurable Fraud Rules Engine
Fraud rules are stored in the `fraud_rules` table — not hardcoded. Before every payment creation, all active rules are evaluated:

- **Velocity rule** — more than N payments in M seconds → flag
- **Amount limit** — single payment over threshold → flag

Flagged payments get `status = flagged` and trigger a `fraud.detected` webhook. Rules can be toggled on/off via admin API without redeployment.

### Immutable Audit Trail (WORM)
Every state transition appends a row to `audit_log`. A Postgres trigger raises an exception on any `UPDATE` or `DELETE` attempt — even by a DBA. The audit entry is written inside the same transaction as the payment update — atomic, always in sync.

```sql
CREATE OR REPLACE FUNCTION prevent_audit_log_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is immutable. Attempted % on record %.', TG_OP, OLD.id;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
```

### Per-Tenant Rate Limiting
Rate limiting is keyed on `req.user.id` — not IP address. Each tenant gets their own independent counter (100 requests per 15 minutes). Returns `429` with `Retry-After` header so clients know exactly when to retry.

### Cursor-Based Pagination
`GET /api/payments` uses composite cursor pagination — `(created_at, id)` — instead of offset. Offset pagination degrades at scale (scanning 10,000 rows to return page 501). Cursor pagination is O(log n) regardless of page depth, with no consistency issues when new data is inserted.

---

## API Reference

### Auth

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | None | Register tenant, get api_key + webhook_secret |
| GET | `/api/auth/me` | Bearer | Get own credentials |

### Payments

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/payments` | Bearer | Create payment with fraud check |
| GET | `/api/payments` | Bearer | List payments with cursor pagination |
| POST | `/api/payments/:id/simulate` | Bearer | Simulate state transition |
| POST | `/api/payments/:id/refund` | Bearer | Full or partial refund |
| GET | `/api/payments/:id/audit` | Bearer | Tamper-evident state history |

### Admin

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/admin/dlq` | Bearer | List all failed webhook jobs |
| POST | `/api/admin/dlq/:id/replay` | Bearer | Re-enqueue failed job |
| GET | `/api/admin/users` | Bearer | List all tenants |
| GET | `/api/admin/fraud-rules` | Bearer | List all fraud rules |
| PATCH | `/api/admin/fraud-rules/:id` | Bearer | Toggle rule on/off |
| GET | `/api/admin/metrics` | Bearer | Live system health snapshot |

---

## Quick Start

### Option 1 — Docker (recommended)

```bash
# Clone the repository
git clone https://github.com/rohithpradeep/mockpay.git
cd mockpay

# Copy environment variables
cp .env.example .env

# Start app + PostgreSQL together
docker-compose up

# Server running at http://localhost:3000
```

### Option 2 — Local

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your Postgres credentials

# Run migrations in order
psql -U your_user -d your_db -f migrations/001_init.sql
psql -U your_user -d your_db -f migrations/002_idempotency_constraint.sql
psql -U your_user -d your_db -f migrations/003_pgcrypto.sql
psql -U your_user -d your_db -f migrations/004_webhook_secret.sql
psql -U your_user -d your_db -f migrations/005_refund_states.sql
psql -U your_user -d your_db -f migrations/006_audit_log.sql
psql -U your_user -d your_db -f migrations/007_audit_log_worm_trigger.sql
psql -U your_user -d your_db -f migrations/008_fraud_rules.sql

# Start server
npm start
```

### Test the full flow

```bash
# 1. Register a tenant
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Dev", "email": "test@example.com"}'

# Save the api_key and webhook_secret from the response

# 2. Create a payment
curl -X POST http://localhost:3000/api/payments \
  -H "Authorization: Bearer <api_key>" \
  -H "Idempotency-Key: pay-001" \
  -H "Content-Type: application/json" \
  -d '{"amount": 5000, "currency": "INR", "webhook_url": "https://webhook.site/your-id"}'

# 3. Simulate success
curl -X POST http://localhost:3000/api/payments/<payment_id>/simulate \
  -H "Authorization: Bearer <api_key>" \
  -H "Content-Type: application/json" \
  -d '{"status": "success"}'

# 4. View audit trail
curl http://localhost:3000/api/payments/<payment_id>/audit \
  -H "Authorization: Bearer <api_key>"

# 5. Check system metrics
curl http://localhost:3000/api/admin/metrics \
  -H "Authorization: Bearer <api_key>"

# 6. Verify HMAC webhook signing
node scripts/verify-webhook.js
```

---

## Environment Variables

```env
# Server
PORT=3000
NODE_ENV=development
LOG_LEVEL=info

# Database
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_password
DB_NAME=mockpay
```

---

## Database Migrations

Run in order — each file builds on the previous:

| File | Description |
|---|---|
| `001_init.sql` | users, payments, webhook_logs tables |
| `002_idempotency_constraint.sql` | UNIQUE(user_id, idempotency_key) |
| `003_pgcrypto.sql` | Enable pgcrypto extension |
| `004_webhook_secret.sql` | webhook_secret column on users |
| `005_refund_states.sql` | refund columns + status constraint |
| `006_audit_log.sql` | Append-only audit_log table |
| `007_audit_log_worm_trigger.sql` | Postgres trigger blocks UPDATE/DELETE |
| `008_fraud_rules.sql` | fraud_rules table + default rules |

---

## Security Model

### API Authentication
Every request to protected endpoints requires `Authorization: Bearer <api_key>`. Keys are generated with `crypto.randomBytes(32)` — 64-character hex strings, cryptographically random.

### Webhook Signing
MockPay signs every webhook with HMAC-SHA256:

```
X-MockPay-Signature: sha256=<hmac_hex>
```

The signature is computed over the exact JSON string sent in the request body. The receiver must recompute the HMAC using their `webhook_secret` and compare using a timing-safe comparison to prevent timing attacks.

Run the verification demo:
```bash
node scripts/verify-webhook.js
```

Output:
```
✓ [PASS] Valid signature accepted
✓ [PASS] Tampered payload rejected
✓ [PASS] Wrong secret rejected
✓ [PASS] Empty signature rejected
✓ [PASS] Replayed signature on different payload rejected

Result: 5/5 tests passed — system secure
```

### Immutable Audit Trail
The `audit_log` table uses a WORM (Write Once Read Many) pattern. A Postgres trigger prevents any modification — not even a database administrator can alter historical records. Every payment state transition is permanently recorded with `old_status`, `new_status`, `triggered_by`, and timestamp.

### Tenant Isolation
All payment queries include `AND user_id = $1`. Tenants cannot access, simulate, or refund another tenant's payments. Cross-tenant requests return `404` — intentionally ambiguous to prevent resource enumeration (OWASP A01 — IDOR prevention).

### Rate Limiting
Each tenant is rate-limited independently by `api_key` — not by IP. This prevents shared-IP false positives and ensures one abusive tenant cannot affect others.

---

## What I Learned

### Concurrency — TOCTOU race conditions
A SELECT then INSERT without a lock has a race condition — two concurrent requests both pass the check before either commits. I fixed this using `pg_advisory_xact_lock` which locks on an arbitrary key (not a row), making it work even when the row doesn't exist yet. This is called a Time-Of-Check-To-Time-Of-Use (TOCTOU) bug — one of the most common concurrency vulnerabilities.

### Async architecture — job queues
HTTP response latency should never be coupled to external network calls. A webhook that takes 7 seconds to exhaust retries should not hold open an API response for 7 seconds. Decoupling via a job queue means the response returns in ~15ms and delivery happens independently. The key insight: `setImmediate` solves the blocking problem but loses jobs on crash — a persistent queue (pg-boss) survives restarts because jobs are written to Postgres before the response returns.

### Cryptography — HMAC and timing attacks
HMAC-SHA256 proves a message came from someone who knows the secret without transmitting the secret. A regular `===` comparison leaks information through timing — an attacker can measure response time to figure out how many characters of a forged signature are correct. `crypto.timingSafeEqual` always takes the same time regardless of how many characters match, closing this side-channel.

### Database patterns — WORM and advisory locks
Postgres triggers fire before or after data modifications — a `BEFORE UPDATE OR DELETE` trigger that raises an exception makes a table physically immutable. Advisory locks are application-level locks identified by an integer — unlike row locks, they work even when the row doesn't exist yet, making them ideal for idempotency checks on new inserts.

### API design — cursor pagination
Offset pagination (`LIMIT 20 OFFSET 10000`) forces a full scan of 10,000 rows. Cursor pagination using `(created_at, id) < (cursor_ts, cursor_id)` is O(log n) with an index and never degrades. The composite cursor handles timestamp collisions — two records with identical timestamps are still uniquely ordered by their UUID.

### Security — IDOR vulnerability
Insecure Direct Object Reference (OWASP A01) — querying a resource by ID without checking ownership. Fixed with `AND user_id = $1` at the database level. Returns 404, not 403 — intentionally ambiguous so callers cannot determine whether a resource exists for another tenant.

### Observability — structured logging
`console.log` strings are unsearchable at scale. Pino child loggers bake `payment_id` and `user_id` into every log line — you can filter all events for a specific payment across the entire system timeline in one query.

---

## Project Structure

```
mockpay/
├── src/
│   ├── config/
│   │   ├── db.js               # PostgreSQL pool
│   │   ├── pgBoss.js           # pg-boss singleton
│   │   └── logger.js           # pino structured logger
│   ├── controllers/
│   │   ├── paymentController.js
│   │   ├── authController.js
│   │   └── adminController.js
│   ├── middlewares/
│   │   ├── authMiddleware.js   # API key verification
│   │   ├── validateRequest.js  # zod middleware factory
│   │   └── rateLimiter.js      # per-tenant rate limiting
│   ├── services/
│   │   ├── paymentService.js   # core business logic
│   │   ├── fraudService.js     # rules engine
│   │   └── auditService.js     # WORM log writer
│   ├── workers/
│   │   └── webhookWorker.js    # pg-boss job handler
│   ├── utils/
│   │   ├── AppError.js         # operational error class
│   │   ├── hmac.js             # sign + verify functions
│   │   └── createLogger.js     # child logger factory
│   ├── validators/
│   │   └── paymentValidator.js # zod schemas
│   └── routes/
│       ├── paymentRoutes.js
│       ├── authRoutes.js
│       └── adminRoutes.js
├── migrations/
│   ├── 001_init.sql
│   ├── 002_idempotency_constraint.sql
│   ├── 003_pgcrypto.sql
│   ├── 004_webhook_secret.sql
│   ├── 005_refund_states.sql
│   ├── 006_audit_log.sql
│   ├── 007_audit_log_worm_trigger.sql
│   └── 008_fraud_rules.sql
├── scripts/
│   └── verify-webhook.js       # HMAC security demo
├── app.js
├── .env.example
├── Dockerfile
├── docker-compose.yml
└── package.json
```

---

## Database Schema

```
users              payments           webhook_logs
─────────────      ────────────────   ────────────────
id UUID PK         id UUID PK         id UUID PK
name               user_id FK         payment_id FK
email UNIQUE       amount             user_id FK
api_key UNIQUE     currency           payload JSONB
webhook_secret     status             status
rate_limit_tier    webhook_url        retries
created_at         idempotency_key    created_at
                   refund_amount
                   refunded_at        audit_log
                   refund_reason      ────────────────
                   created_at         id UUID PK
                                      payment_id FK
fraud_rules                           user_id FK
────────────────                      old_status
id UUID PK                            new_status
name                                  triggered_by
rule_type                             metadata JSONB
threshold                             created_at
window_secs                           (WORM protected)
action
is_active
created_at
```

---

Built by [Rohith Pradeep](https://github.com/ROHITTTTZ) — [LinkedIn](https://www.linkedin.com/in/rohith-pradeep/) — Computer Engineering, Pillai College of Engineering, Mumbai.
