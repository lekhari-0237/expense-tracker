const mongoose = require('mongoose');

const billSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    title: {
        type: String,
        required: [true, 'Please add a title']
    },
    amount: {
        type: Number,
        required: [true, 'Please add an amount']
    },
    dueDate: {
        type: Date,
        required: [true, 'Please add a due date']
    },
    isPaid: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });

module.exports = mongoose.model('Bill', billSchema);
