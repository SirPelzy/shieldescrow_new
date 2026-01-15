const postgres = require('postgres');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL;
const sql = postgres(connectionString, {
    ssl: { rejectUnauthorized: false } // Required for Supabase usually, but postgres.js handles ssl smartly via connection string params too.
});

async function migrate() {
    try {
        console.log('Connected to database...');

        const schemaPath = path.join(__dirname, '../src/db/schema.sql');
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');

        console.log('Running schema...');
        // postgres.js doesn't execute multi-statement SQL strings easily in tagged templates without `sql.file` or similar, 
        // but simply passing the string works if we use the function call `sql(string)`.
        // Actually, `sql` is a function. sql`...` is for parameters. 
        // To run a raw string of sql with no params: sql(query) SHOULD work according to docs but typically sql`...` is preferred. 
        // However, schema.sql has multiple statements separated by semicolons. 
        // postgres.js simple query might struggle with multiple commands unless we use `sql.unsafe(schemaSql)`.

        await sql.unsafe(schemaSql);

        console.log('Schema applied successfully.');

        await sql.end();
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        await sql.end();
        process.exit(1);
    }
}

migrate();
