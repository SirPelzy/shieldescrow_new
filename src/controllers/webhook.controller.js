const sql = require('../db');
const paystackService = require('../services/paystack.service');
const webhookSender = require('../services/webhook_sender.service');

exports.handleWebhook = async (req, res) => {
    // 1. Validate Signature
    const signature = req.headers['x-paystack-signature'];
    const isValid = paystackService.verifySignature(signature, req.rawBody);

    if (!isValid) {
        return res.status(401).send('Invalid Signature');
    }

    const event = req.body;

    // Respond 200 immediately
    res.sendStatus(200);

    // Process event asynchronously
    try {
        switch (event.event) {
            case 'charge.success':
                await handleChargeSuccess(event.data);
                break;
            case 'transfer.success':
                console.log('Transfer success:', event.data.reference);
                break;
            default:
                console.log('Unhandled event:', event.event);
        }
    } catch (error) {
        console.error('Webhook processing error:', error);
    }
};

async function handleChargeSuccess(data) {
    const reference = data.reference;

    try {
        await sql.begin(async sql => {
            // Find Transaction
            const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reference);

            let transaction;
            if (isUUID) {
                [transaction] = await sql`SELECT * FROM transactions WHERE id = ${reference} FOR UPDATE`;
            } else {
                [transaction] = await sql`SELECT * FROM transactions WHERE paystack_reference = ${reference} FOR UPDATE`;
            }

            if (!transaction) {
                console.log('Transaction not found for ref:', reference);
                return;
            }

            if (transaction.status === 'AWAITING_FUNDS') {
                // Update Status
                await sql`UPDATE transactions SET status = 'FUNDS_HELD', updated_at = NOW() WHERE id = ${transaction.id}`;

                // Update Vendor's Escrow Balance
                await sql`UPDATE wallets SET escrow_balance = escrow_balance + ${transaction.amount} WHERE user_id = ${transaction.vendor_id}`;

                console.log(`Funds held for Tx ${transaction.id}`);

                // Trigger Outbound Webhook: escrow.funded
                webhookSender.sendWebhook(transaction.tenant_id, 'escrow.funded', {
                    transaction_id: transaction.id,
                    status: 'FUNDS_HELD',
                    amount: transaction.amount,
                    currency: 'NGN',
                    vendor_id: transaction.vendor_id
                });
            }
        });

    } catch (error) {
        console.error('Error in handleChargeSuccess:', error);
    }
}
