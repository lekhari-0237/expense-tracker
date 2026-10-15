const mongoose = require('mongoose');

const budgetSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    category: {
        type: String,
        trim: true,
        default: null // null or empty string represents overall monthly budget
    },
    amount: {
        type: Number,
        required: [true, 'Budget amount is required'],
        min: [0.01, 'Budget amount must be greater than 0']
    },
    period: {
        type: String,
        enum: ['monthly', 'weekly', 'yearly'],
        default: 'monthly'
    },
    month: {
        type: Number,
        min: 1,
        max: 12,
        default: () => new Date().getMonth() + 1
    },
    year: {
        type: Number,
        default: () => new Date().getFullYear()
    },
    alertThreshold: {
        type: Number,
        default: 0.8, // 80%
        min: 0.01,
        max: 1.0
    },
    alertTriggered: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
});

// Compound index to quickly find user budget per category and month/year
budgetSchema.index({ user: 1, category: 1, month: 1, year: 1 });

module.exports = mongoose.model('Budget', budgetSchema);
