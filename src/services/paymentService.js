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

const refundPayment = async (paymentId, userId, refundAmount, reason) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Lock the row — prevent concurrent refunds on same payment
    const result = await client.query(
      'SELECT * FROM payments WHERE id = $1 AND user_id = $2 FOR UPDATE',
      [paymentId, userId]
    );

    if (result.rows.length === 0) {
      throw new AppError('Payment not found', 404);
    }

    const payment = result.rows[0];

    // Rule 1 — can only refund a successful payment
    if (payment.status !== 'success') {
      throw new AppError(
        `Cannot refund a payment with status ${payment.status}. Only success payments can be refunded.`,
        400
      );
    }

    // Rule 2 — refund amount must be positive
    if (!refundAmount || refundAmount <= 0) {
      throw new AppError('Refund amount must be greater than 0', 400);
    }

    // Rule 3 — refund amount cannot exceed original payment amount
    if (refundAmount > payment.amount) {
      throw new AppError(
        `Refund amount ${refundAmount} exceeds original payment amount ${payment.amount}`,
        400
      );
    }

    // Determine new status based on amount
    // Full refund = exact amount returned
    // Partial refund = less than original amount
    const newStatus = refundAmount === Number(payment.amount)
      ? 'refunded'
      : 'partially_refunded';

    const updated = await client.query(
      `UPDATE payments
       SET status        = $1,
           refund_amount = $2,
           refunded_at   = NOW(),
           refund_reason = $3
       WHERE id = $4
       RETURNING *`,
      [newStatus, refundAmount, reason || null, paymentId]
    );

    await client.query('COMMIT');

    const updatedPayment = updated.rows[0];

    // Fire refund webhook
    if (updatedPayment.webhook_url) {
      const boss = await getBoss();
      await boss.send('webhook-delivery', {
        url:        updatedPayment.webhook_url,
        payment_id: updatedPayment.id,
        user_id:    updatedPayment.user_id,
        payload: {
          event:         'payment.refunded',  // different event name
          payment_id:    updatedPayment.id,
          status:        updatedPayment.status,
          original_amount: updatedPayment.amount,
          refund_amount: updatedPayment.refund_amount,
          currency:      updatedPayment.currency,
          refund_reason: updatedPayment.refund_reason,
          timestamp:     new Date().toISOString(),
        }
      });
    }

    return updatedPayment;

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

module.exports = {
  createPayment,
  simulatePayment,
  refundPayment,
};
