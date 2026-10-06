# APOD Data Source Evolution & Architecture: RSS Feed vs. Scraper vs. Official API

## 1. Overview & Context

This document captures the historical context, architectural rationale, and technical trade-offs regarding data ingestion for the APOD Email service—specifically addressing why the system transitioned from legacy DOM scraping to NASA's official RSS feed, why the official NASA REST API (`api.nasa.gov`) was rejected, and how [Issue #47](https://github.com/gtracy/APODEmail-node/issues/47) ("APOD website is moving") was resolved.

---

## 2. Historical Evolution

The ingestion pipeline has evolved through four distinct phases:

### Phase 1: Legacy Python Architecture (Google App Engine)
* **Implementation:** The original Python app fetched `https://apod.nasa.gov/apod/astropix.html` directly using `urllib` and parsed the markup with `BeautifulSoup`.
* **Objective:** Ensure the daily email replicated the look, layout, and hyperlinked educational content curated by the professional astronomers (Robert Nemiroff and Jerry Bonnell).
* **Relative Link Resolution:** The parser dynamically rewrote relative `href` and `src` attributes to absolute URLs (`https://apod.nasa.gov/apod/...`).

### Phase 2: Early Node.js Migration & Third-Party API (`apod.ellanan.com`)
* **Implementation:** When migrating the service to Node.js, the project initially queried an external REST API (`https://apod.ellanan.com/api`), an open-source project created by Ellanan based on Vercel serverless functions.
* **The HTML Problem:** Because the standard APOD API response schema only included an unformatted plain-text `explanation`, Greg Tracy submitted a patch to the upstream project (commit `04198260` on `ellanan/apod-api`) to introduce an `explanation_html` field that preserved original anchor tags and paragraph structure from the DOM.

### Phase 3: In-House DOM Scraper (Commit `4f88f68`)
* **Implementation:** In commit `4f88f68` (*"feat: replace APOD API with local web scraper"*), the external API was removed in favor of a local scraping module: [`src/services/apodScraper.js`](../src/services/apodScraper.js).
* **Rationale:** Relying on a third-party hosted API introduced unnecessary availability risk, external latency, and potential breakage. The local scraper utilized `axios` and `cheerio`, borrowing extraction regular expressions from NASA's open-source extraction utilities (`nasa/apod-api`) targeting legacy `<center ~ center ~ p>` tags while keeping complete control over HTML sanitation and link preservation.

### Phase 4: RSS-First Architecture & Semantic Fallback (October 2026)
* **The Problem:** In late 2026, NASA transitioned APOD from the legacy static Apache server (`apod.nasa.gov`) to WordPress/HDS on `science.nasa.gov/apod`. Legacy `<center>` tags were completely removed, breaking the Phase 3 scraper. An interim DOM scraper targeting WordPress block classes (`.smd-embed-post__article`, `.hds-media-detail-hero`) proved brittle and over-complex when styling and layout changed, causing silent failures (blank explanation bodies).
* **The Discovery:** NASA provides an official, machine-readable RSS 2.0 feed at `https://science.nasa.gov/feed/apod-basic/` that includes custom `<apod:*>` extension tags:
  * `<apod:explanation>`: Contains the complete, rich HTML explanation with all curated hyperlinks intact.
  * `<apod:hdurl>`: Full-resolution image or poster asset URL.
  * `<apod:credit>` / `<apod:copyright>`: Photographer and institution credits.
  * `<content:encoded>`: Full article HTML (providing video `<source>` and `<iframe>` embeds).
* **Implementation:**
  * **Primary Ingestion:** Direct consumption of `https://science.nasa.gov/feed/apod-basic/` using `cheerio` XML mode.
  * **Secondary Fallback:** Resilient semantic HTML parsing of `https://science.nasa.gov/apod/` (locating paragraphs containing `"Explanation:"` without hardcoded CSS classes) if the RSS endpoint is unavailable.
  * **Universal Cleaner:** Robust stripping of leading `"Explanation:"` labels and trailing footer boilerplate (`"Your Sky Surprise"`, `"Sky Surprise"`, `"Tomorrow's picture"`).
  * **Validation Guard:** Fail-fast assertion in [`src/services/apodService.js`](../src/services/apodService.js) guaranteeing that emails are never constructed or dispatched with an empty explanation.

---

## 3. Why the Official NASA API (`api.nasa.gov`) Was Not Implemented

The automated proposal on Issue #47 recommended migrating to `api.nasa.gov/planetary/apod`. However, evaluations and real-world testing identified several critical blockers with the official REST API:

### 3.1. Loss of Rich Hyperlinks in Explanations (The Dealbreaker)
* **The Issue:** The official NASA APOD API strips all HTML markup, returning the `explanation` field strictly as flat, unlinked plain text.
* **Impact on Subscribers:** The defining characteristic of APOD write-ups is the dense web of educational links embedded by astronomers (pointing to astrophysics research papers, mission logs, terminology definitions, and Wikipedia articles). Stripping these hyperlinks severely degrades the value and reading experience of the newsletter.
* **The RSS Advantage:** In contrast to the REST API, NASA's official RSS feed (`https://science.nasa.gov/feed/apod-basic/`) preserves every rich hyperlink inside `<apod:explanation>`.

### 3.2. Upstream Parsing & Data Quality Bugs
The official NASA API is not backed by a structured database. It is itself an automated Python scraper and cache ([`nasa/apod-api`](https://github.com/nasa/apod-api)) running against web pages. As a result, it inherits scraping vulnerabilities without providing mechanisms to correct edge cases:
* **Swallowing Announcements & Footers:** When site notices or announcements are placed near the explanation block, the official API parser frequently ingests them into the explanation string.
  * *Example:* During the September 2026 site move announcement, the official API output for `2026-09-26` literally appended the raw unlinked move notice into the `explanation`:
    > `...APOD's email for image submissions has changed. Please see: APOD Submissions. APOD's main NASA site is moving: From apod.nasa.gov to science.nasa.gov/apod`
* **Mangled Credits and Copyright:** The official API regularly omits photographer credit lines or fails to separate `credit` from `copyright` properly when non-standard formatting is used.
* **Title Truncation / Bleed:** When titles and photographer credits share a `<center>` tag separated by `<br>`, the official API has been observed appending credit headers directly into the title field (e.g. `"Galaxy Dwingeloo 1 Emerges \r\nCredit:"`).
* **Truncated Explanations:** Upstream parser regexes occasionally terminate early, truncating explanations mid-sentence.

### 3.3. Advanced Media Handling (Video & Native Embeds)
* The official API classifies all videos under `media_type: "video"` with a raw embed URL.
* In contrast, the RSS feed and [`src/services/apodService.js`](../src/services/apodService.js) pipeline feature dedicated logic for:
  * Extracting YouTube IDs to render high-resolution video thumbnail previews directly in email clients.
  * Detecting and linking Vimeo embeds.
  * Identifying native HTML5 `<video>` tags (which email clients cannot display) and generating attractive callout fallback cards prompting users to view the video in their browser.

### 3.4. False Insulation from the Site Migration
* A key argument for switching to `api.nasa.gov` was that it would insulate the app from the move to `science.nasa.gov/apod`.
* In reality, the official API continues to query and link assets on `https://apod.nasa.gov/apod/image/...`.
* If `apod.nasa.gov` is retired without an upstream rewrite of `nasa/apod-api`, the official API will fail alongside any legacy scraper.

### 3.5. Operational Overhead & Rate Limits
* Using `api.nasa.gov` requires managing an API key (`NASA_API_KEY`). The default `DEMO_KEY` is heavily throttled (30–50 requests/hour), and even registered keys are subject to upstream gateway rate limits and network latency.
* Direct consumption of the official RSS feed requires zero authentication credentials and runs with zero external API dependencies.

---

## 4. Current Architecture Summary

1. **Primary Ingestion:** Official RSS feed at `https://science.nasa.gov/feed/apod-basic/`. Eliminates DOM scraping fragility, preserves full HTML hyperlinks, requires no API tokens, and receives updates directly from NASA's publishing workflow.
2. **Resilient Semantic Fallback:** Direct scrape of `https://science.nasa.gov/apod/` using content-based heuristics (`<p>` containing `"Explanation:"`) rather than fragile CSS classes.
3. **Validation & Observability:** Strict validation in [`src/services/apodService.js`](../src/services/apodService.js) ensures that empty explanations are blocked before email generation, with structured JSON logging via Pino to capture any upstream anomalies.
