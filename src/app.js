const express = require('express');
const cors = require('cors');
const routes = require('./routes');

const app = express();

app.use(cors());
// Raw body needed for webhook signature verification? 
// Paystack sends JSON, but for signature verification we might need raw buffer if using a specific verifying middleware.
// For now, standard json parser is fine as we can use JSON.stringify on the body for verification as done in the service.
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health Check
app.get('/', (req, res) => {
    res.status(200).json({ status: 'active', service: 'ShieldEscrow API' });
});

app.use('/v1', routes);

module.exports = app;
