CREATE OR REPLACE FUNCTION prevent_audit_log_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION
    'audit_log is immutable. Attempted % on record %. Audit records cannot be modified or deleted.',
    TG_OP,
    OLD.id;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_immutability_guard
  BEFORE UPDATE OR DELETE
  ON audit_log
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_log_modification();