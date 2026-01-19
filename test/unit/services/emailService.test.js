import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = require('../../../src/database');
const apodService = require('../../../src/services/apodService');
const taskQueueService = require('../../../src/services/taskQueueService');
const emailService = require('../../../src/services/emailService');

describe('emailService', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('should correctly enqueue emails for all users with tracking and personalization', async () => {
        const mockApod = {
            title: 'Moon Games',
            html: '<html><body><b>Moon Games</b><br><a href="https://example.com/more">Details</a><p>Unsubscribe <a href="https://apodemail.org?action=unsubscribe&email={{email}}">here</a></p></body></html>'
        };

        const mockUsers = [
            { email: 'user1@example.com' },
            { email: 'user2@example.com' }
        ];

        vi.spyOn(apodService, 'fetchAPOD').mockResolvedValue(mockApod);
        vi.spyOn(db, 'getUsersByDateRange').mockResolvedValue(mockUsers);
        const createTaskSpy = vi.spyOn(taskQueueService, 'createTask').mockResolvedValue({ name: 'mock-task' });

        const count = await emailService.enqueueEmails('http://localhost', 2023, 10, 11);

        expect(count).toBe(2);
        expect(db.getUsersByDateRange).toHaveBeenCalledWith(2023, 10, 11);
        expect(createTaskSpy).toHaveBeenCalledTimes(2);

        const firstCall = createTaskSpy.mock.calls[0][0];
        expect(firstCall.service).toBe('mailer');

        const params = new URLSearchParams(firstCall.body);
        expect(params.get('email')).toBe('user1@example.com');

        const body = params.get('body');
        expect(body).toContain('user1%40example.com');
        expect(body).toContain('utm_source=newsletter');
    });

    it('should throw error if date parameters are missing', async () => {
        await expect(emailService.enqueueEmails('http://localhost')).rejects.toThrow('Missing date parameters');
    });
});
