import { describe, it, expect, vi, beforeEach } from 'vitest';

const apodScraper = require('../../../src/services/apodScraper');
const apodService = require('../../../src/services/apodService');

describe('apodService', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('should correctly format HTML for an image APOD', async () => {
        const mockData = {
            title: 'Test Image',
            explanation: 'This is a test image explanation.',
            date: '2023-11-29',
            url: 'https://example.com/image.jpg',
            hdurl: 'https://example.com/hdimage.jpg',
            media_type: 'image',
            copyright: 'Test Photographer'
        };

        vi.spyOn(apodScraper, 'getDataByDate').mockResolvedValue(mockData);

        const result = await apodService.fetchAPOD();

        expect(result.title).toBe('APOD - Test Image');
        expect(result.html).toContain('<img src="https://example.com/image.jpg"');
        expect(result.html).toContain('https://apodemail.org/unsubscribe?email={{email}}');
        expect(result.html).toContain('NASA Goddard Space Flight Center<br>Astrophysics Science Division, Code 660<br>8800 Greenbelt Road<br>Greenbelt, MD 20771');
        expect(result.html).toContain('You are receiving this automated email');

        expect(result.text).toBeDefined();
        expect(result.text).toContain('Astronomy Picture of the Day');
        expect(result.text).toContain('https://apodemail.org/unsubscribe?email={{email}}');
        expect(result.text).toContain('NASA Goddard Space Flight Center\nAstrophysics Science Division, Code 660\n8800 Greenbelt Road\nGreenbelt, MD 20771');
    });

    it('should correctly format HTML for a YouTube video APOD', async () => {
        const mockData = {
            title: 'Test YouTube Video',
            explanation: 'This is a test video explanation.',
            date: '2023-11-28',
            url: 'https://www.youtube.com/embed/dQw4w9WgXcQ?rel=0',
            media_type: 'video'
        };

        vi.spyOn(apodScraper, 'getDataByDate').mockResolvedValue(mockData);

        const result = await apodService.fetchAPOD();

        expect(result.title).toBe('APOD - Test YouTube Video');
        expect(result.html).toContain('img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
    });

    it('should correctly format HTML for a native video APOD', async () => {
        const mockData = {
            title: 'Test Native Video',
            explanation: 'This is a test native video explanation.',
            date: '2026-01-13',
            url: 'https://example.com/video.mp4',
            media_type: 'video'
        };

        vi.spyOn(apodScraper, 'getDataByDate').mockResolvedValue(mockData);

        const result = await apodService.fetchAPOD();

        expect(result.title).toBe('APOD - Test Native Video');
        expect(result.html).toContain('Today\'s APOD is a Video!');
    });

    it('links the image to the APOD page, not the raw image file (#51)', async () => {
        const mockData = {
            title: 'Test Image',
            explanation: 'This is a test image explanation.',
            date: '2023-11-29',
            url: 'https://example.com/image.jpg',
            hdurl: 'https://example.com/hdimage.jpg',
            media_type: 'image'
        };

        vi.spyOn(apodScraper, 'getDataByDate').mockResolvedValue(mockData);

        const result = await apodService.fetchAPOD();

        // The anchor must point at the APOD page (direct image-file links 403).
        expect(result.html).toContain('<a href="https://science.nasa.gov/apod/">');
        expect(result.html).not.toContain('example.com/hdimage.jpg');
        expect(result.text).toContain('View Image: https://science.nasa.gov/apod/');
    });

    it('uses only absolute hrefs in the generated email HTML (#51)', async () => {
        const mockData = {
            title: 'Test Image',
            explanation: 'This is a test image explanation.',
            date: '2023-11-29',
            url: 'https://example.com/image.jpg',
            // hdurl missing entirely: must not produce <a href="undefined">
            media_type: 'image'
        };

        vi.spyOn(apodScraper, 'getDataByDate').mockResolvedValue(mockData);

        const result = await apodService.fetchAPOD();

        const hrefs = [...result.html.matchAll(/href="([^"]*)"/g)].map(m => m[1]);
        expect(hrefs.length).toBeGreaterThan(0);
        for (const href of hrefs) {
            expect(href).not.toBe('undefined');
            // mailto: and https: are both absolute; anything else (relative)
            // would break email clients and the UTM pass in emailService.
            expect(href).toMatch(/^(https?|mailto):/);
        }
    });
});
