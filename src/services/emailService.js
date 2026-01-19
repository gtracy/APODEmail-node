const db = require('../database');
const apodService = require('./apodService');
const taskQueueService = require('./taskQueueService');

// 1. Enqueue Logic (Called by Cron/Trigger)
const cheerio = require('cheerio');
const crypto = require('crypto');

// 1. Enqueue Logic (Called by Cron/Trigger)
async function enqueueEmails(workerUrlBase, year, startMonth, endMonth) {
    console.log("Starting enqueue process (Hybrid Mode)...");
    try {
        const apodData = await apodService.fetchAPOD();
        console.log(`Fetched APOD: ${apodData.title}`);

        // Get users (filtered or all)
        // Get users (filtered by date range)
        if (!year || !startMonth || !endMonth) {
            throw new Error("Missing date parameters (year, startMonth, endMonth). Full table scan is not allowed.");
        }

        const users = await db.getUsersByDateRange(year, startMonth, endMonth);
        console.log(`Found ${users.length} subscribers for range ${year}/${startMonth}-${endMonth}.`);

        // optimize: perform cheerio parsing once
        const $ = cheerio.load(apodData.html);

        // Add UTM parameters to all links
        $('a').each((i, link) => {
            const href = $(link).attr('href');
            if (href && !href.startsWith('#') && !href.startsWith('mailto:') && !href.includes('action=unsubscribe')) {
                try {
                    const urlObj = new URL(href);
                    urlObj.searchParams.set('utm_source', 'newsletter');
                    urlObj.searchParams.set('utm_medium', 'email');
                    urlObj.searchParams.set('utm_campaign', 'daily_apod');
                    $(link).attr('href', urlObj.toString());
                } catch (e) {
                    // Ignore invalid URLs
                }
            }
        });

        const trackedHtmlTemplate = $.html();

        let count = 0;
        for (const user of users) {
            try {
                // Construct Form Data Body for Python App
                // Legacy params: email, subject, body, bcc
                const params = new URLSearchParams();
                params.append('email', user.email);
                params.append('subject', apodData.title);

                // Personalize HTML
                let personalizedHtml = trackedHtmlTemplate.replace('{{email}}', encodeURIComponent(user.email));

                // Add Open Tracking Pixel (GA4 Measurement Protocol)
                // https://www.google-analytics.com/g/collect?v=2&tid=MEASUREMENT_ID&cid=CLIENT_ID&en=email_open...
                const clientId = crypto.randomUUID();
                const measurementId = 'G-SRM03RK860'; // GA4 Measurement ID
                const pixelUrl = new URL('https://www.google-analytics.com/g/collect');
                pixelUrl.searchParams.set('v', '2');
                pixelUrl.searchParams.set('tid', measurementId);
                pixelUrl.searchParams.set('cid', clientId);
                pixelUrl.searchParams.set('en', 'email_open'); // Event Name
                pixelUrl.searchParams.set('cs', 'newsletter'); // Campaign Source
                pixelUrl.searchParams.set('cm', 'email');      // Campaign Medium
                pixelUrl.searchParams.set('cn', 'daily_apod'); // Campaign Name

                // Add the pixel image
                personalizedHtml += `<img src="${pixelUrl.toString()}" width="1" height="1" style="display:none;"/>`;

                params.append('body', personalizedHtml);

                const payload = {
                    relativeUri: '/emailqueue',
                    service: 'mailer', // Target the Python service
                    body: params.toString()
                };

                await taskQueueService.createTask(payload);
                count++;
            } catch (err) {
                console.error(`Failed to enqueue email for user ${user.email}:`, err);
                // Continue to next user
            }
        }
        console.log(`Enqueued ${count} tasks to 'mailer' service.`);
        return count;

    } catch (error) {
        console.error("Failed to enqueue emails:", error);
        throw error;
    }
}

// Node.js no longer handles the worker!
// The Python app handles /emailqueue

module.exports = { enqueueEmails };
