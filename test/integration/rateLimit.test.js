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
});
