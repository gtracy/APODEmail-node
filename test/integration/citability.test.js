import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as cheerio from 'cheerio';

const request = require('supertest');
const app = require('../../server');
const statsService = require('../../src/services/statsService');
const logger = require('../../src/services/logger');

describe('AI Citability & Discovery Integration Tests', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        process.env.MOCK_GCP = 'true';
    });

    describe('GET / (SSR Subscriber Count)', () => {
        it('should server-render the cached subscriber count when stats are available', async () => {
            vi.spyOn(statsService, 'getCachedStats').mockResolvedValue({
                labels: ['Nov 2026'],
                data: [12345],
                total: 12345,
                generatedAt: '2026-11-21T12:00:00.000Z'
            });

            const response = await request(app).get('/');

            expect(response.status).toBe(200);
            expect(response.headers['content-type']).toContain('text/html');
            expect(response.text).toContain(
                '12,345 active subscribers - <a href="/stats" style="color: inherit; text-decoration: underline;">see more stats</a>'
            );
            expect(response.text).not.toContain('<!-- SSR_USER_COUNT -->');
        });

        it('should serve static /stats fallback when cached stats are null', async () => {
            vi.spyOn(statsService, 'getCachedStats').mockResolvedValue(null);

            const response = await request(app).get('/');

            expect(response.status).toBe(200);
            const $ = cheerio.load(response.text);
            const statsLink = $('#user-count-display a[href="/stats"]');
            expect(statsLink.length).toBeGreaterThan(0);
        });

        it('should gracefully fall back and log via pino when statsService throws', async () => {
            const testError = new Error('Datastore unavailable');
            vi.spyOn(statsService, 'getCachedStats').mockRejectedValue(testError);
            const loggerSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

            const response = await request(app).get('/');

            expect(response.status).toBe(200);
            const $ = cheerio.load(response.text);
            expect($('#user-count-display a[href="/stats"]').length).toBeGreaterThan(0);
            expect(loggerSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    err: testError,
                    event: 'ssr_user_count_error'
                }),
                expect.any(String)
            );
        });
    });

    describe('Discovery Endpoints', () => {
        it('GET /llms.txt should return 200 with concise service facts and key links', async () => {
            const response = await request(app).get('/llms.txt');

            expect(response.status).toBe(200);
            expect(response.text).toContain('# APOD Email');
            expect(response.text).toContain('2009');
            expect(response.text).toContain('Greg Tracy');
            expect(response.text).toContain('https://apodemail.org/');
            expect(response.text).toContain('https://apodemail.org/stats');
            expect(response.text).toContain('https://science.nasa.gov/apod');
            expect(response.text).toContain('https://github.com/gtracy/APODEmail-node');
            expect(response.text.toLowerCase()).toContain('unsubscribe');
        });

        it('GET /sitemap.xml should return 200 and include <lastmod> on all URLs', async () => {
            const response = await request(app).get('/sitemap.xml');

            expect(response.status).toBe(200);
            expect(response.text).toContain('<loc>https://apodemail.org/</loc>');
            expect(response.text).toContain('<loc>https://apodemail.org/stats</loc>');

            const lastmodMatches = response.text.match(/<lastmod>2026-11-21<\/lastmod>/g) || [];
            expect(lastmodMatches.length).toBe(2);
        });
    });

    describe('Homepage Citability, Schema, Trust & Accessibility', () => {
        async function fetchHomepageDom() {
            vi.spyOn(statsService, 'getCachedStats').mockResolvedValue(null);
            const response = await request(app).get('/');
            expect(response.status).toBe(200);
            return cheerio.load(response.text);
        }

        it('should have a disambiguated H1 and clear lead copy', async () => {
            const $ = await fetchHomepageDom();
            const h1Text = $('h1').first().text().trim();
            const bodyText = $('body').text().toLowerCase();

            expect(h1Text).toContain('APOD Email');
            expect(bodyText).toContain('free');
            expect(bodyText).toContain('daily');
            expect(bodyText).toContain('2009');
            expect(bodyText).toContain('greg tracy');
        });

        it('should include visible FAQ content and trust links', async () => {
            const $ = await fetchHomepageDom();
            const bodyText = $('body').text().toLowerCase();

            expect(bodyText).toContain('what is apod email');
            expect(bodyText).toContain('free');
            expect(bodyText).toContain('nasa');
            expect(bodyText).toContain('unsubscribe');

            const githubLinks = $('a[href="https://github.com/gtracy/APODEmail-node"]');
            expect(githubLinks.length).toBeGreaterThan(0);
        });

        it('should have upgraded JSON-LD with @id graph linking, Service metadata, Person sameAs, and FAQPage', async () => {
            const $ = await fetchHomepageDom();
            const jsonLdText = $('script[type="application/ld+json"]').first().html();
            expect(jsonLdText).toBeTruthy();

            const jsonLd = JSON.parse(jsonLdText);
            expect(Array.isArray(jsonLd['@graph'])).toBe(true);

            const graph = jsonLd['@graph'];
            const website = graph.find(node => node['@type'] === 'WebSite');
            const service = graph.find(node => node['@type'] === 'Service');
            const person = graph.find(node => node['@type'] === 'Person');
            const faqPage = graph.find(node => node['@type'] === 'FAQPage');

            expect(website).toBeDefined();
            expect(website['@id']).toBe('https://apodemail.org/#website');

            expect(service).toBeDefined();
            expect(service['@id']).toBe('https://apodemail.org/#service');
            expect(service.isAccessibleForFree).toBe(true);
            expect(service.serviceType).toBeTruthy();
            expect(service.provider).toEqual({ '@id': 'https://apodemail.org/#provider' });

            const aboutStr = JSON.stringify(service.about || '');
            expect(aboutStr).toContain('https://science.nasa.gov/apod');
            expect(aboutStr).toContain('https://en.wikipedia.org/wiki/Astronomy_Picture_of_the_Day');

            const offersStr = JSON.stringify(service.offers || '');
            expect(offersStr).not.toContain('InStock');

            expect(person).toBeDefined();
            expect(person['@id']).toBe('https://apodemail.org/#provider');
            expect(Array.isArray(person.sameAs)).toBe(true);
            expect(person.sameAs.some(url => url.includes('github.com/gtracy'))).toBe(true);

            expect(faqPage).toBeDefined();
            expect(faqPage['@id']).toBe('https://apodemail.org/#faq');
            expect(Array.isArray(faqPage.mainEntity)).toBe(true);
            expect(faqPage.mainEntity.length).toBeGreaterThanOrEqual(5);
            for (const item of faqPage.mainEntity) {
                expect(item['@type']).toBe('Question');
                expect(item.name).toBeTruthy();
                expect(item.acceptedAnswer?.['@type']).toBe('Answer');
                expect(item.acceptedAnswer?.text).toBeTruthy();
            }
        });

        it('should have rel="noopener noreferrer" on all target="_blank" links and aria-label on social links', async () => {
            const $ = await fetchHomepageDom();

            const blankLinks = $('a[target="_blank"]');
            expect(blankLinks.length).toBeGreaterThan(0);
            blankLinks.each((_, el) => {
                const rel = ($(el).attr('rel') || '').split(/\s+/);
                expect(rel).toContain('noopener');
                expect(rel).toContain('noreferrer');
            });

            const socialLinks = $('.social-links a, a[title^="Share on"]');
            expect(socialLinks.length).toBeGreaterThan(0);
            socialLinks.each((_, el) => {
                expect($(el).attr('aria-label')).toBeTruthy();
            });
        });
    });
});
