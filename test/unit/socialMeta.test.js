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
    const faviconPngPath = path.join(rootDir, 'public/img/favicon.png');
    const faviconIcoPath = path.join(rootDir, 'public/favicon.ico');

    it('should have favicon link tags pointing at the root-relative PNG in index.html and visualization.html (Issue #102)', () => {
        for (const pagePath of [indexPath, statsPath]) {
            const html = fs.readFileSync(pagePath, 'utf-8');
            const $ = cheerio.load(html);
            const faviconHref = $('link[rel="icon"], link[rel="shortcut icon"]').attr('href');

            expect(faviconHref).toBe('/img/favicon.png');
        }
    });

    it('should have favicon assets on disk, including a root /favicon.ico fallback (Issue #102)', () => {
        expect(fs.existsSync(faviconPngPath)).toBe(true);

        // Root fallback so browsers requesting /favicon.ico get a 200
        // (express.static serves public/ before the rate limiter runs).
        expect(fs.existsSync(faviconIcoPath)).toBe(true);

        // Verify the root ICO is a real ICO file (00 00 01 00 header)
        const buffer = fs.readFileSync(faviconIcoPath);
        expect(buffer[0]).toBe(0x00);
        expect(buffer[1]).toBe(0x00);
        expect(buffer[2]).toBe(0x01);
        expect(buffer[3]).toBe(0x00);
    });

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

    it('should have Twitter share link with UTM parameters in index.html', () => {
        const html = fs.readFileSync(indexPath, 'utf-8');
        const $ = cheerio.load(html);
        const twitterShareHref = $('a[title="Share on X"]').attr('href');

        expect(twitterShareHref).toContain('https://twitter.com/intent/tweet');
        expect(twitterShareHref).toContain('utm_source%3Dtwitter');
        expect(twitterShareHref).toContain('utm_medium%3Dsocial');
    });

    it('should have Twitter share link with UTM parameters in visualization.html', () => {
        const html = fs.readFileSync(statsPath, 'utf-8');
        const $ = cheerio.load(html);
        const twitterShareHref = $('a[title="Share on X"]').attr('href');

        expect(twitterShareHref).toContain('https://twitter.com/intent/tweet');
        expect(twitterShareHref).toContain('utm_source%3Dtwitter');
        expect(twitterShareHref).toContain('utm_medium%3Dsocial');
    });
});
