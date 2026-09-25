const db = require('../database');
const apodService = require('./apodService');
const taskQueueService = require('./taskQueueService');
const cheerio = require('cheerio');
const crypto = require('crypto');
const logger = require('./logger');

// 1. Enqueue Logic (Called by Cron/Trigger)
async function enqueueEmails(workerUrlBase, year, startMonth, endMonth) {
    logger.info({ event: 'enqueue_start', year, startMonth, endMonth }, 'Starting enqueue process (Hybrid Mode)...');
    try {
        const apodData = await apodService.fetchAPOD();
        logger.info({ event: 'apod_fetched', title: apodData.title }, `Fetched APOD: ${apodData.title}`);

        // Get users (filtered by date range)
        if (!year || !startMonth || !endMonth) {
            throw new Error("Missing date parameters (year, startMonth, endMonth). Full table scan is not allowed.");
        }

        const users = await db.getUsersByDateRange(year, startMonth, endMonth);
        logger.info({ event: 'subscribers_found', count: users.length, year, startMonth, endMonth }, `Found ${users.length} subscribers for range ${year}/${startMonth}-${endMonth}.`);

        // optimize: perform cheerio parsing once
        const $ = cheerio.load(apodData.html);

        // Add UTM parameters to all links (excluding internal unsubscribe/preferences)
        $('a').each((i, link) => {
            const href = $(link).attr('href');
            if (href && !href.startsWith('#') && !href.startsWith('mailto:') && !href.includes('action=unsubscribe') && !href.includes('/unsubscribe')) {
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
        const rawTextTemplate = apodData.text || '';

        let count = 0;
        for (const user of users) {
            try {
                // Construct Form Data Body for Python App
                const params = new URLSearchParams();
                params.append('email', user.email);
                params.append('subject', apodData.title);

                // Personalize HTML and plain text
                const encodedEmail = encodeURIComponent(user.email);
                let personalizedHtml = trackedHtmlTemplate.replace('{{email}}', encodedEmail);
                let personalizedText = rawTextTemplate.replace('{{email}}', encodedEmail);

                // Add Open Tracking Pixel (GA4 Measurement Protocol)
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
                if (personalizedText) {
                    params.append('text_body', personalizedText);
                }

                // RFC 2369 / RFC 8058 compliant unsubscribe header
                const unsubscribeUrl = `https://apodemail.org/unsubscribe?email=${encodedEmail}`;
                params.append('list_unsubscribe', `<${unsubscribeUrl}>`);

                const payload = {
                    relativeUri: '/emailqueue',
                    service: 'mailer', // Target the Python service
                    body: params.toString()
                };

                await taskQueueService.createTask(payload);
                count++;
            } catch (err) {
                logger.error({ err, email: user.email }, `Failed to enqueue email for user ${user.email}`);
                // Continue to next user
            }
        }
        logger.info({ event: 'tasks_enqueued', count, service: 'mailer' }, `Enqueued ${count} tasks to 'mailer' service.`);
        return count;

    } catch (error) {
        logger.error({ err: error }, 'Failed to enqueue emails');
        throw error;
    }
}

// Node.js no longer handles the worker!
// The Python app handles /emailqueue

module.exports = { enqueueEmails };
