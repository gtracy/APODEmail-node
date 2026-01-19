import { describe, it, expect } from 'vitest';

describe('Sanity Check', () => {
    it('should pass if 1 + 1 is 2', () => {
        expect(1 + 1).toBe(2);
    });

    it('should have MOCK_GCP set to true', () => {
        expect(process.env.MOCK_GCP).toBe('true');
    });
});
