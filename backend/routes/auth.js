const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { protect } = require('../middleware/authMiddleware');

const generateToken = (id, username) => {
    return jwt.sign({ id, username }, process.env.JWT_SECRET, { expiresIn: '7d', subject: id.toString() });
};

function authPayload(user) {
    return {
        userId: user._id,
        username: user.username,
        token: generateToken(user._id, user.username)
    };
}

// @route   POST /api/auth/register
router.post('/register', async (req, res) => {
    try {
        const { username, password, email } = req.body || {};

        if (!username || !password) {
            return res.status(400).json({ success: false, message: 'Username and password are required' });
        }

        const userExists = await User.findOne({ username });
        if (userExists) {
            return res.status(400).json({ success: false, message: 'User already exists' });
        }

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        // The existing schema keeps a unique index on email; a login-only account
        // gets a deterministic derived address so registration never collides twice.
        const user = await User.create({
            username,
            email: email || `${username}@test.com`,
            passwordHash
        });

        res.status(201).json({ success: true, data: authPayload(user), message: 'User registered successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// @route   POST /api/auth/login
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body || {};

        if (!username || !password) {
            return res.status(400).json({ success: false, message: 'Username and password are required' });
        }

        const user = await User.findOne({ username });
        if (!user) {
            return res.status(401).json({ success: false, message: 'Invalid username or password' });
        }

        const matches = await bcrypt.compare(password, user.passwordHash);
        if (!matches) {
            return res.status(401).json({ success: false, message: 'Invalid username or password' });
        }

        res.json({ success: true, data: authPayload(user), message: 'Login successful' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// @route   GET /api/auth/me
router.get('/me', protect, (req, res) => {
    res.json({ success: true, data: { userId: req.user._id, username: req.user.username } });
});

// @route   POST /api/auth/logout — JWTs are stateless, so this only acknowledges
// the request; the client clears the stored token.
router.post('/logout', protect, (req, res) => {
    res.json({ success: true, message: 'Logged out' });
});

module.exports = router;
