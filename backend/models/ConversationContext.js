const mongoose = require('mongoose');

const transactionSnapshotSchema = new mongoose.Schema({
    id: String,
    amount: Number,
    category: String,
    description: String,
    merchant: String,
    date: String,
    formattedDate: String,
    type: String,
    source: String
}, { _id: false });

const pendingActionSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: ['ADD_TRANSACTION', 'CONFIRM_DELETE', 'CONFIRM_RESET', 'SET_BUDGET', 'ADD_RECURRING', 'CREATE_CATEGORY']
    },
    collected: {
        type: Object,
        default: {}
    },
    awaiting: {
        type: String,
        default: ''
    },
    // Monotonic per-write counter: lets the engine tell "this pending action was
    // replaced by the current turn" apart from one that merely survived it.
    // Timestamps cannot do this — two turns in the same second stamp identically.
    seq: {
        type: Number,
        default: 0
    },
    target: {
        type: Object,
        default: null
    },
    createdAt: Date,
    expiresAt: Date
}, { _id: false });

const conversationContextSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },
    lastIntent: { type: String, default: null },
    lastPeriod: { type: String, default: null },
    lastCategory: { type: String, default: null },
    lastRank: { type: Number, default: 1 },
    lastType: { type: String, default: null },
    lastTransaction: { type: transactionSnapshotSchema, default: null },
    lastTransactionsList: { type: [transactionSnapshotSchema], default: [] },
    pendingAction: { type: pendingActionSchema, default: null },
    lastActivityAt: { type: Date, default: Date.now }
}, { timestamps: true });

// Whole context auto-expires after 7 days of inactivity
conversationContextSchema.index({ lastActivityAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });

module.exports = mongoose.model('ConversationContext', conversationContextSchema);
