const express     = require('express');
const router      = express.Router();
const adminController = require('../controllers/adminController');

/**
 * @swagger
 * /api/admin/dlq:
 *   get:
 *     summary: Get failed webhook jobs
 *     tags: [Admin]
 */
router.get('/dlq',            adminController.getDLQ);
/**
 * @swagger
 * /api/admin/dlq/{id}/replay:
 *   post:
 *     summary: Replay a failed webhook job
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 */
router.post('/dlq/:id/replay', adminController.replayDLQ);
/**
 * @swagger
 * /api/admin/users:
 *   get:
 *     summary: Get all users (tenants)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 */
router.get('/users',          adminController.listUsers);
/**
 * @swagger
 * /api/admin/fraud-rules:
 *   get:
 *     summary: Get fraud rules
 *     tags: [Admin]
 */
router.get('/fraud-rules',        adminController.getFraudRules);
/**
 * @swagger
 * /api/admin/fraud-rules/{id}:
 *   patch:
 *     summary: Enable or disable a fraud rule
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 */
router.patch('/fraud-rules/:id',  adminController.toggleFraudRule);
/**
 * @swagger
 * /api/admin/metrics:
 *   get:
 *     summary: Get system metrics and health
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 */
router.get('/metrics', adminController.getMetrics);

module.exports = router;