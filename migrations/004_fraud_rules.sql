CREATE TABLE IF NOT EXISTS fraud_rules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(100) NOT NULL,
  rule_type   VARCHAR(50)  NOT NULL,
  threshold   NUMERIC      NOT NULL,
  window_secs INTEGER,
  action      VARCHAR(20)  NOT NULL DEFAULT 'flag',
  is_active   BOOLEAN      NOT NULL DEFAULT true,
  created_at  TIMESTAMP    NOT NULL DEFAULT NOW()
);

INSERT INTO fraud_rules (name, rule_type, threshold, window_secs, action)
VALUES
  ('Velocity check',  'velocity',     5,      60,   'flag'),
  ('High value txn',  'amount_limit', 100000, NULL, 'flag');