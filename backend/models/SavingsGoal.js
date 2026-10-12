const mongoose = require('mongoose');

const savingsGoalSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    goalName: {
        type: String,
        required: [true, 'Please add a goal name'],
        trim: true
    },
    targetAmount: {
        type: Number,
        required: [true, 'Please add a target amount'],
        min: [1, 'Target amount must be greater than 0']
    },
    targetDate: {
        type: String,
        required: [true, 'Please add a target date']
    },
    description: {
        type: String,
        trim: true,
        default: ''
    },
    isAchieved: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });

module.exports = mongoose.model('SavingsGoal', savingsGoalSchema);
