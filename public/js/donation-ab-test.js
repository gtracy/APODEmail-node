// Donation button A/B test (APODEmail-node #95).
//
// Variant A: "Buy me a coffee" | Variant B: "Donate"
// Deterministic 50/50 bucketing persisted in localStorage so each visitor
// consistently sees the same copy. The variant is reported to GA4 as the
// user-scoped property `donation_button_variant`, and clicks fire a
// `donation_button_click` event with the variant, button text, and link URL,
// so conversion rate per variant can be compared in GA4 Explorations.
//
// Google Optimize is sunset; this replaces the third-party Buy Me a Coffee
// widget script with a native anchor styled to match BMC branding, which
// also removes the widget's script latency and layout shift.
(function () {
    'use strict';

    var STORAGE_KEY = 'apod_donation_variant';
    var BUTTON_URL = 'https://www.buymeacoffee.com/gregtracy';
    var VARIANTS = {
        A: { text: 'Buy me a coffee', label: 'buy_me_a_coffee' },
        B: { text: 'Donate', label: 'donate' }
    };

    // 50/50 split. `randomFn` is injectable so tests can force each bucket.
    function pickVariant(randomFn) {
        return (randomFn || Math.random)() < 0.5 ? 'A' : 'B';
    }

    // Returns the stored variant when valid; otherwise assigns one and
    // persists it. Falls back to a fresh assignment when storage is
    // unavailable (e.g. private browsing) instead of throwing.
    function resolveVariant(storage, randomFn) {
        if (storage) {
            try {
                var stored = storage.getItem(STORAGE_KEY);
                if (stored === 'A' || stored === 'B') {
                    return stored;
                }
            } catch (e) {
                // Storage unreadable — fall through to a fresh assignment.
            }
        }
        var variant = pickVariant(randomFn);
        if (storage) {
            try {
                storage.setItem(STORAGE_KEY, variant);
            } catch (e) {
                // Storage unwritable — the assignment still applies to this page.
            }
        }
        return variant;
    }

    function getGtag() {
        if (typeof gtag === 'function') {
            return gtag;
        }
        return null;
    }

    function getStorage() {
        if (typeof localStorage !== 'undefined' && localStorage) {
            return localStorage;
        }
        return null;
    }

    function getDataLayer() {
        if (typeof dataLayer !== 'undefined' && Array.isArray(dataLayer)) {
            return dataLayer;
        }
        return null;
    }

    // Ensures the pushed `['set', 'user_properties', ...]` entry sits ahead of
    // any queued `['config', ...]` entry in `dataLayer` so the initial
    // automatic `page_view` beacon carries `up.donation_button_variant` for
    // every visitor (including single-hit visitors who leave before a second
    // GA4 event fires).
    function ensureUserPropsBeforeConfig(dl) {
        if (!Array.isArray(dl) || dl.length < 2) {
            return;
        }
        var configIdx = -1;
        for (var i = 0; i < dl.length - 1; i++) {
            var item = dl[i];
            if (item && item[0] === 'config') {
                configIdx = i;
                break;
            }
        }
        if (configIdx === -1) {
            return;
        }
        var last = dl[dl.length - 1];
        if (last && last[0] === 'set' && last[1] === 'user_properties') {
            dl.pop();
            dl.splice(configIdx, 0, last);
        }
    }

    // Wires the experiment up against the given DOM/storage/analytics.
    // Defaults to the real browser globals so pages just load this script.
    function initDonationAbTest(deps) {
        deps = deps || {};
        var doc = deps.document || (typeof document !== 'undefined' ? document : null);
        if (!doc) {
            return null;
        }
        var storage = deps.storage !== undefined ? deps.storage : getStorage();
        var gtagFn = deps.gtag !== undefined ? deps.gtag : getGtag();
        var dl = deps.dataLayer !== undefined ? deps.dataLayer : getDataLayer();

        var variant = resolveVariant(storage, deps.random);
        var copy = VARIANTS[variant];

        var textEl = doc.getElementById('donation-btn-text');
        if (textEl) {
            textEl.textContent = copy.text;
        }

        if (typeof gtagFn === 'function') {
            gtagFn('set', 'user_properties', { donation_button_variant: copy.label });
            ensureUserPropsBeforeConfig(dl);
        }

        var button = doc.getElementById('donation-btn');
        if (button && typeof gtagFn === 'function' && button.addEventListener) {
            button.addEventListener('click', function () {
                gtagFn('event', 'donation_button_click', {
                    variant: variant,
                    button_text: copy.text,
                    link_url: BUTTON_URL
                });
            });
        }

        return variant;
    }

    // Exposed for unit tests (test/unit/donationAbTest.test.js).
    var api = {
        STORAGE_KEY: STORAGE_KEY,
        BUTTON_URL: BUTTON_URL,
        VARIANTS: VARIANTS,
        pickVariant: pickVariant,
        resolveVariant: resolveVariant,
        initDonationAbTest: initDonationAbTest
    };
    if (typeof globalThis !== 'undefined') {
        globalThis.DonationAbTest = api;
    }

    // Auto-init in the browser. Loaded with `defer`, so this runs after the
    // document is parsed; the DOMContentLoaded guard covers the non-defer
    // case as well.
    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function () {
                initDonationAbTest();
            });
        } else {
            initDonationAbTest();
        }
    }
})();
