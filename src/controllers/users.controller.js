const sql = require('../db');
const paystackService = require('../services/paystack.service');

exports.createUser = async (req, res) => {
    const { tenant_id, platform_user_id, name, email, role } = req.body;

    if (!tenant_id || !platform_user_id || !role) {
        return res.status(400).json({ error: 'Missing required fields: tenant_id, platform_user_id, role' });
    }

    try {
        await sql.begin(async sql => {
            // 1. Create User
            const [user] = await sql`
                INSERT INTO users (tenant_id, platform_user_id, email, role)
                VALUES (${tenant_id}, ${platform_user_id}, ${email}, ${role})
                RETURNING id, platform_user_id, role, email
            `;

            // 1b. Create Paystack Customer & DVA (if buyer)
            let paystackCustomerCode = null;
            let virtualAccount = null;

            if (role === 'buyer') {
                try {
                    const nameParts = (name || 'Unknown User').split(' ');
                    const firstName = nameParts[0];
                    const lastName = nameParts.slice(1).join(' ') || 'User';

                    // Create Customer
                    const customer = await paystackService.createCustomer(email, firstName, lastName, '+2340000000000'); // TODO: Collect phone
                    paystackCustomerCode = customer.customer_code;

                    // Update User with Customer Code
                    await sql`UPDATE users SET paystack_customer_code = ${paystackCustomerCode} WHERE id = ${user.id}`;

                    // Create DVA
                    const dvaElement = await paystackService.createDedicatedVirtualAccount(paystackCustomerCode, 'wema-bank'); // Defaulting to Wema
                    virtualAccount = {
                        account_number: dvaElement.account_number,
                        bank_name: dvaElement.bank.name
                    };

                } catch (dvaError) {
                    console.error('DVA Creation Failed:', dvaError.message);
                    // We continue, DVA can be retried later
                }
            }

            // 2. Create Wallet
            await sql`
                INSERT INTO wallets (user_id, virtual_account_number, virtual_bank_name)
                VALUES (${user.id}, ${virtualAccount?.account_number || null}, ${virtualAccount?.bank_name || null})
            `;

            res.status(201).json({
                status: 'success',
                data: { ...user, virtual_account: virtualAccount },
                message: 'User created and wallet initialized.'
            });
        });
    } catch (error) {
        // Handle duplicate user error
        if (error.code === '23505') {
            return res.status(409).json({ error: 'User already exists for this tenant.' });
        }
        res.status(500).json({ error: error.message });
    }
};
