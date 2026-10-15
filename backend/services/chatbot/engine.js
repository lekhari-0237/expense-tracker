'use strict';

/**
 * ExpenseBot engine.
 *
 * Pipeline for every message:
 *   1. Normalize
 *   2. Pending clarification / confirmation -> dedicated dispatcher
 *   3. Ordered intent registries (actions first, then queries)
 *   4. Persist context updates + clear a stale pending action on topic change
 *   5. Gemini only as a last resort for general chat, never overriding numbers
 *
 * The engine never trusts a user ID from the prompt; the caller supplies the
 * authenticated user's own id.
 */

const { normalize } = require('./entityExtractor');
const actionIntents = require('./actionIntents');
const queryIntents = require('./queryIntents');
const { handlePendingAction } = require('./pendingActions');
const contextService = require('../conversationContextService');
const { callGemini } = require('../geminiService');

const NO_MATCH_FALLBACK = "I'm not sure how to help with that yet. I can log and analyse expenses, answer questions about your spending, income, budgets, bills, categories and savings goals, or export reports. Try *\"help\"* to see what I can do.";

/**
 * Build a short factual summary for Gemini grounding. Only the requesting
 * user's own aggregate numbers are included — never another user's data.
 */
async function buildGeminiContext(userId) {
    try {
        const { getBalance, getCategoryBreakdown } = require('../financeAnalyticsService');
        const [balance, breakdown] = await Promise.all([
            getBalance(userId, { period: 'current_month' }),
            getCategoryBreakdown(userId, { period: 'current_month' })
        ]);
        const fmt = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
        const top = breakdown.categories.slice(0, 3).map(c => `${c.category} ${fmt(c.amount)}`).join(', ') || 'none recorded';
        return `Grounding data for ${balance.periodLabel} (INR): income ${fmt(balance.income)}, expenses ${fmt(balance.expenses)}, net ${fmt(balance.balance)}. Top categories: ${top}.`;
    } catch (e) {
        return '';
    }
}

async function runIntentRegistry(intents, { t, raw, ctx, userId }) {
    for (const intent of intents) {
        let params;
        try {
            params = intent.match(t, raw, ctx);
        } catch (matchError) {
            console.error(`[ExpenseBot] match error in ${intent.name}:`, matchError.message);
            continue;
        }
        if (!params) continue;

        let result;
        try {
            result = await intent.handle({ userId, params, ctx, raw });
        } catch (handleError) {
            console.error(`[ExpenseBot] handler error in ${intent.name}:`, handleError.stack || handleError.message);
            return {
                intent: intent.name,
                reply: `Something went wrong while running **${intent.name.replace(/_/g, ' ').toLowerCase()}** on your data: ${handleError.message || 'unexpected error'}. No changes were saved. Please try again or rephrase.`
            };
        }
        if (result && result.reply) {
            return { ...result, intent: intent.name };
        }
    }
    return null;
}

/**
 * @param {string} userId - authenticated user id (from JWT only)
 * @param {string} rawMessage - user message
 */
async function processMessage(userId, rawMessage) {
    const raw = String(rawMessage || '').trim();
    const t = normalize(raw);

    if (!t) {
        return { reply: 'Please type a question or command — for example *"How much did I spend this month?"*.' };
    }

    const ctx = await contextService.getContext(userId);

    // 1) Pending clarification or destructive confirmation takes priority
    if (ctx.pendingAction && ctx.pendingAction.type) {
        const pending = await handlePendingAction(userId, t, raw, ctx);
        if (pending.handled) {
            return await finalize(userId, pending.result);
        }
    }

    // 2) Action intents (commands, more specific), then query intents
    const runArgs = { t, raw, ctx, userId };
    const freshSeq = ctx.pendingAction && ctx.pendingAction.type ? ctx.pendingAction.seq : null;

    let result = await runIntentRegistry(actionIntents.intents, runArgs);
    if (!result) {
        result = await runIntentRegistry(queryIntents.intents, runArgs);
    }

    if (!result) {
        // 3) No intent matched: Gemini for general chat only, grounded on this
        // user's own data, never allowed to fabricate numbers
        const contextLine = await buildGeminiContext(userId);
        const systemPrompt = `You are ExpenseBot, a concise personal-finance assistant inside an expense tracker app. Currency is INR (₹). ` +
            `Answer general finance questions briefly and practically. ` +
            `You may use ONLY this grounded summary about the user's own data (never invent or extrapolate other figures): ${contextLine || 'none available'}. ` +
            `If the question needs the user's specific records that are not in the summary, say you can answer it if they rephrase as a data question (e.g. "how much did I spend on food this month?"). Do not ask for user IDs or credentials.`;

        let geminiReply = null;
        try {
            geminiReply = await callGemini(systemPrompt, raw);
        } catch (e) {
            console.error('[ExpenseBot] Gemini call failed:', e.message);
        }

        if (geminiReply) {
            return await finalize(userId, { reply: geminiReply, intent: 'GENERAL_CHAT' });
        }
        return await finalize(userId, { reply: NO_MATCH_FALLBACK, intent: 'NO_MATCH' });
    }

    // 4) Topic change: an unanswered confirmation left behind must not survive
    if (result.intent !== 'CANCEL') {
        try {
            const after = await contextService.getContext(userId);
            const handlerSetPending = !!(after.pendingAction && after.pendingAction.type)
                && after.pendingAction.seq !== freshSeq;
            if (!handlerSetPending && ctx.pendingAction && ctx.pendingAction.type) {
                await contextService.clearPendingAction(userId);
            }
        } catch (e) {
            console.error('[ExpenseBot] pending-action cleanup failed:', e.message);
        }
    }

    return await finalize(userId, result);
}

const CONFIRM_TYPES = ['CONFIRM_DELETE', 'CONFIRM_RESET'];

/**
 * Persist context updates and shape the response for the API/UI. `pendingAction`
 * tells the frontend whether this turn ended awaiting a yes/no confirmation or a
 * clarification answer, so it never has to detect that from reply text.
 */
async function finalize(userId, result) {
    if (result && result.contextUpdates && Object.keys(result.contextUpdates).length > 0) {
        try {
            await contextService.updateContext(userId, result.contextUpdates);
        } catch (e) {
            console.error('[ExpenseBot] context update failed:', e.message);
        }
    }

    let pendingAction = null;
    try {
        const after = await contextService.getContext(userId);
        if (after.pendingAction && after.pendingAction.type) {
            const type = after.pendingAction.type;
            pendingAction = {
                type,
                awaiting: after.pendingAction.awaiting || null,
                needsConfirmation: CONFIRM_TYPES.includes(type)
            };
        }
    } catch (e) {
        console.error('[ExpenseBot] pending state read failed:', e.message);
    }

    const { contextUpdates, intent, ...response } = result || {};
    return { ...response, intent: intent || null, pendingAction };
}

module.exports = { processMessage };
