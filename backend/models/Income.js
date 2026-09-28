const mongoose = require('mongoose');

const incomeSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    month: {
        type: Number,
        required: true,
        min: 1,
        max: 12
    },
    year: {
        type: Number,
        required: true
    },
    amount: {
        type: Number,
        required: true,
        min: 0
    }
}, {
    timestamps: true
});

// Compound index to ensure 1 income record per user per month/year
incomeSchema.index({ user: 1, month: 1, year: 1 }, { unique: true });

module.exports = mongoose.model('Income', incomeSchema);
