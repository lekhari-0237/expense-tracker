const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    category: {
        type: String,
        required: true
    },
    date: {
        type: Date,
        required: true
    },
    description: {
        type: String
    },
    merchant: {
        type: String
    },
    type: {
        type: String,
        enum: ['INCOME', 'EXPENSE'],
        required: true
    },
    source: {
        type: String,
        enum: ['manual', 'ocr', 'mock_bank'],
        default: 'manual'
    },
    externalId: {
        type: String,
        index: true
    },
    syncedAt: {
        type: Date
    }
}, {
    timestamps: true
});

// Index to quickly check for duplicate external bank transactions per user
transactionSchema.index({ user: 1, externalId: 1 }, { unique: false });

module.exports = mongoose.model('Transaction', transactionSchema);
