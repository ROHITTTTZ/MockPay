const express     = require('express');
const router      = express.Router();
const adminController = require('../controllers/adminController');


router.get('/dlq',            adminController.getDLQ);
router.post('/dlq/:id/replay', adminController.replayDLQ);
router.get('/users',          adminController.listUsers);

module.exports = router;