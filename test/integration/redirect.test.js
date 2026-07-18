import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
const request = require('supertest');
const express = require('express');

// Save original environment
const originalNodeEnv = process.env.NODE_ENV;

describe('Canonical Redirection Middleware Tests', () => {
    let app;

    beforeEach(() => {
        // Clear require cache for server to re-evaluate it with 'production' environment
        delete require.cache[require.resolve('../../server')];
        process.env.NODE_ENV = 'production';
        app = require('../../server');
    });

    afterEach(() => {
        process.env.NODE_ENV = originalNodeEnv;
        delete require.cache[require.resolve('../../server')];
    });

    it('should redirect HTTP requests to HTTPS on the canonical domain', async () => {
        const response = await request(app)
            .get('/stats')
            .set('Host', 'apodemail.org')
            .set('X-Forwarded-Proto', 'http');

        expect(response.status).toBe(301);
        expect(response.headers.location).toBe('https://apodemail.org/stats');
    });

    it('should redirect non-canonical host (www) to the canonical host with HTTPS', async () => {
        const response = await request(app)
            .get('/')
            .set('Host', 'www.apodemail.org')
            .set('X-Forwarded-Proto', 'https');

        expect(response.status).toBe(301);
        expect(response.headers.location).toBe('https://apodemail.org/');
    });

    it('should redirect non-canonical host (www) and HTTP to the canonical host with HTTPS', async () => {
        const response = await request(app)
            .get('/unsubscribe?email=test@example.com')
            .set('Host', 'www.apodemail.org')
            .set('X-Forwarded-Proto', 'http');

        expect(response.status).toBe(301);
        expect(response.headers.location).toBe('https://apodemail.org/unsubscribe?email=test@example.com');
    });

    it('should redirect App Engine default subdomain to canonical host with HTTPS', async () => {
        const response = await request(app)
            .get('/stats')
            .set('Host', 'apod-email-node.uc.r.appspot.com')
            .set('X-Forwarded-Proto', 'https');

        expect(response.status).toBe(301);
        expect(response.headers.location).toBe('https://apodemail.org/stats');
    });

    it('should redirect /index.html to /', async () => {
        const response = await request(app)
            .get('/index.html')
            .set('Host', 'apodemail.org')
            .set('X-Forwarded-Proto', 'https');

        expect(response.status).toBe(301);
        expect(response.headers.location).toBe('https://apodemail.org/');
    });

    it('should redirect /index.html preserving query parameters to /', async () => {
        const response = await request(app)
            .get('/index.html?ref=newsletter')
            .set('Host', 'apodemail.org')
            .set('X-Forwarded-Proto', 'https');

        expect(response.status).toBe(301);
        expect(response.headers.location).toBe('https://apodemail.org/?ref=newsletter');
    });

    it('should NOT redirect GAE Cron requests', async () => {
        const response = await request(app)
            .get('/usercount')
            .set('Host', 'apod-email-node.uc.r.appspot.com')
            .set('X-Forwarded-Proto', 'http')
            .set('X-AppEngine-Cron', 'true');

        expect(response.status).not.toBe(301);
    });

    it('should NOT redirect GAE Task Queue requests', async () => {
        const response = await request(app)
            .post('/emailqueue')
            .set('Host', 'apod-email-node.uc.r.appspot.com')
            .set('X-Forwarded-Proto', 'http')
            .set('X-AppEngine-TaskName', 'task-123');

        expect(response.status).not.toBe(301);
    });

    it('should NOT redirect in non-production environments', async () => {
        // Override back to test environment
        process.env.NODE_ENV = 'test';
        delete require.cache[require.resolve('../../server')];
        const testApp = require('../../server');

        const response = await request(testApp)
            .get('/stats')
            .set('Host', 'www.apodemail.org')
            .set('X-Forwarded-Proto', 'http');

        expect(response.status).not.toBe(301);
    });
});
