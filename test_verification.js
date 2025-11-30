const axios = require('axios');
const db = require('./src/database');
const { sendDailyEmails } = require('./src/services/emailService');

async function runTests() {
    console.log("Starting verification...");

    // 1. Test Signup
    try {
        console.log("Testing Signup...");
        await axios.post('http://localhost:8080/signup', {
            email: 'test@example.com',
            referral: 'Test Script',
            notes: 'Testing 123'
        });
        console.log("Signup request sent.");
    } catch (error) {
        if (error.response && error.response.status === 409) {
            console.log("User already exists (expected if re-running).");
        } else {
            console.error("Signup failed:", error.message);
        }
    }

    // 2. Verify DB
    setTimeout(() => {
        db.get("SELECT * FROM users WHERE email = 'test@example.com'", (err, row) => {
            if (err) {
                console.error("DB Verification failed:", err);
            } else if (row) {
                console.log("DB Verification PASSED: User found.", row);

                // 3. Test Daily Email (Trigger manually)
                console.log("Triggering Daily Email...");
                sendDailyEmails();
            } else {
                console.error("DB Verification FAILED: User not found.");
            }
        });
    }, 1000);
}

// Wait for server to start (manual run required)
console.log("Please ensure server is running (npm start) before running this script.");
// We can't easily auto-run this against the server in the same process without spawning.
// For this environment, I'll just export the function or run it if executed directly.
if (require.main === module) {
    runTests();
}
