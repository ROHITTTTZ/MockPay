const paymentService = require("../services/paymentService");
const pool = require('../config/db');

const getPayments = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const limit  = Math.min(parseInt(req.query.limit) || 10, 100);
 
    const { cursor, status, currency } = req.query;

    const conditions = ['user_id = $1'];
    const params     = [userId];
    let   paramCount = 1;

    if (status) {
      paramCount++;
      conditions.push(`status = $${paramCount}`);
      params.push(status);
    }

    if (currency) {
      paramCount++;
      conditions.push(`currency = $${paramCount}`);
      params.push(currency.toUpperCase());
    }

    if (cursor) {
      try {
        const decoded = Buffer.from(cursor, 'base64').toString('utf8');
        const [cursorTs, cursorId] = decoded.split('__');

        paramCount++;
        const tsParam = paramCount;
        paramCount++;
        const idParam = paramCount;
        conditions.push(`(created_at, id) < ($${tsParam}::timestamptz, $${idParam}::uuid)`);
        params.push(cursorTs, cursorId);

      } catch (e) {
        return next(new AppError('Invalid cursor', 400));
      }
    }

    const whereClause = conditions.join(' AND ');

    paramCount++;
    params.push(limit + 1);

    const result = await pool.query(
      `SELECT
         id, amount, currency, status,
         webhook_url, idempotency_key,
         refund_amount, refunded_at,
         created_at
       FROM payments
       WHERE ${whereClause}
       ORDER BY created_at DESC, id DESC
       LIMIT $${paramCount}`,
      params
    );

    const rows  = result.rows;
    const hasMore = rows.length > limit;

    const payments = hasMore ? rows.slice(0, limit) : rows;

    let nextCursor = null;
    if (hasMore && payments.length > 0) {
      const last = payments[payments.length - 1];
      const raw  = `${last.created_at.toISOString()}__${last.id}`;
      nextCursor = Buffer.from(raw).toString('base64');
    }

    res.json({
      data:        payments,
      total:       payments.length,
      has_more:    hasMore,
      next_cursor: nextCursor,
    });

  } catch (err) {
    next(err);
  }
};
const createPayment = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const idempotencyKey = req.headers["idempotency-key"];

    if (!idempotencyKey) {
      return res.status(400).json({ error: "Idempotency-Key required" });
    }

    const payment = await paymentService.createPayment(
      userId,
      req.body,
      idempotencyKey
    );

    res.status(201).json({
      payment_id: payment.id,
      status: payment.status,
    });
  } catch (err) {
    next(err);
  }
};
const simulatePayment = async (req, res, next) => {
  try {
    const paymentId = req.params.id;
    const userId = req.user.id; 
    const { status } = req.body;

    const updatedPayment = await paymentService.simulatePayment(
      paymentId,
      userId,
      status
    );

    res.json({
      payment_id: updatedPayment.id,
      status: updatedPayment.status,
    });
  } catch (err) {
    next(err); 
  }
};
const refundPayment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { refund_amount, reason } = req.body;

    if (!refund_amount) {
      return next(new AppError('refund_amount is required', 400));
    }

    const updatedPayment = await paymentService.refundPayment(
      id,
      req.user.id,
      Number(refund_amount),
      reason
    );

    res.json({
      payment_id:      updatedPayment.id,
      status:          updatedPayment.status,
      original_amount: updatedPayment.amount,
      refund_amount:   updatedPayment.refund_amount,
      refunded_at:     updatedPayment.refunded_at,
      refund_reason:   updatedPayment.refund_reason,
    });

  } catch (err) {
    next(err);
  }
};
const getAuditLog = async (req, res, next) => {
  try {
    const { id } = req.params;
    const payment = await pool.query(
      'SELECT id FROM payments WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );

    if (payment.rows.length === 0) {
      return next(new AppError('Payment not found', 404));
    }

    const logs = await pool.query(
      `SELECT
         id,
         old_status,
         new_status,
         triggered_by,
         metadata,
         created_at
       FROM audit_log
       WHERE payment_id = $1
       ORDER BY created_at ASC`,
      [id]
    );

    res.json({
      payment_id: id,
      total_events: logs.rows.length,
      history: logs.rows,
    });

  } catch (err) {
    next(err);
  }
};

module.exports = {
  createPayment,
  simulatePayment,
  refundPayment,
  getAuditLog,
  getPayments,
};