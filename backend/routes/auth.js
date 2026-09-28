const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { protect } = require('../middleware/authMiddleware');

const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '7d' });
};

// @route   POST /api/auth/register
router.post('/register', async (req, res) => {
    try {
        const { username, password } = req.body;

        const userExists = await User.findOne({ username });
        if (userExists) {
            return res.status(400).json({ success: false, message: 'User already exists' });
        }

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password || 'dummy', salt);
        const dummyEmail = username + '@test.com'; // Fix for existing DB unique index
        const user = await User.create({
            username,
            email: dummyEmail,
            passwordHash
        });

        res.status(201).json({
            success: true,
            data: {
                userId: user._id,
                username: user.username,
                token: generateToken(user._id)
            },
            message: 'User registered successfully'
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// @route   POST /api/auth/login
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        let user = await User.findOne({ username });
        
        // DEV OVERRIDE: If user doesn't exist, automatically create them on the fly
        if (!user) {
            const salt = await bcrypt.genSalt(10);
            const passwordHash = await bcrypt.hash(password || 'dummy', salt);
            const dummyEmail = username + '@test.com'; // Fix for existing DB unique index
            user = await User.create({
                username,
                email: dummyEmail,
                passwordHash
            });
        }

        // DEV OVERRIDE: Always approve the login regardless of password
        res.json({
            success: true,
            data: {
                userId: user._id,
                username: user.username,
                token: generateToken(user._id)
            },
            message: 'Login successful'
        });
        
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
