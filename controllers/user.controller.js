const User = require('../models/user.models');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
require('dotenv').config();

// Nodemailer transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Helper: send HTML email
const sendEmail = async (to, subject, html) => {
  await transporter.sendMail({
    from: `"Bankee" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html,
  });
};

// Welcome Email
const sendWelcomeEmail = async (user) => {
  const html = `
    <div style="font-family:sans-serif; text-align:center; padding:20px;">
      <h2>Welcome to Bankee, ${user.name} 🎉</h2>
      <p>Your account has been created successfully.</p>
      <p>Please verify your email by clicking the link sent to your inbox.</p>
    </div>
  `;
  await sendEmail(user.email, 'Welcome to Bankee 🎉', html);
};

// Login Notification Email
const sendLoginNotification = async (user) => {
  const html = `
    <div style="font-family:sans-serif; text-align:center; padding:20px;">
      <h3>Login Notification</h3>
      <p>Hello ${user.name},</p>
      <p>Your Bankee account was accessed on <b>${new Date().toLocaleString()}</b>.</p>
      <p>If this wasn’t you, please reset your password immediately.</p>
    </div>
  `;
  await sendEmail(user.email, 'New Login Detected 🔐', html);
};

// Verification Email
const sendVerificationEmail = async (user) => {
  const verifyLink = `${process.env.BASE_URL}/api/auth/verify/${user.verificationToken}`;
  const html = `
    <div style="font-family:sans-serif; text-align:center; padding:20px;">
      <h2>Welcome to Bankee, ${user.name} 🎉</h2>
      <p>Click the button below to verify your email address:</p>
      <a href="${verifyLink}" 
         style="background-color:#4CAF50;color:white;padding:12px 20px;text-decoration:none;border-radius:5px;display:inline-block;margin-top:10px;">
         Verify Email
      </a>
      <p style="margin-top:20px; font-size:12px; color:gray;">If the button doesn't work, copy and paste this link into your browser:</p>
      <p style="font-size:12px; color:gray;">${verifyLink}</p>
    </div>
  `;
  await sendEmail(user.email, 'Verify Your Bankee Account ✅', html);
};

// =======================================
// REGISTER
// =======================================
exports.register = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ msg: 'All fields are required' });

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email))
      return res.status(400).json({ msg: 'Invalid email format' });

    if (password.length < 6)
      return res.status(400).json({ msg: 'Password must be at least 6 characters long' });

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ msg: 'Email already registered' });

    const hashed = await bcrypt.hash(password, 10);
    const verificationToken = crypto.randomBytes(32).toString('hex');

    const user = await User.create({
      name,
      email,
      password: hashed,
      verificationToken,
    });

    await sendVerificationEmail(user);
    await sendWelcomeEmail(user);

    res.status(201).json({ msg: 'User registered. Check your email for verification link.' });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

// =======================================
// VERIFY EMAIL
// =======================================
exports.verifyEmail = async (req, res) => {
  try {
    const { token } = req.params;
    const user = await User.findOne({ verificationToken: token });
    if (!user) return res.status(400).send('<h3>Invalid or expired verification token.</h3>');

    user.isVerified = true;
    user.verificationToken = undefined;
    await user.save();

    res.send(`
      <div style="text-align:center; font-family:sans-serif; padding:20px;">
        <h2>Email Verified Successfully ✅</h2>
        <p>You can now <a href="${process.env.BASE_URL}/login">log in</a> to your account.</p>
      </div>
    `);
  } catch (err) {
    res.status(500).send(`<p>${err.message}</p>`);
  }
};

// =======================================
// LOGIN
// =======================================
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ msg: 'User not found' });
    if (!user.isVerified) return res.status(403).json({ msg: 'Please verify your email first' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ msg: 'Invalid credentials' });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    await sendLoginNotification(user);

    res.json({
      msg: 'Login successful',
      token,
      user: { id: user._id, name: user.name, email: user.email },
    });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

// =======================================
// FORGOT PASSWORD
// =======================================
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ msg: 'User not found' });

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetLink = `${process.env.BASE_URL}/api/auth/reset/${resetToken}`;

    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
    await user.save();

    const html = `
      <div style="font-family:sans-serif; text-align:center; padding:20px;">
        <h3>Password Reset Request</h3>
        <p>Click the button below to reset your password:</p>
        <a href="${resetLink}" style="background:#f44336;color:white;padding:10px 15px;text-decoration:none;border-radius:5px;">
          Reset Password
        </a>
        <p>If the button doesn't work, copy this link:</p>
        <p>${resetLink}</p>
      </div>
    `;

    await sendEmail(email, 'Reset Your Bankee Password 🔑', html);
    res.json({ msg: 'Password reset email sent. Check your inbox.' });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};

// =======================================
// RESET PASSWORD
// =======================================
exports.resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() },
    });
    if (!user) return res.status(400).json({ msg: 'Invalid or expired token' });

    const hashed = await bcrypt.hash(password, 10);
    user.password = hashed;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.json({ msg: 'Password reset successful. You can now log in.' });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
};
