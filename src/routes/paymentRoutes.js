const express = require("express");
const router = express.Router();

const authMiddleware = require("../middlewares/authMiddleware");
const paymentController = require("../controllers/paymentController");

router.post("/payments", authMiddleware, paymentController.createPayment);
router.post("/payments/:id/simulate",authMiddleware,paymentController.simulatePayment);
module.exports = router;