const sql = require('../db');
const paystackService = require('../services/paystack.service');
const webhookSender = require('../services/webhook_sender.service');

const calculateProtectionFee = (amount) => {
    const fee = amount * 0.005;
    return fee > 1000 ? 1000 : fee;
};

// Helper to find or create user
const findOrCreateUser = async (sql, tenant_id, platform_user_id, role, email, name) => {
    // 1. Try to find
    const [existing] = await sql`SELECT id FROM users WHERE tenant_id = ${tenant_id} AND platform_user_id = ${platform_user_id}`;
    if (existing) return existing.id;

    // 2. Create if not found
    const [newUser] = await sql`
        INSERT INTO users (tenant_id, platform_user_id, role, email)
        VALUES (${tenant_id}, ${platform_user_id}, ${role}, ${email || null})
        RETURNING id
    `;

    // 3. Create Wallet
    await sql`INSERT INTO wallets (user_id) VALUES (${newUser.id})`;

    return newUser.id;
};

exports.createEscrow = async (req, res) => {
    try {
        const {
            tenant_id,
            amount,
            description,
            // New inputs
            buyer_platform_id,
            buyer_email,
            vendor_platform_id,
            vendor_email
        } = req.body;

        if (!tenant_id || !amount || !buyer_platform_id || !vendor_platform_id) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // 1. Calculate Fees
        const protectionFee = calculateProtectionFee(amount);

        await sql.begin(async sql => {
            // 2. Resolve Users (Find or Create)
            const buyer_id = await findOrCreateUser(sql, tenant_id, buyer_platform_id, 'buyer', buyer_email);
            const vendor_id = await findOrCreateUser(sql, tenant_id, vendor_platform_id, 'vendor', vendor_email);

            // 3. Create Transaction Record
            const [transaction] = await sql`
                INSERT INTO transactions 
                (tenant_id, buyer_id, vendor_id, amount, protection_fee, status, description)
                VALUES (${tenant_id}, ${buyer_id}, ${vendor_id}, ${amount}, ${protectionFee}, 'AWAITING_FUNDS', ${description})
                RETURNING *
            `;

            // 4. Create Milestones (if provided)
            let createdMilestones = [];
            if (req.body.milestones && Array.isArray(req.body.milestones)) {
                const milestones = req.body.milestones;

                // Validate totals
                const milestoneTotal = milestones.reduce((sum, m) => sum + (parseFloat(m.amount) || 0), 0);
                if (milestoneTotal !== parseFloat(amount)) {
                    throw new Error(`Sum of milestones (${milestoneTotal}) must equal transaction amount (${amount})`);
                }

                // Insert each milestone
                for (const m of milestones) {
                    const [newMilestone] = await sql`
                        INSERT INTO milestones (transaction_id, description, amount, status)
                        VALUES (${transaction.id}, ${m.description}, ${m.amount}, 'PENDING')
                        RETURNING *
                    `;
                    createdMilestones.push(newMilestone);
                }
            }

            res.status(201).json({
                status: 'success',
                data: transaction,
                message: 'Escrow transaction created. Proceed to payment.'
            });
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.releaseEscrow = async (req, res) => {
    try {
        const { id } = req.params;

        await sql.begin(async sql => {
            // 1. Get Transaction
            const [transaction] = await sql`SELECT * FROM transactions WHERE id = ${id} FOR UPDATE`;

            if (!transaction) throw new Error('Transaction not found');
            if (transaction.status !== 'FUNDS_HELD') throw new Error('Funds not currently held or already released');

            // 2. Calculate final amounts
            const totalAmount = parseFloat(transaction.amount);
            const protectionFee = parseFloat(transaction.protection_fee);
            const vendorAmount = totalAmount - protectionFee;

            // 3. Move funds in Ledger
            // Deduct from Vendor's Escrow Balance
            await sql`UPDATE wallets SET escrow_balance = escrow_balance - ${totalAmount} WHERE user_id = ${transaction.vendor_id}`;

            // Add to Vendor's Available Balance
            await sql`UPDATE wallets SET available_balance = available_balance + ${vendorAmount} WHERE user_id = ${transaction.vendor_id}`;

            // 4. Update Transaction Status
            await sql`UPDATE transactions SET status = 'RELEASED', updated_at = NOW() WHERE id = ${id}`;

            // 5. Hooks
            console.log(`Funds released for transaction ${id}. Vendor credited: ${vendorAmount}`);

            // Trigger Outbound Webhook: escrow.released
            webhookSender.sendWebhook(transaction.tenant_id, 'escrow.released', {
                transaction_id: transaction.id,
                status: 'RELEASED',
                amount: vendorAmount,
                currency: 'NGN',
                vendor_id: transaction.vendor_id
            });

            res.status(200).json({
                status: 'success',
                data: { released_amount: vendorAmount },
                message: 'Funds released to vendor available balance.'
            });
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.releaseShipping = async (req, res) => {
    try {
        const { id } = req.params;
        const { shipping_amount } = req.body;

        await sql.begin(async sql => {
            // 1. Get Transaction
            const [transaction] = await sql`SELECT * FROM transactions WHERE id = ${id} FOR UPDATE`;

            if (!transaction) throw new Error('Transaction not found');
            if (transaction.status !== 'FUNDS_HELD') throw new Error('Funds must be HELD to release shipping');

            // 2. Perform Transfer via Paystack

            // Adjust Ledger
            await sql`UPDATE wallets SET escrow_balance = escrow_balance - ${shipping_amount}, available_balance = available_balance + ${shipping_amount} WHERE user_id = ${transaction.vendor_id}`;

            // Get Vendor Bank Details
            const [bankAccount] = await sql`SELECT * FROM bank_accounts WHERE user_id = ${transaction.vendor_id} AND is_verified = TRUE LIMIT 1`;

            let transferResult = null;
            if (bankAccount && bankAccount.paystack_recipient_code) {
                // Trigger Payout
                transferResult = await paystackService.initiateTransfer(
                    shipping_amount,
                    bankAccount.paystack_recipient_code,
                    `Shipping Release for Tx ${id}`
                );
            }

            // Trigger Outbound Webhook: escrow.released (partial/shipping)
            webhookSender.sendWebhook(transaction.tenant_id, 'escrow.released', {
                transaction_id: transaction.id,
                status: 'PARTIALLY_RELEASED',
                amount: shipping_amount,
                currency: 'NGN',
                vendor_id: transaction.vendor_id,
                metadata: { type: 'shipping_release' }
            });

            res.status(200).json({
                status: 'success',
                data: {
                    released_shipping: shipping_amount,
                    payout_status: transferResult ? 'INITIATED' : 'QUEUED (No Bank Account)'
                },
                message: 'Shipping funds released.'
            });
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.getEscrow = async (req, res) => {
    try {
        const { id } = req.params;
        const [transaction] = await sql`SELECT * FROM transactions WHERE id = ${id}`;
        if (!transaction) return res.status(404).json({ error: 'Transaction not found' });

        res.json({ status: 'success', data: transaction });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.refundEscrow = async (req, res) => {
    try {
        const { id } = req.params;

        await sql.begin(async sql => {
            const [transaction] = await sql`SELECT * FROM transactions WHERE id = ${id} FOR UPDATE`;

            if (!transaction) throw new Error('Transaction not found');
            if (!['FUNDS_HELD', 'DISPUTED'].includes(transaction.status)) {
                throw new Error('Funds are not in a refundable state');
            }

            await sql`UPDATE wallets SET escrow_balance = escrow_balance - ${transaction.amount} WHERE user_id = ${transaction.vendor_id}`;
            await sql`UPDATE transactions SET status = 'REFUNDED', updated_at = NOW() WHERE id = ${id}`;

            res.json({
                status: 'success',
                message: 'Transaction refunded.',
                note: 'In production, this triggers a gateway refund to the buyer source.'
            });
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
