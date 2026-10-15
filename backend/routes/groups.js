const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const groupService = require('../services/groupService');

/**
 * Shared & group expenses. Every handler is scoped to req.user (verified JWT) —
 * a group id from the URL is only ever resolved inside that owner filter.
 */
async function respond(res, work) {
    try {
        const data = await work();
        res.json({ success: true, data });
    } catch (error) {
        if (error instanceof groupService.GroupError) {
            return res.status(error.status).json({ success: false, message: error.message });
        }
        if (error.name === 'ValidationError' || error.name === 'CastError') {
            return res.status(400).json({ success: false, message: 'Invalid request data.' });
        }
        res.status(error.status || 500).json({ success: false, message: error.message });
    }
}

// GET /api/groups
router.get('/', protect, (req, res) => respond(res, () => groupService.listGroups(req.user)));

// POST /api/groups
router.post('/', protect, (req, res) => respond(res, () =>
    groupService.createGroup(req.user, req.body || {})));

// POST /api/groups/:id/members
router.post('/:id/members', protect, (req, res) => respond(res, () =>
    groupService.addMembers(req.user, req.params.id, (req.body || {}).memberName)));

// POST /api/groups/:id/expenses
router.post('/:id/expenses', protect, (req, res) => respond(res, () =>
    groupService.addExpense(req.user, req.params.id, req.body || {})));

// GET /api/groups/:id/balances
router.get('/:id/balances', protect, (req, res) => respond(res, () =>
    groupService.getBalances(req.user, req.params.id)));

// POST /api/groups/splits/:splitId/settle
router.post('/splits/:splitId/settle', protect, (req, res) => respond(res, () =>
    groupService.settleSplit(req.user, req.params.splitId)));

module.exports = router;
