const express = require('express');
const router = express.Router();
const escrowController = require('../controllers/escrow.controller');
const webhookController = require('../controllers/webhook.controller');
const authController = require('../controllers/auth.controller');
const milestoneController = require('../controllers/milestone.controller');
const disputeController = require('../controllers/dispute.controller');
const vendorController = require('../controllers/vendor.controller');

const usersController = require('../controllers/users.controller');

// 1. Platform & Auth
router.post('/auth/register', authController.registerPlatform);
router.post('/auth/rotate-keys', authController.rotateKeys);
router.post('/users/create', usersController.createUser);
router.get('/platform/stats', authController.getStats);

// 2. Transaction Management
router.post('/escrow/create', escrowController.createEscrow);
router.get('/escrow/:id', escrowController.getEscrow);
router.post('/escrow/:id/release', escrowController.releaseEscrow);
router.post('/escrow/:id/refund', escrowController.refundEscrow);
router.post('/escrow/:id/release-shipping', escrowController.releaseShipping);

// 3. Milestones
router.get('/escrow/:id/milestones', milestoneController.getMilestones);
router.patch('/escrow/:id/milestones/:milestone_id/complete', milestoneController.completeMilestone);

// 4. Disputes
router.post('/dispute/initiate', disputeController.initiateDispute);
router.post('/dispute/:id/upload', disputeController.uploadEvidence);
router.get('/dispute/:id/history', disputeController.getHistory);

// 5. Vendor Wallet
router.get('/vendor/:vendor_id/ledger', vendorController.getLedger);
router.post('/vendor/:vendor_id/bank-accounts', vendorController.addBankAccount);
router.post('/vendor/:vendor_id/withdraw', vendorController.withdrawFunds);

// Webhook Route
router.post('/webhook/paystack', webhookController.handleWebhook);

// Health
router.get('/health', (req, res) => res.send('OK'));

module.exports = router;

