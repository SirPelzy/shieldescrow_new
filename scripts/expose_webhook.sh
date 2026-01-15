#!/bin/bash
echo "To expose your local webhook to Paystack:"
echo "1. Install ngrok if not installed: 'brew install ngrok'"
echo "2. Run this command: 'ngrok http 3000'"
echo "3. Copy the 'Forwarding' URL (e.g., https://a1b2c3d4.ngrok.io)"
echo "4. Update your Paystack Dashboard > Settings > Webhooks with:"
echo "   URL: [YOUR_NGROK_URL]/v1/webhook/paystack"
echo "   Checking 'charge.success' and 'transfer.success' events."
