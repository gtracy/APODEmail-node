// Global setup for Vitest
process.env.MOCK_GCP = 'true';
process.env.PORT = '8081'; // Default test port
process.env.NODE_ENV = 'test';

// Silence pino logs during tests by default, unless LOG_LEVEL is explicitly set
if (!process.env.LOG_LEVEL) {
    process.env.LOG_LEVEL = 'silent';
}
