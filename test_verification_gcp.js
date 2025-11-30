const axios = require('axios');

async function runTests() {
    console.log("Starting verification (Hybrid + MOCK_GCP Mode)...");

    // 1. Test Signup
    try {
        console.log("Testing Signup Endpoint...");
        const res = await axios.post('http://localhost:8080/signup', {
            email: 'test@example.com',
            referral: 'Test Script',
            notes: 'Testing 123'
        });
        console.log("Signup response:", res.status, res.data);
    } catch (error) {
        console.error("Signup failed:", error.response ? error.response.data : error.message);
    }

    // 2. Test Cron Trigger (Should Enqueue App Engine Tasks)
    try {
        console.log("Testing Cron Trigger...");
        const res = await axios.get('http://localhost:8080/dailyemail/2023/11/29');
        console.log("Cron response:", res.status, res.data);
    } catch (error) {
        console.error("Cron failed:", error.response ? error.response.data : error.message);
    }

    // 3. Worker Endpoint is NO LONGER in Node.js
    // It is in Python. We can't test it here without running the Python app.
    // But we verified the task creation logs above.
}

// Wait for server to start
setTimeout(runTests, 2000);
