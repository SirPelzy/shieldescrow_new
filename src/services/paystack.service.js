const axios = require('axios');
const crypto = require('crypto');
const config = require('../config');

const paystack = axios.create({
    baseURL: 'https://api.paystack.co',
    headers: {
        Authorization: `Bearer ${config.PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
    },
});

// Debug Interceptor
paystack.interceptors.response.use(
    response => response,
    error => {
        console.error('Paystack API Error:', {
            url: error.config?.url,
            method: error.config?.method,
            status: error.response?.status,
            data: error.response?.data,
            message: error.message
        });
        return Promise.reject(error);
    }
);

class PaystackService {
    /**
     * Verify a NUBAN account number
     */
    async verifyAccount(accountNumber, bankCode) {
        try {
            const response = await paystack.get(`/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`);
            return response.data.data;
        } catch (error) {
            throw new Error(`Account verification failed: ${error.response?.data?.message || error.message}`);
        }
    }

    /**
     * Create a Transfer Recipient
     */
    async createTransferRecipient(name, accountNumber, bankCode) {
        try {
            const response = await paystack.post('/transferrecipient', {
                type: 'nuban',
                name,
                account_number: accountNumber,
                bank_code: bankCode,
                currency: 'NGN',
            });
            return response.data.data;
        } catch (error) {
            throw new Error(`Create recipient failed: ${error.response?.data?.message || error.message}`);
        }
    }

    /**
     * Initiate a Transfer (Payout)
     */
    async initiateTransfer(amount, recipientCode, reason) {
        try {
            // Amount is in kobo
            const response = await paystack.post('/transfer', {
                source: 'balance',
                amount: Math.round(amount * 100),
                recipient: recipientCode,
                reason,
            });
            return response.data.data;
        } catch (error) {
            throw new Error(`Transfer failed: ${error.response?.data?.message || error.message}`);
        }
    }

    /**
     * Create Dedicated Virtual Account (DVA) for a customer
     * Note: This usually requires an existing customer.
     */
    async createDedicatedVirtualAccount(customerCode, preferredBank) {
        try {
            const response = await paystack.post('/dedicated_account', {
                customer: customerCode,
                preferred_bank: preferredBank
            });
            return response.data.data;
        } catch (error) {
            throw new Error(`DVA creation failed: ${error.response?.data?.message || error.message}`);
        }
    }

    /**
     * Create Paystack Customer
     */
    async createCustomer(email, first_name, last_name, phone) {
        try {
            const response = await paystack.post('/customer', {
                email,
                first_name,
                last_name,
                phone
            });
            return response.data.data;
        } catch (error) {
            throw new Error(`Create customer failed: ${error.response?.data?.message || error.message}`);
        }
    }

    /**
     * Verify Webhook Signature
     */
    verifySignature(signature, body) {
        const hash = crypto
            .createHmac('sha512', config.PAYSTACK_SECRET_KEY)
            .update(body)
            .digest('hex');

        // Debug Log (Temporary)
        if (hash !== signature) {
            console.log('--- Signature Mismatch ---');
            console.log('Received:', signature);
            console.log('Calculated:', hash);
            console.log('--------------------------');
        }

        return hash === signature;
    }
}

module.exports = new PaystackService();
