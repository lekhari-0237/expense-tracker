const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    title: {
        type: String,
        required: true
    },
    message: {
        type: String,
        required: true
    },
    priority: {
        type: String,
        enum: ['INFO', 'DUE_TODAY', 'OVERDUE', 'WARNING'],
        default: 'INFO'
    },
    isRead: {
        type: Boolean,
        default: false
    },
    category: {
        type: String,
        default: 'GENERAL'
    },
    referenceId: {
        type: String
    }
}, { timestamps: true });

module.exports = mongoose.model('Notification', notificationSchema);
