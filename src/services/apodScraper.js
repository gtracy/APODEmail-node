const axios = require('axios');
const cheerio = require('cheerio');
const { DateTime } = require('luxon');

/**
 * Fetches and parses APOD data for a specific date.
 * @param {Date|string} dateObj - The date to fetch.
 * @returns {Promise<Object>} The APOD data object.
 */
async function getDataByDate(dateObj) {
    const date = DateTime.fromJSDate(new Date(dateObj));
    const dateStr = date.toFormat('yyMMdd');
    const url = `https://apod.nasa.gov/apod/ap${dateStr}.html`;

    console.log(`fetching ${url}`);

    try {
        const response = await axios.get(url);
        const html = response.data;
        const $ = cheerio.load(html);
        const body = $('body').text(); // For regex searches on full text if needed

        // Title extraction logic based on reference
        // https://github.com/nasa/apod-api/blob/e69d56d223543f84fb88ed6be292b48a7064297c/apod/utility.py#L125-L162
        const title = $('center').length < 2
            ? $('title').text().split(' - ')[1]?.trim() || $('title').text().trim()
            : $('b').first().text().split('\n')[0].trim();

        // Media extraction
        const imageElement = $('a[href^=image] img[src^=image], button img[src^=image]');
        const videoElement = $('iframe');
        const embedElement = $('embed');

        // Explanation extraction - preserving HTML
        // Finding the paragraph that follows the center tags. 
        // Usually APOD structure is: <center>Title...</center> <center>Image...</center> <p> Explanation... </p>
        const explanationNode = $('center ~ center ~ p');
        let explanation = explanationNode.html() || '';

        // Clean up "Explanation:" prefix if present (it's often bolded or just text)
        // We do a simple replace on the HTML string carefully, or just leave it. 
        // usage in apodService.js: "<b> Explanation: </b> ${data.explanation}"
        // The scraping target usually has "Explanation: " at the start of the text. 
        // If we preserve HTML, we might get "<b>Explanation:</b> text...". 
        // Let's remove "Explanation:" from the start if it exists, to avoid duplication in the email template which adds it.
        // However, since we are dealing with HTML, it might be tricky. 
        // A simple text replacement on the HTML string might be safe enough for the prefix.

        // Remove "Explanation:" or "<b>Explanation:</b>" case insensitive from the start
        explanation = explanation.replace(/^\s*(?:<b>\s*)?Explanation:\s*(?:<\/b>\s*)?/i, '').trim();

        // Fix relative links in explanation
        explanation = explanation.replace(/href="(?!(http|mailto))/g, 'href="https://apod.nasa.gov/apod/');

        // Copyright and Credit extraction (using text body regex from reference)
        const cleanedBody = body.replace(/\s+/g, ' ');
        const copyrightMatch = /copyright:\s+(.+)\s+explanation/gi.exec(cleanedBody);
        const copyright = copyrightMatch ? copyrightMatch[1].trim() : undefined;

        const creditMatch = /credit:\s+(.+?)\s+(?:;|explanation)/gi.exec(cleanedBody);
        const credit = creditMatch ? creditMatch[1].trim() : undefined;

        // URLs
        const imgSrc = imageElement.attr('src');
        const imgHref = $('a[href^=image]').attr('href');

        const imageUrl = imgSrc ? `https://apod.nasa.gov/apod/${imgSrc}` : undefined;
        const hdImageUrl = imgHref ? `https://apod.nasa.gov/apod/${imgHref}` : undefined;

        const videoUrl = videoElement.attr('src') || embedElement.attr('src');

        const media_type = imageUrl ? 'image' : (videoUrl ? 'video' : 'other');
        const finalUrl = imageUrl || videoUrl;

        // Ensure we explicitly return nulls or empty strings where appropriate to match expected API shape
        return {
            title,
            explanation, // HTML preserved
            date: date.toISODate(),
            hdurl: hdImageUrl || imageUrl,
            url: finalUrl,
            media_type,
            copyright: copyright || credit, // Fallback to credit if copyright missing
            service_version: 'v1'
        };

    } catch (error) {
        console.error(`Error scraping APOD for ${dateStr}:`, error.message);
        throw error;
    }
}

module.exports = { getDataByDate };
