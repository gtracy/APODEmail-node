const db = require('../database');
const { fetchAPOD } = require('./apodService');
const { createTask } = require('./taskQueueService');

// 1. Enqueue Logic (Called by Cron/Trigger)
async function enqueueEmails(workerUrlBase, year, startMonth, endMonth) {
    console.log("Starting enqueue process (Hybrid Mode)...");
    try {
        const apodData = await fetchAPOD();
        console.log(`Fetched APOD: ${apodData.title}`);

        // Get users (filtered or all)
        // Get users (filtered by date range)
        if (!year || !startMonth || !endMonth) {
            throw new Error("Missing date parameters (year, startMonth, endMonth). Full table scan is not allowed.");
        }

        const users = await db.getUsersByDateRange(year, startMonth, endMonth);
        console.log(`Found ${users.length} subscribers for range ${year}/${startMonth}-${endMonth}.`);

        let count = 0;
        for (const user of users) {
            try {
                // Construct Form Data Body for Python App
                // Legacy params: email, subject, body, bcc
                const params = new URLSearchParams();
                params.append('email', user.email);
                params.append('subject', apodData.title);

                const personalizedHtml = apodData.html.replace('{{email}}', encodeURIComponent(user.email));
                params.append('body', personalizedHtml);

                const payload = {
                    relativeUri: '/emailqueue',
                    service: 'mailer', // Target the Python service
                    body: params.toString()
                };

                await createTask(payload);
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
