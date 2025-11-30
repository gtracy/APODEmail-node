const { CloudTasksClient } = require('@google-cloud/tasks');

let client;

if (process.env.MOCK_GCP === 'true') {
    console.log("Using Mock Cloud Tasks (MOCK_GCP=true)");
    client = {
        queuePath: () => "projects/mock/locations/us-central1/queues/emailqueue",
        createTask: async ({ parent, task }) => {
            console.log("Mock Cloud Tasks: Created App Engine task");
            console.log("  Target Service:", task.appEngineHttpRequest.appEngineRouting.service);
            console.log("  URL:", task.appEngineHttpRequest.relativeUri);
            console.log("  Body (Base64 decoded):", Buffer.from(task.appEngineHttpRequest.body, 'base64').toString());
            return [{ name: 'projects/mock/locations/us-central1/queues/emailqueue/tasks/123' }];
        }
    };
} else {
    try {
        client = new CloudTasksClient();
    } catch (err) {
        console.warn("Could not initialize CloudTasksClient. Using Mock.");
        client = {
            queuePath: () => "mock-queue-path",
            createTask: async () => [{ name: 'mock-task-id' }]
        };
    }
}

async function createTask(payload) {
    const project = process.env.GOOGLE_CLOUD_PROJECT || 'mock-project';
    const queue = process.env.GCLOUD_TASK_QUEUE || 'emailqueue';
    const location = process.env.GCLOUD_TASK_LOCATION || 'us-central1';

    const parent = client.queuePath(project, location, queue);

    // Construct App Engine Task
    const task = {
        appEngineHttpRequest: {
            httpMethod: 'POST',
            relativeUri: payload.relativeUri, // e.g., /emailqueue
            appEngineRouting: {
                service: payload.service || 'default', // Target specific service
            },
            body: Buffer.from(payload.body).toString('base64'),
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded', // Legacy app expects form data
            },
        },
    };

    try {
        const [response] = await client.createTask({ parent, task });
        console.log(`Created task ${response.name}`);
        return response;
    } catch (error) {
        console.error('Error creating task:', error);
        throw error;
    }
}

module.exports = { createTask };
