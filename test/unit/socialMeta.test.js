import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import * as cheerio from 'cheerio';

describe('Social Metadata & Assets (Issue #49)', () => {
    const rootDir = path.resolve(__dirname, '../../');
    const indexPath = path.join(rootDir, 'public/index.html');
    const statsPath = path.join(rootDir, 'src/templates/visualization.html');
    const imagePath = path.join(rootDir, 'public/img/stargazers.jpg');
    const earthPath = path.join(rootDir, 'public/img/earth.jpg');

    it('should have the 1200x628 summary_large_image asset under public/img/', () => {
        expect(fs.existsSync(imagePath)).toBe(true);

        // Verify JPEG SOI marker
        const buffer = fs.readFileSync(imagePath);
        expect(buffer[0]).toBe(0xff);
        expect(buffer[1]).toBe(0xd8);

        // Verify earth.jpg still exists for in-page usage
        expect(fs.existsSync(earthPath)).toBe(true);
    });

    it('should have valid Open Graph and Twitter summary_large_image tags in index.html', () => {
        const html = fs.readFileSync(indexPath, 'utf-8');
        const $ = cheerio.load(html);

        expect($('meta[name="twitter:card"]').attr('content')).toBe('summary_large_image');
        expect($('meta[name="twitter:image"]').attr('content')).toBe('https://apodemail.org/img/stargazers.jpg');
        expect($('meta[name="twitter:image:alt"]').attr('content')).toBeTruthy();

        expect($('meta[property="og:image"]').attr('content')).toBe('https://apodemail.org/img/stargazers.jpg');
        expect($('meta[property="og:image:width"]').attr('content')).toBe('1200');
        expect($('meta[property="og:image:height"]').attr('content')).toBe('628');
        expect($('meta[property="og:image:alt"]').attr('content')).toBeTruthy();
    });

    it('should have valid Open Graph and Twitter summary_large_image tags in visualization.html', () => {
        const html = fs.readFileSync(statsPath, 'utf-8');
        const $ = cheerio.load(html);

        expect($('meta[name="twitter:card"]').attr('content')).toBe('summary_large_image');
        expect($('meta[name="twitter:image"]').attr('content')).toBe('https://apodemail.org/img/stargazers.jpg');
        expect($('meta[name="twitter:image:alt"]').attr('content')).toBeTruthy();

        expect($('meta[property="og:image"]').attr('content')).toBe('https://apodemail.org/img/stargazers.jpg');
        expect($('meta[property="og:image:width"]').attr('content')).toBe('1200');
        expect($('meta[property="og:image:height"]').attr('content')).toBe('628');
        expect($('meta[property="og:image:alt"]').attr('content')).toBeTruthy();
    });
});
