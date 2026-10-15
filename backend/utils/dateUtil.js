'use strict';

/**
 * Timezone-aware date utilities.
 * All period boundaries ("today", "this month", etc.) are computed in the
 * configured application timezone (APP_TIMEZONE, default Asia/Kolkata) and
 * converted to UTC instants for MongoDB queries.
 */

const APP_TIMEZONE = () => process.env.APP_TIMEZONE || 'Asia/Kolkata';

const MONTH_NAMES = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function getZoneParts(date, timeZone) {
    const dtf = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hour12: false,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
    const parts = {};
    for (const p of dtf.formatToParts(date)) {
        if (p.type !== 'literal') parts[p.type] = parseInt(p.value, 10);
    }
    if (parts.hour === 24) parts.hour = 0;
    return parts;
}

function getZoneOffsetMs(date, timeZone) {
    const parts = getZoneParts(date, timeZone);
    const asUTC = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    return asUTC - Math.floor(date.getTime() / 1000) * 1000;
}

/**
 * Convert a wall-clock time in `timeZone` to a UTC Date.
 */
function zonedTimeToUtc(year, month, day, hour = 0, minute = 0, second = 0, ms = 0, timeZone = APP_TIMEZONE()) {
    const tz = timeZone;
    const guess = Date.UTC(year, month - 1, day, hour, minute, second, ms);
    let offset = getZoneOffsetMs(new Date(guess), tz);
    let result = guess - offset;
    offset = getZoneOffsetMs(new Date(result), tz);
    result = guess - offset;
    return new Date(result);
}

/** Calendar "today" in the app timezone: {year, month (1-12), day}. */
function todayParts(timeZone = APP_TIMEZONE()) {
    const p = getZoneParts(new Date(), timeZone);
    return { year: p.year, month: p.month, day: p.day };
}

/** UTC instant for the start (00:00:00) of a zone-local day offset from today. */
function startOfDayOffset(dayOffset = 0, timeZone = APP_TIMEZONE()) {
    const t = todayParts(timeZone);
    // Pure calendar arithmetic via UTC (safe: only date rollover is needed)
    const target = new Date(Date.UTC(t.year, t.month - 1, t.day + dayOffset));
    return zonedTimeToUtc(target.getUTCFullYear(), target.getUTCMonth() + 1, target.getUTCDate(), 0, 0, 0, 0, timeZone);
}

function endOfDayOffset(dayOffset = 0, timeZone = APP_TIMEZONE()) {
    const t = todayParts(timeZone);
    const target = new Date(Date.UTC(t.year, t.month - 1, t.day + dayOffset));
    return zonedTimeToUtc(target.getUTCFullYear(), target.getUTCMonth() + 1, target.getUTCDate(), 23, 59, 59, 999, timeZone);
}

/** Start (day 1, 00:00) of a zone-local month. month: 1-12. monthOffset shifts (0=this, -1=previous). */
function startOfMonthOffset(monthOffset = 0, base = null, timeZone = APP_TIMEZONE()) {
    const t = base || todayParts(timeZone);
    const target = new Date(Date.UTC(t.year, t.month - 1 + monthOffset, 1));
    return zonedTimeToUtc(target.getUTCFullYear(), target.getUTCMonth() + 1, 1, 0, 0, 0, 0, timeZone);
}

function endOfMonthOffset(monthOffset = 0, base = null, timeZone = APP_TIMEZONE()) {
    const start = startOfMonthOffset(monthOffset, base, timeZone);
    const sParts = getZoneParts(start, timeZone);
    const nextMonth = new Date(Date.UTC(sParts.year, sParts.month, 1));
    const lastDay = new Date(Date.UTC(nextMonth.getUTCFullYear(), nextMonth.getUTCMonth(), 0));
    return zonedTimeToUtc(lastDay.getUTCFullYear(), lastDay.getUTCMonth() + 1, lastDay.getUTCDate(), 23, 59, 59, 999, timeZone);
}

function startOfWeekOffset(weekOffset = 0, timeZone = APP_TIMEZONE()) {
    // Weeks start on Sunday (matches existing app behaviour)
    const t = todayParts(timeZone);
    const nowUtc = zonedTimeToUtc(t.year, t.month, t.day, 12, 0, 0, 0, timeZone);
    const dow = getZoneParts(nowUtc, timeZone);
    const jsDow = new Date(Date.UTC(t.year, t.month - 1, t.day)).getUTCDay();
    void dow;
    return startOfDayOffset(-jsDow + weekOffset * 7, timeZone);
}

function endOfWeekOffset(weekOffset = 0, timeZone = APP_TIMEZONE()) {
    return endOfDayOffset(-jsDowToday(timeZone) + 6 + weekOffset * 7, timeZone);
}

function jsDowToday(timeZone = APP_TIMEZONE()) {
    const t = todayParts(timeZone);
    return new Date(Date.UTC(t.year, t.month - 1, t.day)).getUTCDay();
}

function startOfYearOffset(yearOffset = 0, timeZone = APP_TIMEZONE()) {
    const t = todayParts(timeZone);
    return zonedTimeToUtc(t.year + yearOffset, 1, 1, 0, 0, 0, 0, timeZone);
}

function endOfYearOffset(yearOffset = 0, timeZone = APP_TIMEZONE()) {
    const t = todayParts(timeZone);
    return zonedTimeToUtc(t.year + yearOffset, 12, 31, 23, 59, 59, 999, timeZone);
}

/**
 * Resolve a named period to { startDate, endDate, label } in the app timezone.
 * Supported: today, yesterday, this_week, last_week, this_month/current_month,
 * previous_month/last_month, last_30_days, this_year, last_year, all_time,
 * month names (optionally "march 2025"), last_N_months handled by caller.
 */
function resolvePeriod(periodStr, options = {}) {
    const tz = options.timeZone || APP_TIMEZONE();
    const p = String(periodStr || '').toLowerCase().trim();
    const now = new Date();

    if (options.startDate && options.endDate) {
        return {
            startDate: options.startDate,
            endDate: options.endDate,
            label: options.label || `${formatDate(options.startDate)} to ${formatDate(options.endDate)}`
        };
    }

    if (p === 'today') return { startDate: startOfDayOffset(0, tz), endDate: endOfDayOffset(0, tz), label: 'Today' };
    if (p === 'yesterday') return { startDate: startOfDayOffset(-1, tz), endDate: endOfDayOffset(-1, tz), label: 'Yesterday' };
    if (p === 'tomorrow') return { startDate: startOfDayOffset(1, tz), endDate: endOfDayOffset(1, tz), label: 'Tomorrow' };
    if (p === 'this_week' || p === 'current_week') return { startDate: startOfWeekOffset(0, tz), endDate: endOfWeekOffset(0, tz), label: 'This Week' };
    if (p === 'last_week' || p === 'previous_week' || p === 'past_week') return { startDate: startOfWeekOffset(-1, tz), endDate: endOfWeekOffset(-1, tz), label: 'Last Week' };
    if (p === 'last_7_days' || p === 'past_7_days') return { startDate: startOfDayOffset(-6, tz), endDate: endOfDayOffset(0, tz), label: 'Last 7 Days' };
    if (p === 'last_30_days' || p === 'past_30_days') return { startDate: startOfDayOffset(-29, tz), endDate: endOfDayOffset(0, tz), label: 'Last 30 Days' };

    if (p === 'previous_month' || p === 'last_month' || p === 'past_month') {
        const s = startOfMonthOffset(-1, null, tz);
        const parts = getZoneParts(s, tz);
        return { startDate: s, endDate: endOfMonthOffset(-1, null, tz), label: `${MONTH_NAMES[parts.month - 1][0].toUpperCase() + MONTH_NAMES[parts.month - 1].slice(1)} ${parts.year}` };
    }
    if (p === 'this_month' || p === 'current_month' || p === 'monthly' || p === 'month') {
        const s = startOfMonthOffset(0, null, tz);
        const parts = getZoneParts(s, tz);
        return { startDate: s, endDate: endOfMonthOffset(0, null, tz), label: `${MONTH_NAMES[parts.month - 1][0].toUpperCase() + MONTH_NAMES[parts.month - 1].slice(1)} ${parts.year}` };
    }
    if (p === 'this_year' || p === 'current_year') {
        const y = todayParts(tz).year;
        return { startDate: startOfYearOffset(0, tz), endDate: endOfYearOffset(0, tz), label: `Year ${y}` };
    }
    if (p === 'last_year' || p === 'previous_year') {
        const y = todayParts(tz).year - 1;
        return { startDate: zonedTimeToUtc(y, 1, 1, 0, 0, 0, 0, tz), endDate: zonedTimeToUtc(y, 12, 31, 23, 59, 59, 999, tz), label: `Year ${y}` };
    }
    if (p === 'all_time') {
        return { startDate: null, endDate: null, label: 'All Time' };
    }

    // "march" / "march 2025"
    const monthMatch = p.match(/^([a-z]+)\s*(\d{4})?$/);
    if (monthMatch) {
        const mIdx = MONTH_NAMES.indexOf(monthMatch[1]);
        if (mIdx >= 0) {
            const t = todayParts(tz);
            let year = monthMatch[2] ? parseInt(monthMatch[2], 10) : t.year;
            let label = `${MONTH_NAMES[mIdx][0].toUpperCase() + MONTH_NAMES[mIdx].slice(1)} ${year}`;
            // If the month is in the future without an explicit year, it likely means last year's month
            if (!monthMatch[2]) {
                const monthStart = zonedTimeToUtc(t.year, mIdx + 1, 1, 0, 0, 0, 0, tz);
                if (monthStart > now) {
                    year = t.year - 1;
                    label = `${MONTH_NAMES[mIdx][0].toUpperCase() + MONTH_NAMES[mIdx].slice(1)} ${year}`;
                }
            }
            const start = zonedTimeToUtc(year, mIdx + 1, 1, 0, 0, 0, 0, tz);
            const end = zonedTimeToUtc(year, mIdx + 2, 1, 0, 0, 0, 0, tz).getTime() - 1;
            return { startDate: start, endDate: new Date(end), label };
        }
    }

    // Default: current month
    const s = startOfMonthOffset(0, null, tz);
    const parts = getZoneParts(s, tz);
    return {
        startDate: s,
        endDate: endOfMonthOffset(0, null, tz),
        label: `${MONTH_NAMES[parts.month - 1][0].toUpperCase() + MONTH_NAMES[parts.month - 1].slice(1)} ${parts.year} (this month)`
    };
}

/** Number of days elapsed in the current month (for average-daily-spending). */
function daysElapsedThisMonth(timeZone = APP_TIMEZONE()) {
    return todayParts(timeZone).day;
}

function daysInMonthOffset(monthOffset = 0, timeZone = APP_TIMEZONE()) {
    const s = getZoneParts(startOfMonthOffset(monthOffset, null, timeZone), timeZone);
    const next = new Date(Date.UTC(s.year, s.month, 1));
    const last = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth(), 0));
    return last.getUTCDate();
}

function formatDate(date) {
    if (!date) return '';
    const d = date instanceof Date ? date : new Date(date);
    // Calendar date in the app timezone — toISOString() would shift a zone-local
    // midnight back by the UTC offset (e.g. IST midnight -> previous day).
    const p = getZoneParts(d, APP_TIMEZONE());
    return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

function formatLongDate(date) {
    if (!date) return '';
    const d = date instanceof Date ? date : new Date(date);
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: APP_TIMEZONE() });
}

function formatShortDate(date) {
    if (!date) return '';
    const d = date instanceof Date ? date : new Date(date);
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: APP_TIMEZONE() });
}

module.exports = {
    APP_TIMEZONE,
    MONTH_NAMES,
    MONTH_SHORT,
    todayParts,
    getZoneParts,
    zonedTimeToUtc,
    startOfDayOffset,
    endOfDayOffset,
    startOfMonthOffset,
    endOfMonthOffset,
    startOfWeekOffset,
    endOfWeekOffset,
    startOfYearOffset,
    endOfYearOffset,
    resolvePeriod,
    daysElapsedThisMonth,
    daysInMonthOffset,
    formatDate,
    formatLongDate,
    formatShortDate
};
