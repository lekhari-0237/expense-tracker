'use strict';

/**
 * QUERY INTENTS — read-only analysis grounded in the user's real data.
 * Ordered by specificity; the engine uses the first match.
 */

const {
    normalize,
    extractAmount,
    extractCount,
    extractRank,
    extractPeriodExpression,
    extractMerchant,
    extractCategoryWord
} = require('./entityExtractor');
const {
    formatRupees,
    resolvePeriodParams,
    resolveCategoryFromText,
    categoryService,
    txnLine,
    analytics
} = require('./shared');

/* ------------------------------------------------------------------ */
/* Savings goals & savings                                             */
/* ------------------------------------------------------------------ */

const GET_SAVINGS_GOALS = {
    name: 'GET_SAVINGS_GOALS',
    match: (t) => /\bsaving(?:s)? goals?\b|\bgoals?\b.*\b(progress|list|status)\b|\b(list|show|my|see)\b.*\bgoals?\b/.test(t) ? {} : null,
    handle: async ({ userId }) => {
        const goals = await analytics.getSavingsGoalsData(userId);
        if (goals.length === 0) {
            return {
                reply: "You haven't created any savings goals yet. You can add one on the **Savings Goal Tracker** page (e.g. *\"Vacation Fund\", target ₹50,000 by next summer*).",
                contextUpdates: { lastIntent: 'GET_SAVINGS_GOALS' }
            };
        }
        const items = goals.map((g, i) => {
            const status = g.isAchieved ? '🎉 Goal achieved!' : `${g.progressPercentage}% complete (${formatRupees(g.remainingAmount)} to go)`;
            return `${i + 1}. **${g.goalName}** — target ${formatRupees(g.targetAmount)} by ${g.targetDate} | ${status}`;
        }).join('\n');
        return {
            reply: `Here are your **savings goals**:\n\n${items}\n\n💡 Note: progress is measured against your net savings (recorded income minus expenses) across your whole history.`,
            contextUpdates: { lastIntent: 'GET_SAVINGS_GOALS' }
        };
    }
};

const SAVINGS_QUERY = {
    name: 'SAVINGS_QUERY',
    match: (t) => /\bhow much (?:did|have) i saved?\b|\bhow much (?:am|will) i (?:be )?sav(?:e|ed|ing)\b|\bdid i save\b|\bmy savings\b|\bsavings this month\b/.test(t)
        ? {} : null,
    handle: async ({ userId, raw }) => {
        const periodParams = await resolvePeriodParams(raw);
        const period = periodParams.period || 'current_month';
        const balance = await analytics.getBalance(userId, { period, startDate: periodParams.startDate, endDate: periodParams.endDate });
        const label = periodParams.label || balance.periodLabel;

        if (balance.income === 0 && balance.expenses === 0) {
            return {
                reply: `You have no recorded income or expenses for **${label}**, so I can't compute any savings for that period.`,
                contextUpdates: { lastIntent: 'SAVINGS_QUERY', lastPeriod: period }
            };
        }

        return {
            reply: `For **${label}**:\n• Recorded income: **${formatRupees(balance.income)}**\n• Expenses: **${formatRupees(balance.expenses)}**\n• **Net cash flow: ${formatRupees(balance.balance)}**${balance.savings > 0 ? ` (savings rate ${balance.savingsPercentage}%)` : ''}\n\n📌 Note: this is recorded income minus expenses (net cash flow) — not verified savings, since the app doesn't track all your external savings.`,
            contextUpdates: { lastIntent: 'SAVINGS_QUERY', lastPeriod: period }
        };
    }
};

/* ------------------------------------------------------------------ */
/* Comparison & insights                                               */
/* ------------------------------------------------------------------ */

const SPENDING_TOO_MUCH = {
    name: 'SPENDING_TOO_MUCH',
    match: (t) => /\b(?:am i|i am) spending too much\b|\bam i overspending\b|\btoo much on\b|\bspending too much on\b/.test(t)
        ? { categoryWord: extractCategoryWord(t) } : null,
    handle: async ({ userId, params }) => {
        const category = params.categoryWord ? await resolveCategoryFromText(userId, params.categoryWord, { requiredAfterOn: false }) : null;
        const breakdown = await analytics.getCategoryBreakdown(userId, { period: 'current_month' });

        if (category) {
            const catStat = breakdown.categories.find(c => c.category.toLowerCase() === category.toLowerCase());
            if (!catStat) {
                return { reply: `You haven't recorded any spending on **${category}** this month (${breakdown.periodLabel}), so you're definitely not overspending on it.` };
            }
            const share = catStat.percentage;
            let verdict;
            if (share > 40) verdict = `Yes — that's a **high share** of your spending. You might want to review it.`;
            else if (share > 25) verdict = `That's **above the common 25% guideline** for a single category — worth keeping an eye on.`;
            else verdict = `No — that looks like a reasonable share of your spending.`;
            return {
                reply: `You spent **${formatRupees(catStat.amount)}** on **${catStat.category}** this month — **${share}%** of your total expenses (${formatRupees(breakdown.totalExpense)}), across ${catStat.count} transaction${catStat.count === 1 ? '' : 's'}.\n\n${verdict}\n\n📌 This is a guideline, not a rule — essential categories can healthily exceed it.`,
                contextUpdates: { lastIntent: 'SPENDING_TOO_MUCH', lastCategory: catStat.category, lastPeriod: 'current_month' }
            };
        }

        const balance = await analytics.getBalance(userId, { period: 'current_month' });
        const top = breakdown.topCategory;
        const savingsRate = balance.savingsPercentage;
        return {
            reply: `Here's an honest look at this month:\n• Income: ${formatRupees(balance.income)}\n• Expenses: ${formatRupees(balance.expenses)}\n• Savings rate: **${savingsRate}%**${top ? `\n• Highest category: **${top.category}** at ${formatRupees(top.amount)} (${top.percentage}% of spending)` : ''}\n\n${savingsRate >= 20 ? 'Your savings rate is healthy (≥20%).' : savingsRate > 0 ? 'You are saving something, but under the common 20% recommendation.' : 'You are currently spending more than you earn this month.'}${top ? ` Your biggest lever would be **${top.category}**.` : ''}`,
            contextUpdates: { lastIntent: 'SPENDING_TOO_MUCH', lastPeriod: 'current_month' }
        };
    }
};

const CUT_DOWN_ADVICE = {
    name: 'CUT_DOWN_ADVICE',
    match: (t) => /\bwhere can i cut\b|\bhow can i (?:save|reduce|spend less|cut)\b|\bcut down\b|\breduce (?:my )?(?:expenses|spending)\b|\bwhere should i cut\b|\bsave more\b|\bspending tips\b/.test(t)
        ? {} : null,
    handle: async ({ userId }) => {
        const breakdown = await analytics.getCategoryBreakdown(userId, { period: 'current_month' });
        if (breakdown.categories.length === 0) {
            return { reply: `You have no recorded expenses for **${breakdown.periodLabel}**, so I have nothing to base a recommendation on yet. Log a few expenses and ask me again!` };
        }

        // Discretionary categories are the usual candidates; essentials are not called "unnecessary"
        const DISCRETIONARY = ['Entertainment', 'Shopping', 'Food', 'Travel'];
        const ESSENTIAL = ['Rent', 'Bills', 'Groceries', 'Healthcare', 'Education', 'Transport'];

        const discretionary = breakdown.categories.filter(c => DISCRETIONARY.includes(c.category));
        const top = breakdown.topCategory;

        let reply = `Based on your recorded spending in **${breakdown.periodLabel}** (total ${formatRupees(breakdown.totalExpense)}):\n\n`;
        if (discretionary.length > 0) {
            reply += `**Largest discretionary categories:**\n${discretionary.slice(0, 3).map((c, i) => `${i + 1}. **${c.category}** — ${formatRupees(c.amount)} (${c.percentage}% of spending, ${c.count} transaction${c.count === 1 ? '' : 's'})`).join('\n')}\n\n`;
            const topDisc = discretionary[0];
            reply += `💡 Your best cut-down candidate is **${topDisc.category}**: ${formatRupees(topDisc.amount)} across ${topDisc.count} transactions (avg ${formatRupees(Math.round(topDisc.amount / topDisc.count))} each). Reducing it by a quarter would free up roughly **${formatRupees(Math.round(topDisc.amount * 0.25))}**.\n\n`;
        } else {
            reply += `Most of your spending is in essential categories (${breakdown.categories.filter(c => ESSENTIAL.includes(c.category)).map(c => c.category).join(', ') || 'n/a'}), so there's no large discretionary category to cut based on your data.\n\n`;
        }
        reply += `📌 I'm only pointing at where the money actually went — whether a category is worth cutting is your call. Essentials like ${ESSENTIAL.slice(0, 4).join(', ')} are usually not good cut targets.`;

        return { reply, contextUpdates: { lastIntent: 'CUT_DOWN_ADVICE', lastPeriod: 'current_month' } };
    }
};

const COMPARE_PERIODS = {
    name: 'COMPARE_PERIODS',
    match: (t) => /\bcompare\b/.test(t) && /\b(month|week|year|period|spending|expenses)\b/.test(t)
        && !/\bcompare it with (?:the )?previous\b/.test(t)
        ? {} : null,
    handle: async ({ userId }) => {
        // Default comparison: this month vs last month (timezone-aware boundaries)
        const res = await analytics.comparePeriods(userId, 'current_month', 'previous_month');

        let verdict;
        if (res.period2.expenses === 0) {
            verdict = `You spent ${formatRupees(res.period1.expenses)} this month. (No expenses were recorded for last month, so I can't compute a change.)`;
        } else if (res.direction === 'increased') {
            verdict = `Spending **increased by ${formatRupees(res.absDifference)} (+${res.percentageChange}%)** vs last month.`;
        } else if (res.direction === 'decreased') {
            verdict = `Spending **decreased by ${formatRupees(res.absDifference)} (-${res.percentageChange}%)** vs last month. Nice!`;
        } else {
            verdict = `Spending is **identical** to last month.`;
        }

        return {
            reply: `**Month-over-month comparison:**\n• **${res.period1.label}:** ${formatRupees(res.period1.expenses)} (${res.period1.count} transactions, income ${formatRupees(res.period1.income)})\n• **${res.period2.label}:** ${formatRupees(res.period2.expenses)} (${res.period2.count} transactions, income ${formatRupees(res.period2.income)})\n\n📊 ${verdict}`,
            contextUpdates: { lastIntent: 'COMPARE_PERIODS', lastPeriod: 'current_month' }
        };
    }
};

const SPENDING_TREND = {
    name: 'SPENDING_TREND',
    match: (t) => /\btrend\b|\bspending over time\b|\bmonth(?:ly)? (?:trend|pattern|breakdown)\b/.test(t)
        || (/\blast \d+ months\b|\blast few months\b/.test(t) && /\b(show|what|how|spending|report)\b/.test(t))
        ? { months: (t.match(/last (\d{1,2}) months?/) ? parseInt(t.match(/last (\d{1,2}) months?/)[1], 10) : 6) } : null,
    handle: async ({ userId, params }) => {
        const months = await analytics.getMonthlyTrend(userId, params.months || 6);
        const active = months.filter(m => m.expenses > 0 || m.income > 0);
        if (active.length === 0) {
            return { reply: `I have no recorded transactions in the last ${months.length} months, so there's no trend to show yet.` };
        }

        const lines = months.map(m => `${m.isCurrent ? '👉' : '  '} **${m.label}** — expenses ${formatRupees(m.expenses)}${m.income > 0 ? ` | income ${formatRupees(m.income)}` : ''} (${m.count} txns)`);

        const withExpenses = months.filter(m => m.expenses > 0);
        let trendNote = '';
        if (withExpenses.length >= 2) {
            const first = withExpenses[0];
            const last = withExpenses[withExpenses.length - 1];
            const change = last.expenses - first.expenses;
            const pct = first.expenses > 0 ? Math.round((Math.abs(change) / first.expenses) * 100) : 0;
            trendNote = `\n\n📈 Compared with ${first.label}, your monthly spending is ${change >= 0 ? `up` : `down`} **${formatRupees(Math.abs(change))}** (${pct}%).`;
        }

        return {
            reply: `**Spending trend — last ${months.length} months:**\n${lines.join('\n')}${trendNote}`,
            contextUpdates: { lastIntent: 'SPENDING_TREND', lastPeriod: 'current_month' }
        };
    }
};

/* ------------------------------------------------------------------ */
/* Categories & extremes                                               */
/* ------------------------------------------------------------------ */

const GET_TOP_CATEGORY = {
    name: 'GET_TOP_CATEGORY',
    match: (t) => /\b(?:which|what) category\b.*\b(?:most|highest|biggest|more|maximum)\b|\bspend(?:ing)? (?:the )?most\b|\bmost expensive category\b|\btop category\b|\bhighest spending category\b|\bwhere (?:does|is) (?:most of )?(?:my|the) money go(?:es|ing)?\b|\bwhere do i spend the most\b/.test(t)
        ? {} : null,
    handle: async ({ userId, raw }) => {
        const periodParams = await resolvePeriodParams(raw);
        const period = periodParams.period || 'current_month';
        const res = await analytics.getCategoryBreakdown(userId, { period, startDate: periodParams.startDate, endDate: periodParams.endDate });
        if (!res.topCategory) {
            return { reply: `You have no recorded expenses for **${res.periodLabel}**, so I can't identify a top category.` };
        }
        const top3 = res.categories.slice(0, 3).map((c, i) => `${i + 1}. **${c.category}** — ${formatRupees(c.amount)} (${c.percentage}%, ${c.count} txns)`).join('\n');
        return {
            reply: `**${res.topCategory.category}** is your highest spending category in **${res.periodLabel}** with **${formatRupees(res.topCategory.amount)}** (${res.topCategory.percentage}% of your ${formatRupees(res.totalExpense)} total).\n\n**Top categories:**\n${top3}`,
            contextUpdates: { lastIntent: 'GET_TOP_CATEGORY', lastPeriod: period }
        };
    }
};

const GET_MAX_TRANSACTION = {
    name: 'GET_MAX_TRANSACTION',
    match: (t) => {
        if (!/\b(biggest|largest|highest|max|maximum|most expensive|most costly|top)\b/.test(t)) return null;
        if (!/\b(expense|expenses|transaction|transactions|spend|spent|purchase|payment|income|salary|entry|it)\b/.test(t)) return null;
        const type = /\b(income|salary|deposit|credit|received|earning)\b/.test(t) && !/\bexpense\b/.test(t) ? 'INCOME' : 'EXPENSE';
        const months = t.match(/last (\d{1,2}) months?/);
        return {
            type,
            rank: extractRank(t),
            categoryWord: extractCategoryWord(t),
            months: months ? parseInt(months[1], 10) : null
        };
    },
    handle: async ({ userId, params, raw }) => {
        const periodParams = await resolvePeriodParams(raw);
        // Unqualified "biggest expense" means this month, matching the rest of the
        // dashboard; an explicit period or "last N months" overrides it.
        const period = params.months ? null : (periodParams.period || 'current_month');
        let startDate = periodParams.startDate;
        let endDate = periodParams.endDate;
        if (params.months) {
            const { startOfMonthOffset, endOfMonthOffset } = require('../../utils/dateUtil');
            startDate = startOfMonthOffset(-(params.months - 1));
            endDate = endOfMonthOffset(0);
        }

        // Only a category the user named narrows the search (and follow-ups).
        const category = params.categoryWord
            ? await categoryService.resolveCategory(userId, params.categoryWord)
            : null;

        const res = await analytics.getMaxTransaction(userId, {
            rank: params.rank,
            type: params.type,
            category,
            period,
            startDate,
            endDate
        });

        if (!res.found) {
            return {
                reply: `I couldn't find any ${params.type === 'INCOME' ? 'income' : 'expense'} records for that period${period && period !== 'all_time' ? ` (**${res.periodLabel}**)` : ''}. Nothing is recorded${period === 'all_time' ? ' yet' : ' for those dates'}.`,
                contextUpdates: { lastIntent: 'GET_MAX_TRANSACTION', lastPeriod: period || 'all_time' }
            };
        }

        const rankText = params.rank === 1 ? (params.type === 'INCOME' ? 'largest income' : 'biggest expense') : `#${params.rank} largest`;
        const tx = res.transaction;
        return {
            reply: `Your ${rankText} in **${res.periodLabel}** is **${formatRupees(tx.amount)}** for **${tx.category}** ("${tx.description}") on ${tx.formattedDate}.`,
            contextUpdates: {
                lastIntent: 'GET_MAX_TRANSACTION',
                lastRank: params.rank,
                lastPeriod: period || 'all_time',
                lastType: params.type,
                lastCategory: category,
                lastTransaction: tx
            }
        };
    }
};

const GET_MIN_TRANSACTION = {
    name: 'GET_MIN_TRANSACTION',
    match: (t) => /\b(smallest|lowest|minimum|min|least expensive|cheapest)\b/.test(t)
        && /\b(expense|expenses|transaction|transactions|spend|spent|purchase|payment|income|salary|entry)\b/.test(t)
        ? { type: /\bincome\b/.test(t) && !/\bexpense\b/.test(t) ? 'INCOME' : 'EXPENSE', rank: extractRank(t), categoryWord: extractCategoryWord(t) } : null,
    handle: async ({ userId, params, raw }) => {
        const periodParams = await resolvePeriodParams(raw);
        const period = periodParams.period || 'current_month';
        const category = params.categoryWord
            ? await categoryService.resolveCategory(userId, params.categoryWord)
            : null;
        const res = await analytics.getMinTransaction(userId, {
            rank: params.rank,
            type: params.type,
            category,
            period,
            startDate: periodParams.startDate,
            endDate: periodParams.endDate
        });
        if (!res.found) {
            return { reply: `I couldn't find any ${params.type === 'INCOME' ? 'income' : 'expense'} records for **${res.periodLabel}**.` };
        }
        const tx = res.transaction;
        return {
            reply: `Your ${params.rank === 1 ? 'smallest' : `#${params.rank} smallest`} ${params.type === 'INCOME' ? 'income' : 'expense'} in **${res.periodLabel}** is **${formatRupees(tx.amount)}** for **${tx.category}** ("${tx.description}") on ${tx.formattedDate}.`,
            contextUpdates: { lastIntent: 'GET_MIN_TRANSACTION', lastRank: params.rank, lastType: params.type, lastCategory: category, lastPeriod: period, lastTransaction: tx }
        };
    }
};

/* ------------------------------------------------------------------ */
/* Follow-up questions (conversational memory)                         */
/* ------------------------------------------------------------------ */

const FOLLOW_UP_DATE = {
    name: 'FOLLOW_UP_DATE',
    match: (t, raw, ctx) => {
        if (!ctx || !ctx.lastTransaction) return null;
        if (/\bwhen did i (?:make|spend|pay|record|log) (?:it|that)\b/.test(t)
            || /\bwhen was (?:it|that|this)\b/.test(t)
            || /\bwhat date was (?:it|that)\b/.test(t)
            || /\bon what date\b/.test(t)) {
            return { tx: ctx.lastTransaction };
        }
        return null;
    },
    handle: async ({ params }) => {
        const tx = params.tx;
        return {
            reply: `You made that ${formatRupees(tx.amount)} ${tx.type === 'INCOME' ? 'income' : 'expense'} ("${tx.description}", ${tx.category}) on **${tx.formattedDate}**.`,
            contextUpdates: { lastIntent: 'FOLLOW_UP_DATE' }
        };
    }
};

const FOLLOW_UP_CATEGORY = {
    name: 'FOLLOW_UP_CATEGORY',
    match: (t, raw, ctx) => {
        if (!ctx || !ctx.lastTransaction) return null;
        if (/\bwhat category was (?:it|that|this)\b/.test(t) || /\bwhich category was (?:it|that|this)\b/.test(t)) {
            return { tx: ctx.lastTransaction };
        }
        return null;
    },
    handle: async ({ params }) => ({
        reply: `That ${formatRupees(params.tx.amount)} transaction ("${params.tx.description}") was categorized under **${params.tx.category}**.`,
        contextUpdates: { lastIntent: 'FOLLOW_UP_CATEGORY', lastCategory: params.tx.category }
    })
};

const RANK_FOLLOWUP = {
    name: 'RANK_FOLLOWUP',
    match: (t, raw, ctx) => {
        if (!ctx) return null;
        const wantsAnother = /\b(second|third|fourth|fifth|2nd|3rd|4th|5th)\b/.test(t)
            && /\b(highest|largest|biggest|one|expense|transaction)\b/.test(t);
        const nextOne = /\b(next (?:highest|largest|biggest|one))\b/.test(t) || /\banother one\b/.test(t);
        if (!wantsAnother && !nextOne) return null;
        if (!ctx.lastIntent || !['GET_MAX_TRANSACTION', 'GET_MIN_TRANSACTION'].includes(ctx.lastIntent)) return null;
        const rank = wantsAnother ? extractRank(t) : (ctx.lastRank || 1) + 1;
        return { rank, intent: ctx.lastIntent };
    },
    handle: async ({ userId, params, ctx }) => {
        const useMin = params.intent === 'GET_MIN_TRANSACTION';
        const fn = useMin ? analytics.getMinTransaction : analytics.getMaxTransaction;
        const res = await fn(userId, { rank: params.rank, type: ctx.lastType || 'EXPENSE', period: ctx.lastPeriod || 'all_time', category: ctx.lastCategory || null });
        if (!res.found) {
            return { reply: `There is no #${params.rank} ${useMin ? 'smallest' : 'largest'} transaction for **${res.periodLabel}**${ctx.lastCategory ? ` in ${ctx.lastCategory}` : ''} — you have fewer records than that.` };
        }
        const tx = res.transaction;
        const rankText = params.rank === 2 ? 'second' : params.rank === 3 ? 'third' : `#${params.rank}`;
        return {
            reply: `Your **${rankText} ${useMin ? 'smallest' : 'largest'}** ${tx.type === 'INCOME' ? 'income' : 'expense'} in **${res.periodLabel}**${ctx.lastCategory ? ` (category ${ctx.lastCategory})` : ''} is **${formatRupees(tx.amount)}** for **${tx.category}** ("${tx.description}") on ${tx.formattedDate}.`,
            contextUpdates: { lastIntent: params.intent, lastRank: params.rank, lastTransaction: tx }
        };
    }
};

const PERIOD_CATEGORY_SHIFT = {
    name: 'PERIOD_CATEGORY_SHIFT',
    match: (t, raw, ctx) => {
        if (!ctx || !ctx.lastIntent) return null;
        if (!/^(what|how) about\b|^and (?:what|how) about\b|^and (?:this|last) (?:month|week|year)\b|^(?:this|last|previous) (?:month|week|year)$|^what about \w+$/.test(t)) return null;

        const periodExpr = extractPeriodExpression(t);
        const period = periodExpr && periodExpr.kind === 'named' ? periodExpr.period : null;

        // "what about food" — a category word on its own
        let category = null;
        const m = t.match(/^(?:what|how) about (?:my |the )?([a-z]+)$/);
        if (m) category = m[1];
        const categoryWord = category && !['month', 'week', 'year', 'today', 'yesterday', 'it', 'that', 'now', 'then'].includes(category) ? category : null;

        if (!period && !categoryWord) return null;
        return {
            intent: ctx.lastIntent,
            period: period || ctx.lastPeriod,
            categoryWord,
            prevCategory: ctx.lastCategory,
            prevPeriod: ctx.lastPeriod
        };
    },
    handle: async ({ userId, params, ctx }) => {
        const intentName = params.intent;
        let category = ctx.lastCategory;
        if (params.categoryWord) {
            category = await resolveCategoryFromText(userId, params.categoryWord, { requiredAfterOn: false }) || category;
        }
        const period = params.period || 'current_month';

        switch (intentName) {
            case 'GET_MAX_TRANSACTION':
            case 'GET_MIN_TRANSACTION': {
                const useMin = intentName === 'GET_MIN_TRANSACTION';
                const fn = useMin ? analytics.getMinTransaction : analytics.getMaxTransaction;
                const res = await fn(userId, { rank: ctx.lastRank || 1, type: ctx.lastType || 'EXPENSE', period, category });
                if (!res.found) {
                    return { reply: `I couldn't find any expenses in **${res.periodLabel}**${category ? ` for ${category}` : ''}.` };
                }
                const tx = res.transaction;
                return {
                    reply: `Your ${useMin ? 'smallest' : (ctx.lastRank || 1) === 1 ? 'biggest' : `#${ctx.lastRank || 1}`} expense in **${res.periodLabel}**${category ? ` for **${category}**` : ''} is **${formatRupees(tx.amount)}** for **${tx.category}** ("${tx.description}") on ${tx.formattedDate}.`,
                    contextUpdates: { lastIntent: intentName, lastPeriod: period, lastCategory: category, lastTransaction: tx }
                };
            }
            case 'GET_TOTAL_EXPENSE':
            case 'GET_CATEGORY_TOTAL': {
                const res = await analytics.getTotalExpenses(userId, { period, category });
                if (res.count === 0) {
                    return {
                        reply: `You didn't record any expenses${category ? ` for **${category}**` : ''} in **${res.periodLabel}**.`,
                        contextUpdates: { lastIntent: 'GET_TOTAL_EXPENSE', lastPeriod: period, lastCategory: category }
                    };
                }
                return {
                    reply: `You spent **${formatRupees(res.total)}**${category ? ` on **${category}**` : ''} in **${res.periodLabel}**, across ${res.count} transaction${res.count === 1 ? '' : 's'} (average ${formatRupees(res.average)}).`,
                    contextUpdates: { lastIntent: 'GET_TOTAL_EXPENSE', lastPeriod: period, lastCategory: category }
                };
            }
            case 'SAVINGS_QUERY': {
                const balance = await analytics.getBalance(userId, { period });
                return {
                    reply: `For **${balance.periodLabel}**: income ${formatRupees(balance.income)}, expenses ${formatRupees(balance.expenses)}, net cash flow **${formatRupees(balance.balance)}**.`,
                    contextUpdates: { lastIntent: 'SAVINGS_QUERY', lastPeriod: period }
                };
            }
            case 'GET_SAVINGS_GOALS':
                return GET_SAVINGS_GOALS.handle({ userId, params: {} });
            default: {
                const res = await analytics.getTotalExpenses(userId, { period, category });
                if (res.count === 0) {
                    return { reply: `No expenses recorded for **${res.periodLabel}**${category ? ` in ${category}` : ''}.` };
                }
                return {
                    reply: `In **${res.periodLabel}** you spent **${formatRupees(res.total)}**${category ? ` on **${category}**` : ''} (${res.count} transactions, average ${formatRupees(res.average)}).`,
                    contextUpdates: { lastIntent: 'GET_TOTAL_EXPENSE', lastPeriod: period, lastCategory: category }
                };
            }
        }
    }
};

const COMPARE_PREVIOUS = {
    name: 'COMPARE_PREVIOUS',
    match: (t, raw, ctx) => /\bcompare (?:it|that|this) with (?:the )?previous\b|\bcompare with (?:the )?previous\b/.test(t) && ctx
        ? { lastPeriod: ctx.lastPeriod } : null,
    handle: async ({ userId, params }) => {
        // Compare the last-queried month with the month before it
        const period = params.lastPeriod || 'current_month';
        const isPrev = period === 'previous_month' || period === 'last_month';
        const offsetA = isPrev ? -1 : 0;
        const offsetB = isPrev ? -2 : -1;

        return {
            reply: await compareMonthOffsets(userId, offsetA, offsetB),
            contextUpdates: { lastIntent: 'COMPARE_PREVIOUS', lastPeriod: isPrev ? 'previous_month' : 'current_month' }
        };
    }
};

/**
 * Compare two calendar months (relative to the current one) using explicit,
 * timezone-aware month boundaries. offset 0 = this month, -1 = last month, -2 = two months ago.
 */
async function compareMonthOffsets(userId, offsetA, offsetB) {
    const { startOfMonthOffset, endOfMonthOffset } = require('../../utils/dateUtil');
    const [a, b] = await Promise.all([
        analytics.getTotalExpenses(userId, { period: null, startDate: startOfMonthOffset(offsetA), endDate: endOfMonthOffset(offsetA) }),
        analytics.getTotalExpenses(userId, { period: null, startDate: startOfMonthOffset(offsetB), endDate: endOfMonthOffset(offsetB) })
    ]);

    if (a.count === 0 && b.count === 0) {
        return 'No expenses were recorded in either period, so there is nothing to compare.';
    }

    const diff = a.total - b.total;
    const pct = b.total > 0 ? Math.round((Math.abs(diff) / b.total) * 100) : 0;
    const dir = diff > 0 ? 'higher' : diff < 0 ? 'lower' : 'the same as';
    return `**${a.periodLabel}:** ${formatRupees(a.total)} (${a.count} txns)\n**${b.periodLabel}:** ${formatRupees(b.total)} (${b.count} txns)\n\n📊 ${a.periodLabel} spending was **${dir} by ${formatRupees(Math.abs(diff))}**${b.total > 0 ? ` (${pct}%)` : ''}.`;
}

/* ------------------------------------------------------------------ */
/* Averages, search, lists                                             */
/* ------------------------------------------------------------------ */

const GET_AVERAGE_DAILY = {
    name: 'GET_AVERAGE_DAILY',
    match: (t) => /\baverage (?:daily|per[- ]day|day)\b|\bdaily (?:spend|spending|average|expense)\b|\bper day\b/.test(t)
        ? {} : null,
    handle: async ({ userId, raw }) => {
        const periodParams = await resolvePeriodParams(raw);
        const period = periodParams.period || 'current_month';
        const res = await analytics.getDailyAverage(userId, { period, startDate: periodParams.startDate, endDate: periodParams.endDate });
        if (res.count === 0) {
            return { reply: `You have no recorded expenses in **${res.periodLabel}**, so there's no daily average yet.` };
        }
        const elapsedNote = period === 'current_month' ? ` over the ${res.days} day${res.days === 1 ? '' : 's'} so far this month` : ` across ${res.days} day${res.days === 1 ? '' : 's'}`;
        return {
            reply: `Your average daily spending in **${res.periodLabel}** is **${formatRupees(res.average)} per day** — total ${formatRupees(res.total)}${elapsedNote}.`,
            contextUpdates: { lastIntent: 'GET_AVERAGE_DAILY', lastPeriod: period }
        };
    }
};

const GET_AVERAGE_EXPENSE = {
    name: 'GET_AVERAGE_EXPENSE',
    match: (t) => /\baverage\b/.test(t) && /\b(expense|transaction|spend|spending|purchase|payment)\b/.test(t)
        ? { categoryWord: extractCategoryWord(t) } : null,
    handle: async ({ userId, params, raw }) => {
        const periodParams = await resolvePeriodParams(raw);
        const period = periodParams.period || 'current_month';
        const category = params.categoryWord ? await resolveCategoryFromText(userId, raw) : null;
        const res = await analytics.getTotalExpenses(userId, { period, category, startDate: periodParams.startDate, endDate: periodParams.endDate });
        if (res.count === 0) {
            return { reply: `No expenses recorded${category ? ` for ${category}` : ''} in **${res.periodLabel}** to average.` };
        }
        return {
            reply: `Your average expense${category ? ` in **${category}**` : ''} for **${res.periodLabel}** is **${formatRupees(res.average)} per transaction** (total ${formatRupees(res.total)} across ${res.count} transactions).`,
            contextUpdates: { lastIntent: 'GET_AVERAGE_EXPENSE', lastPeriod: period, lastCategory: category }
        };
    }
};

const SEARCH_TRANSACTIONS = {
    name: 'SEARCH_TRANSACTIONS',
    match: (t) => {
        const above = t.match(/\b(above|over|greater than|more than|exceeding|at least|minimum of)\s*(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d+)?)/);
        const below = t.match(/\b(below|under|less than|at most|maximum of)\s*(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d+)?)/);
        const merchant = extractMerchant(t);
        if (!above && !below && !merchant) return null;
        // avoid matching add/delete commands
        if (/\b(add|log|record|delete|remove|edit|budget)\b/.test(t)) return null;

        const minAmount = above ? Number(above[2].replace(/,/g, '')) : undefined;
        const maxAmount = below ? Number(below[2].replace(/,/g, '')) : undefined;
        return { minAmount, maxAmount, search: merchant, limit: extractCount(t, 20) || 20 };
    },
    handle: async ({ userId, params, raw }) => {
        const periodParams = await resolvePeriodParams(raw);
        const list = await analytics.getRecentTransactions(userId, {
            limit: params.limit,
            minAmount: params.minAmount,
            maxAmount: params.maxAmount,
            search: params.search,
            period: periodParams.period || 'all_time',
            startDate: periodParams.startDate,
            endDate: periodParams.endDate
        });
        if (list.length === 0) {
            const criteria = [
                params.minAmount !== undefined ? `at least ${formatRupees(params.minAmount)}` : null,
                params.maxAmount !== undefined ? `at most ${formatRupees(params.maxAmount)}` : null,
                params.search ? `from ${params.search}` : null
            ].filter(Boolean).join(' and ');
            return { reply: `I found no transactions ${criteria}.` };
        }
        const criteria = [
            params.minAmount !== undefined ? `above ${formatRupees(params.minAmount)}` : null,
            params.maxAmount !== undefined ? `below ${formatRupees(params.maxAmount)}` : null,
            params.search ? `from ${params.search}` : null
        ].filter(Boolean).join(' and ');
        return {
            reply: `Found **${list.length} transaction${list.length === 1 ? '' : 's'}** ${criteria}:\n\n${list.map((tx, i) => txnLine(tx, i + 1)).join('\n')}`,
            contextUpdates: { lastIntent: 'SEARCH_TRANSACTIONS', lastTransaction: list[0], lastTransactionsList: list.slice(0, 10) }
        };
    }
};

const GET_RECENT_TRANSACTIONS = {
    name: 'GET_RECENT_TRANSACTIONS',
    match: (t) => /\b(?:show|list|display|see|view|give me)\b.*\btransactions?\b|\brecent transactions\b|\blast \d+ transactions\b|\btransaction history\b|\bmy transactions\b|\bshow my expenses\b/.test(t)
        ? { limit: extractCount(t, 5), categoryWord: extractCategoryWord(t) } : null,
    handle: async ({ userId, params, raw }) => {
        const periodParams = await resolvePeriodParams(raw);
        const category = params.categoryWord ? await resolveCategoryFromText(userId, raw) : null;
        const list = await analytics.getRecentTransactions(userId, {
            limit: params.limit || 5,
            category,
            period: periodParams.period && periodParams.period !== 'today' ? periodParams.period : 'all_time',
            startDate: periodParams.startDate,
            endDate: periodParams.endDate
        });
        if (list.length === 0) {
            return { reply: `You don't have any recorded transactions${category ? ` for ${category}` : ''} yet. Add one with *"Add ₹250 for lunch today"*!` };
        }
        const periodText = periodParams.period && periodParams.period !== 'all_time' ? ` in ${periodParams.period.replace(/_/g, ' ')}` : '';
        return {
            reply: `Here are your **last ${list.length} transaction${list.length === 1 ? '' : 's'}**${periodText}:\n\n${list.map((tx, i) => txnLine(tx, i + 1)).join('\n')}`,
            contextUpdates: { lastIntent: 'GET_RECENT_TRANSACTIONS', lastTransaction: list[0], lastTransactionsList: list.slice(0, 10), lastCategory: category }
        };
    }
};

/* ------------------------------------------------------------------ */
/* Balance, income, totals                                             */
/* ------------------------------------------------------------------ */

const GET_BALANCE = {
    name: 'GET_BALANCE',
    match: (t) => /\bbalance\b|\bhow much money do i have\b|\bhow much (?:do i|have i|is)\s+(?:have\s+)?left\b|\bnet (?:balance|worth|cash flow)\b|\bavailable (?:money|balance|funds)\b|\bincome minus expenses?\b/.test(t)
        ? {} : null,
    handle: async ({ userId, raw }) => {
        const periodParams = await resolvePeriodParams(raw);
        const period = periodParams.period || 'current_month';
        const res = await analytics.getBalance(userId, { period, startDate: periodParams.startDate, endDate: periodParams.endDate });
        const savingsText = res.savings > 0 ? ` (savings rate ${res.savingsPercentage}%)` : '';
        return {
            reply: `**${res.periodLabel}:**\n• Income: **${formatRupees(res.income)}**\n• Expenses: **${formatRupees(res.expenses)}**\n• **Net balance: ${formatRupees(res.balance)}**${savingsText}\n\nWant details? Ask *"how much did I spend this month"* or *"what's my biggest expense"*.`,
            contextUpdates: { lastIntent: 'GET_BALANCE', lastPeriod: period }
        };
    }
};

const GET_TOTAL_INCOME = {
    name: 'GET_TOTAL_INCOME',
    match: (t) => /\b(?:total |my |monthly )?(?:income|salary|earnings)\b/.test(t)
        || /\bhow much (?:did i|do i|have i) (?:earn|make|receive[d]?|get paid)\b/.test(t)
        ? {} : null,
    handle: async ({ userId, raw }) => {
        const periodParams = await resolvePeriodParams(raw);
        const period = periodParams.period || 'current_month';
        const res = await analytics.getTotalIncome(userId, { period, startDate: periodParams.startDate, endDate: periodParams.endDate });
        if (res.total === 0) {
            return {
                reply: `You haven't recorded any income for **${res.periodLabel}**. You can add income transactions or set your monthly income on the **Income** page.`,
                contextUpdates: { lastIntent: 'GET_TOTAL_INCOME', lastPeriod: period }
            };
        }
        return {
            reply: `Your total recorded income for **${res.periodLabel}** is **${formatRupees(res.total)}**${res.count === 1 && period === 'current_month' ? ' (from your monthly income setting)' : ''}.`,
            contextUpdates: { lastIntent: 'GET_TOTAL_INCOME', lastPeriod: period }
        };
    }
};

const GET_CATEGORY_TOTAL = {
    name: 'GET_CATEGORY_TOTAL',
    match: (t) => {
        if (!/\b(spend|spent|spending|expense|expenses|cost|paid|pay|used|use)\b/.test(t)) return null;
        // Only a category-scoped question belongs here; "how much did I spend this
        // month?" (no category) must fall through to GET_TOTAL_EXPENSE.
        const categoryWord = extractCategoryWord(t);
        if (!categoryWord) return null;
        return { categoryWord };
    },
    handle: async ({ userId, params, raw }) => {
        const category = await resolveCategoryFromText(userId, raw);
        if (!category) {
            const known = (await require('../categoryService').listCategories(userId)).map(c => c.name).join(', ');
            return { reply: `Which category would you like me to check? Your categories: ${known}` };
        }
        const periodParams = await resolvePeriodParams(raw);
        const period = periodParams.period || 'current_month';
        const res = await analytics.getTotalExpenses(userId, { period, category, startDate: periodParams.startDate, endDate: periodParams.endDate });
        if (res.count === 0) {
            return {
                reply: `You haven't recorded any spending on **${category}** in **${res.periodLabel}**.`,
                contextUpdates: { lastIntent: 'GET_CATEGORY_TOTAL', lastCategory: category, lastPeriod: period }
            };
        }
        return {
            reply: `You spent **${formatRupees(res.total)}** on **${category}** in **${res.periodLabel}** — ${res.count} transaction${res.count === 1 ? '' : 's'}, average ${formatRupees(res.average)} each.`,
            contextUpdates: { lastIntent: 'GET_CATEGORY_TOTAL', lastCategory: category, lastPeriod: period }
        };
    }
};

const GET_TOTAL_EXPENSE = {
    name: 'GET_TOTAL_EXPENSE',
    match: (t) => /\bspend|spent|spending|expenses?\b|\bexpenditure\b|\bhow much did (?:i|it) cost\b|\bhow much have i paid\b/.test(t)
        ? {} : null,
    handle: async ({ userId, params, raw }) => {
        const periodParams = await resolvePeriodParams(raw);
        const period = periodParams.period || 'current_month';
        const res = await analytics.getTotalExpenses(userId, {
            period,
            startDate: periodParams.startDate,
            endDate: periodParams.endDate,
            label: periodParams.label
        });
        if (res.count === 0) {
            return {
                reply: `You haven't recorded any expenses in **${res.periodLabel}**. Add one with *"Add ₹250 for lunch today"*!`,
                contextUpdates: { lastIntent: 'GET_TOTAL_EXPENSE', lastPeriod: period }
            };
        }
        return {
            reply: `You spent **${formatRupees(res.total)}** in **${res.periodLabel}** — across ${res.count} transaction${res.count === 1 ? '' : 's'} (average ${formatRupees(res.average)} per transaction).`,
            contextUpdates: { lastIntent: 'GET_TOTAL_EXPENSE', lastPeriod: period, lastCategory: null }
        };
    }
};

const GET_LOANS = {
    name: 'GET_LOANS',
    match: (t) => /\bloans?\b|\bi owe\b|\bowed?\b|\blent\b|\bborrowed?\b|\bdebts?\b|\bmoney (?:i )?(?:lent|borrowed)\b/.test(t)
        ? {} : null,
    handle: async ({ userId }) => {
        const data = await analytics.getLoansData(userId);
        if (data.loans.length === 0) {
            return { reply: "You have no loan, lent, or borrowed money records. You can add them on the **Loans** page." };
        }
        const items = data.loans.map((l, i) => `${i + 1}. **${l.personName}** (${l.type === 'LENT' ? 'owes you' : 'you owe'}): ${formatRupees(l.remainingAmount)} of ${formatRupees(l.originalAmount)} | ${l.status}${l.dueDate ? ` | due ${l.dueDate}` : ''}`).join('\n');
        return {
            reply: `**Loans & debts summary:**\n• Total you'll receive (money lent): **${formatRupees(data.totalReceive)}**\n• Total you owe (borrowed): **${formatRupees(data.totalOwe)}**\n\n**Active records:**\n${items}`
        };
    }
};

module.exports = {
    intents: [
        GET_SAVINGS_GOALS,
        SAVINGS_QUERY,
        SPENDING_TOO_MUCH,
        CUT_DOWN_ADVICE,
        COMPARE_PREVIOUS,
        COMPARE_PERIODS,
        SPENDING_TREND,
        GET_TOP_CATEGORY,
        GET_MAX_TRANSACTION,
        GET_MIN_TRANSACTION,
        FOLLOW_UP_DATE,
        FOLLOW_UP_CATEGORY,
        RANK_FOLLOWUP,
        PERIOD_CATEGORY_SHIFT,
        GET_AVERAGE_DAILY,
        GET_AVERAGE_EXPENSE,
        SEARCH_TRANSACTIONS,
        GET_RECENT_TRANSACTIONS,
        GET_BALANCE,
        GET_TOTAL_INCOME,
        GET_CATEGORY_TOTAL,
        GET_TOTAL_EXPENSE,
        GET_LOANS
    ]
};
