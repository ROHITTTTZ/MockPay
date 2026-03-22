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

module.exports = {
  createPayment,
  simulatePayment,
};