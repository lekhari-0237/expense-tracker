'use strict';

/**
 * PENDING ACTION DISPATCHER
 * Handles multi-turn clarification answers and destructive-action
 * confirmations stored in the user's persistent conversation context.
 * Returns { handled: true, result } when the message was consumed, or
 * { handled: false } so the engine can treat it as a new command instead.
 */

const Transaction = require('../../models/Transaction');
const contextService = require('../conversationContextService');
const dataResetService = require('../dataResetService');
const categoryService = require('../categoryService');
const {
    normalize,
    extractAmount,
    extractRelativeDate,
    extractDayOfMonth,
    extractPaymentMethod,
    extractNote
} = require('./entityExtractor');
const { formatDate } = require('../../utils/dateUtil');
const { formatRupees, resolveCategoryFromText, titleCase } = require('./shared');
const {
    isYes,
    isNo,
    isSkip,
    advanceAddTransaction,
    advanceSetBudget,
    advanceAddRecurring,
    executeAddRecurring
} = require('./actionIntents');

const CANCEL_RE = /^(cancel|stop|never ?mind|forget it|abort|close)[\s!]*$/;

// A message that opens its own request is a new command, not an answer to the
// pending clarification — let the engine run the registries instead of eating it.
const NEW_COMMAND_RE = /^(add|log|record|track|note\s*down|set|create|delete|remove|mark|export|show|list|compare|what|how|when|where|which|who|give|is|do|did|am|can|please)\b|\b(never ?mind)\b/;

function looksLikeNewCommand(t) {
    if (CANCEL_RE.test(t)) return false;
    return NEW_COMMAND_RE.test(t);
}

async function handlePendingAction(userId, t, raw, ctx) {
    const pa = ctx.pendingAction;
    if (!pa || !pa.type) return { handled: false };

    // "no"/cancel always wins and must leave data untouched
    if (isNo(t) || CANCEL_RE.test(t)) {
        await contextService.clearPendingAction(userId);
        return {
            handled: true,
            result: { reply: `Okay, I've cancelled that${pendingLabel(pa)}. Nothing was changed. What else can I help with?` }
        };
    }

    // A fresh command while a clarification is open: keep the pending action for
    // now (the engine clears it if the new topic is answered) and answer the command.
    if (looksLikeNewCommand(t)) return { handled: false };

    switch (pa.type) {
        case 'CONFIRM_DELETE':
            return await handleConfirmDelete(userId, t, pa);
        case 'CONFIRM_RESET':
            return await handleConfirmReset(userId, t, pa);
        case 'ADD_TRANSACTION':
            return await continueAddTransaction(userId, t, raw, pa);
        case 'SET_BUDGET':
            return await continueSetBudget(userId, t, raw, pa);
        case 'ADD_RECURRING':
            return await continueAddRecurring(userId, t, raw, pa);
        case 'CREATE_CATEGORY':
            return await continueCreateCategory(userId, t, raw, pa);
        default:
            await contextService.clearPendingAction(userId);
            return { handled: false };
    }
}

/* ------------------------------------------------------------------ */
/* Destructive confirmations                                           */
/* ------------------------------------------------------------------ */

async function handleConfirmDelete(userId, t, pa) {
    if (!isYes(t)) return { handled: false };

    const target = pa.target || {};
    // Ownership-checked delete: only the authenticated user's own record
    const deleted = await Transaction.findOneAndDelete({ _id: target.id, user: userId });
    await contextService.clearPendingAction(userId);

    if (!deleted) {
        return {
            handled: true,
            result: { reply: "I couldn't find that transaction anymore — it may have already been deleted. Nothing was changed." }
        };
    }

    const typeName = (deleted.type || 'EXPENSE').toUpperCase() === 'INCOME' ? 'income' : 'expense';
    return {
        handled: true,
        result: {
            reply: `🗑️ Deleted your ${typeName} of **${formatRupees(deleted.amount)}** ("${deleted.description || deleted.category}", ${deleted.category}) from your records.`,
            refreshData: true,
            contextUpdates: { lastIntent: 'DELETE_TRANSACTION', lastTransaction: null }
        }
    };
}

async function handleConfirmReset(userId, t, pa) {
    if (!isYes(t)) return { handled: false };

    // Scope is the authenticated user only — never the account, never other users
    const counts = await dataResetService.deleteUserFinancialData(userId);
    await contextService.clearContext(userId);

    const parts = [];
    if (counts.transactions) parts.push(`${counts.transactions} transaction(s)`);
    if (counts.incomes) parts.push(`${counts.incomes} income record(s)`);
    if (counts.budgets) parts.push(`${counts.budgets} budget(s)`);
    if (counts.bills) parts.push(`${counts.bills} bill(s)`);
    if (counts.savingsGoals) parts.push(`${counts.savingsGoals} savings goal(s)`);
    if (counts.loans) parts.push(`${counts.loans} loan record(s)`);
    if (counts.groups) parts.push(`${counts.groups} shared group(s)`);
    if (counts.categories) parts.push(`${counts.categories} custom categor(y|ies)`);
    if (counts.notifications) parts.push(`${counts.notifications} notification(s)`);

    return {
        handled: true,
        result: {
            reply: parts.length
                ? `✅ Reset complete — deleted your own ${parts.join(', ')}. Your account and login are untouched, and no other user's data was affected.`
                : `✅ Reset complete — you had no records left to delete. Your account and login are untouched.`,
            refreshData: true
        }
    };
}

/* ------------------------------------------------------------------ */
/* Clarification answers                                               */
/* ------------------------------------------------------------------ */

async function continueAddTransaction(userId, t, raw, pa) {
    const collected = { ...(pa.collected || {}) };
    const dialogMode = collected.dialogMode !== false;

    switch (pa.awaiting) {
        case 'amount': {
            const amt = extractAmount(raw, { allowBare: true });
            if (amt === null || amt <= 0) return { handled: false };
            collected.amount = amt;
            await harvestInto(userId, raw, collected);
            break;
        }
        case 'category': {
            const cat = await resolveAnswerCategory(userId, t, raw);
            if (!cat) return { handled: false };
            collected.category = cat;
            collected.categoryWord = cat;
            await harvestInto(userId, raw, collected, { skipCategory: true });
            break;
        }
        case 'date': {
            if (isSkip(t)) {
                collected.dateResolved = true; // falls back to today
            } else {
                const rel = extractRelativeDate(raw);
                if (!rel) {
                    return {
                        handled: true,
                        result: { reply: `I didn't catch that date. Reply *today*, *yesterday*, a date like *2026-10-14* — or **skip** to use today. (Or say *cancel*.)` }
                    };
                }
                collected.date = rel.date;
                collected.dateLabel = rel.label;
                collected.dateResolved = true;
            }
            break;
        }
        case 'paymentMethod': {
            if (isSkip(t)) {
                collected.paymentMethod = null;
            } else {
                const pm = extractPaymentMethod(raw);
                if (!pm) {
                    return {
                        handled: true,
                        result: { reply: `I didn't recognise that payment method. Reply *UPI*, *Cash*, *Card*, *Net Banking* or *Wallet* — or **skip**. (Or say *cancel*.)` }
                    };
                }
                collected.paymentMethod = pm;
            }
            collected.paymentResolved = true;
            break;
        }
        case 'note': {
            collected.note = isSkip(t) ? null : (extractNote(raw) || String(raw).trim().slice(0, 140));
            collected.noteResolved = true;
            break;
        }
        default:
            return { handled: false };
    }

    await contextService.clearPendingAction(userId);
    return { handled: true, result: await advanceAddTransaction(userId, collected, { dialogMode }) };
}

async function continueSetBudget(userId, t, raw, pa) {
    const collected = { ...(pa.collected || {}) };

    if (pa.awaiting === 'amount') {
        const amt = extractAmount(raw, { allowBare: true });
        if (amt === null || amt <= 0) return { handled: false };
        collected.amount = amt;
    } else if (pa.awaiting === 'category') {
        if (/\b(overall|general|total|all|everything|none)\b/.test(t)) {
            collected.categoryWord = null;
        } else {
            const cat = await resolveAnswerCategory(userId, t, raw);
            if (!cat) {
                return {
                    handled: true,
                    result: { reply: `I don't have that category. Which category is this budget for? (e.g. Food, Transport — or say *overall* for the general budget, or *cancel*.)` }
                };
            }
            collected.categoryWord = cat;
        }
    } else {
        return { handled: false };
    }

    await contextService.clearPendingAction(userId);
    return { handled: true, result: await advanceSetBudget(userId, collected) };
}

async function continueAddRecurring(userId, t, raw, pa) {
    const collected = { ...(pa.collected || {}) };

    if (pa.awaiting === 'name') {
        const name = cleanName(raw);
        if (!name) {
            return { handled: true, result: { reply: `What should I call this bill? (e.g. *Netflix*, *Rent* — or say *cancel*.)` } };
        }
        collected.name = name;
    } else if (pa.awaiting === 'amount') {
        const amt = extractAmount(raw, { allowBare: true });
        if (amt === null || amt <= 0) return { handled: false };
        collected.amount = amt;
    } else if (pa.awaiting === 'day') {
        const day = extractDayOfMonth(raw);
        const rel = day ? null : extractRelativeDate(raw);
        if (day) {
            collected.dueDay = day;
            collected.dueDate = null;
        } else if (rel) {
            collected.dueDay = null;
            collected.dueDate = formatDate(rel.date);
        } else {
            return {
                handled: true,
                result: { reply: `When is it due? Reply *"the 1st"* (day of every month) or a date like *2026-11-01*. (Or say *cancel*.)` }
            };
        }
        collected.dueResolved = true;
    } else {
        return { handled: false };
    }

    await contextService.clearPendingAction(userId);

    const stillMissing = !collected.name || collected.amount === null || collected.amount === undefined || collected.amount <= 0 || (!collected.dueDay && !collected.dueDate);
    if (stillMissing) {
        return { handled: true, result: await advanceAddRecurring(userId, collected) };
    }
    return { handled: true, result: await executeAddRecurring(userId, collected) };
}

async function continueCreateCategory(userId, t, raw, pa) {
    const name = cleanName(raw);
    if (!name) {
        return { handled: true, result: { reply: `What should the new category be called? (e.g. *Pets* — or say *cancel*.)` } };
    }

    await contextService.clearPendingAction(userId);
    const result = await categoryService.createCategory(userId, name);
    if (result.created) {
        return {
            handled: true,
            result: {
                reply: `✅ Created the new category **${result.category.name}**. You can now log expenses under it — e.g. *"Add ₹500 for dog food under ${result.category.name}"*.`,
                refreshData: true,
                contextUpdates: { lastIntent: 'CREATE_CATEGORY', lastCategory: result.category.name }
            }
        };
    }
    return {
        handled: true,
        result: { reply: `You already have a category called **${result.category.name}**${result.category.isCustom ? '' : " (it's one of the default categories)"} — no duplicate was created.` }
    };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

// A clarification answer often carries more than the field being asked about
// ("₹1,250 for groceries yesterday by UPI"). Harvest the other entities too so
// the flow does not re-ask for information the user already gave.
async function harvestInto(userId, raw, collected, { skipCategory = false } = {}) {
    if (!skipCategory && !collected.category) {
        const cat = await resolveAnswerCategory(userId, normalize(raw), raw);
        if (cat) {
            collected.category = cat;
            collected.categoryWord = cat;
        }
    }
    if (!collected.date && !collected.dateResolved) {
        const rel = extractRelativeDate(raw);
        if (rel) {
            collected.date = rel.date;
            collected.dateLabel = rel.label;
        }
    }
    if (!collected.paymentMethod && !collected.paymentResolved) {
        const pm = extractPaymentMethod(raw);
        if (pm) collected.paymentMethod = pm;
    }
    if ((collected.note === null || collected.note === undefined) && !collected.noteResolved) {
        const note = extractNote(raw);
        if (note) collected.note = note;
    }
}

async function resolveAnswerCategory(userId, t, raw) {    const viaText = await resolveCategoryFromText(userId, raw, { requiredAfterOn: false });
    if (viaText) return viaText;

    // Bare answers: "food", "my pets category"
    const words = normalize(raw).split(/\s+/).filter(w => w.length > 2 && !['category', 'under', 'the', 'my', 'for', 'put'].includes(w));
    for (const w of words) {
        const resolved = await categoryService.resolveCategory(userId, w);
        if (resolved) return resolved;
    }
    return null;
}

function cleanName(raw) {
    const cleaned = String(raw || '')
        .trim()
        .replace(/^(?:it'?s|its|the|a|an|called|named|name\s*d?|is|my)\s+/i, '')
        .replace(/["']/g, '')
        .replace(/\s+/g, ' ');
    const titled = titleCase(cleaned).slice(0, 40).trim();
    return /^[A-Za-z][A-Za-z0-9\s&.-]{1,39}$/.test(titled) ? titled : null;
}

function pendingLabel(pa) {
    switch (pa.type) {
        case 'ADD_TRANSACTION': return ' — the transaction was not added';
        case 'CONFIRM_DELETE': return ' — nothing was deleted';
        case 'CONFIRM_RESET': return ' — nothing was reset';
        case 'SET_BUDGET': return ' — the budget was not saved';
        case 'ADD_RECURRING': return ' — the reminder was not created';
        case 'CREATE_CATEGORY': return ' — the category was not created';
        default: return '';
    }
}

function reAsk(pa) {
    switch (pa.type) {
        case 'CONFIRM_DELETE': {
            const target = pa.target || {};
            return `Still deciding: should I delete that ${target.type === 'INCOME' ? 'income' : 'expense'} of ${formatRupees(target.amount || 0)} ("${target.description || target.category}")? Reply **yes** to confirm or **no** to cancel.`;
        }
        case 'CONFIRM_RESET':
            return `Please confirm: reset ALL your own financial records (transactions, budgets, bills, goals, groups — your account stays)? Reply **yes** to confirm or **no** to cancel.`;
        case 'ADD_TRANSACTION':
            if (pa.awaiting === 'amount') return 'What was the amount? (e.g. *₹250* — or say *cancel*.)';
            if (pa.awaiting === 'category') return 'Which category does this belong to? (Or say *cancel*.)';
            if (pa.awaiting === 'date') return 'When was this? Reply *today*, *yesterday*, a date — or **skip** for today.';
            if (pa.awaiting === 'paymentMethod') return 'How did you pay? *UPI*, *Cash*, *Card*, *Net Banking*, *Wallet* — or **skip**.';
            return 'Any note for this entry? Reply with the note — or **skip**.';
        case 'SET_BUDGET':
            return pa.awaiting === 'amount'
                ? 'What budget amount should I set? (e.g. *₹20,000* — or say *cancel*.)'
                : 'Which category is this budget for? (e.g. Food — or *overall*. You can also say *cancel*.)';
        case 'ADD_RECURRING':
            if (pa.awaiting === 'name') return "What's the name of this recurring bill? (Or say *cancel*.)";
            if (pa.awaiting === 'amount') return 'How much is it? (e.g. *₹499* — or say *cancel*.)';
            return 'When is it due? (e.g. *"the 1st"* — or say *cancel*.)';
        case 'CREATE_CATEGORY':
            return 'What should the new category be called? (Or say *cancel*.)';
        default:
            return 'Do you want me to continue? Reply **yes** or **no**.';
    }
}

module.exports = {
    handlePendingAction,
    reAsk,
    pendingLabel
};
