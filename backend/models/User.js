const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true
    },
    email: {
        type: String
    },
    passwordHash: {
        type: String,
        required: true
    },
    bankConnected: {
        type: Boolean,
        default: false
    },
    bankLastSynced: {
        type: Date
    },
    bankAccountMask: {
        type: String,
        default: '**** 4582'
    },
    bankName: {
        type: String,
        default: 'Apex Demo Bank'
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('User', userSchema);
