const express = require('express');
const router = express.Router();
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const { protect } = require('../middleware/authMiddleware');
const { getMockBankFeed, categorizeMerchant } = require('../services/mockBankService');

// GET /api/bank/mock/status - Get current bank connection status
router.get('/mock/status', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        const syncedCount = await Transaction.countDocuments({
            user: req.user._id,
            source: 'mock_bank'
        });

        res.json({
            success: true,
            data: {
                connected: !!user.bankConnected,
                bankName: user.bankName || 'Apex Demo Bank',
                accountMask: user.bankAccountMask || '**** 4582',
                lastSynced: user.bankLastSynced || null,
                syncedTransactionsCount: syncedCount
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET /api/bank/mock/accounts - Fictional bank accounts list
router.get('/mock/accounts', protect, async (req, res) => {
    try {
        res.json({
            success: true,
            data: [
                {
                    id: 'ACC_DEMO_01',
                    bankName: 'Apex Demo Bank (Fictional)',
                    accountNumber: '**** 4582',
                    accountType: 'Checking / Savings',
                    currency: 'INR (₹)',
                    balance: 82450.00,
                    status: 'Active (Sandbox / Demo)'
                }
            ]
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET /api/bank/mock/transactions - Raw mock feed preview
router.get('/mock/transactions', protect, async (req, res) => {
    try {
        const feed = getMockBankFeed();
        res.json({
            success: true,
            data: feed
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST /api/bank/mock/connect - Connect fictional demo bank
router.post('/mock/connect', protect, async (req, res) => {
    try {
        const user = await User.findByIdAndUpdate(
            req.user._id,
            {
                bankConnected: true,
                bankName: 'Apex Demo Bank',
                bankAccountMask: '**** 4582'
            },
            { new: true }
        );

        res.json({
            success: true,
            message: 'Demo Bank connected successfully.',
            data: {
                connected: true,
                bankName: user.bankName,
                accountMask: user.bankAccountMask,
                lastSynced: user.bankLastSynced
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST /api/bank/mock/disconnect - Disconnect demo bank
router.post('/mock/disconnect', protect, async (req, res) => {
    try {
        await User.findByIdAndUpdate(
            req.user._id,
            { bankConnected: false }
        );

        res.json({
            success: true,
            message: 'Demo Bank disconnected.',
            data: { connected: false }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST /api/bank/mock/sync - Sync transactions into MongoDB with Duplicate Protection
router.post('/mock/sync', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        if (!user.bankConnected) {
            return res.status(400).json({
                success: false,
                message: 'Please connect the Demo Bank before syncing.'
            });
        }

        const feed = getMockBankFeed();
        const totalFetched = feed.length;

        // Fetch all existing external IDs already synced for this user
        const existingTxns = await Transaction.find({
            user: req.user._id,
            externalId: { $in: feed.map(f => f.externalId) }
        }).select('externalId');

        const existingSet = new Set(existingTxns.map(t => t.externalId));

        let newImported = 0;
        let duplicatesSkipped = 0;
        let expensesCreated = 0;
        let incomeCreated = 0;
        const toInsert = [];

        for (const item of feed) {
            if (existingSet.has(item.externalId)) {
                duplicatesSkipped++;
                continue;
            }

            const isIncome = item.type === 'CREDIT';
            const category = categorizeMerchant(item.description, item.category);

            toInsert.push({
                user: req.user._id,
                amount: item.amount,
                category: category,
                date: new Date(item.date),
                description: item.description,
                merchant: item.merchant,
                type: isIncome ? 'INCOME' : 'EXPENSE',
                source: 'mock_bank',
                externalId: item.externalId,
                syncedAt: new Date()
            });

            if (isIncome) {
                incomeCreated++;
            } else {
                expensesCreated++;
            }
            newImported++;
        }

        if (toInsert.length > 0) {
            await Transaction.insertMany(toInsert);
        }

        const now = new Date();
        user.bankLastSynced = now;
        await user.save();

        res.json({
            success: true,
            message: newImported > 0
                ? `Sync complete! Imported ${newImported} new transactions (${expensesCreated} expenses, ${incomeCreated} income).`
                : 'Your transactions are already up to date. 0 new transactions found.',
            data: {
                totalFetched,
                newImported,
                duplicatesSkipped,
                expensesCreated,
                incomeCreated,
                lastSynced: now
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
