import { describe, it, expect, vi, beforeEach } from 'vitest';

// NOTE: the scraper loads axios via CJS require('axios'). An ESM
// `import axios from 'axios'` resolves to a different module instance that
// vi.mock/vi.spyOn cannot intercept for the scraper, so we require it the
// same way the scraper does and spy on that shared instance.
const axios = require('axios');

const { getDataByDate, isKnownVideoSource, absolutizeApodUrl } = require('../../../src/services/apodScraper');

function mockPage(html) {
    vi.spyOn(axios, 'get').mockResolvedValue({ data: Buffer.from(html, 'utf8') });
}

describe('apodScraper media detection', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('classifies a root-relative image as image even with an extraneous survey iframe present', async () => {
        mockPage(`<html><head><title>APOD: 2026 October 1 - Test Nebula</title></head>
        <body>
            <center><b>Test Nebula</b></center>
            <center><a href="/apod/image/2610/TestNebula.jpg"><img src="/apod/image/2610/TestNebula_thumb.jpg"></a></center>
            <iframe src="https://survey.example.com/embed/widget123"></iframe>
            <p>Explanation: A test nebula image.</p>
        </body></html>`);

        const data = await getDataByDate(new Date('2026-10-01'));

        expect(data.media_type).toBe('image');
        expect(data.url).toBe('https://apod.nasa.gov/apod/image/2610/TestNebula_thumb.jpg');
        expect(data.hdurl).toBe('https://apod.nasa.gov/apod/image/2610/TestNebula.jpg');
    });

    it('handles uppercase tags and attributes', async () => {
        mockPage(`<html><head><title>APOD: 2026 October 1 - Upper Case</title></head>
        <body>
            <CENTER><A HREF="image/2610/Upper.jpg"><IMG SRC="image/2610/Upper_thumb.jpg"></A></CENTER>
            <p>Explanation: Uppercase markup.</p>
        </body></html>`);

        const data = await getDataByDate(new Date('2026-10-01'));

        expect(data.media_type).toBe('image');
        expect(data.url).toBe('https://apod.nasa.gov/apod/image/2610/Upper_thumb.jpg');
    });

    it('falls back to og:image meta when no img element matches', async () => {
        mockPage(`<html><head><title>APOD: 2026 October 1 - Meta Only</title>
            <meta property="og:image" content="https://apod.nasa.gov/apod/image/2610/MetaOnly.jpg">
        </head><body>
            <center><b>Meta Only</b></center>
            <p>Explanation: Only og:image present.</p>
        </body></html>`);

        const data = await getDataByDate(new Date('2026-10-01'));

        expect(data.media_type).toBe('image');
        expect(data.url).toBe('https://apod.nasa.gov/apod/image/2610/MetaOnly.jpg');
    });

    it('still detects a real YouTube embed as video', async () => {
        mockPage(`<html><head><title>APOD: 2026 October 1 - Video Day</title></head>
        <body>
            <center><b>Video Day</b></center>
            <center><iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe></center>
            <p>Explanation: A real video.</p>
        </body></html>`);

        const data = await getDataByDate(new Date('2026-10-01'));

        expect(data.media_type).toBe('video');
        expect(data.url).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
    });

    it('still detects a native video source as video', async () => {
        mockPage(`<html><head><title>APOD: 2026 October 1 - Native Video</title></head>
        <body>
            <center><b>Native Video</b></center>
            <center><video controls><source src="image/2601/Eruption_SDO.mp4"></video></center>
            <p>Explanation: Native video.</p>
        </body></html>`);

        const data = await getDataByDate(new Date('2026-10-01'));

        expect(data.media_type).toBe('video');
        expect(data.url).toBe('https://apod.nasa.gov/apod/image/2601/Eruption_SDO.mp4');
    });

    it('prefers a genuine video signal when the page also carries a generic og:image', async () => {
        // Mirrors the live 2026-01-13 APOD page: an about:blank placeholder
        // iframe, a real native video, and a generic og:image thumbnail.
        mockPage(`<html><head><title>APOD: 2026 January 13 - A Solar Eruption from SDO</title>
            <meta property="og:image" content="https://assets.science.nasa.gov/content/dam/science/astro/news-thumbnail.png">
        </head><body>
            <center><b>A Solar Eruption from SDO</b></center>
            <center><video controls><source src="https://assets.science.nasa.gov/content/dam/science/cds/apod/apod/2026/january/Eruption_SDO.mp4"></video></center>
            <iframe src="about:blank"></iframe>
            <p>Explanation: A solar eruption.</p>
        </body></html>`);

        const data = await getDataByDate(new Date('2026-01-13'));

        expect(data.media_type).toBe('video');
        expect(data.url).toContain('Eruption_SDO.mp4');
    });
});

describe('isKnownVideoSource', () => {
    it('accepts known providers and direct media files', () => {
        expect(isKnownVideoSource('https://www.youtube.com/embed/abc')).toBe(true);
        expect(isKnownVideoSource('https://youtu.be/abc')).toBe(true);
        expect(isKnownVideoSource('https://player.vimeo.com/video/123')).toBe(true);
        expect(isKnownVideoSource('https://apod.nasa.gov/apod/image/2601/x.mp4')).toBe(true);
        expect(isKnownVideoSource('//www.youtube.com/embed/abc')).toBe(true);
    });

    it('rejects arbitrary iframes from widgets, analytics, and surveys', () => {
        expect(isKnownVideoSource('https://survey.example.com/embed/widget123')).toBe(false);
        expect(isKnownVideoSource('https://www.google-analytics.com/collect')).toBe(false);
        expect(isKnownVideoSource('https://evil-youtube.com/embed/abc')).toBe(false);
        expect(isKnownVideoSource('')).toBe(false);
        expect(isKnownVideoSource(null)).toBe(false);
    });
});

describe('absolutizeApodUrl', () => {
    it('normalizes the various URL shapes found on APOD pages', () => {
        expect(absolutizeApodUrl('image/2610/x.jpg')).toBe('https://apod.nasa.gov/apod/image/2610/x.jpg');
        expect(absolutizeApodUrl('/apod/image/2610/x.jpg')).toBe('https://apod.nasa.gov/apod/image/2610/x.jpg');
        expect(absolutizeApodUrl('./image/2610/x.jpg')).toBe('https://apod.nasa.gov/apod/image/2610/x.jpg');
        expect(absolutizeApodUrl('apod/image/2610/x.jpg')).toBe('https://apod.nasa.gov/apod/image/2610/x.jpg');
        expect(absolutizeApodUrl('//cdn.example.com/x.jpg')).toBe('https://cdn.example.com/x.jpg');
        expect(absolutizeApodUrl('https://example.com/x.jpg')).toBe('https://example.com/x.jpg');
        expect(absolutizeApodUrl(null)).toBeUndefined();
    });
});

describe('apodScraper science.nasa.gov layout', () => {
    it('parses the redirected science.nasa.gov/apod page (image day)', async () => {
        const fs = require('fs');
        const path = require('path');
        mockPage(fs.readFileSync(path.join(__dirname, '../../fixtures/science-nasa-apod.html'), 'utf8'));

        const data = await getDataByDate(new Date('2026-10-04'));

        expect(data.media_type).toBe('image');
        expect(data.title).toBe('Supernumerary Rainbows over New Jersey');
        expect(data.date).toBe('2026-10-04');
        expect(data.url).toContain('SupernumeraryRainbows_Entwistle_1362.jpg');
        expect(data.copyright).toBe('John Entwistle');
        expect(data.explanation).toMatch(/^Yes, but can your rainbow do this\?/);
        expect(data.explanation).not.toMatch(/Your Sky Surprise|Tomorrow/);
    });
});

describe('apodScraper science.nasa.gov layout (video day)', () => {
    it('classifies a native mp4 hero as video', async () => {
        const fs = require('fs');
        const path = require('path');
        mockPage(fs.readFileSync(path.join(__dirname, '../../fixtures/science-nasa-apod-video.html'), 'utf8'));

        const data = await getDataByDate(new Date('2026-07-26'));

        expect(data.media_type).toBe('video');
        expect(data.title).toBe('Simulation TNG50: A Galaxy Cluster Forms');
        expect(data.date).toBe('2026-07-26');
        expect(data.url).toMatch(/ClusterFormation_TNG50\.mp4$/);
        expect(data.copyright).toMatch(/IllustrisTNG/);
    });
});

describe('apodScraper science.nasa.gov layout (video day, caption explanation)', () => {
    it('parses an mp4 video with explanation in the caption and absolutizes relative links', async () => {
        const fs = require('fs');
        const path = require('path');
        mockPage(fs.readFileSync(path.join(__dirname, '../../fixtures/science-nasa-apod-video2.html'), 'utf8'));

        const data = await getDataByDate(new Date('2026-07-13'));

        expect(data.media_type).toBe('video');
        expect(data.title).toBe('Auroras from Space');
        expect(data.url).toMatch(/Auroras_Esa\.mp4$/);
        expect(data.explanation).toMatch(/^What do auroras look like from above\?/);
        expect(data.explanation).toContain('href="https://apod.nasa.gov/apod/ap120209.html"');
        expect(data.explanation).not.toMatch(/href="ap\d/);
    });
});
