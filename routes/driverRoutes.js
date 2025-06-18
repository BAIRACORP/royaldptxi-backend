const express = require('express');
const router = express.Router();
const { registerDriver, checkexists } = require('../controllers/driverController');

router.post('/register', registerDriver);
router.get('/check-exists', checkexists);

module.exports = router;
