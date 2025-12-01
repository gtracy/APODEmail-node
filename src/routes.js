const express = require('express');
const router = express.Router();
const db = require('./database');
const emailService = require('./services/emailService');
const apodService = require('./services/apodService');
const path = require('path');
const axios = require('axios');

// Serve index.html
router.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Signup Endpoint
router.post('/signup', async (req, res) => {
    console.dir(req.body);
    console.log(process.env.RECAPTCHA_SECRET_KEY);
    const { email, referral, notes, recaptchaToken } = req.body;

    // Verify Recaptcha
    if (!recaptchaToken) {
        return res.status(400).send('Recaptcha is required');
    }

    try {
        const verifyUrl = `https://www.google.com/recaptcha/api/siteverify?secret=${process.env.RECAPTCHA_SECRET_KEY}&response=${recaptchaToken}`;
        const verifyResponse = await axios.post(verifyUrl);
        if (!verifyResponse.data.success) {
            return res.status(400).send('Recaptcha verification failed');
        }
    } catch (error) {
        console.error('Recaptcha verification error:', error);
        return res.status(500).send('Error verifying recaptcha');
    }

    if (!email) {
        return res.status(400).send('Email is required');
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).send('Invalid email format');
    }

    try {
        // Check if user exists
        const existingUser = await db.getUserByEmail(email);
        if (existingUser) {
            return res.status(409).send('Email already subscribed');
        }

        await db.createUser(email, referral, notes);
        res.send('Signup successful! You have been added to the list.');
    } catch (error) {
        console.error(error);
        res.status(500).send('Database error');
    }
});

// Unsubscribe Endpoint
router.get('/unsubscribe', async (req, res) => {
    const email = req.query.email;
    if (!email) {
        return res.status(400).send('Email is required to unsubscribe');
    }

    try {
        const deleted = await db.deleteUser(email);
        if (!deleted) {
            return res.send('Email not found in subscription list.');
        }
        res.send('You have been unsubscribed.');
    } catch (error) {
        console.error(error);
        res.status(500).send('Database error');
    }
});

// User Count Endpoint (Cron)
router.get('/usercount', async (req, res) => {
    try {
        const count = await db.getUserCount();
        console.log(`User count: ${count}`);
        res.send(`Total users: ${count}`);
    } catch (error) {
        console.error(error);
        res.status(500).send('Database error');
    }
});

// Cron Trigger Endpoint (Legacy: /dailyemail/year/startMonth/endMonth)
router.get('/dailyemail/:year/:startMonth/:endMonth', async (req, res) => {
    // Verify it's a cron request (GAE adds this header)
    if (process.env.NODE_ENV === 'production' && !req.get('X-AppEngine-Cron')) {
        return res.status(403).send('Forbidden');
    }

    let { year, startMonth, endMonth } = req.params;

    // Handle 'current' legacy case if needed, though cron.yaml is specific now.
    if (year === 'current') {
        const now = new Date();
        year = now.getFullYear();
        startMonth = 1;
        endMonth = 12; // Default to full year if just 'current'
    }

    console.log(`Cron trigger received for ${year} (Months ${startMonth}-${endMonth})`);

    try {
        // Construct the worker URL base. 
        // In GAE, we can use the current host.
        const protocol = req.protocol;
        const host = req.get('host');
        const workerUrlBase = `${protocol}://${host}`;

        const count = await emailService.enqueueEmails(workerUrlBase, parseInt(year), parseInt(startMonth), parseInt(endMonth));
        res.send(`Enqueued ${count} tasks.`);
    } catch (error) {
        console.error(error);
        res.status(500).send('Error enqueuing emails');
    }
});

// Worker Endpoint (Legacy: /emailqueue)
router.post('/emailqueue', async (req, res) => {
    // Verify it's a task queue request
    if (process.env.NODE_ENV === 'production' && !req.get('X-AppEngine-TaskName')) {
        return res.status(403).send('Forbidden');
    }

    try {
        const payload = req.body;
        await emailService.sendEmailWorker(payload);
        res.status(200).send('Email sent');
    } catch (error) {
        console.error(error);
        // Return 500 to trigger Cloud Tasks retry
        res.status(500).send('Error sending email');
    }
});

// Adhoc Email Endpoint (Test)
router.get('/adhocemail', async (req, res) => {
    const fs = require('fs');
    const templatePath = path.join(__dirname, '../public/adhocemail.html');

    try {
        const body = fs.readFileSync(templatePath, 'utf8');

        const email = req.query.email;
        if (!email) {
            return res.status(400).send('Missing email parameter. Usage: /adhocemail?email=test@example.com');
        }

        // Create task for Python mailer
        const params = new URLSearchParams();
        params.append('email', email);
        params.append('subject', 'testing');
        params.append('body', body);

        const payload = {
            relativeUri: '/emailqueue',
            service: 'mailer',
            body: params.toString()
        };

        const { createTask } = require('./services/taskQueueService');
        await createTask(payload);

        res.send(body);
    } catch (error) {
        console.error(error);
        res.status(500).send('Error sending adhoc email');
    }
});

// APOD Email Test Endpoint
router.get('/testapod', async (req, res) => {
    const email = req.query.email;
    if (!email) {
        return res.status(400).send('Missing email parameter. Usage: /testapod?email=test@example.com');
    }

    try {
        // 1. Fetch APOD
        const apodData = await apodService.fetchAPOD();

        // 2. Personalize HTML
        const personalizedHtml = apodData.html.replace('{{email}}', encodeURIComponent(email));

        // 3. Create Task
        const params = new URLSearchParams();
        params.append('email', email);
        params.append('subject', apodData.title);
        params.append('body', personalizedHtml);

        const payload = {
            relativeUri: '/emailqueue',
            service: 'mailer',
            body: params.toString()
        };

        const { createTask } = require('./services/taskQueueService');
        await createTask(payload);

        // 4. Return HTML for preview
        res.send(personalizedHtml);

    } catch (error) {
        console.error(error);
        res.status(500).send('Error sending test APOD email');
    }
});

module.exports = router;
