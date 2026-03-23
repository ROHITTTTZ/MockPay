CREATE TABLE IF NOT EXISTS audit_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id   UUID NOT NULL REFERENCES payments(id),
  user_id      UUID NOT NULL,
  old_status   VARCHAR(30),
  new_status   VARCHAR(30) NOT NULL,
  triggered_by VARCHAR(50) NOT NULL DEFAULT 'system',
  metadata     JSONB,
  created_at   TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_payment_id ON audit_log(payment_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id    ON audit_log(user_id);