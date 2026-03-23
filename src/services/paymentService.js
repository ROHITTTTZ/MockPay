const pool = require("../config/db");
const { v4: uuidv4 } = require("uuid");
const AppError = require('../utils/AppError');
const getBoss = require('../config/pgBoss');
const { logTransition } = require('./auditService');

const createPayment = async (userId, data, idempotencyKey) => {
  const { amount, currency, webhook_url } = data;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const lockResult = await client.query(
      `SELECT hashtext($1) as lock_key`,
      [`${userId}:${idempotencyKey}`]
    );
    const lockKey = lockResult.rows[0].lock_key;
    await client.query(`SELECT pg_advisory_xact_lock($1)`, [lockKey]);

    // FIX — use client not pool
    const existing = await client.query(
      `SELECT * FROM payments
       WHERE user_id = $1 AND idempotency_key = $2`,
      [userId, idempotencyKey]
    );

    if (existing.rows.length > 0) {
      await client.query("COMMIT");
      return existing.rows[0];
    }

    const id = uuidv4();

    // FIX — use client not pool
    const result = await client.query(
      `INSERT INTO payments (id, user_id, amount, currency, webhook_url, idempotency_key)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [id, userId, amount, currency, webhook_url, idempotencyKey]
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
  // FIX — create client at the very top
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // FIX — use client not pool
    const result = await client.query(
      "SELECT * FROM payments WHERE id = $1 AND user_id = $2",
      [paymentId, userId]
    );

    if (result.rows.length === 0) {
      throw new AppError("Payment not found", 404);
    }

    const payment   = result.rows[0];
    const oldStatus = payment.status;

    const validTransitions = {
      pending: ["success", "failed"],
    };

    if (!validTransitions[payment.status]?.includes(newStatus)) {
      throw new AppError(
        `Invalid transition from ${payment.status} to ${newStatus}`,
        400
      );
    }

    // FIX — use client not pool
    const updated = await client.query(
      "UPDATE payments SET status = $1 WHERE id = $2 RETURNING *",
      [newStatus, paymentId]
    );

    // NOW client exists — logTransition works
    await logTransition(client, {
      paymentId,
      userId,
      oldStatus,
      newStatus,
      triggeredBy: 'simulate_api',
      metadata: { timestamp: new Date().toISOString() }
    });

    await client.query("COMMIT");

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
      });

      console.log(`Webhook job enqueued for payment ${updatedPayment.id}`);
    }

    return updatedPayment;

  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
};


const refundPayment = async (paymentId, userId, refundAmount, reason) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const result = await client.query(
      'SELECT * FROM payments WHERE id = $1 AND user_id = $2 FOR UPDATE',
      [paymentId, userId]
    );

    if (result.rows.length === 0) {
      throw new AppError('Payment not found', 404);
    }

    const payment = result.rows[0];

    if (payment.status !== 'success') {
      throw new AppError(
        `Cannot refund a payment with status ${payment.status}. Only success payments can be refunded.`,
        400
      );
    }

    if (!refundAmount || refundAmount <= 0) {
      throw new AppError('Refund amount must be greater than 0', 400);
    }

    if (refundAmount > payment.amount) {
      throw new AppError(
        `Refund amount ${refundAmount} exceeds original payment amount ${payment.amount}`,
        400
      );
    }

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

    await logTransition(client, {
      paymentId,
      userId,
      oldStatus: payment.status,
      newStatus,
      triggeredBy: 'refund_api',
      metadata: {
        refund_amount: refundAmount,
        timestamp: new Date().toISOString(),
      }
    });

    await client.query('COMMIT');

    const updatedPayment = updated.rows[0];

    if (updatedPayment.webhook_url) {
      const boss = await getBoss();
      await boss.send('webhook-delivery', {
        url:        updatedPayment.webhook_url,
        payment_id: updatedPayment.id,
        user_id:    updatedPayment.user_id,
        payload: {
          event:           'payment.refunded',
          payment_id:      updatedPayment.id,
          status:          updatedPayment.status,
          original_amount: updatedPayment.amount,
          refund_amount:   updatedPayment.refund_amount,
          currency:        updatedPayment.currency,
          refund_reason:   updatedPayment.refund_reason,
          timestamp:       new Date().toISOString(),
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


module.exports = { createPayment, simulatePayment, refundPayment };