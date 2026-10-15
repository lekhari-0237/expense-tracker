'use strict';

const ConversationContext = require('../models/ConversationContext');

const PENDING_ACTION_TTL_MS = 5 * 60 * 1000; // pending actions expire after 5 minutes

/**
 * Persistent, per-user conversation context (survives server restarts,
 * safe with multiple simultaneous users because it is keyed by user in MongoDB).
 */
async function getContext(userId) {
    let doc = await ConversationContext.findOne({ user: userId });
    if (!doc) {
        doc = await ConversationContext.create({ user: userId });
    }
    // Drop an expired pending action so stale confirmations never fire
    if (doc.pendingAction && doc.pendingAction.expiresAt && new Date(doc.pendingAction.expiresAt).getTime() < Date.now()) {
        doc.pendingAction = null;
        await doc.save();
    }
    return doc;
}

async function updateContext(userId, updates) {
    const doc = await getContext(userId);
    Object.assign(doc, updates || {});
    doc.lastActivityAt = new Date();
    await doc.save();
    return doc;
}

async function setPendingAction(userId, pendingAction) {
    const now = new Date();
    if (!pendingAction) return updateContext(userId, { pendingAction: null });

    const current = await getContext(userId);
    const seq = ((current.pendingAction && current.pendingAction.seq) || 0) + 1;

    return updateContext(userId, {
        pendingAction: {
            ...pendingAction,
            seq,
            createdAt: now,
            expiresAt: new Date(now.getTime() + PENDING_ACTION_TTL_MS)
        }
    });
}

async function clearPendingAction(userId) {
    return updateContext(userId, { pendingAction: null });
}

async function clearContext(userId) {
    await ConversationContext.findOneAndDelete({ user: userId });
}

module.exports = {
    getContext,
    updateContext,
    setPendingAction,
    clearPendingAction,
    clearContext,
    PENDING_ACTION_TTL_MS
};
