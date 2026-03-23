const paymentService = require("../services/paymentService");

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

module.exports = {
  createPayment,
  simulatePayment,
  refundPayment,
};