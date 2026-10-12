const mongoose = require('mongoose');

const repaymentSchema = new mongoose.Schema({
    amount: {
        type: Number,
        required: true,
        min: [0.01, 'Repayment amount must be positive']
    },
    repaymentDate: {
        type: String,
        required: true
    },
    notes: {
        type: String,
        default: ''
    }
}, { timestamps: true });

const loanSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    personName: {
        type: String,
        required: [true, 'Please provide a person name'],
        trim: true
    },
    type: {
        type: String,
        enum: ['LENT', 'BORROWED'],
        required: true
    },
    amount: {
        type: Number,
        required: [true, 'Please provide an amount'],
        min: [0.01, 'Loan amount must be greater than 0']
    },
    dateGivenTaken: {
        type: String,
        required: true
    },
    dueDate: {
        type: String,
        default: null
    },
    reminderDays: {
        type: Number,
        default: 3
    },
    notes: {
        type: String,
        default: ''
    },
    repayments: [repaymentSchema],
    status: {
        type: String,
        enum: ['PENDING', 'PARTIALLY_PAID', 'FULLY_PAID'],
        default: 'PENDING'
    }
}, { timestamps: true });

module.exports = mongoose.model('Loan', loanSchema);
