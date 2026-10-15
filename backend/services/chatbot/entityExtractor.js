'use strict';

const {
    MONTH_NAMES,
    todayParts,
    zonedTimeToUtc,
    startOfDayOffset,
    formatDate
} = require('../../utils/dateUtil');

/** Normalize for matching: lowercase, strip punctuation except currency/number symbols. */
function normalize(text) {
    let s = String(text || '').toLowerCase();
    // A comma or dot between digits is part of one number ("₹15,000", "12.50"), not
    // sentence punctuation — hide it first so it survives the strip below.
    s = s.replace(/(\d),(?=\d)/g, '$1\u0001').replace(/(\d)\.(?=\d)/g, '$1\u0002');
    return s
        .replace(/[?.,!;:"'()]/g, ' ')
        .replace(/\u0001/g, ',')
        .replace(/\u0002/g, '.')
        .replace(/\s+/g, ' ')
        .trim();
}

const NUM = String.raw`([\d,]+(?:\.\d{1,2})?)`;

function parseNumber(raw) {
    if (raw === undefined || raw === null) return null;
    const n = Number(String(raw).replace(/,/g, ''));
    return isFinite(n) ? n : null;
}

/**
 * Extract a monetary amount. Prefers explicitly marked amounts
 * (₹250, rs 250, 250 rupees, inr 250), falls back to "2k" style,
 * then to bare numbers when allowBare is true.
 */
function extractAmount(text, { allowBare = false } = {}) {
    const t = normalize(text);

    const prefixed = t.match(new RegExp(String.raw`(?:₹|rs\.?|inr)\s*${NUM}`, 'i'));
    if (prefixed) {
        const v = parseNumber(prefixed[1]);
        if (v !== null) return v;
    }

    const suffixed = t.match(new RegExp(String.raw`${NUM}\s*(?:rs\.?|rupees|inr)\b`, 'i'));
    if (suffixed) {
        const v = parseNumber(suffixed[1]);
        if (v !== null) return v;
    }

    const kStyle = t.match(/(\d+(?:\.\d+)?)\s*k\b/i);
    if (kStyle) {
        const v = Number(kStyle[1]) * 1000;
        if (isFinite(v)) return Math.round(v * 100) / 100;
    }

    if (allowBare) {
        const bare = t.match(new RegExp(String.raw`\b${NUM}\b`));
        if (bare) {
            const v = parseNumber(bare[1]);
            if (v !== null) return v;
        }
    }
    return null;
}

/** Extract count like "last 10 transactions" / "show 5 transactions". */
function extractCount(text, fallback = null) {
    const t = normalize(text);
    const m = t.match(/(?:last|show|recent(?:\s+\w+)?|top)\s+(\d{1,3})\s+(?:transactions?|expenses?|entries|records?)/)
        || t.match(/(\d{1,3})\s+(?:transactions?|expenses?|entries|records?)/)
        || t.match(/(?:last|show)\s+(\d{1,3})\b/);
    if (m) {
        const n = parseInt(m[1], 10);
        if (n > 0 && n <= 50) return n;
    }
    return fallback;
}

/** Extract a percentage like "80%" or "80 percent" as a fraction (0.8). */
function extractPercent(text) {
    const t = normalize(text);
    const m = t.match(/(\d{1,3}(?:\.\d+)?)\s*(?:%|percent|per cent)/);
    if (m) {
        const v = Number(m[1]);
        if (isFinite(v) && v > 0 && v <= 100) return v / 100;
    }
    return null;
}

/** Extract ordinal rank: first/second/third/1st/2nd/3rd... */
function extractRank(text, fallback = 1) {
    const t = normalize(text);
    const words = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, '1st': 1, '2nd': 2, '3rd': 3, '4th': 4, '5th': 5 };
    for (const [w, r] of Object.entries(words)) {
        if (new RegExp(`\\b${w}\\b`).test(t)) return r;
    }
    return fallback;
}

const PERIOD_PATTERNS = [
    [/last\s+(\d{1,2})\s+months?/, (m) => ({ kind: 'last_n_months', months: Math.min(24, Math.max(1, parseInt(m[1], 10))) })],
    [/\b(this|current)\s+month('s)?\b|\bmonthly\b/, () => ({ kind: 'named', period: 'current_month' })],
    [/\b(last|previous|past)\s+month\b/, () => ({ kind: 'named', period: 'previous_month' })],
    [/\b(this|current)\s+week\b/, () => ({ kind: 'named', period: 'this_week' })],
    [/\b(last|previous|past)\s+week\b/, () => ({ kind: 'named', period: 'last_week' })],
    [/\blast\s+(\d{1,3})\s+days?\b/, (m) => ({ kind: 'named', period: `last_${parseInt(m[1], 10)}_days` })],
    [/\b(this|current)\s+year\b/, () => ({ kind: 'named', period: 'this_year' })],
    [/\b(last|previous|past)\s+year\b/, () => ({ kind: 'named', period: 'last_year' })],
    [/\btoday\b/, () => ({ kind: 'named', period: 'today' })],
    [/\byesterday\b/, () => ({ kind: 'named', period: 'yesterday' })],
    [/\ball\s+time\b|\bever\b|\bso far\b/, () => ({ kind: 'named', period: 'all_time' })]
];

/**
 * Extract a period expression: named period, month name (with optional year),
 * a "between X and Y" month range, or "from X to Y".
 */
function extractPeriodExpression(text) {
    const t = normalize(text);

    for (const [pattern, build] of PERIOD_PATTERNS) {
        const m = t.match(pattern);
        if (m) return build(m);
    }

    // "between january and march" / "from january to march"
    const range = t.match(/(?:between|from)\s+([a-z]+(?:\s+\d{4})?)\s+(?:and|to|-)\s+([a-z]+(?:\s+\d{4})?)/);
    if (range) {
        const startM = matchMonthToken(range[1]);
        const endM = matchMonthToken(range[2]);
        if (startM !== null && endM !== null) {
            return { kind: 'month_range', startMonth: startM.month, startYear: startM.year, endMonth: endM.month, endYear: endM.year };
        }
    }

    // "in march 2025" / "in march"
    const inMonth = t.match(/\b(?:in|during|for|of)\s+([a-z]+)(?:\s+(\d{4}))?\b/);
    if (inMonth) {
        const mIdx = MONTH_NAMES.indexOf(inMonth[1]);
        if (mIdx >= 0) {
            return { kind: 'single_month', month: mIdx + 1, year: inMonth[2] ? parseInt(inMonth[2], 10) : null };
        }
    }

    // bare month name anywhere ("march spending")
    for (let i = 0; i < MONTH_NAMES.length; i++) {
        if (new RegExp(`\\b${MONTH_NAMES[i]}\\b`).test(t)) {
            const withYear = t.match(new RegExp(`${MONTH_NAMES[i]}\\s+(\\d{4})`));
            return { kind: 'single_month', month: i + 1, year: withYear ? parseInt(withYear[1], 10) : null };
        }
    }

    return null;
}

function matchMonthToken(token) {
    const parts = token.trim().split(/\s+/);
    const mIdx = MONTH_NAMES.indexOf(parts[0]);
    if (mIdx < 0) return null;
    const year = parts[1] ? parseInt(parts[1], 10) : null;
    return { month: mIdx + 1, year };
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/**
 * Extract a specific transaction date (for logging expenses):
 * today / yesterday / day before yesterday / last <weekday> /
 * "on the 5th" / ISO date / "march 5" / "5th march".
 * Returns { date: Date, label: string } in the app timezone, or null.
 */
function extractRelativeDate(text) {
    const t = normalize(text);

    if (/\btoday\b|\bthis (?:morning|afternoon|evening)\b/.test(t)) {
        return { date: startOfDayOffset(0), offsetDays: 0, label: 'today' };
    }
    if (/\byesterday\b/.test(t)) {
        return { date: startOfDayOffset(-1), offsetDays: -1, label: 'yesterday' };
    }
    if (/day before yesterday/.test(t)) {
        return { date: startOfDayOffset(-2), offsetDays: -2, label: 'the day before yesterday' };
    }
    if (/\btomorrow\b/.test(t)) {
        return { date: startOfDayOffset(1), offsetDays: 1, label: 'tomorrow' };
    }

    for (let i = 0; i < WEEKDAYS.length; i++) {
        const re = new RegExp(`\\b(?:last|this past|past)\\s+${WEEKDAYS[i]}\\b`);
        if (re.test(t)) {
            const tp = todayParts();
            const currentDow = new Date(Date.UTC(tp.year, tp.month - 1, tp.day)).getUTCDay();
            let diff = currentDow - i;
            if (diff <= 0) diff += 7;
            return { date: startOfDayOffset(-diff), offsetDays: -diff, label: `last ${WEEKDAYS[i]}` };
        }
    }

    // ISO date: 2026-10-05
    const iso = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
    if (iso) {
        const d = zonedTimeToUtc(parseInt(iso[1], 10), parseInt(iso[2], 10), parseInt(iso[3], 10));
        if (!isNaN(d.getTime())) return { date: d, offsetDays: null, label: iso[0] };
    }

    // "on the 5th" / "on 5th" / "the 5th" / "5th of this month" / "on the 5th of october"
    const dayOfMonth = t.match(/\bon\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?\b(?:\s+(?:of|in)\s+([a-z]+))?/)
        || t.match(/\b(\d{1,2})(?:st|nd|rd|th)\s+of\s+([a-z]+)/);
    if (dayOfMonth) {
        const day = parseInt(dayOfMonth[1], 10);
        if (day >= 1 && day <= 31) {
            const monthName = dayOfMonth[2] ? MONTH_NAMES.indexOf(dayOfMonth[2]) : -1;
            if (monthName >= 0) {
                const tp = todayParts();
                const year = monthName + 1 >= tp.month ? tp.year : tp.year; // keep current year for explicit months
                const d = zonedTimeToUtc(year, monthName + 1, day);
                return { date: d, offsetDays: null, label: formatDate(d) };
            }
            // Day of current month; if it is in the future, assume the previous month ("paid on the 5th")
            const tp = todayParts();
            let candidate = new Date(Date.UTC(tp.year, tp.month - 1, day));
            if (candidate.getTime() > Date.UTC(tp.year, tp.month - 1, tp.day)) {
                candidate = new Date(Date.UTC(tp.year, tp.month - 1 - 1, day));
            }
            const d = zonedTimeToUtc(candidate.getUTCFullYear(), candidate.getUTCMonth() + 1, candidate.getUTCDate());
            return { date: d, offsetDays: null, label: formatDate(d) };
        }
    }

    // "march 5" / "5 march" / "march 5th"
    const monthDay = t.match(new RegExp(`\\b(${MONTH_NAMES.join('|')})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`))
        || t.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_NAMES.join('|')})\\b`));
    if (monthDay) {
        const monthName = MONTH_NAMES.find(m => t.includes(` ${m} `) || t.startsWith(`${m} `) || t.includes(`${m} `));
        const mIdx = MONTH_NAMES.indexOf(monthName);
        const day = parseInt(monthDay[2] && /^\d/.test(monthDay[2].trim()) ? monthDay[2] : monthDay[1], 10);
        if (mIdx >= 0 && day >= 1 && day <= 31) {
            const tp = todayParts();
            const d = zonedTimeToUtc(tp.year, mIdx + 1, day);
            return { date: d, offsetDays: null, label: formatDate(d) };
        }
    }

    // Bare day number (used while collecting a date in the dialog flow)
    const bareDay = t.match(/^(\d{1,2})$/);
    if (bareDay) {
        const day = parseInt(bareDay[1], 10);
        if (day >= 1 && day <= 31) {
            const tp = todayParts();
            let candidate = new Date(Date.UTC(tp.year, tp.month - 1, day));
            if (candidate.getTime() > Date.UTC(tp.year, tp.month - 1, tp.day)) {
                candidate = new Date(Date.UTC(tp.year, tp.month, day));
            }
            const d = zonedTimeToUtc(candidate.getUTCFullYear(), candidate.getUTCMonth() + 1, candidate.getUTCDate());
            return { date: d, offsetDays: null, label: formatDate(d) };
        }
    }

    return null;
}

const PAYMENT_METHODS = [
    { re: /\bupi\b|\bgpay\b|\bgoogle pay\b|\bphonepe\b|\bpaytm\b|\bbhim\b/, value: 'UPI' },
    { re: /\bcash\b/, value: 'Cash' },
    { re: /\b(?:credit|debit)\s+card\b|\bcard payment\b|\bpaid by card\b|\bcard\b/, value: 'Card' },
    { re: /\bnet\s*banking\b|\bbank\s+transfer\b|\bneft\b|\bimps\b/, value: 'NetBanking' },
    { re: /\bwallet\b|\bpaytm wallet\b|\bamazon pay\b/, value: 'Wallet' }
];

function extractPaymentMethod(text) {
    const t = normalize(text);
    for (const pm of PAYMENT_METHODS) {
        if (pm.re.test(t)) return pm.value;
    }
    return null;
}

const KNOWN_MERCHANTS = ['netflix', 'swiggy', 'zomato', 'amazon', 'flipkart', 'uber', 'ola', 'spotify', 'irctc', 'myntra', 'bigbasket', 'dominos', 'starbucks', 'airtel', 'jio', 'vodafone', 'reliance', 'decathlon', 'bookmyshow', 'zepto', 'blinkit'];

function extractMerchant(text) {
    const t = normalize(text);
    for (const m of KNOWN_MERCHANTS) {
        if (new RegExp(`\\b${m}\\b`).test(t)) return m;
    }
    return null;
}

/** Extract export format: excel or pdf. */
function extractFormat(text) {
    const t = normalize(text);
    if (/excel|xlsx|spreadsheet|sheet|workbook/.test(t)) return 'excel';
    if (/pdf/.test(t)) return 'pdf';
    return null;
}

/** Extract recurring frequency. */
function extractFrequency(text) {
    const t = normalize(text);
    if (/every\s+month|monthly|each\s+month|per\s+month/.test(t)) return 'MONTHLY';
    if (/every\s+week|weekly|each\s+week/.test(t)) return 'WEEKLY';
    if (/every\s+year|yearly|annual|annually/.test(t)) return 'YEARLY';
    return null;
}

/** Day-of-month for reminders: "on the 1st of every month". */
function extractDayOfMonth(text) {
    const t = normalize(text);
    const m = t.match(/\bon\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(?:every|each)\s+(?:month|week|year)/)
        || t.match(/(?:every|each)\s+(?:month|week|year)(?:\s+on)?(?:\s+the)?\s+(\d{1,2})(?:st|nd|rd|th)?/)
        || t.match(/(\d{1,2})(?:st|nd|rd|th)\s+of\s+(?:every|each)\s+month/);
    if (m) {
        const d = parseInt(m[1], 10);
        if (d >= 1 && d <= 31) return d;
    }
    return null;
}

/** Extract a likely category word (raw). Returns the word or null; resolution happens in categoryService. */
function extractCategoryWord(text, { afterOnFor = true } = {}) {
    const t = normalize(text);
    if (!afterOnFor) return null;
    // "on food", "for entertainment", "under transport", "in shopping". Every candidate is
    // checked, not just the first, so a stop word like "today" doesn't hide the real category.
    const re = /\b(?:on|for|under|in)\s+(?:my\s+|the\s+)?([a-z]{3,})\b/g;
    let m;
    while ((m = re.exec(t)) !== null) {
        if (!isStopWord(m[1]) && !MONTH_NAMES.includes(m[1])) return m[1];
    }
    return null;
}

const STOP_WORDS = new Set([
    'this', 'that', 'last', 'current', 'previous', 'today', 'yesterday', 'tomorrow', 'week', 'month',
    'months', 'year', 'day', 'days', 'the', 'and', 'with', 'was', 'were', 'are', 'have', 'has', 'had',
    'my', 'me', 'you', 'it', 'them', 'they', 'all', 'now', 'here', 'there', 'what', 'which', 'when',
    'where', 'how', 'much', 'many', 'did', 'do', 'does', 'spend', 'spent', 'spending', 'expense',
    'expenses', 'transaction', 'transactions', 'budget', 'bill', 'bills', 'income', 'salary', 'save',
    'savings', 'total', 'amount', 'money', 'cash', 'card', 'upi', 'yes', 'no', 'please', 'want',
    'would', 'like', 'record', 'log', 'add', 'track', 'note', 'notes', 'description', 'paid', 'pay',
    'yesterday'
]);

function isStopWord(w) {
    return STOP_WORDS.has(w);
}

/** Extract a note from quoted text or after a note/remark/memo label. */
function extractNote(text) {
    const raw = String(text || '');
    const quoted = raw.match(/["']([^"']{2,200})["']/);
    if (quoted) return quoted[1].trim();
    const punctuated = raw.match(/(?:note|notes|remark|remarks|memo)\s*[:\-]\s*(.{2,200})/i);
    if (punctuated) return punctuated[1].trim();
    // "..., note team lunch" — a spoken label with no separator: the note is the
    // rest of that clause.
    const spoken = raw.match(/(?:^|[,;.]\s)\s*(?:note|notes|remark|remarks|memo)\s+(?!\b(?:that|this|it)\b)(.{2,200})/i);
    if (spoken) return spoken[1].trim();
    return null;
}

module.exports = {
    normalize,
    extractAmount,
    extractCount,
    extractPercent,
    extractRank,
    extractPeriodExpression,
    extractRelativeDate,
    extractPaymentMethod,
    extractMerchant,
    extractFormat,
    extractFrequency,
    extractDayOfMonth,
    extractCategoryWord,
    extractNote,
    isStopWord
};
