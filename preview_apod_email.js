/**
 * APOD Email Preview Generator
 *
 * Renders the EXACT production email markup for any date by running the same
 * buildEmail() code path that fetchAPOD() uses. Use it to verify that multiple
 * dates (images, YouTube videos, native videos) render correctly in email
 * clients before shipping.
 *
 * Usage:
 *   node preview_apod_email.js                       # default date set + today
 *   node preview_apod_email.js 2026-10-18 2026-07-13 # any historical date(s)
 *
 * Output (per date):
 *   preview-tests/<name>.html and preview-tests/<name>.txt
 */

const { getDataByDate } = require('./src/services/apodScraper');
const { buildEmail } = require('./src/services/apodService');
const fs = require('fs');
const path = require('path');

const PREVIEW_DIR = path.join(__dirname, 'preview-tests');

// Create preview directory if it doesn't exist
if (!fs.existsSync(PREVIEW_DIR)) {
    fs.mkdirSync(PREVIEW_DIR, { recursive: true });
}

const DEFAULT_PREVIEWS = [
    { date: '2026-01-13', name: 'video-tag' },
    { date: '2013-11-30', name: 'vimeo' },
    { date: '2022-12-04', name: 'youtube' },
    { date: '2022-01-13', name: 'static-image' }
];

async function runPreviews() {
    // CLI dates take precedence: each YYYY-MM-DD arg previews that exact day.
    let previews;
    const args = process.argv.slice(2);
    const argDates = args.filter((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));

    if (args.length && !argDates.length) {
        console.error('Expected dates in YYYY-MM-DD format.');
        process.exit(1);
    }

    if (argDates.length) {
        previews = argDates.map((date) => ({ date, name: date }));
    } else {
        // Add today
        const today = new Date();
        const todayStr = today.getFullYear() + '-' +
            String(today.getMonth() + 1).padStart(2, '0') + '-' +
            String(today.getDate()).padStart(2, '0');

        previews = [...DEFAULT_PREVIEWS, { date: todayStr, name: 'today' }];
    }

    console.log(`Starting preview generation in ${PREVIEW_DIR}`);

    for (const preview of previews) {
        await generateEmailPreview(preview.date, preview.name);
    }
}

async function generateEmailPreview(dateStr, fileName) {
    try {
        console.log(`\n---------------------------------------------------------`);
        console.log(`Generating preview for ${dateStr} as ${fileName}.html...`);

        // Parse the date string
        const [year, month, day] = dateStr.split('-').map(Number);
        const date = new Date(year, month - 1, day);

        // Fetch data from APOD
        const data = await getDataByDate(date);

        if (!data || !data.explanation || data.explanation.trim().length === 0) {
            throw new Error('APOD data missing valid explanation');
        }

        console.log(`   Scraped: ${data.title} (${data.date})`);
        console.log(`   Media type: ${data.media_type}${data.media_type === 'video' ? ` — ${data.url}` : ''}`);

        // Generate the email with the exact same production code path
        const { title, html, text } = buildEmail(data);
        console.log(`   Email title: ${title}`);

        // Save to file
        const outputFile = path.join(PREVIEW_DIR, `${fileName}.html`);
        fs.writeFileSync(outputFile, html);
        const outputTextFile = path.join(PREVIEW_DIR, `${fileName}.txt`);
        fs.writeFileSync(outputTextFile, text);
        console.log(`   Saved HTML to ${outputFile}`);
        console.log(`   Saved Text to ${outputTextFile}`);
    } catch (error) {
        console.error(`   Error for ${dateStr}:`, error.message);
    }
}

runPreviews();
