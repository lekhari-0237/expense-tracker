'use strict';

/**
 * ACTION INTENTS — commands that create, modify or delete data,
 * plus conversational intents. Ordered by specificity: the engine
 * tries them in order and uses the first match.
 */

const Transaction = require('../../models/Transaction');
const budgetService = require('../budgetService');
const billService = require('../billService');
const categoryService = require('../categoryService');
const dataResetService = require('../dataResetService');
const { startOfDayOffset, formatLongDate, formatDate, resolvePeriod } = require('../../utils/dateUtil');
const {
    normalize,
    extractAmount,
    extractPercent,
    extractRelativeDate,
    extractPaymentMethod,
    extractMerchant,
    extractFormat,
    extractFrequency,
    extractDayOfMonth,
    extractNote,
    extractCategoryWord
} = require('./entityExtractor');
const {
    formatRupees,
    resolvePeriodParams,
    resolveCategoryFromText,
    getLatestTransaction,
    extractDescriptionCandidate,
    titleCase,
    txnLine,
    contextService,
    analytics
} = require('./shared');

const isYes = (t) => /^(yes|y|yeah|yep|sure|confirm|confirmed|do it|go ahead|ok|okay|proceed|approve)\b/.test(t);
const isNo = (t) => /^(no|n|nope|cancel|stop|never ?mind|abort|dont|don't|do not)\b/.test(t);
const isSkip = (t) => /^(skip|none|no|nah|not really|later|nothing|n)\b/.test(t);

/* ------------------------------------------------------------------ */
/* Conversational                                                      */
/* ------------------------------------------------------------------ */

const GREETING = {
    name: 'GREETING',
    match: (t) => /^(hi+|hello+|hey+|yo|namaste|hola|good (morning|afternoon|evening)|sup|greetings)[\s!]*$/.test(t) ? {} : null,
    handle: async () => ({
        reply: "Hello! I'm **ExpenseBot**, your finance assistant. I can log expenses, answer questions about your spending, manage budgets, bills, categories and savings goals — all using your real data.\n\nTry: *\"Add ₹250 for lunch today\"*, *\"How much did I spend this month?\"* or *\"Set a monthly budget of ₹20,000\"*."
    })
};

const THANKS = {
    name: 'THANKS',
    match: (t) => /^(thanks?|thank you|thankyou|thx|ty|great thanks|awesome|perfect)[\s!]*$/.test(t) ? {} : null,
    handle: async () => ({ reply: "You're welcome! Let me know if you'd like more insights into your expenses or help logging transactions." })
};

const CAPABILITIES = {
    name: 'CAPABILITIES',
    match: (t) => /what can you do|help me|who are you|^help$|your (features|capabilities)|what do you do|how do you work/.test(t) ? {} : null,
    handle: async () => ({
        reply: "Here's what I can do with your real financial data:\n" +
            "• **Log & manage expenses:** *\"Add ₹250 for lunch today\"*, *\"Delete my last expense\"*, *\"Edit the amount of my last expense to ₹300\"*\n" +
            "• **Spending analysis:** *\"How much did I spend this month?\"*, *\"What was my biggest expense?\"*, *\"Show my last 10 transactions\"*, *\"Show transactions above ₹5,000\"*\n" +
            "• **Budgets:** *\"Set a monthly budget of ₹20,000\"*, *\"How much of my budget is left?\"*, *\"Alert me when I cross 80% of my budget\"*\n" +
            "• **Categories:** *\"Show all my categories\"*, *\"Create a category called Pets\"*\n" +
            "• **Bills & reminders:** *\"Add a recurring expense of ₹499 for Netflix every month\"*, *\"What bills are overdue?\"*, *\"Mark my electricity bill as paid\"*\n" +
            "• **Insights:** *\"Compare this month with last month\"*, *\"Show my spending trend for the last 6 months\"*, *\"Where can I cut down expenses?\"*\n" +
            "• **Goals, loans & reports:** *\"List my saving goals\"*, *\"How much do I owe?\"*, *\"Export my expenses as Excel/PDF\"*\n\n" +
            "You can also ask follow-ups like *\"When did I make it?\"* or *\"What about last month?\"*"
    })
};

const CANCEL = {
    name: 'CANCEL',
    match: (t) => /^(cancel|stop|never ?mind|forget it|abort|close)[\s!]*$/.test(t) ? {} : null,
    handle: async ({ userId }) => {
        await contextService.clearPendingAction(userId);
        return { reply: "Okay, I've cancelled that. Is there anything else I can help you with?" };
    }
};

/* ------------------------------------------------------------------ */
/* Add transaction                                                     */
/* ------------------------------------------------------------------ */

const ADD_TRANSACTION = {
    name: 'ADD_TRANSACTION',
    match: (t, raw) => {
        // Recurring/subscription wording belongs to ADD_RECURRING (a schedule, not an expense)
        if (/\brecurring\b|\bsubscription\b|\bevery (?:month|week|year)\b|\bmonthly\b|\bweekly\b|\byearly\b|\bremind me\b/i.test(t)) return null;
        const addVerb = /\b(add|log|record|track|save|put in|note down)\b/.test(t) && /\b(expense|transaction|income|spent|spend|payment|purchase|bill of|amount)\b/.test(t)
            || /^(i\s+)?(spent|spend|paid|pay)\b/.test(t) && extractAmount(t) !== null;
        const withAmount = /\b(add|log|record|track)\b/.test(t) && extractAmount(t) !== null && !/budget|category|recurring|subscription|reminder/i.test(t);
        if (!addVerb && !withAmount) return null;

        const amount = extractAmount(t, { allowBare: true });
        const relDate = extractRelativeDate(t);
        const type = /\bincome\b|\bsalary\b|\breceived\b|\bcredit\b/.test(t) && !/\bexpense\b/.test(t) ? 'INCOME' : 'EXPENSE';
        return {
            amount,
            type,
            categoryWord: extractCategoryWord(t),
            date: relDate ? relDate.date : null,
            dateLabel: relDate ? relDate.label : null,
            merchant: extractMerchant(t),
            paymentMethod: extractPaymentMethod(t),
            note: extractNote(raw) || extractNote(t) || null,
            bare: amount === null
        };
    },
    handle: async ({ userId, params, raw }) => {
        const t = normalize(raw);
        const description = extractDescriptionCandidate(t, params.merchant, params.categoryWord);
        const category = params.categoryWord ? await categoryService.resolveCategory(userId, params.categoryWord) : null;

        const collected = {
            amount: params.amount,
            type: params.type || 'EXPENSE',
            category,
            categoryWord: params.categoryWord || null,
            description,
            date: params.date,
            dateLabel: params.dateLabel,
            paymentMethod: params.paymentMethod,
            note: params.note,
            merchant: params.merchant
        };

        // Guided multi-turn flow when required fields are missing; a complete
        // command (amount + category known) executes immediately.
        const dialogMode = collected.amount === null || collected.amount <= 0 || !collected.category;
        return await advanceAddTransaction(userId, collected, { dialogMode });
    }
};

/**
 * State machine for the add-transaction conversation: asks only for what is
 * missing, in the order amount -> category -> date -> payment method -> note,
 * preserving everything already collected. Executes once complete.
 */
async function advanceAddTransaction(userId, collected, { dialogMode = false } = {}) {
    if (collected.amount === null || collected.amount === undefined || collected.amount <= 0) {
        await contextService.setPendingAction(userId, {
            type: 'ADD_TRANSACTION',
            collected: { ...collected, dialogMode },
            awaiting: 'amount'
        });
        return { reply: "Sure — what was the amount? (e.g. *₹250*)" };
    }

    if (!collected.category) {
        const known = (await categoryService.listCategories(userId)).map(c => c.name).join(', ');
        await contextService.setPendingAction(userId, {
            type: 'ADD_TRANSACTION',
            collected: { ...collected, dialogMode },
            awaiting: 'category'
        });
        return { reply: `Which category does it belong to? Your categories: ${known}\n(You can also say *"create category <name>"* to add a new one, or *cancel*.)` };
    }

    if (dialogMode) {
        if (!collected.date && !collected.dateResolved) {
            await contextService.setPendingAction(userId, {
                type: 'ADD_TRANSACTION',
                collected: { ...collected, dialogMode },
                awaiting: 'date'
            });
            return { reply: `When was this ${collected.type === 'INCOME' ? 'income' : 'expense'}? Reply *today*, *yesterday*, a date like *2026-10-14* — or **skip** to record it for today.` };
        }
        if (!collected.paymentMethod && !collected.paymentResolved) {
            await contextService.setPendingAction(userId, {
                type: 'ADD_TRANSACTION',
                collected: { ...collected, dialogMode },
                awaiting: 'paymentMethod'
            });
            return { reply: 'How did you pay? Reply *UPI*, *Cash*, *Card*, *Net Banking* or *Wallet* — or **skip** if you don’t want to record it.' };
        }
        if ((collected.note === null || collected.note === undefined) && !collected.noteResolved) {
            await contextService.setPendingAction(userId, {
                type: 'ADD_TRANSACTION',
                collected: { ...collected, dialogMode },
                awaiting: 'note'
            });
            return { reply: 'Want to add a short note for this entry? Reply with the note — or **skip**.' };
        }
    }

    return await executeAddTransaction(userId, collected);
}

async function executeAddTransaction(userId, collected) {
    const date = collected.date || startOfDayOffset(0);
    if (isNaN(date.getTime())) {
        return { reply: "That date didn't look valid. Please give me a date like *today*, *yesterday*, or *2026-10-14*." };
    }

    const created = await Transaction.create({
        user: userId,
        amount: collected.amount,
        category: collected.category,
        date,
        description: collected.description ? titleCase(collected.description) : collected.category,
        merchant: collected.merchant ? titleCase(collected.merchant) : '',
        type: collected.type || 'EXPENSE',
        source: 'manual',
        paymentMethod: collected.paymentMethod || '',
        notes: collected.note || ''
    });

    const amountText = `${collected.type === 'INCOME' ? 'income' : 'expense'} of **${formatRupees(created.amount)}**`;
    const dateText = collected.date ? ` on **${formatLongDate(date)}**` : ' for **today**';
    const viaText = created.paymentMethod ? `, paid via **${created.paymentMethod}**` : '';
    const noteText = created.notes ? `\n📝 Note: ${created.notes}` : '';

    return {
        reply: `✅ Added ${amountText} under **${created.category}** ("${created.description}")${dateText}${viaText}.${noteText}`,
        refreshData: true,
        contextUpdates: {
            lastIntent: 'ADD_TRANSACTION',
            lastTransaction: {
                id: created._id,
                amount: created.amount,
                category: created.category,
                description: created.description,
                date: formatDate(created.date),
                formattedDate: formatLongDate(created.date),
                type: created.type,
                source: created.source
            }
        }
    };
}

/* ------------------------------------------------------------------ */
/* Delete transaction (with confirmation)                              */
/* ------------------------------------------------------------------ */

const DELETE_TRANSACTION = {
    name: 'DELETE_TRANSACTION',
    match: (t) => {
        const m = /\b(delete|remove|erase)\b/.test(t)
            && /\b(expense|expenses|transaction|transactions|entry|record|it|income)\b/.test(t)
            && !/\b(all|every|data|everything|history|account)\b/.test(t);
        if (!m) return null;
        const type = /\bincome\b/.test(t) && !/\bexpense\b/.test(t) ? 'INCOME' : 'EXPENSE';
        return { type };
    },
    handle: async ({ userId, params, ctx, raw }) => {
        const t = normalize(raw);
        let target = /\b(it|that|that one|this)\b/.test(t) && ctx.lastTransaction ? ctx.lastTransaction : null;
        const wantedCategory = target ? null : await resolveCategoryFromText(userId, raw);
        const wantedAmount = target ? null : extractAmount(raw);

        if (!target) {
            target = await getLatestTransaction(userId, params.type, {
                category: wantedCategory,
                amount: wantedAmount
            });
        }

        if (!target) {
            if (wantedCategory || wantedAmount !== null) {
                const asked = [wantedAmount !== null ? formatRupees(wantedAmount) : null, wantedCategory].filter(Boolean).join(' ');
                return { reply: `I couldn't find your ${asked} ${params.type === 'INCOME' ? 'income' : 'expense'} to delete. Say *"show my last transactions"* to see what you have.` };
            }
            return { reply: `I couldn't find any recorded ${params.type === 'INCOME' ? 'income' : 'expense'} to delete. Add one first!` };
        }

        await contextService.setPendingAction(userId, {
            type: 'CONFIRM_DELETE',
            awaiting: 'confirmation',
            target
        });

        const typeName = target.type === 'INCOME' ? 'income' : 'expense';
        const foundLabel = wantedCategory || wantedAmount !== null ? 'I found this' : 'I found your latest';
        return {
            reply: `${foundLabel} ${typeName}:\n\n${txnLine(target, 1).replace(/^\d+\.\s*/, '')}\n\n⚠️ **Delete it permanently?** Reply **yes** to confirm or **no** to cancel. (yes/no)`
        };
    }
};

/* ------------------------------------------------------------------ */
/* Edit transaction                                                    */
/* ------------------------------------------------------------------ */

const EDIT_TRANSACTION = {
    name: 'EDIT_TRANSACTION',
    match: (t) => {
        if (!/\b(edit|update|change|modify)\b/.test(t)) return null;
        // "change that to 700" continues from the stored conversation context — the
        // target is the user's own last transaction, never an id from the message.
        const refersToContext = /\b(it|that|that one|this one|last one|previous one)\b/.test(t)
            && !/^(what|how|why|when|who|is|are|can|could|should|do|did)\b/.test(t);
        if (!refersToContext && !/\b(amount|category|date|description|note|payment method|expense|transaction|entry|record)\b/.test(t)) return null;
        if (/\bbudget\b/.test(t)) return null;

        const newAmount = extractAmount(t, { allowBare: true });
        const relDate = extractRelativeDate(t);
        const fieldMatch = t.match(/\b(amount|category|date|description|note)\b/);
        let field = fieldMatch ? fieldMatch[1] : null;
        if (newAmount !== null && (!field || field === 'amount' || /to\s+(?:₹|rs|inr)?\s*[\d,]/.test(t))) field = 'amount';
        else if (relDate && (!field || field === 'date')) field = 'date';
        else if (/category/.test(t)) field = 'category';
        else if (/description|note/.test(t)) field = 'description';
        else if (newAmount !== null) field = 'amount';
        if (!field) return null;

        return { field, newAmount, newDate: relDate ? relDate.date : null };
    },
    handle: async ({ userId, params, ctx, raw }) => {
        // Target: referenced transaction ("it"/"that"), the one named by category
        // ("change the groceries expense to 1500"), else the latest expense.
        const t = normalize(raw);
        let target = /\b(it|that|that one)\b/.test(t) && ctx.lastTransaction ? ctx.lastTransaction : null;
        const wantedCategory = target || params.field === 'category'
            ? null
            : await resolveCategoryFromText(userId, raw);
        if (!target) {
            target = await getLatestTransaction(userId, 'EXPENSE', { category: wantedCategory });
        }

        if (!target) {
            return {
                reply: wantedCategory
                    ? `I couldn't find one of your **${wantedCategory}** expenses to edit. Say *"show my last transactions"* to see what you have.`
                    : "I couldn't find any recorded expense to edit. Add one first!"
            };
        }

        const update = {};
        if (params.field === 'amount') {
            if (params.newAmount === null || params.newAmount <= 0) {
                return { reply: "What should the new amount be? (e.g. *₹300*)" };
            }
            update.amount = params.newAmount;
        } else if (params.field === 'date') {
            if (!params.newDate) {
                return { reply: "What should the new date be? (e.g. *today* or *2026-10-14*)" };
            }
            update.date = params.newDate;
        } else if (params.field === 'category') {
            const newCat = await resolveCategoryFromText(userId, raw);
            if (!newCat) return { reply: "Which category should I change it to?" };
            update.category = newCat;
        } else if (params.field === 'description') {
            const note = extractNote(raw);
            if (!note) return { reply: "What should the new description be?" };
            update.description = note;
        }

        // Atomic, ownership-checked update; original preserved if this fails
        const updated = await Transaction.findOneAndUpdate(
            { _id: target.id, user: userId },
            { $set: update },
            { new: true, runValidators: true }
        );
        if (!updated) {
            return { reply: "I couldn't update that transaction — it may have already been deleted. Nothing was changed." };
        }

        const beforeText = params.field === 'amount' ? formatRupees(target.amount)
            : params.field === 'date' ? target.formattedDate
                : params.field === 'category' ? target.category : target.description;
        const afterText = params.field === 'amount' ? formatRupees(updated.amount)
            : params.field === 'date' ? formatLongDate(updated.date)
                : params.field === 'category' ? updated.category : updated.description;

        return {
            reply: `✏️ Updated the **${params.field}** of your ${target.type === 'INCOME' ? 'income' : 'expense'} ("${target.description}") from **${beforeText}** to **${afterText}**. All other details are unchanged.`,
            refreshData: true,
            contextUpdates: {
                lastIntent: 'EDIT_TRANSACTION',
                lastTransaction: {
                    id: updated._id,
                    amount: updated.amount,
                    category: updated.category,
                    description: updated.description,
                    date: formatDate(updated.date),
                    formattedDate: formatLongDate(updated.date),
                    type: updated.type,
                    source: updated.source
                }
            }
        };
    }
};

/* ------------------------------------------------------------------ */
/* Budgets                                                             */
/* ------------------------------------------------------------------ */

const SET_BUDGET = {
    name: 'SET_BUDGET',
    match: (t) => {
        // "did I set a budget?" is a question, not a command -> GET_BUDGET_STATUS
        if (/^(did|do|does|have|has|am|is|are|was|when|why|what|how|which|no|not)\b/.test(t)) return null;
        if (!/\b(set|create|make|define|fix|assign|give)\b/.test(t)) return null;
        if (!/\bbudget\b|\blimit\b/.test(t)) return null;
        const amount = extractAmount(t, { allowBare: true });
        const period = /\b(weekly|per week)\b/.test(t) ? 'weekly' : (/\b(yearly|annual|per year)\b/.test(t) ? 'yearly' : 'monthly');
        const categoryWord = extractCategoryWord(t);
        return { amount, period, categoryWord };
    },
    handle: async ({ userId, params, raw }) => {
        return await advanceSetBudget(userId, {
            amount: params.amount,
            period: params.period,
            categoryWord: params.categoryWord,
            // "set a Food budget of ₹1,000" names the category without a preposition
            categoryFromText: params.categoryWord ? null : await resolveCategoryFromText(userId, raw)
        });
    }
};

/**
 * Create/update a budget, asking one at a time for a missing amount or an
 * unresolvable category.
 */
async function advanceSetBudget(userId, collected) {
    if (collected.amount === null || collected.amount === undefined || collected.amount <= 0) {
        await contextService.setPendingAction(userId, {
            type: 'SET_BUDGET',
            collected,
            awaiting: 'amount'
        });
        return { reply: `Sure — what ${collected.categoryWord ? `${collected.categoryWord} budget` : 'monthly budget'} amount should I set? (e.g. *₹20,000*, or *cancel*.)` };
    }

    let category = null;
    if (collected.categoryWord) {
        category = await categoryService.resolveCategory(userId, collected.categoryWord);
        if (!category) {
            await contextService.setPendingAction(userId, {
                type: 'SET_BUDGET',
                collected: { ...collected, categoryWord: null },
                awaiting: 'category'
            });
            return { reply: `I don't have a category called "${collected.categoryWord}". Which category is this budget for? (e.g. Food, Transport, Entertainment — or say *"overall"* for the general budget, or *cancel*.)` };
        }
    } else if (collected.categoryFromText) {
        category = collected.categoryFromText;
    }

    const { budget, created } = await budgetService.setBudget(userId, {
        category,
        amount: collected.amount,
        period: collected.period || 'monthly'
    });

    const label = category ? `**${category}** category budget` : '**overall monthly budget**';
    const alertNote = `\n\n💡 I'll alert you (in your Notifications) when you cross **${Math.round((budget.alertThreshold || 0.8) * 100)}%** of it.`;
    return {
        reply: `${created ? '✅ Created' : '🔁 Updated'} your ${label} for ${budget.month}/${budget.year}: **${formatRupees(budget.amount)}** (${budget.period}).${alertNote}`,
        refreshData: true,
        contextUpdates: { lastIntent: 'SET_BUDGET', lastCategory: category }
    };
}

const SET_BUDGET_ALERT = {
    name: 'SET_BUDGET_ALERT',
    match: (t) => {
        if (/^(did|do|does|have|has|am|is|are|was|when|why|what|how|which|no|not)\b/.test(t)) return null;
        if (!/\b(alert|notify|warn|remind)\b/.test(t)) return null;
        if (!/\b(budget|limit|threshold)\b/.test(t)) return null;
        if (!/\b(cross|reach|exceed|hit|go over|over|when)\b/.test(t)) return null;
        return { threshold: extractPercent(t) || 0.8, categoryWord: extractCategoryWord(t) };
    },
    handle: async ({ userId, params }) => {
        let category = null;
        if (params.categoryWord) {
            category = await categoryService.resolveCategory(userId, params.categoryWord);
        }
        const result = await budgetService.setAlertThreshold(userId, { category, threshold: params.threshold });
        if ((result.matchedCount || 0) === 0) {
            return { reply: `I couldn't find ${category ? `a ${category} budget` : 'any budget'} to attach this alert to. Set one first — e.g. *"Set a monthly budget of ₹20,000"* — then I'll alert you at ${Math.round(params.threshold * 100)}%.` };
        }
        return {
            reply: `🔔 Got it — I'll flag an alert in your **Notifications** when your ${category ? `**${category}** ` : ''}spending crosses **${Math.round(params.threshold * 100)}%** of your budget.\n\nHow it works: the check runs whenever your budget status is calculated (when you ask about budgets or after new expenses), and it fires **once per crossing** — not on every message.`,
            refreshData: true
        };
    }
};

const GET_BUDGET_STATUS = {
    name: 'GET_BUDGET_STATUS',
    match: (t) => {
        const budgetWord = /\bbudget\b/.test(t);
        const overspending = /\b(overspend(ing)?|over budget|exceed(ed)? (my )?budget|over the limit)\b/.test(t);
        if (!budgetWord && !overspending) return null;
        // "set a budget" / "alert me" are handled by earlier intents
        if (/\b(set|create|make|define|alert|notify|warn)\b/.test(t)) return null;
        if (!/\b(left|remain(ing|s)?|status|how much|used|usage|progress|overspend|exceed|over|am i|did i)\b/.test(t) && !overspending) return null;
        const categoryWord = /\b(on|for)\s+([a-z]{3,})/.test(t) && !overspending ? extractCategoryWord(t) : null;
        return { categoryWord };
    },
    handle: async ({ userId, params }) => {
        const status = await budgetService.getBudgetStatus(userId);

        if (!status.hasBudgets) {
            const spent = await analytics.getTotalExpenses(userId, { period: 'current_month' });
            return {
                reply: `You haven't set any budget for this month yet, so I can't say whether you're overspending.\n\nSo far this month you've spent **${formatRupees(spent.total)}** across ${spent.count} transaction${spent.count === 1 ? '' : 's'}.\n\nWant me to set one? Try *"Set a monthly budget of ₹20,000"* or *"Set a ₹3,000 limit for entertainment"*.`,
                contextUpdates: { lastIntent: 'GET_BUDGET_STATUS', lastPeriod: 'current_month' }
            };
        }

        let focus = null;
        if (params.categoryWord) {
            const cat = await categoryService.resolveCategory(userId, params.categoryWord);
            if (cat) focus = status.categoryStatuses.find(s => (s.category || '').toLowerCase() === cat.toLowerCase()) || null;
        }

        const lines = [];
        const fmt = (s) => {
            const pct = s.percentUsed;
            const icon = s.exceeded ? '🔴' : pct >= (s.alertThreshold || 0.8) * 100 ? '🟠' : '🟢';
            const state = s.exceeded ? '**Exceeded**' : `**${pct}%** used`;
            return `${icon} ${s.label}: spent **${formatRupees(s.spent)}** of ${formatRupees(s.amount)} — ${state}, ${formatRupees(Math.abs(s.remaining))} ${s.remaining >= 0 ? 'left' : 'over the limit'}`;
        };

        if (focus) {
            lines.push(fmt(focus));
        } else {
            if (status.overall) lines.push(fmt(status.overall));
            for (const s of status.categoryStatuses) lines.push(fmt(s));
            if (!status.overall && status.categoryStatuses.length === 0) lines.push('(no budgets found)');
        }

        const overspendVerdict = status.overall
            ? (status.overall.exceeded
                ? `Yes — you're over your overall budget by ${formatRupees(Math.abs(status.overall.remaining))}.`
                : `No — you're within your overall budget with ${formatRupees(status.overall.remaining)} left.`)
            : null;

        const reply = `**Budget status for ${status.month}/${status.year}:**\n${lines.join('\n')}\n\nTotal spent this month: **${formatRupees(status.totalSpentThisMonth)}**${overspendVerdict ? `\n\n${overspendVerdict}` : ''}`;
        return {
            reply,
            contextUpdates: { lastIntent: 'GET_BUDGET_STATUS', lastPeriod: 'current_month' }
        };
    }
};

/* ------------------------------------------------------------------ */
/* Categories                                                          */
/* ------------------------------------------------------------------ */

const CREATE_CATEGORY = {
    name: 'CREATE_CATEGORY',
    match: (t) => {
        if (!/\b(create|add|make|new)\b/.test(t)) return null;
        if (!/\bcategor(y|ies)\b/.test(t)) return null;
        const nameMatch = t.match(/\bcategor(?:y|ies)\s+(?:called|named|titled|for)?\s*(?:["']?)([a-z][a-z\s&]{0,30})/)
            || t.match(/\b(?:called|named|titled)\s+["']?([a-z][a-z\s&]{0,30})["']?/);
        const name = nameMatch ? nameMatch[1].trim() : null;
        return { name };
    },
    handle: async ({ userId, params }) => {
        if (!params.name) {
            await contextService.setPendingAction(userId, {
                type: 'CREATE_CATEGORY',
                collected: {},
                awaiting: 'name'
            });
            return { reply: "Sure — what should the new category be called? (e.g. *Pets*)" };
        }
        const result = await categoryService.createCategory(userId, params.name);
        if (result.created) {
            return {
                reply: `✅ Created the new category **${result.category.name}**. You can now log expenses under it — e.g. *"Add ₹500 for dog food under ${result.category.name}"*.`,
                refreshData: true,
                contextUpdates: { lastIntent: 'CREATE_CATEGORY', lastCategory: result.category.name }
            };
        }
        return { reply: `You already have a category called **${result.category.name}**${result.category.isCustom ? '' : ' (it\'s one of the default categories)'} — no duplicate was created.` };
    }
};

const LIST_CATEGORIES = {
    name: 'LIST_CATEGORIES',
    match: (t) => (/^(show|list|display|see|view|what are|which are)\b/.test(t) || /^(categories|my categories)$/.test(t))
        && /\bcategor(y|ies)\b/.test(t)
        ? {} : null,
    handle: async ({ userId }) => {
        const cats = await categoryService.listCategories(userId);
        const expenseCats = cats.filter(c => c.type === 'EXPENSE');
        const incomeCats = cats.filter(c => c.type === 'INCOME');
        const fmt = (c) => `${c.name}${c.isCustom ? ' *(custom)*' : ''}`;
        return {
            reply: `Here are all your categories:\n\n**Expense categories:**\n${expenseCats.map(c => `• ${fmt(c)}`).join('\n')}\n\n**Income categories:**\n${incomeCats.map(c => `• ${fmt(c)}`).join('\n')}\n\nAsk me to *"create a category called <name>"* to add more, or *"add ₹500 for dog food under Pets"* to use one.`,
            contextUpdates: { lastIntent: 'LIST_CATEGORIES' }
        };
    }
};

/* ------------------------------------------------------------------ */
/* Bills & recurring expenses                                          */
/* ------------------------------------------------------------------ */

const ADD_RECURRING = {
    name: 'ADD_RECURRING',
    match: (t) => {
        // Questions like "when do you remind me about bills" are not commands
        if (/^(did|do|does|have|has|am|is|are|was|when|why|what|how|which|no|not)\b/.test(t)) return null;
        // "set my monthly budget to ₹20,000" is a budget, not a bill reminder
        if (/\bbudget\b|\blimit\b|\blimit for\b/i.test(t)) return null;
        const recurring = /\b(add|create|set|setup|set up|start)\b/.test(t) && /\b(recurring|subscription|every month|every week|every year|monthly|weekly|yearly)\b/.test(t);
        const remind = /\bremind me (?:about|for|to pay)\b/.test(t);
        if (!recurring && !remind) return null;

        const amount = extractAmount(t, { allowBare: true });
        const freq = extractFrequency(t) || (remind ? 'MONTHLY' : null);
        const day = extractDayOfMonth(t);
        const relDate = extractRelativeDate(t);

        // Bill name: merchant word, or the phrase after "for/about"
        let name = extractMerchant(t);
        if (!name) {
            const nameMatch = t.match(/\b(?:for|about|to pay)\s+(?:my\s+|the\s+)?([a-z][a-z\s]{0,30}?)(?:\s+(?:of|every|each|on|starting|from|on the|\d)|$)/);
            if (nameMatch) name = nameMatch[1].trim();
        }
        if (!name) {
            const nounPhrase = t.match(/\b(?:expense|bill|payment)\s+(?:of\s+)?(?:₹|rs\.?|inr)?\s*[\d,]+(?:\.\d+)?\s+(?:for|to)\s+([a-z][a-z\s]{0,20})/);
            if (nounPhrase) name = nounPhrase[1].trim();
        }

        return {
            name: name ? name.trim() : null,
            amount,
            frequency: freq || 'MONTHLY',
            dueDay: day,
            // Bill.dueDate is a 'YYYY-MM-DD' string — never store a Date object
            dueDate: day ? null : (relDate ? formatDate(relDate.date) : null),
            reminder: remind
        };
    },
    handle: async ({ userId, params }) => {
        return await advanceAddRecurring(userId, {
            name: params.name,
            amount: params.amount,
            frequency: params.frequency,
            dueDay: params.dueDay,
            dueDate: params.dueDate,
            reminder: params.reminder
        });
    }
};

/**
 * Create a recurring bill/reminder, asking one at a time for a missing
 * name, amount or due day.
 */
async function advanceAddRecurring(userId, collected) {
    const missing = [];
    if (!collected.name) missing.push('name');
    if (collected.amount === null || collected.amount === undefined || collected.amount <= 0) missing.push('amount');
    if (!collected.dueDay && !collected.dueDate && !collected.dueResolved) missing.push('day');

    if (missing.length > 0) {
        await contextService.setPendingAction(userId, { type: 'ADD_RECURRING', collected, awaiting: missing[0] });
        const question = missing[0] === 'name' ? "What's the name of this recurring bill? (e.g. *Netflix*, *Rent*)"
            : missing[0] === 'amount' ? `How much is ${collected.name || 'it'} per ${collected.frequency === 'MONTHLY' ? 'month' : String(collected.frequency).toLowerCase().replace('ly', '')}? (e.g. *₹499*)`
                : `When is it due? (e.g. *"the 1st"* for the 1st of every month, or a date like *2026-11-01*)`;
        return { reply: `Let's set that up. ${question} (or say *cancel*.)` };
    }

    return await executeAddRecurring(userId, collected);
}

async function executeAddRecurring(userId, collected) {
    const bill = await billService.createBill(userId, {
        billName: collected.name,
        amount: collected.amount,
        category: 'Bills',
        frequency: collected.frequency,
        dueDay: collected.dueDay,
        dueDate: collected.dueDate,
        reminderDays: 3
    });

    return {
        reply: `✅ Set up the recurring ${collected.frequency.toLowerCase()} reminder for **${bill.billName}** — ${formatRupees(bill.amount)}, next due **${bill.dueDate}** (${bill.statusText}).\n\n📌 Note: this is a *reminder schedule*, not a recorded expense — I won't create duplicate transactions from it. It will show up in **Bill Due Date Reminders** and your Notifications. When you pay it, say *"mark my ${bill.billName} bill as paid"*.`,
        refreshData: true,
        contextUpdates: { lastIntent: 'ADD_RECURRING' }
    };
}

const MARK_BILL_PAID = {
    name: 'MARK_BILL_PAID',
    match: (t) => {
        const mark = /\b(mark|set|flag)\b/.test(t) && /\b(paid|done|complete|settled)\b/.test(t) && /\b(bill|it)\b/.test(t);
        const paid = /^(i\s+)?(paid|have paid|cleared|settled)\b/.test(t) && /\b(bill|rent|emi|subscription|netflix|electricity|internet|water|phone|recharge)\b/.test(t);
        if (!mark && !paid) return null;

        let name = extractMerchant(t);
        if (!name) {
            const m = t.match(/\b(?:my|the)\s+([a-z][a-z\s]{0,25}?)\s+(?:bill|payment|subscription|emi)\b/)
                || t.match(/\b(?:bill|payment)\s+(?:for|of)\s+([a-z][a-z\s]{0,25})/)
                || t.match(/\b(paid|cleared|settled)\s+(?:my|the)\s+([a-z][a-z\s]{0,25})/);
            if (m) name = (m[2] || m[1]).trim();
        }
        if (!name) {
            const m = t.match(/^(?:i\s+)?(?:have\s+)?(?:paid|cleared|settled)\s+(?:my\s+|the\s+)?([a-z][a-z\s]{0,25})/);
            if (m) name = m[1].trim();
        }
        return { name };
    },
    handle: async ({ userId, params }) => {
        if (!params.name) {
            const bills = await billService.listBills(userId);
            const unpaid = bills.filter(b => b.status !== 'PAID');
            if (unpaid.length === 0) return { reply: "You have no unpaid bills to mark as paid." };
            return { reply: `Which bill did you pay? Your unpaid bills:\n${unpaid.map((b, i) => `${i + 1}. **${b.billName}** — ${formatRupees(b.amount)} (${b.statusText})`).join('\n')}` };
        }

        const bill = await billService.findBillByName(userId, params.name);
        if (!bill) {
            return { reply: `I couldn't find a bill named "${params.name}". Say *"list my upcoming bills"* to see what you have.` };
        }

        const updated = await billService.markBillPaid(userId, bill._id);
        if (!updated) return { reply: "Something went wrong marking that bill as paid. Please try again." };

        return {
            reply: `✅ Marked **${updated.billName}** (${formatRupees(updated.amount)}, was due ${updated.dueDate}) as **paid**.\n\n📌 No expense was recorded for this payment — say *"Add ${formatRupees(updated.amount)} for ${updated.billName} today"* if you want it logged.`,
            refreshData: true,
            contextUpdates: { lastIntent: 'MARK_BILL_PAID' }
        };
    }
};

const LIST_BILLS = {
    name: 'LIST_BILLS',
    match: (t) => {
        if (!/\bbills?\b|\bpayments? due\b|\bnext payment\b/.test(t)) return null;
        if (/\b(mark|paid|set)\b/.test(t)) return null;
        if (/\b(add|create|remind me)\b/.test(t)) return null;

        let filter = 'upcoming';
        if (/\boverdue\b/.test(t)) filter = 'overdue';
        else if (/\bdue (this|within) week\b|\bthis week\b/.test(t)) filter = 'this_week';
        else if (/\bdue today\b|\btoday\b/.test(t)) filter = 'due_today';
        else if (/\bpaid\b/.test(t)) filter = 'paid';
        return { filter };
    },
    handle: async ({ userId, params }) => {
        const bills = await billService.listBills(userId);
        if (bills.length === 0) {
            return {
                reply: "You have no bills recorded yet. You can add one on the **Bill Due Date Reminders** page, or tell me — e.g. *\"Add a recurring expense of ₹499 for Netflix every month\"*.",
                contextUpdates: { lastIntent: 'LIST_BILLS' }
            };
        }

        const filtered = bills.filter(b => {
            switch (params.filter) {
                case 'overdue': return b.status === 'OVERDUE';
                case 'this_week': return ['DUE_THIS_WEEK', 'DUE_TODAY', 'OVERDUE'].includes(b.status);
                case 'due_today': return b.status === 'DUE_TODAY';
                case 'paid': return b.status === 'PAID';
                default: return b.status !== 'PAID'; // upcoming = all unpaid
            }
        });

        if (filtered.length === 0) {
            if (params.filter === 'overdue') return { reply: "🎉 None of your bills are overdue." };
            if (params.filter === 'due_today') return { reply: "No bills are due today." };
            if (params.filter === 'this_week') return { reply: "No bills are due within the next 7 days." };
            return { reply: "🎉 All your bills are marked as paid!" };
        }

        const icon = (b) => b.status === 'OVERDUE' ? '🔴' : b.status === 'DUE_TODAY' ? '🚨' : b.status === 'DUE_THIS_WEEK' ? '🟡' : '🟢';
        const title = params.filter === 'overdue' ? 'Overdue Bills'
            : params.filter === 'this_week' ? 'Bills Due This Week'
                : params.filter === 'due_today' ? 'Bills Due Today'
                    : params.filter === 'paid' ? 'Paid Bills'
                        : 'Upcoming / Unpaid Bills';

        return {
            reply: `Here are your **${title}**:\n\n${filtered.map((b, i) => `${icon(b)} ${i + 1}. **${b.billName}** — ${formatRupees(b.amount)} | ${b.category} | due ${b.dueDate} (${b.statusText})${b.recurringFrequency ? ` | recurring ${b.recurringFrequency.toLowerCase()}` : ''}`).join('\n')}\n\nYou can say *"mark my ${filtered[0].billName} bill as paid"* when you settle one.`,
            contextUpdates: { lastIntent: 'LIST_BILLS' }
        };
    }
};

/* ------------------------------------------------------------------ */
/* Reports, exports, settings, reset                                   */
/* ------------------------------------------------------------------ */

const EXPORT = {
    name: 'EXPORT',
    match: (t) => {
        // A report file is wanted when the user names a format (excel/pdf) with a
        // fetching verb, or asks to export/download/produce their records.
        const format = extractFormat(t);
        const fetchVerb = /\b(export|download|generate|produce|send|give|get|share|make|create|need|want|show)\b/.test(t);
        const strongVerb = /\b(export|download|generate|produce)\b/.test(t);
        const reportNoun = /\b(report|statement)\b/.test(t);
        const dataNoun = /\b(transactions?|expenses?|data|records?|history|summary)\b/.test(t);

        if (format) { if (!fetchVerb && !reportNoun) return null; }
        else if (reportNoun && fetchVerb) { /* default to pdf below */ }
        else if (strongVerb && dataNoun) { /* default to pdf below */ }
        else return null;

        return { format: format || 'pdf', periodParams: null };
    },
    handle: async ({ userId, params, raw }) => {
        const periodParams = await resolvePeriodParams(raw);
        const fmt = params.format;

        // The export API supports these named periods; anything else becomes a custom range
        const supportedNamed = ['current_month', 'this_month', 'previous_month', 'last_month', 'current_year', 'this_year'];
        let periodQuery = '?period=current_month';
        let label = 'the current month';
        if (periodParams.period && supportedNamed.includes(periodParams.period)) {
            periodQuery = `?period=${encodeURIComponent(periodParams.period)}`;
            label = periodParams.period.replace(/_/g, ' ');
        } else if (periodParams.startDate && periodParams.endDate) {
            periodQuery = `?period=custom&startDate=${formatDate(periodParams.startDate)}&endDate=${formatDate(periodParams.endDate)}`;
            label = periodParams.label || 'the selected period';
        }

        const rangeQuery = periodParams.startDate && periodParams.endDate
            ? { date: { $gte: periodParams.startDate, $lte: periodParams.endDate } }
            : (periodParams.period && supportedNamed.includes(periodParams.period)
                ? { date: { $gte: resolvePeriod(periodParams.period).startDate, $lte: resolvePeriod(periodParams.period).endDate } }
                : {});
        const txnCount = await Transaction.countDocuments({ user: userId, ...rangeQuery });

        if (txnCount === 0) {
            return { reply: "You have no transactions in that period, so the report would be empty. Log an expense first!" };
        }

        return {
            reply: `Here is your ${fmt === 'excel' ? 'Excel' : 'PDF'} report for **${label}** — ${txnCount} transaction${txnCount === 1 ? '' : 's'} included. Use the button below to download it. (/api/export/${fmt}${periodQuery})`,
            downloadFormat: fmt
        };
    }
};

const MONTHLY_SUMMARY = {
    name: 'MONTHLY_SUMMARY',
    match: (t) => /\bmonthly summary\b|\bsummary report\b|\bmonth(?:ly)? report\b|\bsummarize (?:my )?(?:month|spending|finances)\b|\bthis month'?s summary\b|\bhow did i do this month\b|\bfinancial summary\b|\bsummary (?:of|for) (?:my )?(?:this |last |current |monthly )?(?:month|spending|finances?|expenses?)\b|\b(?:give|show|get|prepare) (?:me )?(?:a |the )?(?:quick )?summary\b/.test(t) ? {} : null,
    handle: async ({ userId }) => {
        const [balance, breakdown, maxTx, avg, bills, trend] = await Promise.all([
            analytics.getBalance(userId, { period: 'current_month' }),
            analytics.getCategoryBreakdown(userId, { period: 'current_month' }),
            analytics.getMaxTransaction(userId, { rank: 1, type: 'EXPENSE', period: 'current_month' }),
            analytics.getDailyAverage(userId, { period: 'current_month' }),
            billService.listBills(userId),
            analytics.getMonthlyTrend(userId, 3)
        ]);

        const topCats = breakdown.categories.slice(0, 5);
        const unpaidBills = bills.filter(b => b.status !== 'PAID');
        const lastMonth = trend[trend.length - 2];

        let reply = `**Monthly Summary — ${balance.periodLabel}:**\n` +
            `• Income: **${formatRupees(balance.income)}**\n` +
            `• Expenses: **${formatRupees(balance.expenses)}** across ${breakdown.categories.reduce((s, c) => s + c.count, 0)} transactions\n` +
            `• Net balance: **${formatRupees(balance.balance)}** (savings rate ${balance.savingsPercentage}%)\n` +
            `• Average daily spending: ${formatRupees(avg.average)}\n`;

        if (maxTx.found) {
            reply += `\n**Biggest expense:** ${formatRupees(maxTx.transaction.amount)} — ${maxTx.transaction.category} ("${maxTx.transaction.description}") on ${maxTx.transaction.formattedDate}\n`;
        }
        if (topCats.length > 0) {
            reply += `\n**Top categories:**\n${topCats.map((c, i) => `${i + 1}. ${c.category} — ${formatRupees(c.amount)} (${c.percentage}%)`).join('\n')}\n`;
        }
        if (lastMonth && lastMonth.expenses > 0) {
            const diff = balance.expenses - lastMonth.expenses;
            reply += `\n**Vs last month:** ${diff >= 0 ? 'up' : 'down'} ${formatRupees(Math.abs(diff))} from ${formatRupees(lastMonth.expenses)} (${lastMonth.label}).\n`;
        }
        if (unpaidBills.length > 0) {
            reply += `\n**Pending bills:** ${unpaidBills.length} unpaid (next: ${unpaidBills[0].billName}, ${unpaidBills[0].statusText.toLowerCase()}).\n`;
        }
        reply += `\nYou can download the full details as **PDF** or **Excel** — just say *"export my expenses as pdf"* or *"export as excel"*.`;

        return { reply, contextUpdates: { lastIntent: 'MONTHLY_SUMMARY', lastPeriod: 'current_month' } };
    }
};

const CHANGE_CURRENCY = {
    name: 'CHANGE_CURRENCY',
    match: (t) => /\bcurrency\b/.test(t) && /\b(change|set|switch|use|make|what|which|my)\b/.test(t)
        ? { currency: (t.match(/\b(inr|rupees?|₹|usd|dollars?|euros?|eur|gbp|pounds?|yen|jpy|aud|cad|sgd|aed|dirhams?)\b/) || [null])[0] } : null,
    handle: async ({ params }) => {
        const requested = params.currency ? params.currency.toLowerCase() : null;
        if (!requested || ['inr', 'rupee', 'rupees', '₹'].includes(requested)) {
            return { reply: "Your currency is already set to **INR (₹)** — all amounts, reports and charts use Indian Rupees by default, so there's nothing to change." };
        }
        return {
            reply: `INR (₹) is the default and currently supported currency of this Expense Tracker, so I can't switch to ${params.currency} yet. All your existing records stay in INR.\n\nIf you'd like, I can still help you with everything in rupees — reports, budgets and analysis all work today.`
        };
    }
};

const RESET_DATA = {
    name: 'RESET_DATA',
    match: (t) => /\b(reset|clear|wipe|erase|delete)\b/.test(t)
        && /\b(all|everything|whole)\b.*\b(data|records?|history|transactions|info)\b|\b(data|records?|history)\b.*\b(reset|clear|wipe|delete)\b|^reset all my data$/.test(t)
        ? {} : null,
    handle: async ({ userId }) => {
        const counts = {
            transactions: await Transaction.countDocuments({ user: userId }),
            bills: await require('../../models/Bill').countDocuments({ user: userId })
        };
        await contextService.setPendingAction(userId, {
            type: 'CONFIRM_RESET',
            awaiting: 'confirmation',
            target: null
        });
        return {
            reply: `⚠️ **Reset all your data?** This will permanently delete **your own** records only:\n\n• Transactions (${counts.transactions} currently)\n• Incomes, budgets, bills (${counts.bills} currently), savings goals, loans\n• Shared expense groups, custom categories, notifications\n\nYour **account and login stay intact**, and no other user's data is touched.\n\nReply **yes** to confirm or **no** to cancel. (yes/no)`
        };
    }
};

module.exports = {
    isYes,
    isNo,
    isSkip,
    executeAddTransaction,
    executeAddRecurring,
    advanceAddTransaction,
    advanceSetBudget,
    advanceAddRecurring,
    intents: [
        GREETING,
        THANKS,
        CAPABILITIES,
        CANCEL,
        ADD_TRANSACTION,
        ADD_RECURRING,
        DELETE_TRANSACTION,
        EDIT_TRANSACTION,
        SET_BUDGET,
        SET_BUDGET_ALERT,
        GET_BUDGET_STATUS,
        CREATE_CATEGORY,
        LIST_CATEGORIES,
        MARK_BILL_PAID,
        LIST_BILLS,
        RESET_DATA,
        EXPORT,
        MONTHLY_SUMMARY,
        CHANGE_CURRENCY
    ]
};
