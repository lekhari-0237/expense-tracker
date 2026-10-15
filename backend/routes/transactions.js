const express = require('express');
const router = express.Router();
const Transaction = require('../models/Transaction');
const { protect } = require('../middleware/authMiddleware');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const { parseReceiptOcr } = require('../services/receiptOcrService');
const budgetService = require('../services/budgetService');
const { formatDate } = require('../utils/dateUtil');

const upload = multer({ storage: multer.memoryStorage() });

const PAYMENT_METHOD_LABELS = {
    upi: 'UPI',
    cash: 'Cash',
    card: 'Card',
    creditcard: 'Card',
    debitcard: 'Card',
    netbanking: 'NetBanking',
    banktransfer: 'NetBanking',
    neft: 'NetBanking',
    imps: 'NetBanking',
    wallet: 'Wallet'
};

// Same canonical vocabulary ExpenseBot stores, so one field means one thing.
function normalisePaymentMethod(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const key = raw.toLowerCase().replace(/[\s_-]/g, '');
    return PAYMENT_METHOD_LABELS[key] || raw.slice(0, 40);
}

// Get all transactions for current user
router.get('/', protect, async (req, res) => {
    try {
        const query = { user: req.user._id };
        if (req.query.source) {
            query.source = req.query.source;
        }

        const limit = parseInt(req.query.limit, 10) || 100;
        const transactions = await Transaction.find(query).sort({ date: -1 }).limit(limit);

        const formatted = transactions.map(t => ({
            id: t._id,
            amount: t.amount,
            category: t.category,
            date: formatDate(t.date),
            description: t.description || t.merchant || t.category,
            merchant: t.merchant || '',
            type: t.type,
            source: t.source || 'manual',
            paymentMethod: t.paymentMethod || '',
            notes: t.notes || '',
            externalId: t.externalId || null,
            syncedAt: t.syncedAt || null
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

        // Credentials come from the environment only; there is no shared demo key in the code.
        const ocrKey = process.env.OCR_SPACE_API_KEY;
        if (!ocrKey) {
            return res.status(503).json({
                success: false,
                message: 'Receipt OCR is not configured on this server. Set OCR_SPACE_API_KEY in the backend environment, or add the expense manually.'
            });
        }

        const formData = new FormData();
        formData.append('file', req.file.buffer, req.file.originalname);
        formData.append('apikey', ocrKey);
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
                    date: formatDate(new Date()),
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
        let errorDetails = error.message;
        if (error.response && error.response.data) {
            errorDetails += ' | API Details: ' + JSON.stringify(error.response.data);
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
        const { amount, category, date, description, type, source, merchant, paymentMethod, notes } = req.body;

        const value = Number(amount);
        if (!isFinite(value) || value <= 0) {
            return res.status(400).json({ success: false, message: 'A positive amount is required.' });
        }
        if (!category || !String(category).trim()) {
            return res.status(400).json({ success: false, message: 'A category is required.' });
        }
        const when = date ? new Date(date) : new Date();
        if (isNaN(when.getTime())) {
            return res.status(400).json({ success: false, message: 'A valid date is required (YYYY-MM-DD).' });
        }
        if (notes !== undefined && String(notes).length > 200) {
            return res.status(400).json({ success: false, message: 'Notes are limited to 200 characters.' });
        }

        const transaction = await Transaction.create({
            user: req.user._id,
            amount: value,
            category: String(category).trim(),
            date: when,
            description,
            merchant: merchant || description,
            type: type || 'EXPENSE',
            source: source || 'manual',
            paymentMethod: normalisePaymentMethod(paymentMethod),
            notes: String(notes || '').trim()
        });

        // Recompute budgets so an expense added through the form fires the same
        // once-per-crossing alert that an ExpenseBot add does. A failed check must
        // not lose the transaction, so it is logged but keeps the response as-is.
        try {
            await budgetService.getBudgetStatus(req.user._id);
        } catch (alertError) {
            console.error('[Budget Alert] check failed:', alertError.message);
        }

        res.status(201).json({
            success: true,
            data: {
                id: transaction._id,
                amount: transaction.amount,
                category: transaction.category,
                date: transaction.date,
                description: transaction.description,
                merchant: transaction.merchant,
                type: transaction.type,
                source: transaction.source,
                paymentMethod: transaction.paymentMethod,
                notes: transaction.notes
            },
            message: 'Transaction added successfully'
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
