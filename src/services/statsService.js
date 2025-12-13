const db = require('../database');
const { DateTime } = require('luxon');

async function generateAndSaveStats() {
    console.log('Starting stats generation (Counter Optimized)...');

    // O(1) Fetch of pre-aggregated counts
    const monthlyCounts = await db.getMonthlyCounts();
    console.log(`Fetched counters for ${Object.keys(monthlyCounts).length} months.`);

    // Sort keys chronologically
    const sortedKeys = Object.keys(monthlyCounts).sort();

    const labels = [];
    const data = [];
    let total = 0;

    const currentYear = new Date().getFullYear();

    sortedKeys.forEach(key => {
        // key format is "YYYY-MM"
        const year = parseInt(key.split('-')[0]);

        // Filter out garbage data (e.g. year 43000 or year 0)
        if (year < 1995 || year > currentYear + 1) {
            return;
        }

        const count = monthlyCounts[key];

        // Format label nicely, e.g., "Oct 2023"
        const label = DateTime.fromFormat(key, 'yyyy-MM').toFormat('MMM yyyy');

        labels.push(label);
        data.push(count);
        total += count;
    });

    const statsPayload = {
        labels,
        data,
        total,
        generatedAt: new Date().toISOString()
    };

    await db.saveStats(statsPayload);
    console.log('Stats saved successfully.');
    return statsPayload;
}

async function getCachedStats() {
    return await db.getStats();
}

module.exports = {
    generateAndSaveStats,
    getCachedStats
};
