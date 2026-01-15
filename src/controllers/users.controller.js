const sql = require('../db');

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
                RETURNING id, platform_user_id, role
            `;

            // 2. Create Wallet
            await sql`
                INSERT INTO wallets (user_id)
                VALUES (${user.id})
            `;

            res.status(201).json({
                status: 'success',
                data: user,
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
