const axios = require('axios');
const cheerio = require('cheerio');
const { DateTime } = require('luxon');

// Hosts/embed sources that are known to deliver real video content. Iframes
// and embeds are also used on APOD pages for analytics, surveys, and host
// headers — those must never flip an image APOD to media_type "video".
const VIDEO_HOSTS = [
    'youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'youtube-nocookie.com',
    'vimeo.com', 'www.vimeo.com', 'player.vimeo.com',
    'dailymotion.com', 'www.dailymotion.com', 'dai.ly'
];
const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mov', '.m4v'];

/**
 * Normalizes an image/video URL found on an APOD page to an absolute URL.
 * Handles absolute, protocol-relative (//), root-relative (/apod/image/...),
 * dot-relative (./image/...), and bare relative (image/...) references.
 */
function absolutizeApodUrl(url) {
    if (!url) return undefined;
    const u = url.trim();
    if (/^https?:\/\//i.test(u)) return u;
    if (u.startsWith('//')) return `https:${u}`;
    if (u.startsWith('/')) return `https://apod.nasa.gov${u}`;
    const cleaned = u.replace(/^\.?\//, '');
    if (cleaned.toLowerCase().startsWith('apod/')) return `https://apod.nasa.gov/${cleaned}`;
    return `https://apod.nasa.gov/apod/${cleaned}`;
}

/**
 * Returns true when a URL plausibly points at real video content: a known
 * video provider host, or a direct media file (.mp4/.webm/...).
 */
function isKnownVideoSource(url) {
    if (!url) return false;
    try {
        const parsed = new URL(url, 'https://apod.nasa.gov');
        const host = parsed.hostname.toLowerCase();
        if (VIDEO_HOSTS.some(h => host === h || host.endsWith(`.${h}`))) return true;
        const path = parsed.pathname.toLowerCase();
        return VIDEO_EXTENSIONS.some(ext => path.endsWith(ext));
    } catch (e) {
        return false;
    }
}

/**
 * Finds the APOD image element using several strategies, in order of
 * specificity. APOD page markup varies: strict href^=image / src^=image
 * matching misses root-relative paths (/apod/image/...), uppercase
 * attributes, and external anchors, so we probe progressively.
 * Returns { el, metaSrc } — el may be an empty cheerio set and metaSrc the
 * og:image content when no <img> matched.
 */
function findImageElement($) {
    // 1. Anchor-wrapped image with "image" in href/src (classic APOD layout)
    let el = $('a[href*=image] img[src*=image], button img[src*=image]').first();

    // 2. Any <img> whose src references the /image/ directory (case-insensitive;
    //    catches root-relative /apod/image/... and uppercase markup)
    if (!el.length) {
        el = $('img')
            .filter((_, node) => /\/image\//i.test($(node).attr('src') || ''))
            .first();
    }

    // 3. First image inside a <center> (classic APOD layout)
    if (!el.length) {
        el = $('center img').first();
    }

    // 4. og:image meta tag
    let metaSrc = null;
    if (!el.length) {
        metaSrc = $('meta[property="og:image"]').attr('content') || null;
    }

    return { el, metaSrc };
}

/**
 * Parses the current science.nasa.gov/apod layout. apod.nasa.gov now
 * 301-redirects (for every apYYMMDD.html URL) to https://science.nasa.gov/apod/,
 * which embeds today's APOD in a ".smd-embed-post__article" block. Returns
 * null when that block is absent so the caller can fall back to the legacy
 * apod.nasa.gov parser.
 */
function parseScienceNasaLayout($) {
    // The /apod/ landing page wraps the hero in an embed article (with an
    // extra "Astronomy Picture of the Day" h1); per-day article pages use the
    // bare hero block with the title as its h1.
    const embed = $('.smd-embed-post__article').first();
    const root = embed.length ? embed : $('.hds-media-detail-hero').first();
    const media = root.find('.media-detail-hero__media').first();
    const desc = root.find('.media-detail-hero__description').first();
    if (!root.length || !media.length || !desc.length) return null;

    const title = (embed.length ? root.find('h2') : root.find('h1')).first().text().trim();

    // Explanation: drop the "Explanation:" label and the trailing
    // "Your Sky Surprise / Tomorrow's picture" boilerplate.
    let explanation = (desc.html() || '')
        .replace(/<br\s*\/?>\s*<br\s*\/?>\s*<strong>\s*Your Sky Surprise[\s\S]*$/i, '')
        .replace(/^\s*<strong>\s*Explanation:\s*<\/strong>\s*/i, '')
        .trim();
    explanation = explanation
        .replace(/href="\/(?!\/)/g, 'href="https://science.nasa.gov/')
        // bare relative archive links (ap120209.html) -> absolute
        .replace(/href="(?!https?:|mailto:|\/|#)/gi, 'href="https://apod.nasa.gov/apod/');

    // Meta table rows: Date / Credit & Copyright / ...
    const meta = {};
    root.find('.media-detail-hero__meta-row').each((_, row) => {
        const key = $(row).find('th').text().trim().toLowerCase();
        meta[key.startsWith('credit') ? 'credit' : key] = $(row).find('td').text().replace(/\s+/g, ' ').trim();
    });
    const parsedDate = meta['date'] ? DateTime.fromFormat(meta['date'], 'LLLL d, yyyy') : null;

    const imageUrl = absolutizeApodUrl(media.find('img').first().attr('src'))
        || absolutizeApodUrl($('meta[property="og:image"]').attr('content'));

    const rawVideo = media.find('iframe').first().attr('src')
        || media.find('video source').first().attr('src')
        || media.find('video').first().attr('src')
        || media.find('embed').first().attr('src');
    const videoUrl = rawVideo && isKnownVideoSource(absolutizeApodUrl(rawVideo))
        ? absolutizeApodUrl(rawVideo)
        : undefined;

    return {
        title,
        explanation,
        date: parsedDate && parsedDate.isValid ? parsedDate.toISODate() : undefined,
        imageUrl,
        videoUrl,
        copyright: meta['credit'] || undefined
    };
}

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
        // apod.nasa.gov redirects to science.nasa.gov/apod/ (axios follows it)
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        const buffer = response.data;

        // Detect encoding (UTF-16LE, UTF-16BE, or default to UTF-8)
        let html;
        if (buffer[0] === 0xff && buffer[1] === 0xfe) {
            html = buffer.toString('utf16le');
        } else if (buffer[0] === 0xfe && buffer[1] === 0xff) {
            html = buffer.toString('utf16be');
        } else {
            html = buffer.toString('utf8');
        }

        const $ = cheerio.load(html);

        const modern = parseScienceNasaLayout($);
        if (modern) {
            const media_type = modern.videoUrl ? 'video' : (modern.imageUrl ? 'image' : 'other');
            return {
                title: modern.title,
                explanation: modern.explanation,
                date: modern.date || date.toISODate(),
                hdurl: media_type === 'video' ? modern.videoUrl : modern.imageUrl,
                url: media_type === 'video' ? modern.videoUrl : modern.imageUrl,
                media_type,
                copyright: modern.copyright,
                service_version: 'v1'
            };
        }

        const body = $('body').text(); // For regex searches on full text if needed

        // Title extraction logic based on reference
        // https://github.com/nasa/apod-api/blob/e69d56d223543f84fb88ed6be292b48a7064297c/apod/utility.py#L125-L162
        const title = $('center').length < 2
            ? $('title').text().split(' - ')[1]?.trim() || $('title').text().trim()
            : $('b').first().text().split('\n')[0].trim();

        // Media extraction (multi-strategy; see findImageElement above)
        const { el: imageElement, metaSrc } = findImageElement($);

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
        const imgSrc = imageElement.attr('src') || metaSrc;
        const imgHref = imageElement.closest('a').attr('href')
            || $('a[href*=image]').first().attr('href');

        const imageUrl = absolutizeApodUrl(imgSrc);
        const hdImageUrl = absolutizeApodUrl(imgHref);

        // Extract video URL from iframe/embed — but ONLY when the source is a
        // known video provider or direct media file. Arbitrary iframes (survey
        // widgets, analytics, host headers) must not masquerade as APOD videos.
        const rawVideoCandidate = $('iframe').first().attr('src')
            || $('embed').first().attr('src');
        let videoUrl;
        if (rawVideoCandidate && isKnownVideoSource(rawVideoCandidate)) {
            videoUrl = absolutizeApodUrl(rawVideoCandidate);
        }

        // Check for native HTML5 video tag
        if (!videoUrl && $('video').length > 0) {
            const src = $('video').find('source').first().attr('src');
            // Native video sources are relative paths like "image/2601/Eruption_SDO.mp4"
            const absSrc = absolutizeApodUrl(src);
            if (absSrc && isKnownVideoSource(absSrc)) {
                videoUrl = absSrc;
            }
        }

        // Video takes precedence over image: a genuine video signal (known
        // provider embed or a native <video> with a real media source) means
        // the entry is a video day even when the page also carries a generic
        // og:image thumbnail. Spurious iframes (about:blank, survey widgets,
        // analytics) are already rejected by isKnownVideoSource above, so a
        // non-empty videoUrl is trustworthy.
        const media_type = videoUrl ? 'video' : (imageUrl ? 'image' : 'other');
        // The returned URL must match the classification: for a video entry it
        // is the video URL, not a fallback image.
        const finalUrl = media_type === 'video' ? videoUrl : (imageUrl || videoUrl);

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

module.exports = { getDataByDate, isKnownVideoSource, absolutizeApodUrl };
