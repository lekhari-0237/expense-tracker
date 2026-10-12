const {
    resolveDateRange,
    getMaxTransaction,
    getMinTransaction,
    getTotalExpenses,
    getTotalIncome,
    getBalance,
    getCategoryBreakdown,
    getRecentTransactions,
    comparePeriods,
    getSavingsGoalsData,
    getBillsData,
    getLoansData
} = require('./financeAnalyticsService');

// In-memory conversation session context store (keyed by userId)
const conversationSessions = new Map();

function getSessionContext(userId) {
    const key = userId.toString();
    if (!conversationSessions.has(key)) {
        conversationSessions.set(key, {
            lastIntent: null,
            lastPeriod: 'current_month',
            lastCategory: null,
            lastRank: 1,
            lastTransaction: null,
            lastTransactionsList: [],
            lastUpdated: Date.now()
        });
    }
    return conversationSessions.get(key);
}

function updateSessionContext(userId, updates) {
    const key = userId.toString();
    const current = getSessionContext(userId);
    conversationSessions.set(key, {
        ...current,
        ...updates,
        lastUpdated: Date.now()
    });
}

/**
 * Clean & normalize text for matching
 */
function normalize(str) {
    return (str || '')
        .toLowerCase()
        .replace(/[?.,!/]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Extract time period from user prompt
 */
function extractPeriod(text, fallbackPeriod = 'all_time') {
    const t = normalize(text);

    if (t.includes('today')) return 'today';
    if (t.includes('yesterday')) return 'yesterday';
    if (t.includes('this week') || t.includes('current week')) return 'this_week';
    if (t.includes('last week') || t.includes('previous week') || t.includes('past week')) return 'last_week';
    if (t.includes('last 30 days') || t.includes('past 30 days')) return 'last_30_days';
    if (t.includes('last month') || t.includes('previous month') || t.includes('past month')) return 'previous_month';
    if (t.includes('this month') || t.includes('current month')) return 'current_month';
    if (t.includes('this year') || t.includes('current year')) return 'this_year';
    if (t.includes('last year') || t.includes('previous year')) return 'last_year';

    const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
    for (const m of months) {
        if (t.includes(m)) return m;
    }

    return fallbackPeriod;
}

/**
 * Extract category from user prompt
 */
function extractCategory(text) {
    const categories = [
        'food', 'dining', 'restaurant', 'groceries', 'grocery',
        'shopping', 'clothing', 'electronics',
        'transport', 'travel', 'fuel', 'cab', 'uber', 'ola',
        'bills', 'utilities', 'electricity', 'water', 'internet', 'rent', 'recharge',
        'entertainment', 'movies', 'netflix', 'spotify',
        'healthcare', 'medical', 'medicine', 'hospital',
        'education', 'books', 'tuition', 'course',
        'other'
    ];

    const t = normalize(text);
    for (const cat of categories) {
        // match word boundary
        const regex = new RegExp(`\\b${cat}\\b`, 'i');
        if (regex.test(t)) {
            if (['dining', 'restaurant'].includes(cat)) return 'Food';
            if (['grocery', 'groceries'].includes(cat)) return 'Groceries';
            if (['clothing', 'electronics'].includes(cat)) return 'Shopping';
            if (['fuel', 'cab', 'uber', 'ola'].includes(cat)) return 'Transport';
            if (['utilities', 'electricity', 'water', 'internet', 'recharge'].includes(cat)) return 'Bills';
            if (['movies', 'netflix', 'spotify'].includes(cat)) return 'Entertainment';
            if (['medical', 'medicine', 'hospital'].includes(cat)) return 'Healthcare';
            if (['books', 'tuition', 'course'].includes(cat)) return 'Education';
            return cat.charAt(0).toUpperCase() + cat.slice(1);
        }
    }
    return null;
}

/**
 * Extract rank (e.g. 1st, 2nd, 3rd)
 */
function extractRank(text) {
    const t = normalize(text);
    if (t.includes('second') || t.includes('2nd')) return 2;
    if (t.includes('third') || t.includes('3rd')) return 3;
    if (t.includes('fourth') || t.includes('4th')) return 4;
    if (t.includes('fifth') || t.includes('5th')) return 5;
    return 1;
}

/**
 * Extract number amounts from prompt (e.g. "above 5000", "below 500")
 */
function extractAmountFilters(text) {
    const t = normalize(text);
    let minAmount = undefined;
    let maxAmount = undefined;

    const aboveMatch = t.match(/(?:above|greater than|more than|over|exceeding)\s*(?:₹|inr|rs\.?|rs)?\s*([0-9,]+)/i);
    if (aboveMatch) {
        minAmount = parseFloat(aboveMatch[1].replace(/,/g, ''));
    }

    const belowMatch = t.match(/(?:below|less than|under)\s*(?:₹|inr|rs\.?|rs)?\s*([0-9,]+)/i);
    if (belowMatch) {
        maxAmount = parseFloat(belowMatch[1].replace(/,/g, ''));
    }

    return { minAmount, maxAmount };
}

/**
 * Intent Classifier with Conversational Memory Disambiguation
 */
function classifyIntent(text, context) {
    const t = normalize(text);

    // 1. Follow-up: Date inquiry on last transaction ("When did I make it?", "when was that?")
    if (
        (t.includes('when') && (t.includes('make it') || t.includes('was it') || t.includes('did i') || t.includes('was that') || t.includes('occur'))) ||
        t.includes('what date') || t.includes('which date') || t.includes('what time')
    ) {
        if (context.lastTransaction) {
            return { intent: 'FOLLOW_UP_DATE', context };
        }
    }

    // 2. Follow-up: Category inquiry on last transaction ("What category was it?", "which category?")
    if (
        (t.includes('what category') || t.includes('which category') || t.includes('how was it categorized')) &&
        !t.includes('spend the most') && !t.includes('highest') && !t.includes('most on')
    ) {
        if (context.lastTransaction) {
            return { intent: 'FOLLOW_UP_CATEGORY', context };
        }
    }

    // 3. Follow-up: Rank inquiry ("Show me my second highest", "second largest", "show me another one", "what about the second")
    if (
        (t.includes('second') || t.includes('2nd') || t.includes('third') || t.includes('3rd') || t.includes('another one') || t.includes('next highest') || t.includes('next largest')) &&
        (t.includes('highest') || t.includes('largest') || t.includes('biggest') || t.includes('one') || context.lastIntent === 'GET_MAX_TRANSACTION')
    ) {
        const rank = extractRank(text);
        return { intent: 'GET_MAX_TRANSACTION', rank: rank > 1 ? rank : (context.lastRank || 1) + 1 };
    }

    // 4. Follow-up: Time shift on prior intent ("What about last month?", "and this month?", "how about yesterday?", "what about food?")
    if (t.startsWith('what about') || t.startsWith('how about') || t.startsWith('and ') || t === 'last month' || t === 'this month' || t === 'yesterday') {
        const extractedP = extractPeriod(text, null);
        const extractedC = extractCategory(text);

        if (context.lastIntent) {
            return {
                intent: context.lastIntent,
                period: extractedP || context.lastPeriod,
                category: extractedC || context.lastCategory,
                isFollowUp: true
            };
        }
    }

    // 5. Greetings & Capabilities
    if (['hi', 'hello', 'hey', 'namaste', 'good morning', 'good afternoon', 'good evening'].includes(t)) {
        return { intent: 'GREETING' };
    }

    if (t.includes('thank') || t.includes('thanks') || t.includes('great thanks')) {
        return { intent: 'THANKS' };
    }

    if (t.includes('what can you do') || t.includes('help me') || t.includes('who are you') || t === 'help' || t.includes('features')) {
        return { intent: 'CAPABILITIES' };
    }

    // 6. Max / Highest Transaction Intents
    const maxKeywords = ['maximum', 'max', 'highest', 'largest', 'biggest', 'most expensive', 'greatest'];
    const isMax = maxKeywords.some(k => t.includes(k));

    if (isMax) {
        if (t.includes('income') || t.includes('salary') || t.includes('deposit') || t.includes('credit')) {
            return { intent: 'GET_MAX_TRANSACTION', type: 'INCOME', rank: extractRank(text), period: extractPeriod(text, 'all_time'), category: extractCategory(text) };
        }
        if (t.includes('category')) {
            return { intent: 'GET_TOP_CATEGORY', period: extractPeriod(text, 'current_month') };
        }
        return {
            intent: 'GET_MAX_TRANSACTION',
            type: t.includes('expense') || t.includes('spent') ? 'EXPENSE' : undefined,
            rank: extractRank(text),
            period: extractPeriod(text, 'all_time'),
            category: extractCategory(text)
        };
    }

    // 7. Min / Lowest Transaction Intents
    const minKeywords = ['minimum', 'min', 'lowest', 'smallest', 'least expensive'];
    if (minKeywords.some(k => t.includes(k))) {
        return {
            intent: 'GET_MIN_TRANSACTION',
            type: t.includes('income') ? 'INCOME' : 'EXPENSE',
            rank: extractRank(text),
            period: extractPeriod(text, 'all_time'),
            category: extractCategory(text)
        };
    }

    // 8. Top / Highest Category Intents
    if (
        (t.includes('spend the most') || t.includes('spent the most') || t.includes('biggest spending category') || t.includes('top category') || t.includes('highest spending category') || t.includes('which category')) &&
        !t.includes('how much')
    ) {
        return { intent: 'GET_TOP_CATEGORY', period: extractPeriod(text, 'current_month') };
    }

    // 9. Compare Periods Intent
    if (t.includes('compare') || t.includes('this month vs last month') || t.includes('this month and last month') || t.includes('compared to')) {
        return { intent: 'COMPARE_PERIODS' };
    }

    // 10. Savings Goals Intent
    if (t.includes('saving') || t.includes('savings') || t.includes('goal') || t.includes('target')) {
        if (t.includes('goal') || t.includes('target') || t.includes('progress') || t.includes('how much have i saved')) {
            return { intent: 'GET_SAVINGS_GOAL' };
        }
    }

    // 11. Bills Intent
    if (t.includes('bill') || t.includes('bills') || t.includes('due date') || t.includes('upcoming bill')) {
        return { intent: 'GET_BILLS' };
    }

    // 12. Loans / Money Lent or Borrowed Intent
    if (t.includes('loan') || t.includes('loans') || t.includes('owe') || t.includes('lent') || t.includes('borrowed') || t.includes('debt')) {
        return { intent: 'GET_LOANS' };
    }

    // 13. Balance / Leftover Money Intent
    if (
        t.includes('balance') || t.includes('how much money do i have') || t.includes('how much is left') ||
        t.includes('available money') || t.includes('income minus expense') || t.includes('net savings')
    ) {
        return { intent: 'GET_BALANCE', period: extractPeriod(text, 'current_month') };
    }

    // 14. Total Income Intent
    if (t.includes('income') || t.includes('salary') || t.includes('earn') || t.includes('earned') || t.includes('received')) {
        return { intent: 'GET_TOTAL_INCOME', period: extractPeriod(text, 'current_month') };
    }

    // 15. Average Expense Intent
    if (t.includes('average') || t.includes('usually spend') || t.includes('typical expense')) {
        return { intent: 'GET_AVERAGE_EXPENSE', period: extractPeriod(text, 'current_month'), category: extractCategory(text) };
    }

    // 16. Search / Filter Transactions (amounts or specific merchant)
    const amtFilter = extractAmountFilters(text);
    if (amtFilter.minAmount !== undefined || amtFilter.maxAmount !== undefined) {
        return {
            intent: 'SEARCH_TRANSACTIONS',
            minAmount: amtFilter.minAmount,
            maxAmount: amtFilter.maxAmount,
            category: extractCategory(text),
            period: extractPeriod(text, 'all_time')
        };
    }

    if (t.includes('swiggy') || t.includes('zomato') || t.includes('amazon') || t.includes('flipkart') || t.includes('uber') || t.includes('ola') || t.includes('netflix')) {
        const words = ['swiggy', 'zomato', 'amazon', 'flipkart', 'uber', 'ola', 'netflix'];
        const matched = words.find(w => t.includes(w));
        return { intent: 'SEARCH_TRANSACTIONS', search: matched, period: extractPeriod(text, 'all_time') };
    }

    // 17. Recent Transactions Intent
    if (t.includes('recent') || t.includes('last transaction') || t.includes('last 5') || t.includes('latest transaction') || t.includes('history') || (t.includes('show') && t.includes('transaction'))) {
        const countMatch = t.match(/last\s*(\d+)/i) || t.match(/(\d+)\s*transaction/i);
        const limit = countMatch ? parseInt(countMatch[1], 10) : 5;
        return { intent: 'GET_RECENT_TRANSACTIONS', limit, category: extractCategory(text), period: extractPeriod(text, 'all_time') };
    }

    // 18. Financial Advice / Spending Evaluation
    if (t.includes('am i spending too much') || t.includes('how can i save') || t.includes('is my spending good') || t.includes('evaluate my spending')) {
        return { intent: 'FINANCIAL_ADVICE', category: extractCategory(text), period: extractPeriod(text, 'current_month') };
    }

    // 19. Category Specific Spending (e.g. "How much did I spend on Food?")
    const cat = extractCategory(text);
    if (cat) {
        return { intent: 'GET_CATEGORY_TOTAL', category: cat, period: extractPeriod(text, 'current_month') };
    }

    // 20. Total Expenses Intent (fallback for any "spend" inquiry)
    if (t.includes('spend') || t.includes('spent') || t.includes('expense') || t.includes('expenses') || t.includes('cost') || t.includes('how much')) {
        return { intent: 'GET_TOTAL_EXPENSE', period: extractPeriod(text, 'current_month') };
    }

    // Fallback: General inquiry / Overview
    return { intent: 'GENERAL_SUMMARY', period: extractPeriod(text, 'current_month') };
}

/**
 * Format Currency in Indian Standard Format (₹)
 */
function formatRupees(amount) {
    if (amount === undefined || amount === null || isNaN(amount)) return '₹0';
    return `₹${Number(amount).toLocaleString('en-IN')}`;
}

/**
 * Main Controller: Generate Context-Aware Grounded Financial Analysis
 */
async function generateFinancialAnalysis(userId, rawPrompt) {
    const context = getSessionContext(userId);
    const parsed = classifyIntent(rawPrompt, context);

    let answer = '';

    switch (parsed.intent) {
        // --- GREETINGS & HELP ---
        case 'GREETING':
            answer = "Hello! I am your personal financial AI assistant. I can help you analyze your transactions, calculate spending and income, find your highest/lowest transactions, compare months, and track your budget using your real data.";
            break;

        case 'THANKS':
            answer = "You're very welcome! Let me know if you need any more insights into your expenses or financial goals.";
            break;

        case 'CAPABILITIES':
            answer = "Here is what I can do for you:\n" +
                "• **Max/Min Transactions:** Ask 'What is my highest transaction?' or 'Show my lowest expense'.\n" +
                "• **Spending & Income:** Ask 'How much did I spend this month?' or 'What is my total income?'.\n" +
                "• **Category Insights:** Ask 'How much did I spend on food?' or 'Which category do I spend the most on?'.\n" +
                "• **Comparisons:** Ask 'Compare this month with last month'.\n" +
                "• **Balance & Savings:** Ask 'What is my current balance?' or 'How is my savings goal progressing?'.\n" +
                "• **Bills & Loans:** Ask 'What bills are due?' or 'How much money do I owe?'.\n" +
                "• **Conversational Memory:** Ask follow-ups like 'When did I make it?' or 'What about last month?'.";
            break;

        // --- FOLLOW-UP QUESTIONS ---
        case 'FOLLOW_UP_DATE': {
            const tx = context.lastTransaction;
            if (tx && tx.formattedDate) {
                answer = `You made that ${formatRupees(tx.amount)} ${tx.category} transaction ("${tx.description}") on ${tx.formattedDate}.`;
            } else {
                answer = "I couldn't identify the previous transaction you're referring to. Ask me about your highest or recent transaction first!";
            }
            break;
        }

        case 'FOLLOW_UP_CATEGORY': {
            const tx = context.lastTransaction;
            if (tx && tx.category) {
                answer = `That transaction of ${formatRupees(tx.amount)} was categorized under **${tx.category}** (Description: "${tx.description}").`;
            } else {
                answer = "I couldn't identify the previous transaction you're referring to. Ask me about your highest or recent transaction first!";
            }
            break;
        }

        // --- 1. MAXIMUM TRANSACTION ---
        case 'GET_MAX_TRANSACTION': {
            const rank = parsed.rank || 1;
            const res = await getMaxTransaction(userId, {
                rank,
                type: parsed.type,
                period: parsed.period,
                category: parsed.category
            });

            if (!res.found) {
                answer = `I couldn't find any recorded transactions for your account${parsed.category ? ` in ${parsed.category}` : ''} (${res.periodLabel}). Start by adding transactions or syncing your bank!`;
            } else {
                const tx = res.transaction;
                const rankText = rank === 1 ? 'highest' : rank === 2 ? 'second highest' : rank === 3 ? 'third highest' : `#${rank} highest`;
                const typeText = tx.type === 'INCOME' ? 'income' : 'expense';
                
                answer = `Your ${rankText} ${typeText} is **${formatRupees(tx.amount)}** for **${tx.category}** ("${tx.description}") on ${tx.formattedDate}.`;
                
                // Store in conversational memory
                updateSessionContext(userId, {
                    lastIntent: 'GET_MAX_TRANSACTION',
                    lastRank: rank,
                    lastPeriod: parsed.period,
                    lastCategory: parsed.category,
                    lastTransaction: tx
                });
            }
            break;
        }

        // --- 2. MINIMUM TRANSACTION ---
        case 'GET_MIN_TRANSACTION': {
            const rank = parsed.rank || 1;
            const res = await getMinTransaction(userId, {
                rank,
                type: parsed.type,
                period: parsed.period,
                category: parsed.category
            });

            if (!res.found) {
                answer = `I couldn't find any transactions for your account${parsed.category ? ` in ${parsed.category}` : ''}.`;
            } else {
                const tx = res.transaction;
                const rankText = rank === 1 ? 'lowest' : rank === 2 ? 'second lowest' : `#${rank} lowest`;
                answer = `Your ${rankText} expense is **${formatRupees(tx.amount)}** for **${tx.category}** ("${tx.description}") on ${tx.formattedDate}.`;

                updateSessionContext(userId, {
                    lastIntent: 'GET_MIN_TRANSACTION',
                    lastRank: rank,
                    lastTransaction: tx
                });
            }
            break;
        }

        // --- 3. TOTAL EXPENSES ---
        case 'GET_TOTAL_EXPENSE': {
            const res = await getTotalExpenses(userId, {
                period: parsed.period || 'current_month',
                category: parsed.category
            });

            if (res.count === 0) {
                answer = `You haven't recorded any expenses${parsed.category ? ` for ${parsed.category}` : ''} during **${res.periodLabel}**.`;
            } else {
                const catText = parsed.category ? ` on **${parsed.category}**` : '';
                answer = `You spent **${formatRupees(res.total)}**${catText} across ${res.count} transaction${res.count === 1 ? '' : 's'} in **${res.periodLabel}** (Average: ${formatRupees(res.average)} per transaction).`;
            }

            updateSessionContext(userId, {
                lastIntent: 'GET_TOTAL_EXPENSE',
                lastPeriod: parsed.period || 'current_month',
                lastCategory: parsed.category
            });
            break;
        }

        // --- 4. TOTAL INCOME ---
        case 'GET_TOTAL_INCOME': {
            const res = await getTotalIncome(userId, { period: parsed.period || 'current_month' });
            if (res.total === 0) {
                answer = `You haven't recorded any income for **${res.periodLabel}**. You can set your monthly income on the Income page or sync your bank feed.`;
            } else {
                answer = `Your total recorded income for **${res.periodLabel}** is **${formatRupees(res.total)}**.`;
            }

            updateSessionContext(userId, {
                lastIntent: 'GET_TOTAL_INCOME',
                lastPeriod: parsed.period || 'current_month'
            });
            break;
        }

        // --- 5. CURRENT BALANCE ---
        case 'GET_BALANCE': {
            const res = await getBalance(userId, { period: parsed.period || 'current_month' });
            const savingsText = res.savings > 0 ? ` (Savings rate: ${res.savingsPercentage}%)` : '';
            answer = `For **${res.periodLabel}**:\n` +
                `• **Total Income:** ${formatRupees(res.income)}\n` +
                `• **Total Expenses:** ${formatRupees(res.expenses)}\n` +
                `• **Available Net Balance:** **${formatRupees(res.balance)}**${savingsText}`;

            updateSessionContext(userId, {
                lastIntent: 'GET_BALANCE',
                lastPeriod: parsed.period || 'current_month'
            });
            break;
        }

        // --- 6. TOP CATEGORIES & CATEGORY BREAKDOWN ---
        case 'GET_TOP_CATEGORY': {
            const res = await getCategoryBreakdown(userId, { period: parsed.period || 'current_month' });
            if (!res.topCategory || res.categories.length === 0) {
                answer = `You have no recorded expenses for **${res.periodLabel}**.`;
            } else {
                const top = res.topCategory;
                const top3 = res.categories.slice(0, 3).map((c, i) => `${i + 1}. **${c.category}** — ${formatRupees(c.amount)} (${c.percentage}%)`).join('\n');
                answer = `**${top.category}** is your highest spending category in **${res.periodLabel}** with **${formatRupees(top.amount)}** (${top.percentage}% of total expenses).\n\n**Top Categories:**\n${top3}`;
            }

            updateSessionContext(userId, {
                lastIntent: 'GET_TOP_CATEGORY',
                lastPeriod: parsed.period || 'current_month'
            });
            break;
        }

        // --- 7. CATEGORY SPECIFIC EXPENSE ---
        case 'GET_CATEGORY_TOTAL': {
            const res = await getTotalExpenses(userId, {
                period: parsed.period || 'current_month',
                category: parsed.category
            });

            if (res.count === 0) {
                answer = `You haven't spent anything on **${parsed.category}** in **${res.periodLabel}**.`;
            } else {
                answer = `You spent **${formatRupees(res.total)}** on **${parsed.category}** in **${res.periodLabel}** across ${res.count} transaction${res.count === 1 ? '' : 's'} (Average: ${formatRupees(res.average)}).`;
            }

            updateSessionContext(userId, {
                lastIntent: 'GET_CATEGORY_TOTAL',
                lastCategory: parsed.category,
                lastPeriod: parsed.period || 'current_month'
            });
            break;
        }

        // --- 8. AVERAGE EXPENSE ---
        case 'GET_AVERAGE_EXPENSE': {
            const res = await getTotalExpenses(userId, {
                period: parsed.period || 'current_month',
                category: parsed.category
            });

            if (res.count === 0) {
                answer = `No transactions recorded for **${res.periodLabel}** to calculate an average.`;
            } else {
                const catText = parsed.category ? ` for ${parsed.category}` : '';
                answer = `Your average expense${catText} in **${res.periodLabel}** is **${formatRupees(res.average)}** (Total: ${formatRupees(res.total)} across ${res.count} transactions).`;
            }
            break;
        }

        // --- 9. COMPARE PERIODS ---
        case 'COMPARE_PERIODS': {
            const res = await comparePeriods(userId, 'current_month', 'previous_month');
            let verdict = '';
            if (res.period2.expenses === 0) {
                verdict = `You spent ${formatRupees(res.period1.expenses)} this month. (No expenses recorded for last month).`;
            } else if (res.direction === 'increased') {
                verdict = `Your spending **increased by ${formatRupees(res.absDifference)} (+${res.percentageChange}%)** this month compared to last month.`;
            } else if (res.direction === 'decreased') {
                verdict = `Great job! Your spending **decreased by ${formatRupees(res.absDifference)} (-${res.percentageChange}%)** this month compared to last month.`;
            } else {
                verdict = `Your spending is identical between this month and last month (${formatRupees(res.period1.expenses)}).`;
            }

            answer = `**Month-over-Month Comparison:**\n` +
                `• **${res.period1.label}:** ${formatRupees(res.period1.expenses)} (${res.period1.count} transactions)\n` +
                `• **${res.period2.label}:** ${formatRupees(res.period2.expenses)} (${res.period2.count} transactions)\n\n` +
                `📊 ${verdict}`;

            updateSessionContext(userId, { lastIntent: 'COMPARE_PERIODS' });
            break;
        }

        // --- 10. RECENT TRANSACTIONS ---
        case 'GET_RECENT_TRANSACTIONS': {
            const list = await getRecentTransactions(userId, {
                limit: parsed.limit || 5,
                category: parsed.category,
                period: parsed.period
            });

            if (list.length === 0) {
                answer = `You don't have any recorded transactions${parsed.category ? ` for ${parsed.category}` : ''} yet.`;
            } else {
                const items = list.map((t, idx) => `${idx + 1}. **${t.formattedDate}** — ${t.type === 'INCOME' ? '+' : '-'}${formatRupees(t.amount)} | **${t.category}** ("${t.description}")`).join('\n');
                answer = `Here are your **last ${list.length} transactions**:\n\n${items}`;

                updateSessionContext(userId, {
                    lastIntent: 'GET_RECENT_TRANSACTIONS',
                    lastTransaction: list[0],
                    lastTransactionsList: list
                });
            }
            break;
        }

        // --- 11. SEARCH TRANSACTIONS ---
        case 'SEARCH_TRANSACTIONS': {
            const list = await getRecentTransactions(userId, {
                limit: 10,
                minAmount: parsed.minAmount,
                maxAmount: parsed.maxAmount,
                search: parsed.search,
                category: parsed.category,
                period: parsed.period
            });

            if (list.length === 0) {
                answer = `No transactions found matching your criteria.`;
            } else {
                const items = list.map((t, idx) => `${idx + 1}. **${t.formattedDate}** — ${formatRupees(t.amount)} | **${t.category}** ("${t.description}")`).join('\n');
                answer = `Found **${list.length} matching transactions**:\n\n${items}`;
            }
            break;
        }

        // --- 12. SAVINGS GOALS ---
        case 'GET_SAVINGS_GOAL': {
            const goals = await getSavingsGoalsData(userId);
            if (goals.length === 0) {
                answer = "You haven't set any Savings Goals yet. You can create one on the **Savings Goal Tracker** page!";
            } else {
                const goalItems = goals.map((g, i) => {
                    const status = g.isAchieved ? '🎉 Goal Achieved!' : `${g.progressPercentage}% completed (Remaining: ${formatRupees(g.remainingAmount)})`;
                    return `${i + 1}. **${g.goalName}** — Target: ${formatRupees(g.targetAmount)} by ${g.targetDate} | ${status}`;
                }).join('\n');
                answer = `Here is the status of your **Savings Goals**:\n\n${goalItems}`;
            }
            break;
        }

        // --- 13. BILL REMINDERS ---
        case 'GET_BILLS': {
            const bills = await getBillsData(userId);
            if (bills.length === 0) {
                answer = "You have no bills recorded. You can add recurring bills on the **Bill Due Date Reminders** page.";
            } else {
                const unpaid = bills.filter(b => !b.isPaid);
                if (unpaid.length === 0) {
                    answer = "🎉 All your bills are marked as **Paid**!";
                } else {
                    const billItems = unpaid.map((b, i) => {
                        const dueText = b.daysRemaining < 0 ? `⚠️ Overdue by ${Math.abs(b.daysRemaining)} days` : b.daysRemaining === 0 ? '🚨 Due Today' : `Due in ${b.daysRemaining} days (${b.dueDate})`;
                        return `${i + 1}. **${b.billName}** — ${formatRupees(b.amount)} | ${b.category} | ${dueText}`;
                    }).join('\n');
                    answer = `Here are your **Upcoming / Pending Bills**:\n\n${billItems}`;
                }
            }
            break;
        }

        // --- 14. LOANS & MONEY LENT / BORROWED ---
        case 'GET_LOANS': {
            const loansData = await getLoansData(userId);
            if (loansData.loans.length === 0) {
                answer = "You have no active loan, borrowed, or lent money records.";
            } else {
                answer = `**Loans & Debts Summary:**\n` +
                    `• **Total You'll Receive (Lent):** ${formatRupees(loansData.totalReceive)}\n` +
                    `• **Total You Owe (Borrowed):** ${formatRupees(loansData.totalOwe)}\n\n` +
                    `**Active Records:**\n` +
                    loansData.loans.map((l, i) => `${i + 1}. **${l.personName}** (${l.type === 'LENT' ? 'Owes you' : 'You owe'}): ${formatRupees(l.remainingAmount)} | Status: ${l.status}`).join('\n');
            }
            break;
        }

        // --- 15. FINANCIAL ADVICE ---
        case 'FINANCIAL_ADVICE': {
            const [balanceData, catData] = await Promise.all([
                getBalance(userId, { period: 'current_month' }),
                getCategoryBreakdown(userId, { period: 'current_month' })
            ]);

            if (parsed.category) {
                const catStat = catData.categories.find(c => c.category.toLowerCase() === parsed.category.toLowerCase());
                if (catStat) {
                    answer = `You spent **${formatRupees(catStat.amount)}** on **${catStat.category}** this month, which is **${catStat.percentage}%** of your total expenses (${formatRupees(catData.totalExpense)}).\n\n💡 *Financial Rule of Thumb:* Essential categories like groceries and food should ideally stay under 25-30% of total monthly spending.`;
                } else {
                    answer = `You haven't recorded any spending on **${parsed.category}** this month.`;
                }
            } else {
                const topCat = catData.topCategory;
                const savingsRate = balanceData.savingsPercentage;
                let advice = savingsRate >= 20
                    ? `Excellent! Your savings rate is **${savingsRate}%** (saving ${formatRupees(balanceData.savings)} this month).`
                    : `Your current savings rate is **${savingsRate}%**. Try to aim for at least 20% savings by moderating spending on top discretionary categories like ${topCat ? topCat.category : 'dining/shopping'}.`;

                answer = `**Monthly Financial Health Assessment:**\n` +
                    `• Total Income: ${formatRupees(balanceData.income)}\n` +
                    `• Total Expenses: ${formatRupees(balanceData.expenses)}\n` +
                    `• Net Savings: ${formatRupees(balanceData.savings)} (${savingsRate}%)\n\n` +
                    `💡 ${advice}`;
            }
            break;
        }

        // --- GENERAL SUMMARY ---
        default: {
            const [balanceData, catData] = await Promise.all([
                getBalance(userId, { period: 'current_month' }),
                getCategoryBreakdown(userId, { period: 'current_month' })
            ]);

            const topCat = catData.topCategory;
            const topCatText = topCat ? ` | Top Category: **${topCat.category}** (${formatRupees(topCat.amount)})` : '';

            answer = `**Financial Summary (${balanceData.periodLabel}):**\n` +
                `• **Income:** ${formatRupees(balanceData.income)}\n` +
                `• **Expenses:** ${formatRupees(balanceData.expenses)}\n` +
                `• **Balance:** **${formatRupees(balanceData.balance)}**${topCatText}\n\n` +
                `Ask me for specifics like *"What is my highest transaction?"*, *"How much did I spend on food?"*, or *"Compare this month with last month"*!`;
            break;
        }
    }

    return answer;
}

module.exports = {
    generateFinancialAnalysis
};
