# Testing Strategy for APODEmail-node

This document outlines the plan for implementing unit and integration tests for the APODEmail-node repository, enabling local automation without GAE deployment.

## 1. Testing Framework & Tools

- **Test Runner**: [Vitest](https://vitest.dev/)
  - Modern, fast, and Jest-compatible API.
  - Native support for ESM and TypeScript (though we are using CJS).
- **Integration Testing**: [Supertest](https://github.com/ladjs/supertest)
  - For testing Express routes without manually starting the server.
- **Mocking**:
  - `vitest` built-in mocking for services and external APIs.
  - `sinon` (optional) if more complex mocking is needed, but Vitest is usually sufficient.
- **Logging**:
  - Keep using `pino` but silence it or set to `ERROR/SILENT` during tests unless debugging.

## 2. Directory Structure

```text
/test
├───integration/        # Integration tests (API routes, end-to-end)
│   └───routes.test.js
├───unit/               # Unit tests for individual components
│   ├───services/
│   │   ├───apodService.test.js
│   │   ├───emailService.test.js
│   │   └───statsService.test.js
│   └───database.test.js # Testing data access logic with Mocks
└───setup.js             # Global test setup (env vars, global mocks)
```

## 3. Unit Testing Strategy

### Services
- **`apodService.js`**:
    - Mock `axios` to simulate NASA API responses (or the scraper).
    - Verify parsing of HTML/JSON.
    - Test edge cases (missing data, video content vs image content).
- **`emailService.js`**:
    - Verify HTML templates are rendered correctly with provided data.
    - Mock Cloud Tasks to ensure emails are correctly scheduled if applicable.
- **`statsService.js`**:
    - Test calculation logic for signup counts, conversion rates, etc.

### Database (`database.js`)
- Mock `@google-cloud/datastore`.
- Ensure `saveSubscriber`, `getSubscriber`, and other DB methods call Datastore with correct parameters.
- Test handling of "Not Found" or "Conflict" errors.

## 4. Integration Testing Strategy

### API Routes (`routes.js`)
- Use `supertest(app)` to hit endpoints.
- **Signup Flow**:
  - POST `/signup` with valid/invalid data.
  - Verify Datastore and Cloud Tasks are "called" (via mocks).
  - Verify response codes and messages.
- **Stats**:
  - GET `/stats` and verify it returns correct rendered HTML or JSON.
- **Verification**:
  - Simulate the verification redirect and ensure subscriber status updates.

## 5. Local Automation Setup

1. **Install Dependencies**:
   ```bash
   npm install --save-dev vitest @vitest/coverage-v8 supertest
   ```
2. **Update `package.json`**:
   ```json
   "scripts": {
     "test": "vitest run",
     "test:watch": "vitest",
     "test:coverage": "vitest run --coverage"
   }
   ```
3. **Mock Environment**:
   - Use `MOCK_GCP=true` (which seems to be partially implemented) to bypass actual GCP calls in local tests.
   - Use a `test/setup.js` to initialize environment variables for testing.

## 6. Implementation Steps

1. **Phase 1: Basic Setup**
   - Install dependencies and configure `package.json`.
   - Create `test/setup.js`.
2. **Phase 2: Service Unit Tests**
   - Start with `statsService.js` and `apodService.js` as they are more isolated.
3. **Phase 3: Database Mocking**
   - Implement mocks for Datastore.
4. **Phase 4: Route Integration Tests**
   - Use `supertest` to cover the main signup and stats flows.
5. **Phase 5: Automation**
   - Ensure `npm test` runs smoothly and provides meaningful output.
