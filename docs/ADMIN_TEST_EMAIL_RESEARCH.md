# Admin Test Email: Research Notes

Goal: be able to send exactly one real APOD email, to the admin only, from production, to check how it renders in an inbox. Chosen approach: cron-style route triggered from `gcloud`, not a public endpoint.

**Status: not implemented.** The edit was blocked by the auto-mode classifier in the session where this was researched. Nothing below has been applied.

## What exists today

- `src/routes.js`
  - `GET /dailyemail/:year/:startMonth/:endMonth` is guarded by `if (!req.get('X-AppEngine-Cron')) return 403`. App Engine sets that header only for its own cron requests and strips it from external traffic. The handler calls `emailService.enqueueEmails(...)`.
  - `POST /emailqueue` is guarded by `X-AppEngine-TaskName`. It is the Cloud Tasks worker.
  - `GET /testapod?email=` returns 403 when `NODE_ENV === 'production'`, and the code that would enqueue a task is commented out. It can only render a preview, so it is no help in prod.
- `src/services/emailService.js`: `enqueueEmails(workerUrlBase, year, startMonth, endMonth)` fetches the APOD, adds UTM params to links, then loops over `db.getUsersByDateRange(...)`. For each user it personalizes `{{email}}`, appends the GA4 open-tracking pixel, sets the `List-Unsubscribe` header, and enqueues a task for the `mailer` service (`/emailqueue`).
- `app.yaml` already sets `ADMIN_EMAIL: ${ADMIN_EMAIL}` in `env_variables`. `routes.js` already uses it for unsubscribe-feedback mail.
- `cron.yaml` has one entry per date range for the daily send (~10:00 to 12:04 America/Chicago).

## Why not a normal "back door"

An unauthenticated or token-in-URL route that sends mail in production is an attack surface (spam relay, abuse of the mailer quota). The classifier flagged it for the same reason. The design below avoids that.

## Proposed design

1. **`emailService.enqueueEmails`**: add an optional 5th parameter `options = {}`. When `options.recipients` (array of emails) is set, skip `db.getUsersByDateRange` and use `recipients.map(email => ({ email }))`. Everything else (UTM links, tracking pixel, unsubscribe header, task creation) stays identical, so the test send exercises the real pipeline.
2. **`routes.js`**: add
   ```js
   router.get('/dailyemail/test', async (req, res) => {
       if (!req.get('X-AppEngine-Cron')) return res.status(403).send('Forbidden');
       const adminEmail = process.env.ADMIN_EMAIL;
       if (!adminEmail || !validator.isEmail(adminEmail)) return res.status(404).send('Not found');
       const count = await emailService.enqueueEmails(null, null, null, null, { recipients: [adminEmail] });
       res.send(`Enqueued ${count} test task.`);
   });
   ```
   Register it **before** `/dailyemail/:year/:startMonth/:endMonth`. `test` has only one path segment so it would not match the 3-segment route anyway, but keeping the order explicit is safer.
3. **Safety properties**
   - Same guard as the existing cron routes, so it is unreachable from the public internet.
   - The recipient is never read from the request, so it cannot mail anyone else.
   - 404 if `ADMIN_EMAIL` is unset.
4. **Tests** (vitest + supertest are already set up): 403 without the cron header; 200 with the header and a single enqueued task addressed to `ADMIN_EMAIL`; 404 when `ADMIN_EMAIL` is unset; query/body `email` is ignored; `enqueueEmails` with `recipients` does not call `db.getUsersByDateRange`.

## Triggering from gcloud

`curl` will not work because the cron header cannot be forged from outside. Options:
- **Cloud Scheduler job with an App Engine HTTP target** pointed at `/dailyemail/test`, left paused, then run on demand:
  ```bash
  gcloud scheduler jobs create app-engine apod-admin-test \
    --schedule="0 0 1 1 *" --relative-url="/dailyemail/test" --http-method=GET \
    --service=default --location=<region>
  gcloud scheduler jobs pause apod-admin-test
  gcloud scheduler jobs run apod-admin-test
  ```
  (Verify the flags against the current `gcloud scheduler jobs create app-engine` docs and the project's region/service name before relying on this.)
- Or add a `/dailyemail/test` entry to `cron.yaml` and run it from the App Engine cron console. This is simpler, but `cron.yaml` entries are scheduled, so pick a rarely-hit schedule.

## Alternative with no production code change

A one-off local script that runs `fetchAPOD()` and creates a single Cloud Task for the `mailer` service addressed to the admin, using your own gcloud credentials. It does not touch the request path.

## Local preview (no email)

```bash
node -e "require('./src/services/apodService').fetchAPOD().then(r=>require('fs').writeFileSync('email_preview.html', r.html.replace('{{email}}','test@example.com')))" && open email_preview.html
```
`preview_apod_email.js` fetches past dates, which no longer works now that NASA only serves today's APOD. Use the saved pages in `test/fixtures/` for video-day previews.

## Related work in the same session (uncommitted)

NASA moved APOD: `apod.nasa.gov/apod/apYYMMDD.html` now 301-redirects to `https://science.nasa.gov/apod/`, which broke the scraper. `src/services/apodScraper.js` gained `parseScienceNasaLayout` for the new page (with the old parser as fallback), plus tests and fixtures (`test/fixtures/science-nasa-apod*.html`). Past dates cannot be fetched from the new site, so only today's APOD is scraped.
