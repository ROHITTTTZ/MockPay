const express = require("express");
const router = express.Router();

const authMiddleware = require("../middlewares/authMiddleware");
const validate          = require('../middlewares/validateRequest');
const paymentController = require("../controllers/paymentController");
const {
  createPaymentSchema,
  simulatePaymentSchema,
  refundPaymentSchema,
} = require('../validators/paymentValidator');

router.post("/payments", authMiddleware, validate(createPaymentSchema), paymentController.createPayment);
router.post("/payments/:id/simulate",authMiddleware, validate(simulatePaymentSchema), paymentController.simulatePayment);
router.post('/payments/:id/refund',authMiddleware, validate(refundPaymentSchema), paymentController.refundPayment);
router.get('/payments/:id/audit',authMiddleware,paymentController.getAuditLog);
module.exports = router;