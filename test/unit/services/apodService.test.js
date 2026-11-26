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

    it('links YouTube embeds to the canonical watch URL in HTML and plain text', async () => {
        const mockData = {
            title: 'Test YouTube Video',
            explanation: 'This is a test video explanation.',
            date: '2023-11-28',
            url: 'https://www.youtube.com/embed/dQw4w9WgXcQ?rel=0',
            media_type: 'video'
        };

        vi.spyOn(apodScraper, 'getDataByDate').mockResolvedValue(mockData);

        const result = await apodService.fetchAPOD();

        // Canonical watch URL, never the raw /embed/ URL (Error 153 as a top-level link)
        expect(result.html).toContain('href="https://www.youtube.com/watch?v=dQw4w9WgXcQ"');
        expect(result.html).not.toContain('/embed/');
        expect(result.text).toContain('Watch Video: https://www.youtube.com/watch?v=dQw4w9WgXcQ');
        expect(result.text).not.toContain('/embed/');
    });

    it('renders YouTube previews with email-safe card markup (no absolute positioning)', async () => {
        const mockData = {
            title: 'Test YouTube Video',
            explanation: 'This is a test video explanation.',
            date: '2023-11-28',
            url: 'https://www.youtube.com/embed/dQw4w9WgXcQ?rel=0',
            media_type: 'video'
        };

        vi.spyOn(apodScraper, 'getDataByDate').mockResolvedValue(mockData);

        const result = await apodService.fetchAPOD();

        // Thumbnail and pill CTA render inside the gradient hero card
        expect(result.html).toContain('img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
        expect(result.html).toContain('► Watch Video on YouTube');
        expect(result.html).toContain('https://science.nasa.gov/apod/');
        // Email clients strip these, so the video card must not rely on them
        const mediaBlock = result.html.substring(0, result.html.indexOf('Explanation:'));
        expect(mediaBlock).not.toContain('position: absolute');
        expect(mediaBlock).not.toContain('transform:');
        expect(mediaBlock).not.toContain('display: flex');
    });

    it('links Vimeo embeds to the canonical vimeo.com URL without an overlay', async () => {
        const mockData = {
            title: 'Test Vimeo Video',
            explanation: 'This is a test vimeo video explanation.',
            date: '2013-11-30',
            url: 'https://player.vimeo.com/video/123456789',
            media_type: 'video'
        };

        vi.spyOn(apodScraper, 'getDataByDate').mockResolvedValue(mockData);

        const result = await apodService.fetchAPOD();

        expect(result.html).toContain('href="https://vimeo.com/123456789"');
        expect(result.html).not.toContain('player.vimeo.com');
        expect(result.text).toContain('Watch Video: https://vimeo.com/123456789');
        const mediaBlock = result.html.substring(0, result.html.indexOf('Explanation:'));
        expect(mediaBlock).not.toContain('position: absolute');
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

    it('does not render the video banner for a misclassified entry with a bogus video URL', async () => {
        const mockData = {
            title: 'Test Misclassified',
            explanation: 'This was flagged video by a survey iframe.',
            date: '2026-10-01',
            url: 'https://survey.example.com/embed/widget123',
            media_type: 'video'
        };

        vi.spyOn(apodScraper, 'getDataByDate').mockResolvedValue(mockData);

        const result = await apodService.fetchAPOD();

        expect(result.html).not.toContain('Today\'s APOD is a Video!');
        expect(result.html).toContain('View today\'s Astronomy Picture of the Day on NASA APOD');
    });

    it('throws an error if fetched APOD explanation is empty', async () => {
        const mockData = {
            title: 'Test Empty Explanation',
            explanation: '',
            date: '2026-10-05',
            url: 'https://example.com/image.jpg',
            media_type: 'image'
        };

        vi.spyOn(apodScraper, 'getDataByDate').mockResolvedValue(mockData);

        await expect(apodService.fetchAPOD()).rejects.toThrow('APOD data missing valid explanation');
    });
});
