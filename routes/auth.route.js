const express = require('express');
const router = express.Router();
const authCtrl = require('../controllers/user.controller');

router.post('/register', authCtrl.register);
router.get('/verify/:token', authCtrl.verifyEmail);
router.post('/login', authCtrl.login);
router.post('/forgot', authCtrl.forgotPassword);
router.post('/reset/:token', authCtrl.resetPassword);

module.exports = router;
