const express = require('express');
const router = express.Router();
const Transaction = require('../models/Transaction');
const { protect } = require('../middleware/authMiddleware');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const { parseReceiptOcr } = require('../services/receiptOcrService');

const upload = multer({ storage: multer.memoryStorage() });

// Get all transactions for current user
router.get('/', protect, async (req, res) => {
    try {
        const transactions = await Transaction.find({ user: req.user._id }).sort({ date: -1 });
        const formatted = transactions.map(t => ({
            id: t._id,
            amount: t.amount,
            category: t.category,
            date: t.date.toISOString().split('T')[0],
            description: t.description,
            type: t.type
        }));
        res.json({ success: true, data: formatted });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Upload and parse receipt image
router.post('/upload-receipt', protect, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No image uploaded' });
        }

        const formData = new FormData();
        formData.append('file', req.file.buffer, req.file.originalname);
        formData.append('apikey', process.env.OCR_SPACE_API_KEY || 'helloworld'); // OCR.space API key
        formData.append('isOverlayRequired', 'false');
        formData.append('language', 'eng');
        formData.append('OCREngine', '2');
        formData.append('scale', 'true');
        formData.append('isTable', 'true');

        const response = await axios.post('https://api.ocr.space/parse/image', formData, {
            headers: formData.getHeaders(),
            timeout: 25000
        });

        const parsedText = response.data.ParsedResults && response.data.ParsedResults[0] 
            ? response.data.ParsedResults[0].ParsedText 
            : '';

        if (!parsedText || parsedText.trim().length === 0) {
            return res.json({
                success: true,
                data: {
                    merchantName: 'Store Purchase',
                    date: new Date().toISOString().split('T')[0],
                    amount: null,
                    category: 'Food',
                    confidence: { merchant: 0, date: 0, total: 0, level: 'LOW' },
                    rawText: '',
                    message: 'Receipt image scanned, but no clear text was detected. Please enter details manually.'
                }
            });
        }

        // Delegate parsing to robust OCR parsing engine
        const extraction = parseReceiptOcr(parsedText);

        res.json({
            success: true,
            data: extraction
        });
    } catch (error) {
        console.error('OCR Error:', error.message);
        if (error.response) {
            console.error('OCR API Response Data:', error.response.data);
        }
        
        let errorDetails = error.message;
        if (error.response && error.response.data) {
            errorDetails += ' | API Details: ' + JSON.stringify(error.response.data);
        } else if (error.stack) {
            errorDetails += ' | Stack: ' + error.stack.split('\n')[1];
        }

        res.status(500).json({ 
            success: false, 
            message: 'OCR Processing Error: ' + errorDetails 
        });
    }
});

// Create manual or confirmed transaction
router.post('/', protect, async (req, res) => {
    try {
        const { amount, category, date, description, type } = req.body;
        
        const transaction = await Transaction.create({
            user: req.user._id,
            amount,
            category,
            date,
            description,
            type: type || 'EXPENSE'
        });

        res.status(201).json({
            success: true,
            data: {
                id: transaction._id,
                amount: transaction.amount,
                category: transaction.category,
                date: transaction.date,
                description: transaction.description,
                type: transaction.type
            },
            message: 'Transaction added successfully'
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
