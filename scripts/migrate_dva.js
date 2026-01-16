const postgres = require('postgres');
require('dotenv').config();
const config = require('../src/config');

const connectionString = config.DATABASE_URL;
const sql = postgres(connectionString);

async function migrateDVA() {
    try {
        console.log('Running DVA Migration...');

        // 1. Add paystack_customer_code to users
        try {
            await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS paystack_customer_code VARCHAR(100)`;
            console.log('Added paystack_customer_code to users');
        } catch (e) {
            console.log('paystack_customer_code might already exist:', e.message);
        }

        // 2. Add virtual_account_number to wallets
        try {
            await sql`ALTER TABLE wallets ADD COLUMN IF NOT EXISTS virtual_account_number VARCHAR(20)`;
            console.log('Added virtual_account_number to wallets');
        } catch (e) {
            console.log('virtual_account_number might already exist:', e.message);
        }

        // 3. Add virtual_bank_name to wallets
        try {
            await sql`ALTER TABLE wallets ADD COLUMN IF NOT EXISTS virtual_bank_name VARCHAR(100)`;
            console.log('Added virtual_bank_name to wallets');
        } catch (e) {
            console.log('virtual_bank_name might already exist:', e.message);
        }

        console.log('DVA Migration completed.');
        await sql.end();
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        await sql.end();
        process.exit(1);
    }
}

migrateDVA();
