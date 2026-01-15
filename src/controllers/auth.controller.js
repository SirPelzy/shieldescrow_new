const sql = require('../db');
const { v4: uuidv4 } = require('uuid');

exports.registerPlatform = async (req, res) => {
    const { name, webhook_url } = req.body;

    // Simple API Key generation (In production use crypto.randomBytes)
    const api_key = 'sk_live_' + uuidv4().replace(/-/g, '');

    try {
        const result = await sql`
      INSERT INTO tenants (name, api_key, webhook_url) 
      VALUES (${name}, ${api_key}, ${webhook_url}) 
      RETURNING id, name, api_key
    `;

        res.status(201).json({
            status: 'success',
            data: result[0],
            message: 'Platform registered. Save your API Key securely.'
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.rotateKeys = async (req, res) => {
    const { tenant_id } = req.body;
    if (!tenant_id) return res.status(400).json({ error: 'Tenant ID required for prototype key rotation' });

    const new_key = 'sk_live_' + uuidv4().replace(/-/g, '');

    try {
        const result = await sql`
      UPDATE tenants SET api_key = ${new_key} WHERE id = ${tenant_id} RETURNING api_key
    `;

        if (result.length === 0) return res.status(404).json({ error: 'Tenant not found' });

        res.json({
            status: 'success',
            data: { new_api_key: result[0].api_key }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.getStats = async (req, res) => {
    const { tenant_id } = req.query;
    if (!tenant_id) return res.status(400).json({ error: 'Tenant ID required' });

    try {
        const [volRes] = await sql`
        SELECT SUM(amount) as total_volume, COUNT(*) as tx_count FROM transactions WHERE tenant_id = ${tenant_id}
    `;
        const [activeRes] = await sql`
        SELECT COUNT(*) as active_count FROM transactions 
        WHERE tenant_id = ${tenant_id} AND status IN ('AWAITING_FUNDS', 'FUNDS_HELD', 'DISPUTED')
    `;

        res.json({
            status: 'success',
            data: {
                total_volume: volRes.total_volume || 0,
                total_transactions: volRes.tx_count || 0,
                active_escrows: activeRes.active_count || 0
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
