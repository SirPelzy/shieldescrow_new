const axios = require('axios');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const sql = require('../db');

class WebhookSenderService {
    /**
     * Send a webhook notification with retries
     * @param {string} tenantId 
     * @param {string} eventName 
     * @param {object} dataPayload 
     */
    async sendWebhook(tenantId, eventName, dataPayload) {
        const tRes = await sql`SELECT webhook_url, api_key FROM tenants WHERE id = ${tenantId}`;
        if (tRes.length === 0) return;
        const { webhook_url, api_key } = tRes[0];

        if (!webhook_url) return;

        // Construct Payload
        const payload = {
            event: eventName,
            event_id: `evt_${uuidv4()}`,
            created_at: new Date().toISOString(),
            tenant_id: tenantId,
            data: dataPayload
        };

        // Sign Payload
        const signature = crypto
            .createHmac('sha256', api_key)
            .update(JSON.stringify(payload))
            .digest('hex');

        payload.signature = signature;

        // Send with Retries
        this.attemptSend(webhook_url, payload, 0);
    }

    async attemptSend(url, payload, attempt) {
        const backoffStrategy = [0, 5 * 60 * 1000, 60 * 60 * 1000, 24 * 60 * 60 * 1000]; // Immediate, 5m, 1h, 24h

        if (attempt >= backoffStrategy.length) {
            console.log(`Webhook failed permanently after ${attempt} attempts: ${payload.event_id}`);
            // Log to 'failed_webhooks'
            return;
        }

        const delay = backoffStrategy[attempt];

        setTimeout(async () => {
            try {
                console.log(`Sending webhook ${payload.event} (Attempt ${attempt + 1})...`);
                await axios.post(url, payload, { timeout: 5000 });
                console.log(`Webhook sent successfully: ${payload.event_id}`);
            } catch (error) {
                console.error(`Webhook attempt ${attempt + 1} failed: ${error.message}`);
                this.attemptSend(url, payload, attempt + 1);
            }
        }, delay);
    }
}

module.exports = new WebhookSenderService();
