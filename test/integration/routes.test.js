import { describe, it, expect, vi, beforeEach } from 'vitest';
const request = require('supertest');
const express = require('express');

// We use spies on the actual modules because they are CJS and this is more reliable in this environment
const db = require('../../src/database');
const emailService = require('../../src/services/emailService');
const statsService = require('../../src/services/statsService');
const taskQueueService = require('../../src/services/taskQueueService');

// Create the app for testing
const routes = require('../../src/routes');
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/', routes);

describe('Route Integration Tests', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        process.env.MOCK_GCP = 'true';
    });

    describe('POST /signup', () => {
        it('should create user and enqueue confirmation on success', async () => {
            vi.spyOn(db, 'getUserByEmail').mockResolvedValue(null);
            vi.spyOn(db, 'createUser').mockResolvedValue({ path: ['UserSignup', '123'] });
            vi.spyOn(taskQueueService, 'createTask').mockResolvedValue({ name: 'task-123' });

            const response = await request(app)
                .post('/signup')
                .send({ email: 'new@example.com', notes: 'hello' });

            expect(response.status).toBe(200);
            expect(response.text).toContain('Signup successful');
        });
    });

    describe('GET /dailyemail', () => {
        it('should allow cron tasks if GAE header is present', async () => {
            vi.spyOn(emailService, 'enqueueEmails').mockResolvedValue(5);

            const response = await request(app)
                .get('/dailyemail/2023/1/12')
                .set('X-AppEngine-Cron', 'true');

            expect(response.status).toBe(200);
            expect(response.text).toContain('Enqueued 5 tasks');
        });
    });

    describe('GET /stats', () => {
        it('should return fallback message if no stats exist', async () => {
            vi.spyOn(statsService, 'getCachedStats').mockResolvedValue(null);

            const response = await request(app).get('/stats');
            expect(response.status).toBe(200);
            expect(response.text).toContain('Stats are being generated');
        });
    });

    describe('GET /unsubscribe', () => {
        it('should return 400 if email is missing', async () => {
            const response = await request(app).get('/unsubscribe');
            expect(response.status).toBe(400);
            expect(response.text).toContain('Email is required');
        });

        it('should return message if email not found', async () => {
            vi.spyOn(db, 'deleteUser').mockResolvedValue(false);
            const response = await request(app).get('/unsubscribe?email=unknown@example.com');
            expect(response.status).toBe(200);
            expect(response.text).toContain('Email not found');
        });

        it('should unsubscribe user and enqueue notification on success', async () => {
            vi.spyOn(db, 'deleteUser').mockResolvedValue(true);
            const createTaskSpy = vi.spyOn(taskQueueService, 'createTask').mockResolvedValue({ name: 'task-123' });

            const response = await request(app).get('/unsubscribe?email=test@example.com&notes=tooManyEmails');

            expect(response.status).toBe(200);
            expect(response.text).toContain('You have been unsubscribed');
            expect(db.deleteUser).toHaveBeenCalledWith('test@example.com');
            expect(createTaskSpy).toHaveBeenCalled();
        });
    });

    describe('User Count Endpoints', () => {
        it('GET /usercount should return text count', async () => {
            vi.spyOn(db, 'getUserCount').mockResolvedValue(42);
            const response = await request(app).get('/usercount');
            expect(response.status).toBe(200);
            expect(response.text).toContain('Total users: 42');
        });

        it('GET /api/user-count should return JSON count', async () => {
            vi.spyOn(db, 'getUserCount').mockResolvedValue(100);
            const response = await request(app).get('/api/user-count');
            expect(response.status).toBe(200);
            expect(response.body).toEqual({ count: 100 });
        });
    });
});
