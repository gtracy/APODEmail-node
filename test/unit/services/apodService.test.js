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
});
