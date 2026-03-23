const express        = require('express');
const router         = express.Router();
const authController = require('../controllers/authcontroller');
const authMiddleware = require('../middlewares/authMiddleware');


router.post('/register', authController.register);
router.get('/me', authMiddleware, authController.me);

module.exports = router;