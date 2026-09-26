# APOD Data Source Evolution & Architecture: Scraper vs. Official API

## 1. Overview & Context

This document captures the historical context, architectural rationale, and technical trade-offs regarding data ingestion for the APOD Email service—specifically addressing why the system uses a custom DOM scraper rather than the official NASA APOD API (`api.nasa.gov`), and guiding decisions for [Issue #47](https://github.com/gtracy/APODEmail-node/issues/47) ("APOD website is moving").

---

## 2. Historical Evolution

The ingestion pipeline has evolved through three distinct phases:

### Phase 1: Legacy Python Architecture (Google App Engine)
* **Implementation:** The original Python app fetched `https://apod.nasa.gov/apod/astropix.html` directly using `urllib` and parsed the markup with `BeautifulSoup`.
* **Objective:** Ensure the daily email replicated the look, layout, and hyperlinked educational content curated by the professional astronomers (Robert Nemiroff and Jerry Bonnell).
* **Relative Link Resolution:** The parser dynamically rewrote relative `href` and `src` attributes to absolute URLs (`https://apod.nasa.gov/apod/...`).

### Phase 2: Early Node.js Migration & Third-Party API (`apod.ellanan.com`)
* **Implementation:** When migrating the service to Node.js, the project initially queried an external REST API (`https://apod.ellanan.com/api`), an open-source project created by Ellanan based on Vercel serverless functions.
* **The HTML Problem:** Because the standard APOD API response schema only included an unformatted plain-text `explanation`, Greg Tracy submitted a patch to the upstream project (commit `04198260` on `ellanan/apod-api`) to introduce an `explanation_html` field that preserved original anchor tags and paragraph structure from the DOM.

### Phase 3: In-House DOM Scraper (Commit `4f88f68`)
* **Implementation:** In commit `4f88f68` (*"feat: replace APOD API with local web scraper"*), the external API was removed in favor of a local scraping module: [`src/services/apodScraper.js`](../src/services/apodScraper.js).
* **Rationale:** Relying on a third-party hosted API introduced unnecessary availability risk, external latency, and potential breakage. The local scraper utilized `axios` and `cheerio`, borrowing extraction regular expressions from NASA's open-source extraction utilities (`nasa/apod-api`) while keeping complete control over HTML sanitation and link preservation.

---

## 3. Why the Official NASA API (`api.nasa.gov`) Was Not Implemented

The automated proposal on Issue #47 recommended migrating to `api.nasa.gov/planetary/apod`. However, previous evaluations and real-world testing identified several critical blockers with the official API:

### 3.1. Loss of Rich Hyperlinks in Explanations (The Dealbreaker)
* **The Issue:** The official NASA APOD API strips all HTML markup, returning the `explanation` field strictly as flat, unlinked plain text.
* **Impact on Subscribers:** The defining characteristic of APOD write-ups is the dense web of educational links embedded by astronomers (pointing to astrophysics research papers, mission logs, terminology definitions, and Wikipedia articles). Stripping these hyperlinks severely degrades the value and reading experience of the newsletter.
* **Scraper Advantage:** [`src/services/apodScraper.js`](../src/services/apodScraper.js) isolates `<center ~ center ~ p>`, strips duplicate "Explanation:" prefixes, and resolves all relative URLs while preserving every hyperlink.

### 3.2. Upstream Parsing & Data Quality Bugs
The official NASA API is not backed by a structured database. It is itself an automated Python scraper and cache ([`nasa/apod-api`](https://github.com/nasa/apod-api)) running against `apod.nasa.gov`. As a result, it inherits scraping vulnerabilities without providing mechanisms to correct edge cases:
* **Swallowing Announcements & Footers:** When site notices or announcements are placed near the explanation block, the official API parser frequently ingests them into the explanation string.
  * *Example:* During the September 2026 site move announcement, the official API output for `2026-09-26` literally appended the raw unlinked move notice into the `explanation`:
    > `...APOD's email for image submissions has changed. Please see: APOD Submissions. APOD's main NASA site is moving: From apod.nasa.gov to science.nasa.gov/apod`
* **Mangled Credits and Copyright:** The official API regularly omits photographer credit lines or fails to separate `credit` from `copyright` properly when non-standard formatting is used.
* **Title Truncation / Bleed:** When titles and photographer credits share a `<center>` tag separated by `<br>`, the official API has been observed appending credit headers directly into the title field (e.g. `"Galaxy Dwingeloo 1 Emerges \r\nCredit:"`).
* **Truncated Explanations:** Upstream parser regexes occasionally terminate early, truncating explanations mid-sentence.

### 3.3. Advanced Media Handling (Video & Native Embeds)
* The official API classifies all videos under `media_type: "video"` with a raw embed URL.
* In contrast, the current scraper and [`src/services/apodService.js`](../src/services/apodService.js) pipeline feature dedicated logic for:
  * Extracting YouTube IDs to render high-resolution video thumbnail previews directly in email clients.
  * Detecting and linking Vimeo embeds.
  * Identifying native HTML5 `<video>` tags (which email clients cannot display) and generating attractive callout fallback cards prompting users to view the video in their browser.

### 3.4. False Insulation from the Site Migration
* A key argument for switching to `api.nasa.gov` was that it would insulate the app from the move to `science.nasa.gov/apod`.
* In reality, the official API continues to query and link assets on `https://apod.nasa.gov/apod/image/...`.
* If `apod.nasa.gov` is retired without an upstream rewrite of `nasa/apod-api`, the official API will fail alongside any direct scraper.

### 3.5. Operational Overhead & Rate Limits
* Using `api.nasa.gov` requires managing an API key (`NASA_API_KEY`). The default `DEMO_KEY` is heavily throttled (30–50 requests/hour), and even registered keys are subject to upstream gateway rate limits and network latency.
* Direct scraping requires zero authentication credentials and runs with zero external API dependencies.

---

## 4. Recommendations for Issue #47

1. **Do Not Switch Primary Ingestion to the Official API:**
   Abandoning DOM parsing in favor of `api.nasa.gov` would degrade email quality by eliminating all hyperlinks from the daily explanation and exposing the newsletter to known upstream parsing defects.

2. **Maintain DOM Parsing for Content Ingestion:**
   Retain direct web scraping as the primary ingestion method. As NASA transitions to `science.nasa.gov/apod`, monitor the new site's DOM structure, URL schemes, and redirection behavior, and adapt the parser (e.g. using Cheerio selectors tailored to the new layout or WordPress REST feeds if available).

3. **Optional Fallback Role Only:**
   If desired, the official API may be retained as a secondary emergency fallback inside a `try/catch` block in [`src/services/apodService.js`](../src/services/apodService.js) if direct page scraping returns an HTTP error. However, fallback execution should be explicitly logged, and teams should accept that fallback emails will render plain text without rich links.
