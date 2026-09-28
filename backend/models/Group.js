const mongoose = require('mongoose');

const groupSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    name: {
        type: String,
        required: [true, 'Please add a group name']
    },
    members: [{
        name: String,
        email: String
    }],
    totalExpenses: {
        type: Number,
        default: 0
    }
}, { timestamps: true });

module.exports = mongoose.model('Group', groupSchema);
