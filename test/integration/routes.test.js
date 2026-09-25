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

    describe('Unsubscribe Endpoints', () => {
        describe('GET /unsubscribe (Bot-safe confirmation page)', () => {
            it('should serve confirmation page without deleting user when scanned by bots', async () => {
                const deleteSpy = vi.spyOn(db, 'deleteUser');
                const response = await request(app).get('/unsubscribe?email=test@example.com');

                expect(response.status).toBe(200);
                expect(response.text).toContain('Unsubscribe from Daily Email');
                expect(response.text).toContain('test@example.com');
                expect(response.text).toContain('Confirm Unsubscribe');
                // Ensure GET never triggers unsubscription (bot protection)
                expect(deleteSpy).not.toHaveBeenCalled();
            });

            it('should serve confirmation page even when no email is provided', async () => {
                const deleteSpy = vi.spyOn(db, 'deleteUser');
                const response = await request(app).get('/unsubscribe');

                expect(response.status).toBe(200);
                expect(response.text).toContain('Unsubscribe from Daily Email');
                expect(deleteSpy).not.toHaveBeenCalled();
            });
        });

        describe('POST /unsubscribe (Action execution)', () => {
            it('should return 400 if email is missing', async () => {
                const response = await request(app)
                    .post('/unsubscribe')
                    .send({});
                expect(response.status).toBe(400);
                expect(response.text).toContain('Email is required');
            });

            it('should return 400 if email is invalid', async () => {
                const response = await request(app)
                    .post('/unsubscribe')
                    .send({ email: 'not-an-email' });
                expect(response.status).toBe(400);
                expect(response.text).toContain('Invalid email format');
            });

            it('should return message if email not found', async () => {
                vi.spyOn(db, 'deleteUser').mockResolvedValue(false);
                const response = await request(app)
                    .post('/unsubscribe')
                    .send({ email: 'unknown@example.com' });
                expect(response.status).toBe(200);
                expect(response.text).toContain('Email not found');
            });

            it('should unsubscribe user and enqueue notification on success via JSON', async () => {
                vi.spyOn(db, 'deleteUser').mockResolvedValue(true);
                const createTaskSpy = vi.spyOn(taskQueueService, 'createTask').mockResolvedValue({ name: 'task-123' });

                const response = await request(app)
                    .post('/unsubscribe')
                    .send({ email: 'test@example.com', notes: 'tooManyEmails' });

                expect(response.status).toBe(200);
                expect(response.text).toContain('You have been unsubscribed');
                expect(db.deleteUser).toHaveBeenCalledWith('test@example.com');
                expect(createTaskSpy).toHaveBeenCalled();
            });

            it('should unsubscribe user and render confirmation page via Form URL-encoded', async () => {
                vi.spyOn(db, 'deleteUser').mockResolvedValue(true);
                const createTaskSpy = vi.spyOn(taskQueueService, 'createTask').mockResolvedValue({ name: 'task-123' });

                const response = await request(app)
                    .post('/unsubscribe')
                    .type('form')
                    .send({ email: 'test@example.com', notes: 'tooManyEmails' });

                expect(response.status).toBe(200);
                expect(response.text).toContain('You Have Been Unsubscribed');
                expect(response.text).toContain('test@example.com');
                expect(db.deleteUser).toHaveBeenCalledWith('test@example.com');
                expect(createTaskSpy).toHaveBeenCalled();
            });

            it('should support RFC 8058 one-click unsubscribe where email is in query params', async () => {
                vi.spyOn(db, 'deleteUser').mockResolvedValue(true);
                const createTaskSpy = vi.spyOn(taskQueueService, 'createTask').mockResolvedValue({ name: 'task-123' });

                const response = await request(app)
                    .post('/unsubscribe?email=test@example.com')
                    .set('Content-Type', 'application/x-www-form-urlencoded')
                    .send('List-Unsubscribe=One-Click');

                expect(response.status).toBe(200);
                expect(response.text).toContain('You have been unsubscribed');
                expect(db.deleteUser).toHaveBeenCalledWith('test@example.com');
                expect(createTaskSpy).toHaveBeenCalled();
            });
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
