import { describe, it, expect, vi, beforeEach } from 'vitest';
const request = require('supertest');
const app = require('../../server');

// Mock dependencies to prevent side effects and allow server to load routes
vi.mock('../../src/database', () => ({
    getUserByEmail: vi.fn(),
    createUser: vi.fn(),
    deleteUser: vi.fn(),
    getUserCount: vi.fn(),
}));
vi.mock('../../src/services/emailService', () => ({
    enqueueEmails: vi.fn(),
}));
vi.mock('../../src/services/statsService', () => ({
    getCachedStats: vi.fn(),
}));
vi.mock('../../src/services/taskQueueService', () => ({
    createTask: vi.fn(),
}));

describe('Rate Limiting Middleware', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        process.env.MOCK_GCP = 'true';
    });

    it('should include rate limit headers in response', async () => {
        // Hitting a non-existent endpoint should still trigger rate limiting
        const response = await request(app).get('/random-path-for-rate-limit-test');

        expect(response.headers['ratelimit-limit']).toBeDefined();
        expect(response.headers['ratelimit-remaining']).toBeDefined();
        expect(response.headers['ratelimit-reset']).toBeDefined();
    });

    it('should decrement remaining requests on subsequent calls', async () => {
        // First request
        const response1 = await request(app).get('/random-path-TEST-1');
        const remaining1 = parseInt(response1.headers['ratelimit-remaining']);

        // Second request
        const response2 = await request(app).get('/random-path-TEST-2');
        const remaining2 = parseInt(response2.headers['ratelimit-remaining']);

        expect(remaining2).toBe(remaining1 - 1);
    });

    it('should skip rate limiting for GAE internal requests', async () => {
        const cronRes = await request(app)
            .get('/random-path-cron')
            .set('X-AppEngine-Cron', 'true');
        expect(cronRes.headers['ratelimit-limit']).toBeUndefined();

        const taskRes = await request(app)
            .get('/random-path-task')
            .set('X-AppEngine-TaskName', 'task-xyz');
        expect(taskRes.headers['ratelimit-limit']).toBeUndefined();

        const queueRes = await request(app)
            .get('/random-path-queue')
            .set('X-AppEngine-QueueName', 'mail-queue');
        expect(queueRes.headers['ratelimit-limit']).toBeUndefined();

        const schedulerRes = await request(app)
            .get('/random-path-scheduler')
            .set('X-CloudScheduler', 'true');
        expect(schedulerRes.headers['ratelimit-limit']).toBeUndefined();
    });

    it('should track different client IPs independently via x-appengine-user-ip', async () => {
        const ipA = '198.51.100.10';
        const ipB = '203.0.113.20';

        const resA1 = await request(app)
            .get('/ip-test-path')
            .set('X-AppEngine-User-IP', ipA);
        const remA1 = parseInt(resA1.headers['ratelimit-remaining']);

        const resB1 = await request(app)
            .get('/ip-test-path')
            .set('X-AppEngine-User-IP', ipB);
        const remB1 = parseInt(resB1.headers['ratelimit-remaining']);

        // Since ipB is a separate client, its quota should start fresh and not be affected by ipA
        expect(remB1).toBe(99);

        // A second request from ipA should decrement ipA only
        const resA2 = await request(app)
            .get('/ip-test-path')
            .set('X-AppEngine-User-IP', ipA);
        const remA2 = parseInt(resA2.headers['ratelimit-remaining']);
        expect(remA2).toBe(remA1 - 1);
    });

    it('should correctly resolve different client IPs through private/linklocal proxy hops', async () => {
        const clientA = '198.51.100.55';
        const clientB = '203.0.113.77';

        // Requests passing through GAE internal linklocal proxy 169.254.1.1
        const resA = await request(app)
            .get('/proxy-hop-test')
            .set('X-Forwarded-For', `${clientA}, 169.254.1.1`);

        const resB = await request(app)
            .get('/proxy-hop-test')
            .set('X-Forwarded-For', `${clientB}, 169.254.1.1`);

        // Both clients should have independent counters rather than sharing the proxy's IP
        expect(parseInt(resA.headers['ratelimit-remaining'])).toBe(99);
        expect(parseInt(resB.headers['ratelimit-remaining'])).toBe(99);
    });
});
