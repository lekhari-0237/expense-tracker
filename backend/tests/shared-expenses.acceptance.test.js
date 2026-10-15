'use strict';

/**
 * Shared & group expenses acceptance suite (Phase 8): member parsing, exact
 * split maths, balances, settlement and ownership protection over real HTTP +
 * the isolated MongoDB test database.
 *
 * Run: node backend/tests/shared-expenses.acceptance.test.js
 */

const h = require('./helpers');
const { createRunner, ok, includes, notIncludes, matches, equal, closeTo } = require('./runner');

const Group = require('../models/Group');

const A = `group_user_a_${Date.now()}`;
const B = `group_user_b_${Date.now()}`;
const PW = 'Test#12345';

let ctxA = null;
let ctxB = null;

function data(res) {
    return res.body && res.body.data !== undefined ? res.body.data : (res.body || {});
}

async function run(group, test) {
    await h.startServer();
    await h.resetData();
    ctxA = await h.registerAndLogin(A, PW);
    ctxB = await h.registerAndLogin(B, PW);

    const createGroup = async (body, token = ctxA.token) =>
        data(await h.request('POST', '/groups', { token, body }));

    const addExpense = async (groupId, body, token = ctxA.token) =>
        await h.request('POST', `/groups/${groupId}/expenses`, { token, body });

    // ------------------------------------------------------------------
    await group('Shared & group expenses', async () => {

        await test('S01 comma-separated members are trimmed, de-duplicated and include the owner', async () => {
            const g = await createGroup({ groupName: 'Flatmates', memberNames: `${A},  Ravi , Priya; ravi , Sam ` });
            const names = g.members.map(m => m.name);
            equal(names.length, 4, `expected 4 unique members, got ${JSON.stringify(names)}`);
            includes(names[0], A, 'owner listed first');
            equal(names[1], 'Ravi', 'second member');
            equal(g.members[0].isOwner, true, 'owner flagged');
            equal(g.members.filter(m => m.isOwner).length, 1, 'exactly one owner');
        });

        await test('S02 group id is a plain string usable by the frontend', async () => {
            const g = await createGroup({ groupName: 'Trip', memberNames: 'Ravi, Priya' });
            equal(typeof g.id, 'string', 'id is a string');
            equal(g.id, g._id, 'id and _id agree');
            matches(g.id, /^[0-9a-f]{24}$/i, 'id is a hex ObjectId');
            const listed = data(await h.request('GET', '/groups', { token: ctxA.token }));
            ok(listed.some(x => x.id === g.id), 'same id returned by the list endpoint');
        });

        await test('S03 split sums EXACTLY to the total (paise-level, 3-way on ₹1,000)', async () => {
            const g = await createGroup({ groupName: 'Split maths', memberNames: 'Ravi, Priya' });
            const res = await addExpense(g.id, {
                description: 'Wi-Fi bill', totalAmount: 1000, paidByName: g.members[0].name,
                members: g.memberNames
            });
            const exp = data(res).expenses[0];
            equal(exp.splits.length, 3, 'three shares');
            const sum = exp.splits.reduce((s, x) => s + Math.round(x.amount * 100), 0);
            equal(sum, 100000, `shares must add to 1000.00, got ${sum / 100}`);
            const amounts = exp.splits.map(s => s.amount).sort((a, b) => b - a);
            closeTo(amounts[0] - amounts[1], 0.01, 0.0001, 'leftover paise spread by at most 1 paisa');
        });

        await test('S04 the payer is never in debt to themselves', async () => {
            const g = await createGroup({ groupName: 'No self debt', memberNames: 'Ravi, Priya' });
            const payer = g.members[0].name;
            await addExpense(g.id, { description: 'Groceries', totalAmount: 900, paidByName: payer, members: g.memberNames });
            const balances = data(await h.request('GET', `/groups/${g.id}/balances`, { token: ctxA.token }));
            ok(balances.length === 2, `expected 2 unsettled shares, got ${balances.length}`);
            ok(!balances.some(b => b.fromMember.toLowerCase() === payer.toLowerCase()), 'payer has no debt');
            ok(!balances.some(b => b.toMember.toLowerCase() === payer.toLowerCase() && b.fromMember.toLowerCase() === payer.toLowerCase()), 'no self-debt row');
            balances.forEach(b => notIncludes(b.summaryText, `${payer} owes ${payer}`, 'summary wording'));
        });

        await test('S05 every member and amount appears in the balances', async () => {
            const g = await createGroup({ groupName: 'Everyone listed', memberNames: 'Ravi, Priya, Sam' });
            await addExpense(g.id, { description: 'Dinner', totalAmount: 1000, paidByName: g.members[0].name, members: g.memberNames });
            const balances = data(await h.request('GET', `/groups/${g.id}/balances`, { token: ctxA.token }));
            const owed = balances.map(b => b.fromMember).sort();
            equal(owed.join(','), 'Priya,Ravi,Sam', `all non-payers listed, got ${owed.join(',')}`);
            ok(balances.every(b => b.amount === 250), `each share ₹250: ${balances.map(b => b.amount).join(', ')}`);
            const total = balances.reduce((s, b) => s + Math.round(b.amount * 100), 0);
            equal(total, 75000, 'the three non-payer shares are 4-way splits of ₹1,000 (₹250 each)');
            ok(balances.every(b => b.splitId && b.groupId === g.id), 'split ids are strings tied to the group');
        });

        await test('S06 splitting with a non-member is rejected', async () => {
            const g = await createGroup({ groupName: 'Outsider', memberNames: 'Ravi' });
            const res = await addExpense(g.id, { description: 'Cab', totalAmount: 300, paidByName: 'Rahul From Another Flat', members: ['Rahul From Another Flat'] });
            equal(res.status, 400, '400 for a payer who is not a member');
            const doc = await Group.findById(g.id).lean();
            equal(doc.expenses.length, 0, 'nothing stored');
        });

        await test('S07 invalid expense payloads are rejected without touching data', async () => {
            const g = await createGroup({ groupName: 'Validation', memberNames: 'Ravi' });
            const before = await Group.findById(g.id).lean();
            const bad = [
                { description: '', totalAmount: 500, paidByName: 'Ravi', members: ['Ravi'] },
                { description: 'Zero', totalAmount: 0, paidByName: 'Ravi', members: ['Ravi'] },
                { description: 'Negative', totalAmount: -400, paidByName: 'Ravi', members: ['Ravi'] },
                { description: 'No payer', totalAmount: 400, paidByName: '', members: ['Ravi'] }
            ];
            for (const body of bad) {
                const res = await addExpense(g.id, body);
                equal(res.status, 400, `400 expected for ${JSON.stringify(body)}`);
            }
            const after = await Group.findById(g.id).lean();
            equal(after.expenses.length, before.expenses.length, 'no expense rows added');
        });

        await test('S08 settling a split removes only that debt', async () => {
            const g = await createGroup({ groupName: 'Settle', memberNames: 'Ravi, Priya' });
            await addExpense(g.id, { description: 'Cleaning', totalAmount: 900, paidByName: g.members[0].name, members: g.memberNames });
            const before = data(await h.request('GET', `/groups/${g.id}/balances`, { token: ctxA.token }));
            equal(before.length, 2, 'two debts before');
            const target = before[0];
            const settled = data(await h.request('POST', `/groups/splits/${target.splitId}/settle`, { token: ctxA.token }));
            ok(settled.expenses[0].splits.some(s => s.isSettled), 'split flagged settled');
            const after = data(await h.request('GET', `/groups/${g.id}/balances`, { token: ctxA.token }));
            equal(after.length, 1, 'only the settled debt removed');
            ok(!after.some(b => b.splitId === target.splitId), 'settled split no longer in balances');
        });

        await test('S09 another user cannot read or modify this group', async () => {
            const g = await createGroup({ groupName: 'Private', memberNames: 'Ravi' });
            await addExpense(g.id, { description: 'Secret', totalAmount: 400, paidByName: g.members[0].name, members: g.memberNames });

            const read = await h.request('GET', `/groups/${g.id}/balances`, { token: ctxB.token });
            ok(read.status === 404 || read.status === 401, `B cannot read balances (got ${read.status})`);
            const write = await addExpense(g.id, { description: 'Injected', totalAmount: 9999, paidByName: 'Ravi', members: ['Ravi'] }, ctxB.token);
            ok(write.status === 404 || write.status === 401, `B cannot add expenses (got ${write.status})`);
            const fakeSplitId = '650000000000000000000000';
            const settle = await h.request('POST', `/groups/splits/${fakeSplitId}/settle`, { token: ctxB.token });
            ok(settle.status === 404 || settle.status === 400 || settle.status === 401, `settle is ownership-checked (got ${settle.status})`);

            const doc = await Group.findById(g.id).lean();
            equal(doc.expenses.length, 1, 'no injected expense');
            equal(doc.expenses[0].description, 'Secret', 'original expense intact');
            const own = data(await h.request('GET', '/groups', { token: ctxB.token }));
            ok(!own.some(x => x.id === g.id), "B's group list does not expose A's group");
        });

        await test('S10 adding a member later keeps earlier expenses and shows no stale state', async () => {
            const g = await createGroup({ groupName: 'Growing', memberNames: 'Ravi' });
            await addExpense(g.id, { description: 'Month 1 rent', totalAmount: 1000, paidByName: g.members[0].name, members: g.memberNames });
            const updated = data(await h.request('POST', `/groups/${g.id}/members`, { token: ctxA.token, body: { memberName: 'Priya, sam, RAVI' } }));
            const names = updated.members.map(m => m.name);
            equal(names.length, 4, `owner + Ravi + Priya + sam, no RAVI duplicate; got ${names.join(', ')}`);
            equal(names.filter(n => n.toLowerCase() === 'ravi').length, 1, 'RAVI matched the existing Ravi');
            includes(names.join(','), 'Priya', 'new member added');
            includes(names.join(','), 'sam', 'new member added');
            equal(updated.expenses.length, 1, 'earlier expense preserved');
            equal(updated.expenses[0].splits.length, 2, 'earlier split untouched by the new member');
            const listed = data(await h.request('GET', '/groups', { token: ctxA.token }));
            const again = listed.find(x => x.id === g.id);
            equal(again.memberNames.length, 4, 'list endpoint reflects the new member (no stale cache)');
        });
    });
}

(async () => {
    const { group, test, summary } = createRunner('Shared expenses acceptance');
    let crashed = null;
    try {
        await run(group, test);
    } catch (fatal) {
        crashed = fatal;
    }
    const s = summary();
    if (crashed) console.error('\nSUITE CRASHED:', crashed.stack || crashed.message);
    await h.stopAll();
    process.exit(crashed ? 1 : (s.failed ? 1 : 0));
})();
