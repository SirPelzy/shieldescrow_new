const paystackService = require('../src/services/paystack.service');
const escrowController = require('../src/controllers/escrow.controller');

console.log('--- Verification Start ---');

// 1. Verify Service Method
if (typeof paystackService.initializeTransaction === 'function') {
    console.log('✅ paystackService.initializeTransaction exists.');
} else {
    console.error('❌ paystackService.initializeTransaction is missing!');
    process.exit(1);
}

// 2. Verify Controller Syntax
try {
    console.log('✅ escrowController loaded successfully (Syntax OK).');
} catch (e) {
    console.error('❌ escrowController failed to load:', e.message);
    process.exit(1);
}

console.log('--- Verification Complete ---');
console.log('To fully test, you need to POST /escrow with a buyer_email and amount.');
console.log('The response should now contain "authorization_url" within "payment_info".');
