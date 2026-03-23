const pool = require('../config/db');

const runFraudChecks = async (userId, amount) => {
  const rulesResult = await pool.query(
    `SELECT * FROM fraud_rules WHERE is_active = true`
  );

  const rules = rulesResult.rows;

  for (const rule of rules) {

    if (rule.rule_type === 'velocity') {
      const countResult = await pool.query(
        `SELECT COUNT(*) AS payment_count
         FROM payments
         WHERE user_id    = $1
           AND created_at > NOW() - ($2 || ' seconds')::INTERVAL
           AND status    != 'failed'`,
        [userId, rule.window_secs]
      );

      const count = parseInt(countResult.rows[0].payment_count);

      if (count >= rule.threshold) {
        return {
          flagged: true,
          reason:  `Velocity rule triggered: ${count} payments in ${rule.window_secs}s (max ${rule.threshold})`,
          rule:    rule.name,
        };
      }
    }

    if (rule.rule_type === 'amount_limit') {
      if (amount > rule.threshold) {
        return {
          flagged: true,
          reason:  `Amount rule triggered: ₹${amount} exceeds limit of ₹${rule.threshold}`,
          rule:    rule.name,
        };
      }
    }
  }

  return { flagged: false };
};

module.exports = { runFraudChecks };