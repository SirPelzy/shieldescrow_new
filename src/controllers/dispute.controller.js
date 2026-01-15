const sql = require('../db');
const webhookSender = require('../services/webhook_sender.service');

exports.initiateDispute = async (req, res) => {
    try {
        const { transaction_id, reason } = req.body;

        await sql.begin(async sql => {
            // Verify Tx
            const [transaction] = await sql`SELECT * FROM transactions WHERE id = ${transaction_id} FOR UPDATE`;

            if (!transaction) throw new Error('Transaction not found');
            if (transaction.status !== 'FUNDS_HELD') throw new Error('Cannot dispute transaction in current state');

            // Create Dispute
            const [dispute] = await sql`
                INSERT INTO disputes (transaction_id, reason, status) VALUES (${transaction_id}, ${reason}, 'OPEN') RETURNING *
            `;

            // Update Tx Status
            await sql`UPDATE transactions SET status = 'DISPUTED', updated_at = NOW() WHERE id = ${transaction_id}`;

            // Trigger Outbound Webhook: escrow.disputed
            webhookSender.sendWebhook(transaction.tenant_id, 'escrow.disputed', {
                transaction_id: transaction.id,
                status: 'DISPUTED',
                dispute_id: dispute.id,
                reason: reason
            });

            res.status(201).json({
                status: 'success',
                data: {
                    dispute: dispute,
                    hosted_dispute_url: `https://shieldescrow.com/dispute/${dispute.id}/evidence` // Mock URL
                }
            });
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.uploadEvidence = async (req, res) => {
    const { id } = req.params; // Dispute ID
    const { evidence_url } = req.body;

    try {
        await sql`UPDATE disputes SET evidence_url = ${evidence_url} WHERE id = ${id}`;
        res.json({ status: 'success', message: 'Evidence uploaded linked.' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.getHistory = async (req, res) => {
    const { id } = req.params;
    try {
        const [dispute] = await sql`SELECT * FROM disputes WHERE id = ${id}`;
        res.json({ status: 'success', data: dispute });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
