const express = require('express');
const router = express.Router();
const db = require('./database');
const emailService = require('./services/emailService');
const apodService = require('./services/apodService');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { createTask } = require('./services/taskQueueService');

// Serve index.html
router.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Signup Endpoint
router.post('/signup', async (req, res) => {
    console.dir(req.body);
    console.log(process.env.RECAPTCHA_SECRET_KEY);
    const { email, notes, recaptchaToken } = req.body;

    // Verify Recaptcha
    if (process.env.MOCK_GCP !== 'true') {
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
    } else {
        console.log("Skipping Recaptcha verification (MOCK_GCP=true)");
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

        await db.createUser(email, notes);

        // Send Confirmation Email
        try {
            const templatePath = path.join(__dirname, 'templates/added-email.html');
            let html = fs.readFileSync(templatePath, 'utf8');
            html = html.replace('{{ email }}', email);

            const params = new URLSearchParams();
            params.append('email', email);
            params.append('subject', 'APOD Email Signup Confirmation');
            params.append('body', html);

            const payload = {
                relativeUri: '/emailqueue',
                service: 'mailer',
                body: params.toString()
            };

            console.log(`Attempting to enqueue signup confirmation for ${email}`);
            await createTask(payload);
            console.log(`Enqueued signup confirmation for ${email}`);



        } catch (emailError) {
            console.error('Error sending confirmation email:', emailError);
            // Don't fail the signup if email fails, just log it
        }

        res.send('Signup successful! You have been added to the list.');
    } catch (error) {
        console.error(error);
        res.status(500).send('Database error');
    }
});

// Unsubscribe Endpoint
router.get('/unsubscribe', async (req, res) => {
    console.dir(req.query);
    const email = req.query.email;
    if (!email) {
        return res.status(400).send('Email is required to unsubscribe');
    }

    try {
        const deleted = await db.deleteUser(email);
        if (!deleted) {
            return res.send('Email not found in subscription list.');
        }
        // Send Unsubscribe Confirmation Email
        try {
            const templatePath = path.join(__dirname, 'templates/removed-email.html');
            let html = fs.readFileSync(templatePath, 'utf8');
            // Notes might be undefined, handle gracefully
            html = html.replace('{{ notes }}', req.query.notes || '');

            const params = new URLSearchParams();
            params.append('email', email);
            params.append('subject', 'APOD Email Removal Request');
            params.append('body', html);

            const payload = {
                relativeUri: '/emailqueue',
                service: 'mailer',
                body: params.toString()
            };

            console.log(`Attempting to enqueue unsubscribe confirmation for ${email}`);
            await createTask(payload);
            console.log(`Enqueued unsubscribe confirmation for ${email}`);

            // Send Admin Notification if notes are present
            const notes = req.query.notes;
            if (notes && process.env.ADMIN_EMAIL) {
                const adminParams = new URLSearchParams();
                adminParams.append('email', process.env.ADMIN_EMAIL);
                adminParams.append('subject', `APOD Unsubscribe Feedback from ${email}`);
                adminParams.append('body', `Feedback: ${notes}`);

                const adminPayload = {
                    relativeUri: '/emailqueue',
                    service: 'mailer',
                    body: adminParams.toString()
                };
                await createTask(adminPayload);
                console.log(`Enqueued admin notification for unsubscribe feedback from ${email}`);
            }

        } catch (emailError) {
            console.error('Error sending unsubscribe confirmation email:', emailError);
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
    // Removed NODE_ENV check to enforce security everywhere.
    if (!req.get('X-AppEngine-Cron')) {
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
    // Removed NODE_ENV check
    if (!req.get('X-AppEngine-TaskName')) {
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

// APOD Email Test Endpoint
router.get('/testapod', async (req, res) => {
    // SECURED: Test endpoint disabled in production
    if (process.env.NODE_ENV === 'production') {
        return res.status(403).send('Forbidden: Test endpoint disabled in production.');
    }

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

        // turn off emails in production
        //const { createTask } = require('./services/taskQueueService');
        //await createTask(payload);

        // 4. Return HTML for preview
        res.send(personalizedHtml);

    } catch (error) {
        console.error(error);
        res.status(500).send('Error sending test APOD email');
    }
});

// User Count Endpoint
router.get('/api/user-count', async (req, res) => {
    try {
        const count = await db.getUserCount();
        res.json({ count });
    } catch (error) {
        console.error('Error fetching user count:', error);
        res.status(500).json({ error: 'Failed to fetch user count' });
    }
});

const statsService = require('./services/statsService');

// Stats Generation Endpoint (Cron)
router.get('/tasks/generate-stats', async (req, res) => {
    // Verify it's a cron request
    // Removed NODE_ENV check
    if (!req.get('X-AppEngine-Cron')) {
        return res.status(403).send('Forbidden');
    }

    try {
        const stats = await statsService.generateAndSaveStats();
        res.json({ message: 'Stats generated', stats });
    } catch (error) {
        console.error('Error generating stats:', error);
        res.status(500).send('Error generating stats');
    }
});

// Stats Visualization Page
router.get('/stats', async (req, res) => {
    try {
        const stats = await statsService.getCachedStats();

        if (!stats) {
            // Fallback if no stats generated yet
            return res.send('Stats are being generated. Please check back later.');
        }

        const templatePath = path.join(__dirname, 'templates/visualization.html');
        let html = fs.readFileSync(templatePath, 'utf8');

        // Simple template injection
        html = html.replace('{{ labels }}', JSON.stringify(stats.labels))
            .replace('{{ data }}', JSON.stringify(stats.data))
            .replace('{{ total }}', stats.total)
            .replace('{{ generatedAt }}', stats.generatedAt);

        res.send(html);
    } catch (error) {
        console.error('Error serving stats page:', error);
        res.status(500).send('Error loading stats');
    }
});

module.exports = router;
