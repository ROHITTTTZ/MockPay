const pool = require("../config/db");
const { v4: uuidv4 } = require("uuid");

const createPayment = async (userId, data, idempotencyKey) => {
  const { amount, currency, webhook_url } = data;

  const existing = await pool.query(
    `SELECT * FROM payments 
     WHERE user_id = $1 AND idempotency_key = $2`,
    [userId, idempotencyKey]
  );

  if (existing.rows.length > 0) {
    return existing.rows[0]; 
  }

  const id = uuidv4();

  const result = await pool.query(
    `INSERT INTO payments (id, user_id, amount, currency, webhook_url, idempotency_key)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [id, userId, amount, currency, webhook_url, idempotencyKey]
  );

  return result.rows[0];
};

const simulatePayment = async (paymentId, newStatus) => {
  // Fetch payment
  const result = await pool.query(
    "SELECT * FROM payments WHERE id = $1",
    [paymentId]
  );

  if (result.rows.length === 0) {
    throw new Error("Payment not found");
  }

  const payment = result.rows[0];

  // 🔥 VALID STATE TRANSITIONS
  const validTransitions = {
    pending: ["success", "failed"],
  };

  if (!validTransitions[payment.status]?.includes(newStatus)) {
    throw new Error(
      `Invalid transition from ${payment.status} to ${newStatus}`
    );
  }

  // Update status
  const updated = await pool.query(
    "UPDATE payments SET status = $1 WHERE id = $2 RETURNING *",
    [newStatus, paymentId]
  );

  return updated.rows[0];
};

module.exports = {
  createPayment,
  simulatePayment,
};