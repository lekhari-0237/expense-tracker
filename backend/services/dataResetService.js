'use strict';

const Transaction = require('../models/Transaction');
const Income = require('../models/Income');
const Budget = require('../models/Budget');
const Bill = require('../models/Bill');
const SavingsGoal = require('../models/SavingsGoal');
const Loan = require('../models/Loan');
const Group = require('../models/Group');
const Category = require('../models/Category');
const Notification = require('../models/Notification');
const ConversationContext = require('../models/ConversationContext');

/**
 * Delete ALL financial data belonging to a single user.
 * Never touches the user account itself or any other user's records.
 */
async function deleteUserFinancialData(userId) {
    const [transactions, incomes, budgets, bills, goals, loans, groups, categories, notifications, contexts] = await Promise.all([
        Transaction.deleteMany({ user: userId }),
        Income.deleteMany({ user: userId }),
        Budget.deleteMany({ user: userId }),
        Bill.deleteMany({ user: userId }),
        SavingsGoal.deleteMany({ user: userId }),
        Loan.deleteMany({ user: userId }),
        Group.deleteMany({ user: userId }),
        Category.deleteMany({ user: userId }),
        Notification.deleteMany({ user: userId }),
        ConversationContext.deleteMany({ user: userId })
    ]);

    return {
        transactions: transactions.deletedCount,
        incomes: incomes.deletedCount,
        budgets: budgets.deletedCount,
        bills: bills.deletedCount,
        savingsGoals: goals.deletedCount,
        loans: loans.deletedCount,
        groups: groups.deletedCount,
        categories: categories.deletedCount,
        notifications: notifications.deletedCount
    };
}

module.exports = { deleteUserFinancialData };
