import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        setupFiles: ['./test/setup.js'],
        environment: 'node',
        globals: true,
    },
});
