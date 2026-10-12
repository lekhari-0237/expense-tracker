const mongoose = require('mongoose');

const billSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    billName: {
        type: String,
        required: [true, 'Please add a bill name'],
        trim: true
    },
    amount: {
        type: Number,
        required: [true, 'Please add an amount'],
        min: [0.01, 'Amount must be greater than 0']
    },
    category: {
        type: String,
        default: 'Rent'
    },
    dueDate: {
        type: String,
        required: [true, 'Please add a due date']
    },
    recurringFrequency: {
        type: String,
        enum: ['MONTHLY', 'WEEKLY', 'YEARLY'],
        default: 'MONTHLY'
    },
    reminderDays: {
        type: Number,
        default: 3
    },
    notes: {
        type: String,
        default: ''
    },
    isPaid: {
        type: Boolean,
        default: false
    },
    lastPaidDate: {
        type: Date
    }
}, { timestamps: true });

module.exports = mongoose.model('Bill', billSchema);
