'use strict';

const Transaction = require('../../models/Transaction');
const analytics = require('../financeAnalyticsService');
const categoryService = require('../categoryService');
const contextService = require('../conversationContextService');
const { formatRupees } = require('./formatter');
const { extractPeriodExpression, extractCategoryWord, normalize } = require('./entityExtractor');
const {
    zonedTimeToUtc,
    startOfMonthOffset,
    endOfMonthOffset,
    formatDate,
    MONTH_NAMES
} = require('../../utils/dateUtil');

/**
 * Convert a period expression extracted from user text into
 * analytics-compatible params: { period } or { startDate, endDate, label }.
 */
async function resolvePeriodParams(text) {
    const expr = extractPeriodExpression(text);
    if (!expr) return { period: null };

    if (expr.kind === 'named') {
        return { period: expr.period };
    }

    if (expr.kind === 'last_n_months') {
        const start = startOfMonthOffset(-(expr.months - 1));
        const end = endOfMonthOffset(0);
        return { period: null, startDate: start, endDate: end, label: `last ${expr.months} months` };
    }

    if (expr.kind === 'single_month') {
        const periodStr = expr.year
            ? `${MONTH_NAMES[expr.month - 1]} ${expr.year}`
            : `${MONTH_NAMES[expr.month - 1]}`;
        return { period: periodStr };
    }

    if (expr.kind === 'month_range') {
        const tp = { year: new Date().getFullYear() };
        const startYear = expr.startYear || tp.year;
        const endYear = expr.endYear || expr.startYear || tp.year;
        const start = zonedTimeToUtc(startYear, expr.startMonth, 1);
        const end = new Date(zonedTimeToUtc(endYear, expr.endMonth + 1, 1).getTime() - 1);
        const label = `${MONTH_NAMES[expr.startMonth - 1][0].toUpperCase() + MONTH_NAMES[expr.startMonth - 1].slice(1)} to ${MONTH_NAMES[expr.endMonth - 1][0].toUpperCase() + MONTH_NAMES[expr.endMonth - 1].slice(1)} ${endYear}`;
        return { period: null, startDate: start, endDate: end, label };
    }

    return { period: null };
}

/**
 * Resolve a category mentioned in the text (checks defaults, synonyms and
 * the user's custom categories). Returns the canonical category name or null.
 */
async function resolveCategoryFromText(userId, text, { requiredAfterOn = true } = {}) {
    const word = extractCategoryWord(text, { afterOnFor: requiredAfterOn });
    if (word) {
        const resolved = await categoryService.resolveCategory(userId, word);
        if (resolved) return resolved;
    }
    // Also check direct word presence in the text (e.g. "food spending")
    const t = normalize(text);
    for (const [syn, target] of Object.entries(categoryService.CATEGORY_SYNONYMS)) {
        if (new RegExp(`\\b${syn}\\b`).test(t)) return target;
    }
    return null;
}

/** Latest expense (or income) transaction snapshot for a user. */
async function getLatestTransaction(userId, type = 'EXPENSE', { category = null, amount = null } = {}) {
    const tx = await Transaction.findOne({
        user: userId,
        type: { $in: [type, type.toLowerCase()] },
        ...(category ? { category } : {}),
        ...(amount !== null && amount !== undefined ? { amount } : {})
    }).sort({ date: -1, createdAt: -1 });
    if (!tx) return null;
    return {
        id: tx._id,
        amount: tx.amount,
        category: tx.category,
        description: tx.description || tx.merchant || tx.category,
        merchant: tx.merchant || '',
        date: tx.date ? formatDate(tx.date) : '',
        formattedDate: tx.date ? tx.date.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '',
        type: (tx.type || 'EXPENSE').toUpperCase(),
        source: tx.source || 'manual'
    };
}

/**
 * Heuristic description extraction for expense-logging commands:
 * "add ₹250 for lunch today" -> "lunch"
 * "record my electricity bill of ₹1850 paid on the 5th" -> "electricity bill"
 */
function extractDescriptionCandidate(t, merchant, categoryWord) {
    if (merchant) return merchant;

    // Noun phrase right before "of/for ₹<amount>": "my electricity bill of ₹1,850"
    const beforeAmount = t.match(/(?:add|log|record|track|spent|spend|paid|pay|save)\s+(?:my\s+|a\s+|an\s+|the\s+)?((?:[a-z]{3,})(?:\s+[a-z]{3,}){0,2})\s+(?:of|for|worth)\s+(?:₹|rs|inr|\d)/);
    if (beforeAmount) {
        const words = beforeAmount[1].split(/\s+/).filter(w => !['expense', 'transaction', 'money'].includes(w));
        if (words.length) return words.join(' ');
    }

    // Phrase after "for/on": "for lunch today" -> "lunch"
    const afterFor = t.match(/\b(?:for|on)\s+(?:my\s+|a\s+|an\s+|the\s+)?((?:[a-z]{3,})(?:\s+[a-z]{3,}){0,2})/);
    if (afterFor) {
        let phrase = afterFor[1];
        phrase = phrase.split(/\s+(?=(?:today|yesterday|tomorrow|last|this|paid|via|by|under|in|on|of)\b)/)[0];
        const words = phrase.split(/\s+/).filter(w => !['expense', 'transaction', 'today', 'yesterday', 'tomorrow', 'paid'].includes(w));
        if (words.length) return words.join(' ');
    }

    return categoryWord || null;
}

function titleCase(str) {
    return String(str || '')
        .trim()
        .split(/\s+/)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
}

function txnLine(tx, idx) {
    const sign = tx.type === 'INCOME' ? '+' : '-';
    return `${idx}. **${tx.formattedDate}** — ${sign}${formatRupees(tx.amount)} | **${tx.category}** ("${tx.description}")${tx.paymentMethod ? ` | via ${tx.paymentMethod}` : ''}`;
}

module.exports = {
    analytics,
    categoryService,
    contextService,
    formatRupees,
    resolvePeriodParams,
    resolveCategoryFromText,
    getLatestTransaction,
    extractDescriptionCandidate,
    titleCase,
    txnLine
};
