const sql = require('../db');
const paystackService = require('../services/paystack.service');

exports.getLedger = async (req, res) => {
    const { vendor_id } = req.params;
    try {
        const [wallet] = await sql`SELECT * FROM wallets WHERE user_id = ${vendor_id}`;
        if (!wallet) return res.status(404).json({ error: 'Wallet not found for vendor' });
        res.json({ status: 'success', data: wallet });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.addBankAccount = async (req, res) => {
    const { vendor_id } = req.params;
    const { bank_code, account_number } = req.body;

    try {
        // 1. Verify Name
        const resolvedAccount = await paystackService.verifyAccount(account_number, bank_code);

        // 2. Create Transfer Recipient
        const recipient = await paystackService.createTransferRecipient(resolvedAccount.account_name, account_number, bank_code);

        // 3. Save to DB
        const [account] = await sql`
            INSERT INTO bank_accounts (user_id, bank_name, account_number, account_name, paystack_recipient_code, is_verified)
             VALUES (${vendor_id}, ${resolvedAccount.bank_id}, ${account_number}, ${resolvedAccount.account_name}, ${recipient.recipient_code}, TRUE)
             RETURNING *
        `;

        res.status(201).json({
            status: 'success',
            data: account,
            message: 'Bank account verified and linked.'
        });

    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

exports.withdrawFunds = async (req, res) => {
    const { vendor_id } = req.params;
    const { amount } = req.body;

    try {
        await sql.begin(async sql => {
            // 1. Check Balance
            const [wallet] = await sql`SELECT * FROM wallets WHERE user_id = ${vendor_id} FOR UPDATE`;

            if (parseFloat(wallet.available_balance) < parseFloat(amount)) {
                throw new Error('Insufficient available balance');
            }

            // 2. Get Bank Account
            const [bank] = await sql`SELECT * FROM bank_accounts WHERE user_id = ${vendor_id} AND is_verified = TRUE ORDER BY created_at DESC LIMIT 1`;
            if (!bank) throw new Error('No verified bank account provided');

            // 3. Initiate Transfer
            const transfer = await paystackService.initiateTransfer(amount, bank.paystack_recipient_code, 'Withdrawal from ShieldEscrow');

            // 4. Update Ledger
            await sql`UPDATE wallets SET available_balance = available_balance - ${amount}, withdrawn_balance = withdrawn_balance + ${amount} WHERE user_id = ${vendor_id}`;

            // 5. Log Payout Record
            await sql`INSERT INTO payouts (user_id, amount, bank_account_id, status, paystack_transfer_code) VALUES (${vendor_id}, ${amount}, ${bank.id}, 'PENDING', ${transfer.transfer_code})`;

            res.json({
                status: 'success',
                message: 'Withdrawal initiated successfully.'
            });
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
