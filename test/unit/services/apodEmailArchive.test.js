import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const { parseRss, parseHtml } = require('../../../src/services/apodScraper');
const { buildEmail } = require('../../../src/services/apodService');

const FIXTURE_DIR = path.join(__dirname, '../../fixtures/apod-archive');
const manifest = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'index.json'), 'utf8'));

/**
 * Fixed archive-based regression suite (gtracy/APODEmail-node#76).
 *
 * Each manifest entry is a real historical APOD post saved as the raw source
 * payload it was fetched from (a single RSS <item> document, or the APOD
 * page HTML), so the suite is deterministic and runs offline under
 * `npm run test`. Fixtures run through the real production parsers
 * (parseRss / parseHtml) and then through the real email builder
 * (buildEmail), so a regression anywhere in fetch -> parse -> render fails
 * here before it reaches subscribers.
 *
 * Old archive pages carry no machine-readable date row, so the test fills
 * data.date from the manifest (provenance from the archive listing) when
 * the parser yields none; the rendered date header is still asserted.
 */
describe('apodEmailArchive (fixed historical reference points)', () => {
    for (const entry of manifest.entries) {
        describe(`${entry.date} ${entry.title} [${entry.media_type}${entry.video_host ? '/' + entry.video_host : ''}]`, () => {
            const raw = fs.readFileSync(path.join(FIXTURE_DIR, entry.file), 'utf8');
            const parsed = entry.kind === 'rss'
                ? parseRss(raw, entry.date)
                : parseHtml(raw);

            it('parses the saved source payload to the expected APOD data', () => {
                expect(parsed).toBeTruthy();
                expect(parsed.title).toBe(entry.title);
                expect(parsed.media_type).toBe(entry.media_type);
                expect(parsed.explanation).toBeTruthy();
                expect(parsed.explanation.trim().length).toBeGreaterThan(50);
                if (parsed.date) {
                    expect(parsed.date).toBe(entry.date);
                }
                if (entry.video_id) {
                    expect(parsed.url).toContain(entry.video_id);
                }
                if (entry.video_url_contains) {
                    expect(parsed.url).toContain(entry.video_url_contains);
                }
                if (entry.image_url_contains) {
                    expect(parsed.url).toContain(entry.image_url_contains);
                }
            });

            it('builds a complete, well-formed email for the reference post', () => {
                const data = { ...parsed, date: parsed.date || entry.date };
                const result = buildEmail(data);

                expect(result.title).toBe(`APOD - ${entry.title}`);
                // Date and title headers render; nothing renders as "undefined".
                expect(result.html).toContain(entry.date);
                expect(result.html).toContain(entry.title);
                expect(result.html).not.toContain('undefined');
                expect(result.text).toContain(`${entry.date} - ${entry.title}`);
                // Shared footer structure.
                expect(result.html).toContain('https://apodemail.org/unsubscribe?email={{email}}');
                expect(result.html).toContain('NASA Goddard Space Flight Center');
                expect(result.html).toContain('https://science.nasa.gov/apod/archive');
                expect(result.text).toContain('https://apodemail.org/unsubscribe?email={{email}}');
                expect(result.text).toContain('NASA Goddard Space Flight Center');
            });

            if (entry.video_host === 'youtube') {
                it('links the YouTube video to the canonical watch URL with an email-safe card', () => {
                    const data = { ...parsed, date: parsed.date || entry.date };
                    const result = buildEmail(data);

                    expect(result.html).toContain(`href="${entry.watch_url}"`);
                    expect(result.html).not.toContain('/embed/');
                    expect(result.html).toContain(entry.thumbnail);
                    expect(result.html).toContain('► Watch Video on YouTube');
                    expect(result.text).toContain(`Watch Video: ${entry.watch_url}`);
                    expect(result.text).not.toContain('/embed/');
                    // Email clients strip these, so the video card must not rely on them.
                    const mediaBlock = result.html.substring(0, result.html.indexOf('Explanation:'));
                    expect(mediaBlock).not.toContain('position: absolute');
                    expect(mediaBlock).not.toContain('transform:');
                    expect(mediaBlock).not.toContain('display: flex');
                });
            }

            if (entry.video_host === 'vimeo') {
                it('links the Vimeo video to the canonical vimeo.com URL with an email-safe card', () => {
                    const data = { ...parsed, date: parsed.date || entry.date };
                    const result = buildEmail(data);

                    expect(result.html).toContain(`href="${entry.watch_url}"`);
                    expect(result.html).not.toContain('player.vimeo.com');
                    expect(result.html).toContain('► Watch Video on Vimeo');
                    expect(result.text).toContain(`Watch Video: ${entry.watch_url}`);
                    expect(result.text).not.toContain('player.vimeo.com');
                    const mediaBlock = result.html.substring(0, result.html.indexOf('Explanation:'));
                    expect(mediaBlock).not.toContain('position: absolute');
                    expect(mediaBlock).not.toContain('transform:');
                    expect(mediaBlock).not.toContain('display: flex');
                });
            }

            if (entry.video_host === 'native') {
                it('renders the native-video hero card linking to the APOD page', () => {
                    const data = { ...parsed, date: parsed.date || entry.date };
                    const result = buildEmail(data);

                    expect(result.html).toContain("Today's APOD is a Video!");
                    expect(result.html).toContain('► Watch Video on NASA APOD');
                    expect(result.html).toContain('href="https://science.nasa.gov/apod/"');
                    expect(result.html).not.toContain('/embed/');
                    // Plain text links the video file itself (a .mp4 plays
                    // directly), while the HTML card links the APOD page.
                    expect(result.text).toContain(`Watch Video: ${parsed.url}`);
                });
            }

            if (entry.media_type === 'image') {
                it('renders the image linked to its full-resolution URL', () => {
                    const data = { ...parsed, date: parsed.date || entry.date };
                    const result = buildEmail(data);

                    expect(result.html).toContain(`<img src="${parsed.url}"`);
                    expect(result.html).toContain(`href="${parsed.hdurl || parsed.url}"`);
                    expect(result.html).not.toContain("Today's APOD is a Video!");
                    expect(result.text).toContain(`View Image: ${parsed.hdurl || parsed.url}`);
                });
            }
        });
    }
});
