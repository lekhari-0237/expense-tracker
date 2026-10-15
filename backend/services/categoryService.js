'use strict';

const Category = require('../models/Category');

const DEFAULT_EXPENSE_CATEGORIES = [
    'Food', 'Groceries', 'Shopping', 'Transport', 'Bills',
    'Entertainment', 'Healthcare', 'Education', 'Travel', 'Rent', 'Other'
];

const DEFAULT_INCOME_CATEGORIES = ['Salary', 'Freelance', 'Business', 'Investment', 'Gifts', 'Other'];

const CATEGORY_SYNONYMS = {
    dining: 'Food', restaurant: 'Food', restaurants: 'Food', lunch: 'Food', dinner: 'Food', breakfast: 'Food',
    cafe: 'Food', coffee: 'Food', eat: 'Food', eating: 'Food', meal: 'Food', meals: 'Food', food: 'Food', swiggy: 'Food', zomato: 'Food',
    grocery: 'Groceries', groceries: 'Groceries', supermarket: 'Groceries', vegetables: 'Groceries',
    shopping: 'Shopping', amazon: 'Shopping', flipkart: 'Shopping', clothing: 'Shopping', clothes: 'Shopping', electronics: 'Shopping', myntra: 'Shopping',
    transport: 'Transport', transportation: 'Transport', fuel: 'Transport', petrol: 'Transport', cab: 'Transport',
    uber: 'Transport', ola: 'Transport', auto: 'Transport', rickshaw: 'Transport', metro: 'Transport', bus: 'Transport', train: 'Transport', taxi: 'Transport', auto_fare: 'Transport',
    bills: 'Bills', utilities: 'Bills', utility: 'Bills', electricity: 'Bills', water: 'Bills', internet: 'Bills',
    recharge: 'Bills', mobile: 'Bills', wifi: 'Bills', broadband: 'Bills', gas: 'Bills', phone: 'Bills',
    entertainment: 'Entertainment', movies: 'Entertainment', movie: 'Entertainment', netflix: 'Entertainment',
    spotify: 'Entertainment', gaming: 'Entertainment', hotstar: 'Entertainment', prime: 'Entertainment',
    healthcare: 'Healthcare', health: 'Healthcare', medical: 'Healthcare', medicine: 'Healthcare', medicines: 'Healthcare',
    hospital: 'Healthcare', doctor: 'Healthcare', pharmacy: 'Healthcare', clinic: 'Healthcare',
    education: 'Education', books: 'Education', tuition: 'Education', course: 'Education', school: 'Education', college: 'Education', fees: 'Education',
    travel: 'Travel', trip: 'Travel', vacation: 'Travel', holiday: 'Travel', flight: 'Travel', hotel: 'Travel',
    rent: 'Rent', rental: 'Rent',
    salary: 'Salary', paycheck: 'Salary',
    freelance: 'Freelance', freelancing: 'Freelance',
    business: 'Business',
    investment: 'Investment', investments: 'Investment', stocks: 'Investment', mutual_fund: 'Investment',
    gifts: 'Gifts', gift: 'Gifts',
    other: 'Other', others: 'Other', misc: 'Other', miscellaneous: 'Other'
};

function normalizeName(name) {
    return String(name || '').trim().replace(/\s+/g, ' ');
}

/**
 * Resolve a free-text category word to one of the user's categories
 * (defaults + custom), preserving stored capitalisation.
 * Returns null when the word does not match any known category.
 */
async function resolveCategory(userId, rawWord) {
    if (!rawWord) return null;
    const word = normalizeName(rawWord).toLowerCase();
    if (!word) return null;

    // 1. Direct case-insensitive match against defaults and synonyms
    const synonymTarget = CATEGORY_SYNONYMS[word];
    const candidates = [];
    if (synonymTarget) candidates.push(synonymTarget);
    for (const def of [...DEFAULT_EXPENSE_CATEGORIES, ...DEFAULT_INCOME_CATEGORIES]) {
        if (def.toLowerCase() === word) candidates.push(def);
    }

    // 2. Match against the user's custom categories
    const customCategories = await Category.find({ user: userId }).lean();
    for (const c of customCategories) {
        if (c.name.toLowerCase() === word) candidates.push(c.name);
    }

    if (candidates.length > 0) {
        // Prefer the user's custom category spelling, then defaults
        const customMatch = customCategories.find(c => c.name.toLowerCase() === candidates[0].toLowerCase());
        return customMatch ? customMatch.name : candidates[0];
    }

    // 3. Multi-word match ("netflix subscription" contains "netflix")
    for (const [syn, target] of Object.entries(CATEGORY_SYNONYMS)) {
        if (word.includes(syn) && syn.length > 3) return target;
    }
    for (const def of DEFAULT_EXPENSE_CATEGORIES) {
        if (def.toLowerCase() !== 'other' && word.includes(def.toLowerCase())) return def;
    }
    return null;
}

/** All categories for a user: defaults + custom (with isCustom flag). */
async function listCategories(userId) {
    const custom = await Category.find({ user: userId }).sort({ name: 1 }).lean();
    const customNames = custom.map(c => c.name);
    const defaults = [...DEFAULT_EXPENSE_CATEGORIES, ...DEFAULT_INCOME_CATEGORIES]
        .filter((v, i, arr) => arr.indexOf(v) === i)
        .map(name => ({ name, isCustom: false, type: DEFAULT_INCOME_CATEGORIES.includes(name) ? 'INCOME' : 'EXPENSE' }));

    const customList = customNames.map(name => ({
        name,
        isCustom: true,
        type: DEFAULT_INCOME_CATEGORIES.includes(name) ? 'INCOME' : 'EXPENSE'
    }));

    // Defaults first (deduped against custom by case-insensitive name), then custom
    const customLower = new Set(customNames.map(n => n.toLowerCase()));
    return [...defaults.filter(d => !customLower.has(d.name.toLowerCase())), ...customList];
}

async function createCategory(userId, rawName) {
    const name = normalizeName(rawName);
    if (!name) {
        const err = new Error('Category name cannot be empty');
        err.status = 400;
        throw err;
    }
    if (name.length > 40) {
        const err = new Error('Category name is too long (max 40 characters)');
        err.status = 400;
        throw err;
    }

    // Duplicate check (case-insensitive) across defaults and existing customs
    const existing = await listCategories(userId);
    const dupe = existing.find(c => c.name.toLowerCase() === name.toLowerCase());
    if (dupe) {
        return { created: false, category: dupe, reason: 'already_exists' };
    }

    const created = await Category.create({ user: userId, name, isCustom: true });
    return { created: true, category: { name: created.name, isCustom: true }, reason: null };
}

async function deleteCategory(userId, name) {
    const normalized = normalizeName(name);
    const deleted = await Category.findOneAndDelete({
        user: userId,
        name: { $regex: new RegExp(`^${escapeRegex(normalized)}$`, 'i') }
    });
    return !!deleted;
}

function escapeRegex(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isDefaultCategory(name) {
    const lower = String(name || '').toLowerCase();
    return [...DEFAULT_EXPENSE_CATEGORIES, ...DEFAULT_INCOME_CATEGORIES].some(d => d.toLowerCase() === lower);
}

module.exports = {
    DEFAULT_EXPENSE_CATEGORIES,
    DEFAULT_INCOME_CATEGORIES,
    CATEGORY_SYNONYMS,
    resolveCategory,
    listCategories,
    createCategory,
    deleteCategory,
    isDefaultCategory,
    normalizeName
};
