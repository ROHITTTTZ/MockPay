const paymentService = require("../services/paymentService");

const createPayment = async (req, res) => {
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
    res.status(500).json({ error: err.message });
  }
};

const simulatePayment = async (req, res) => {
  try {
    const paymentId = req.params.id;
    const { status } = req.body;

    const updatedPayment = await paymentService.simulatePayment(
      paymentId,
      status
    );

    res.json({
      payment_id: updatedPayment.id,
      status: updatedPayment.status,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  createPayment,
  simulatePayment,
};