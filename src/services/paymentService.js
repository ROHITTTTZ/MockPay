const pool = require("../config/db");
const { v4: uuidv4 } = require("uuid");
const sendWebhook = require("../utils/webhookSender");
const AppError = require('../utils/AppError');
const getBoss = require('../config/pgBoss');

const createPayment = async (userId, data, idempotencyKey) => {
  const { amount, currency, webhook_url } = data;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const lockResult = await client.query(`SELECT hashtext($1) as lock_key`, [
      `${userId}:${idempotencyKey}`,
    ]);
    const lockKey = lockResult.rows[0].lock_key;
    await client.query(`SELECT pg_advisory_xact_lock($1)`, [lockKey]);

    const existing = await pool.query(
      `SELECT * FROM payments 
     WHERE user_id = $1 AND idempotency_key = $2`,
      [userId, idempotencyKey],
    );
    if (existing.rows.length > 0) {
      await client.query("COMMIT");
      return existing.rows[0];
    }
    const id = uuidv4();

    const result = await pool.query(
      `INSERT INTO payments (id, user_id, amount, currency, webhook_url, idempotency_key)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
      [id, userId, amount, currency, webhook_url, idempotencyKey],
    );

    await client.query("COMMIT");

    return result.rows[0];
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
};

const simulatePayment = async (paymentId, userId, newStatus) => {
  const result = await pool.query("SELECT * FROM payments WHERE id = $1 AND user_id = $2", [
    paymentId,
    userId,
  ]);

  if (result.rows.length === 0) {
    throw new AppError("Payment not found", 404);
  }

  const payment = result.rows[0];

  const validTransitions = {
    pending: ["success", "failed"],
  };

  if (!validTransitions[payment.status]?.includes(newStatus)) {
    throw new AppError(
      `Invalid transition from ${payment.status} to ${newStatus}`,
      400   
    );
  }

  const updated = await pool.query(
    "UPDATE payments SET status = $1 WHERE id = $2 RETURNING *",
    [newStatus, paymentId],
  );

  const updatedPayment = updated.rows[0];

   if (updatedPayment.webhook_url) {
    const boss = await getBoss();

    await boss.send('webhook-delivery', {
      url:        updatedPayment.webhook_url,
      payment_id: updatedPayment.id,
      user_id:    updatedPayment.user_id,
      payload: {
        payment_id: updatedPayment.id,
        status:     updatedPayment.status,
        amount:     updatedPayment.amount,
        currency:   updatedPayment.currency,
        timestamp:  new Date().toISOString(),
      }
    },{
  retryLimit:   3,
  retryDelay:   2,
  retryBackoff: true,
});

    console.log(`Webhook job enqueued for payment ${updatedPayment.id}`);
  }

  return updatedPayment;
};

module.exports = {
  createPayment,
  simulatePayment,
};
