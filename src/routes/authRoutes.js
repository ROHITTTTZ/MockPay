const express        = require('express');
const router         = express.Router();
const authController = require('../controllers/authcontroller');
const authMiddleware = require('../middlewares/authMiddleware');

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register new tenant
 *     tags: [Auth]
 */
router.post('/register', authController.register);
/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: Get current user info
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 */
router.get('/me', authMiddleware, authController.me);

module.exports = router;