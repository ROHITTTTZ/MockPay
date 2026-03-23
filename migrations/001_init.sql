CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(100) NOT NULL,
  email           VARCHAR(100) UNIQUE NOT NULL,
  api_key         VARCHAR(64)  UNIQUE NOT NULL,
  webhook_secret  VARCHAR(64)  NOT NULL,
  rate_limit_tier VARCHAR(20)  DEFAULT 'standard',
  created_at      TIMESTAMP    DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payments (
  id               UUID PRIMARY KEY,
  user_id          UUID NOT NULL REFERENCES users(id),
  amount           NUMERIC(10,2) NOT NULL,
  currency         VARCHAR(10) NOT NULL,
  status           VARCHAR(30) NOT NULL DEFAULT 'pending',
  webhook_url      TEXT,
  idempotency_key  VARCHAR(255) NOT NULL,
  refund_amount    NUMERIC(10,2) DEFAULT 0,
  refunded_at      TIMESTAMP,
  refund_reason    TEXT,
  created_at       TIMESTAMP DEFAULT NOW(),
  CONSTRAINT payments_status_check CHECK (
    status IN ('pending','success','failed','flagged','refunded','partially_refunded')
  )
);

CREATE TABLE IF NOT EXISTS webhook_logs (
  id          UUID PRIMARY KEY,
  payment_id  UUID NOT NULL REFERENCES payments(id),
  user_id     UUID NOT NULL,
  payload     TEXT,
  status      VARCHAR(20) NOT NULL,
  retries     INTEGER DEFAULT 0,
  created_at  TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS unique_user_idempotency
ON payments(user_id, idempotency_key);