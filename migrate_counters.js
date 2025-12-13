const db = require('./src/database');
const { DateTime } = require('luxon');

// Force REAL GCP to ensure migration happens on production data
// if process.env.MOCK_GCP is true, this will run against mock, which is fine for testing.

async function migrateCounters() {
    console.log('--- Starting Migration: Backfill Monthly Counters ---');

    // Step 0: Clean up existing MonthlyStats (to remove bad keys)
    console.log('0. Cleaning up old MonthlyStats...');
    const query = db.datastore.createQuery(db.KIND_MONTHLY_STATS).select('__key__');
    const [existingEntities] = await db.datastore.runQuery(query);
    const existingKeys = existingEntities.map(e => e[db.datastore.KEY]);

    if (existingKeys.length > 0) {
        console.log(`   Deleting ${existingKeys.length} existing counter entities...`);
        // Delete in batches of 500
        const batchSize = 500;
        for (let i = 0; i < existingKeys.length; i += batchSize) {
            const batch = existingKeys.slice(i, i + batchSize);
            await db.datastore.delete(batch);
            console.log(`   Deleted batch ${i} - ${i + batch.length}`);
        }
    } else {
        console.log('   No existing counters found.');
    }

    console.log('1. Fetching ALL user dates (This might take a moment)...');
    // Using the "old" method one last time to get data
    const dates = await db.getSignupDates();
    console.log(`   Found ${dates.length} users.`);

    console.log('2. Aggregating counts in memory...');
    const aggregator = {};

    dates.forEach(dateInput => {
        let dt;
        if (dateInput instanceof Date) {
            dt = DateTime.fromJSDate(dateInput);
        } else if (typeof dateInput === 'string') {
            dt = DateTime.fromISO(dateInput);
        } else {
            let val = Number(dateInput);
            // Heuristic: If value > 10 trillion, it's microseconds (Year 2286+)
            // 1e13 is roughly year 2286 in ms.
            // Typical 2009 timestamp in us is 1.25e15
            if (val > 100000000000000) {
                val = val / 1000;
            }
            dt = DateTime.fromMillis(val);
        }

        if (dt && dt.isValid) {
            const key = dt.toFormat('yyyy-MM');
            aggregator[key] = (aggregator[key] || 0) + 1;
        }
    });

    const monthKeys = Object.keys(aggregator).sort();
    console.log(`   Found ${monthKeys.length} unique months.`);

    console.log('3. Writing MonthlyStats entities...');
    let totalWritten = 0;

    for (const monthKey of monthKeys) {
        const count = aggregator[monthKey];
        const key = db.datastore.key([db.KIND_MONTHLY_STATS, monthKey]);

        const entity = {
            key: key,
            data: {
                count: count,
                month: monthKey
            }
        };

        // Saving directly via datastore instance to avoid transaction overhead for batch migration
        // In a live system with writes, this might have a race condition, but for a one-off backfill it's usually acceptable 
        // if we assume we are setting the baseline.
        await db.datastore.save(entity);
        console.log(`   Saved ${monthKey}: ${count}`);
        totalWritten += count;
    }

    console.log('--- Migration Complete ---');
    console.log(`Total Users Processed: ${dates.length}`);
    console.log(`Total Counts Written: ${totalWritten}`);

    if (dates.length !== totalWritten) {
        console.warn(`WARNING: Count mismatch! ${dates.length - totalWritten} users were skipped due to invalid dates.`);
    }
}

migrateCounters().catch(err => {
    console.error('Migration Failed:', err);
});
