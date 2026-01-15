try {
    console.log('Verifying build...');
    require('../src/config');
    require('../src/db');
    require('../src/services/paystack.service');
    require('../src/controllers/escrow.controller');
    require('../src/controllers/webhook.controller');
    require('../src/routes');
    require('../src/app');
    // require('../src/server'); // Don't require server as it listens on port
    console.log('Build verification successful: All modules loaded without syntax errors.');
} catch (error) {
    console.error('Build verification failed:', error);
    process.exit(1);
}
