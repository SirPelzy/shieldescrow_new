const sql = require('../db');
const webhookSender = require('../services/webhook_sender.service');

exports.getMilestones = async (req, res) => {
    try {
        const { id } = req.params; // Transaction ID
        const milestones = await sql`SELECT * FROM milestones WHERE transaction_id = ${id}`;
        res.json({ status: 'success', data: milestones });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.completeMilestone = async (req, res) => {
    try {
        const { id, milestone_id } = req.params;

        await sql.begin(async sql => {
            // 1. Get Milestone
            const [milestone] = await sql`SELECT * FROM milestones WHERE id = ${milestone_id} FOR UPDATE`;

            if (!milestone) throw new Error('Milestone not found');
            if (milestone.status === 'COMPLETED') throw new Error('Milestone already completed');

            // 2. Get Transaction to verify linkage and status
            const [transaction] = await sql`SELECT * FROM transactions WHERE id = ${milestone.transaction_id}`;

            if (transaction.status !== 'FUNDS_HELD') throw new Error('Transaction funds must be HELD to release milestone payments');

            // 3. Release Funds
            await sql`UPDATE wallets SET escrow_balance = escrow_balance - ${milestone.amount}, available_balance = available_balance + ${milestone.amount} WHERE user_id = ${transaction.vendor_id}`;

            // 4. Mark Milestone Complete
            await sql`UPDATE milestones SET status = 'COMPLETED' WHERE id = ${milestone_id}`;

            // Trigger Outbound Webhook: escrow.released (partial)
            webhookSender.sendWebhook(transaction.tenant_id, 'escrow.released', {
                transaction_id: transaction.id,
                milestone_id: milestone_id,
                status: 'PARTIALLY_RELEASED',
                amount: milestone.amount,
                currency: 'NGN',
                vendor_id: transaction.vendor_id
            });

            res.json({
                status: 'success',
                message: `Milestone completed. ${milestone.amount} released to vendor.`,
            });
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
