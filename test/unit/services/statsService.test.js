import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = require('../../../src/database');
const statsService = require('../../../src/services/statsService');

describe('statsService', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('should correctly aggregate and filter monthly counts', async () => {
        const mockMonthlyCounts = {
            '2023-10': 10,
            '2023-11': 20,
            '3000-01': 99, // Should be filtered out
            '1990-01': 5,  // Should be filtered out
        };

        const spy = vi.spyOn(db, 'getMonthlyCounts').mockResolvedValue(mockMonthlyCounts);
        vi.spyOn(db, 'saveStats').mockResolvedValue({ id: 'stats_id' });

        const result = await statsService.generateAndSaveStats();

        expect(spy).toHaveBeenCalled();
        expect(result.labels).toContain('Oct 2023');
        expect(result.labels).toContain('Nov 2023');
        expect(result.labels).not.toContain('Jan 3000');
        expect(result.labels).not.toContain('Jan 1990');
        expect(result.total).toBe(30);

        expect(db.saveStats).toHaveBeenCalledWith(expect.objectContaining({
            total: 30,
            labels: ['Oct 2023', 'Nov 2023']
        }));
    });
});
