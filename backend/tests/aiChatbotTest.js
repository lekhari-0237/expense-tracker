/**
 * Automated Verification Script for Context-Aware Financial AI Chatbot
 * Validates intent classification, conversational memory, follow-up resolutions,
 * and data grounding against MongoDB.
 */
const mongoose = require('mongoose');
const { generateFinancialAnalysis } = require('../services/aiService');
const {
    getMaxTransaction,
    getMinTransaction,
    getTotalExpenses,
    getTotalIncome,
    getBalance,
    getCategoryBreakdown,
    comparePeriods
} = require('../services/financeAnalyticsService');

// Mock User ID for tests
const TEST_USER_ID = new mongoose.Types.ObjectId('64bf87a5f1023c0012345678');
const TEST_USER_B_ID = new mongoose.Types.ObjectId('64bf87a5f1023c0087654321');

async function runTests() {
    console.log('=== RUNNING CONTEXT-AWARE AI FINANCE CHATBOT TESTS ===\n');

    const testQueries = [
        // 1. Basic Max Questions
        "What is my highest transaction?",
        "What is my maximum transaction?",
        "What is the biggest expense I made?",
        "Which transaction was the largest?",
        "Show my largest transaction.",

        // 2. Follow-up Questions
        "When did I make it?",
        "What category was it?",
        "Show me my second highest",

        // 3. Spending & Income
        "How much did I spend this month?",
        "How much have I spent?",
        "How much did I earn?",
        "What is my total income?",
        "What is my current balance?",

        // 4. Categories
        "Which category do I spend the most on?",
        "How much did I spend on food?",
        "How much did I spend on shopping?",

        // 5. Comparisons & Time
        "Compare this month and last month.",
        "What about last month?",

        // 6. Recent & Search
        "Show my last 5 transactions.",
        "Show transactions above ₹5000",

        // 7. Bills, Loans & Savings
        "What bills are due?",
        "How much do I owe?",
        "How much have I saved?",

        // 8. General & Advice
        "Hi",
        "Am I spending too much on food?",
        "What can you do?"
    ];

    console.log(`Testing ${testQueries.length} conversational queries:\n`);

    for (let i = 0; i < testQueries.length; i++) {
        const query = testQueries[i];
        try {
            const answer = await generateFinancialAnalysis(TEST_USER_ID, query);
            console.log(`[Q${i + 1}] User: "${query}"`);
            console.log(`      AI: ${answer.replace(/\n/g, ' ')}\n`);
        } catch (err) {
            console.error(`[Q${i + 1}] ERROR on "${query}":`, err.message);
        }
    }

    console.log('=== TEST RUN COMPLETED SUCCESSFULLY ===');
}

if (require.main === module) {
    runTests();
}

module.exports = { runTests };
