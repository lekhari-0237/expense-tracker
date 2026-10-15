'use strict';

/**
 * Shared & group expense logic: member parsing, exact split maths, balances.
 * Kept out of the route so the rules are testable and have one source of truth.
 */

const mongoose = require('mongoose');
const Group = require('../models/Group');
const { formatDate } = require('../utils/dateUtil');

class GroupError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

/** Case/whitespace-insensitive identity compare, so a payer never owes themselves. */
function samePerson(a, b) {
    return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
}

/**
 * Accepts an array or a "Ravi, Priya; Arun" style string and returns a trimmed,
 * de-duplicated name list.
 */
function parseMemberList(input) {
    const raw = Array.isArray(input)
        ? input.flatMap(v => String(v ?? '').split(/[,;]/))
        : String(input ?? '').split(/[,;]/);

    const seen = new Set();
    const list = [];
    for (const token of raw) {
        const name = token.replace(/\s+/g, ' ').trim().slice(0, 60);
        if (!name) continue;
        const key = name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        list.push(name);
    }
    return list;
}

/** parseMemberList + the creator always present (first): "Other members" must never drop you. */
function normalizeMembers(input, ownerName) {
    const list = parseMemberList(input);
    const owner = String(ownerName || 'Me').trim();
    const existing = list.findIndex(n => samePerson(n, owner));
    if (existing >= 0) {
        const [kept] = list.splice(existing, 1);
        list.unshift(kept);
    } else {
        list.unshift(owner);
    }
    return list;
}

/**
 * Split `amount` across `members` in paise so the shares sum EXACTLY to the
 * total — leftover paise go to the first members instead of being dropped.
 */
function buildSplits(amount, members, paidByName) {
    const totalPaise = Math.round(amount * 100);
    const n = members.length;
    const base = Math.floor(totalPaise / n);
    const leftover = totalPaise - base * n;

    return members.map((memberName, i) => ({
        memberName,
        amount: (base + (i < leftover ? 1 : 0)) / 100,
        isSettled: samePerson(memberName, paidByName)
    }));
}

function formatGroup(group) {
    const id = String(group._id);
    const ownerName = group.memberNames?.[0] || 'Me';
    return {
        id,
        _id: id,
        groupName: group.groupName,
        memberNames: group.memberNames || [],
        ownerName,
        members: (group.memberNames || []).map(name => ({ name, isOwner: samePerson(name, ownerName) })),
        expenses: (group.expenses || []).map(e => ({
            id: String(e._id),
            _id: String(e._id),
            description: e.description,
            totalAmount: e.totalAmount,
            paidByName: e.paidByName,
            date: e.date,
            members: e.members || [],
            splits: (e.splits || []).map(s => ({
                id: String(s._id),
                _id: String(s._id),
                memberName: s.memberName,
                amount: s.amount,
                isSettled: s.isSettled === true || samePerson(s.memberName, e.paidByName)
            })),
            createdAt: e.createdAt
        })),
        createdAt: group.createdAt
    };
}

/** Owns the ownership filter: every lookup is scoped to the authenticated user. */
async function findOwnedGroup(groupId, userId) {
    if (!mongoose.isValidObjectId(groupId)) {
        throw new GroupError(400, 'Invalid group id');
    }
    const group = await Group.findOne({ _id: groupId, user: userId });
    if (!group) throw new GroupError(404, 'Group not found');
    return group;
}

function idOf(user) {
    return (user && user._id) ? user._id : user;
}

async function listGroups(user) {
    const groups = await Group.find({ user: idOf(user) }).sort({ createdAt: -1 });
    return groups.map(formatGroup);
}

async function createGroup(user, { groupName, memberNames }) {
    if (!groupName || !String(groupName).trim()) {
        throw new GroupError(400, 'Group name is required');
    }
    const group = await Group.create({
        user: idOf(user),
        groupName: String(groupName).trim(),
        memberNames: normalizeMembers(memberNames, user.username || 'Me'),
        expenses: []
    });
    return formatGroup(group);
}

async function addMembers(user, groupId, memberName) {
    const additions = parseMemberList(memberName);
    if (additions.length === 0) throw new GroupError(400, 'Member name is required');

    const group = await findOwnedGroup(groupId, idOf(user));
    for (const name of additions) {
        if (!group.memberNames.some(existing => samePerson(existing, name))) {
            group.memberNames.push(name);
        }
    }
    await group.save();
    return formatGroup(group);
}

async function addExpense(user, groupId, { description, totalAmount, paidByName, date, members }) {
    const amt = Number(totalAmount);
    if (!description || !String(description).trim()) throw new GroupError(400, 'Expense description is required.');
    if (!isFinite(amt) || amt <= 0) throw new GroupError(400, 'Total amount must be greater than 0.');
    if (!paidByName || !String(paidByName).trim()) throw new GroupError(400, 'Please choose who paid.');

    const group = await findOwnedGroup(groupId, idOf(user));

    const payer = String(paidByName).trim();
    if (!group.memberNames.some(m => samePerson(m, payer))) {
        throw new GroupError(400, `"${payer}" is not a member of this group.`);
    }

    // Only split among names that really belong to this group, in the group's own spelling.
    const splitMembers = parseMemberList(members)
        .map(m => group.memberNames.find(gm => samePerson(gm, m)))
        .filter(Boolean);

    if (splitMembers.length === 0) throw new GroupError(400, 'Select at least one group member to split with.');

    group.expenses.unshift({
        description: String(description).trim(),
        totalAmount: Math.round(amt * 100) / 100,
        paidByName: group.memberNames.find(gm => samePerson(gm, payer)),
        date: date || formatDate(new Date()),
        members: splitMembers,
        splits: buildSplits(amt, splitMembers, payer)
    });

    await group.save();
    return formatGroup(group);
}

async function getBalances(user, groupId) {
    const group = await findOwnedGroup(groupId, idOf(user));
    const unsettled = [];

    for (const exp of group.expenses || []) {
        for (const sp of exp.splits || []) {
            // The payer's own share is already covered — never show it as self-debt.
            if (sp.isSettled || samePerson(sp.memberName, exp.paidByName)) continue;
            unsettled.push({
                splitId: String(sp._id),
                expenseId: String(exp._id),
                groupId: String(group._id),
                expenseDescription: exp.description,
                expenseDate: exp.date,
                fromMember: sp.memberName,
                toMember: exp.paidByName,
                amount: sp.amount,
                summaryText: `${sp.memberName} owes ${exp.paidByName} ₹${Number(sp.amount || 0).toLocaleString('en-IN')}`
            });
        }
    }
    return unsettled;
}

async function settleSplit(user, splitId) {
    if (!mongoose.isValidObjectId(splitId)) throw new GroupError(400, 'Invalid split id');

    const group = await Group.findOne({ user: idOf(user), 'expenses.splits._id': splitId });
    if (!group) throw new GroupError(404, 'Split record not found');

    let found = false;
    for (const exp of group.expenses) {
        for (const sp of exp.splits) {
            if (String(sp._id) === String(splitId)) {
                sp.isSettled = true;
                sp.settledAt = new Date();
                found = true;
                break;
            }
        }
        if (found) break;
    }
    if (!found) throw new GroupError(404, 'Split record not found');

    await group.save();
    return formatGroup(group);
}

module.exports = {
    GroupError,
    samePerson,
    parseMemberList,
    normalizeMembers,
    buildSplits,
    formatGroup,
    listGroups,
    createGroup,
    addMembers,
    addExpense,
    getBalances,
    settleSplit
};
