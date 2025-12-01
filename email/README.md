# APOD Email Service (Python)

This directory contains the legacy Python 2.7 application that acts as a dedicated microservice for sending emails. It is deployed as the `mailer` service in Google App Engine.

## Architecture

This service works in tandem with the main Node.js application:
1.  **Trigger**: The Node.js app (default service) processes the daily APOD and subscriber list.
2.  **Queueing**: For each subscriber, the Node.js app creates a Google Cloud Task.
3.  **Execution**: The Cloud Task targets this `mailer` service.
4.  **Delivery**: This Python app receives the task and sends the email using the App Engine Mail API.

## API Reference

### `POST /emailqueue`

This is the worker endpoint that processes email tasks.

**Parameters (Form Data):**
*   `email`: Recipient email address.
*   `subject`: Email subject line.
*   `body`: HTML body content of the email.
*   `bcc`: (Optional) Set to 'True' to BCC the admin.

## Configuration

This service uses the **Google App Engine Mail API**. No external SMTP configuration is required.
It relies on the `app_engine_apis: true` setting in `app.yaml` and the project's App Engine quota.

## Deployment

To deploy this service independently:

```bash
gcloud app deploy email/app.yaml
```

## Testing Strategy

### 1. Unit Tests (Local)
You can run the unit tests locally.

> **Note:** You must use **Python 3.11** (or 3.10). The App Engine SDK libraries are incompatible with Python 3.12+.

**Prerequisites:**
```bash
pip install -r email/requirements.txt
```

**Run Tests:**
```bash
python3 email/tests/test_main.py
```

### 2. Local Server (Integration Test)
You can run the application directly using Python 3.11.

1.  **Start the Server:**
    ```bash
    # Ensure you are in the email/ directory or set PYTHONPATH
    python3 email/main.py
    ```

2.  **Send a Request:**
    ```bash
    curl -X POST http://localhost:8080/emailqueue \
      -d "email=test@example.com" \
      -d "subject=Test" \
      -d "body=<h1>Hello</h1>"
    ```

### 3. Using dev_appserver.py (Advanced)
If you prefer to use the Google Cloud SDK emulator, you must run the **emulator itself** with a compatible Python version (e.g., Python 3.11), while telling it to use your Python 3.13 environment for the **application**.

```bash
# 1. Locate dev_appserver.py (usually in your Cloud SDK installation)
# 2. Run with Python 3.11 (to satisfy SDK deps) and point to Python 3.13 (for your app)
python3.11 $(which dev_appserver.py) \
  --runtime_python_path=$(pwd)/venv/bin/python3 \
  email/app.yaml
```
