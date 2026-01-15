const express = require('express');
const cors = require('cors');
const routes = require('./routes');

const app = express();

app.use(cors());
// Capture raw body for webhook signature verification
app.use(express.json({
    verify: (req, res, buf) => {
        req.rawBody = buf;
    }
}));
app.use(express.urlencoded({ extended: true }));

// Health Check
app.get('/', (req, res) => {
    res.status(200).json({ status: 'active', service: 'ShieldEscrow API' });
});

app.use('/v1', routes);

module.exports = app;
