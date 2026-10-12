const mongoose = require('mongoose');

const splitSchema = new mongoose.Schema({
    memberName: {
        type: String,
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    isSettled: {
        type: Boolean,
        default: false
    },
    settledAt: {
        type: Date
    }
});

const groupExpenseSchema = new mongoose.Schema({
    description: {
        type: String,
        required: true,
        trim: true
    },
    totalAmount: {
        type: Number,
        required: true,
        min: [0.01, 'Amount must be greater than 0']
    },
    paidByName: {
        type: String,
        required: true
    },
    date: {
        type: String,
        required: true
    },
    members: [{
        type: String
    }],
    splits: [splitSchema]
}, { timestamps: true });

const groupSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    groupName: {
        type: String,
        required: [true, 'Please provide a group name'],
        trim: true
    },
    memberNames: [{
        type: String,
        trim: true
    }],
    expenses: [groupExpenseSchema]
}, { timestamps: true });

module.exports = mongoose.model('Group', groupSchema);
