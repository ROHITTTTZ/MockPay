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
const rateLimiter = require('../middlewares/rateLimiter');

router.use(authMiddleware);  
router.use(rateLimiter); 

/**
 * @swagger
 * /api/payments:
 *   get:
 *     summary: Get all payments
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of payments
 */
router.get('/payments', paymentController.getPayments);
/**
 * @swagger
 * /api/payments:
 *   post:
 *     summary: Create a new payment
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: Idempotency-Key
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               amount:
 *                 type: number
 *               currency:
 *                 type: string
 *               webhook_url:
 *                 type: string
 *     responses:
 *       200:
 *         description: Payment created successfully
 */

router.post("/payments", authMiddleware, validate(createPaymentSchema), paymentController.createPayment);
/**
 * @swagger
 * /api/payments/{id}/simulate:
 *   post:
 *     summary: Simulate payment status
 *     tags: [Payments]
 */
router.post("/payments/:id/simulate",authMiddleware, validate(simulatePaymentSchema), paymentController.simulatePayment);
/**
 * @swagger
 * /api/payments/{id}/refund:
 *   post:
 *     summary: Refund a payment
 *     tags: [Payments]
 *     responses:
 *       200:
 *         description: Refund processed
 */
router.post('/payments/:id/refund',authMiddleware, validate(refundPaymentSchema), paymentController.refundPayment);
/**
 * @swagger
 * /api/payments/{id}/audit:
 *   get:
 *     summary: Get audit trail of a payment
 *     tags: [Payments]
 *     responses:
 *       200:
 *         description: Audit history
 */
router.get('/payments/:id/audit',authMiddleware,paymentController.getAuditLog);
module.exports = router;