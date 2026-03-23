const pool = require('../config/db');

const logTransition = async (client, {
  paymentId,
  userId,
  oldStatus,
  newStatus,
  triggeredBy = 'api',
  metadata = null,
}) => {

  await client.query(
    `INSERT INTO audit_log
     (payment_id, user_id, old_status, new_status, triggered_by, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      paymentId,
      userId,
      oldStatus,
      newStatus,
      triggeredBy,
      metadata ? JSON.stringify(metadata) : null,
    ]
  );
};

module.exports = { logTransition };