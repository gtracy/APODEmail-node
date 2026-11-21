import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import vm from 'node:vm';
import * as cheerio from 'cheerio';

describe('Donation button A/B test (Issue #95)', () => {
    const rootDir = path.resolve(__dirname, '../../');
    const indexPath = path.join(rootDir, 'public/index.html');
    const statsPath = path.join(rootDir, 'src/templates/visualization.html');
    const cssPath = path.join(rootDir, 'public/css/style.css');
    const scriptPath = path.join(rootDir, 'public/js/donation-ab-test.js');

    // Runs donation-ab-test.js in a stubbed browser environment and returns
    // the sandbox plus the captured DOMContentLoaded handler, if any.
    function runScript({ storedVariant, randomValue } = {}) {
        const gtagCalls = [];
        const listeners = {};
        const clickHandlers = [];
        const store = storedVariant ? { apod_donation_variant: storedVariant } : {};
        const textEl = { textContent: 'Buy me a coffee' };
        const buttonEl = {
            addEventListener: (event, handler) => {
                if (event === 'click') clickHandlers.push(handler);
            }
        };
        const sandbox = {
            console,
            document: {
                readyState: 'loading',
                getElementById: (id) => {
                    if (id === 'donation-btn') return buttonEl;
                    if (id === 'donation-btn-text') return textEl;
                    return null;
                },
                addEventListener: (event, handler) => {
                    listeners[event] = handler;
                }
            },
            localStorage: {
                getItem: (key) => (key in store ? store[key] : null),
                setItem: (key, value) => { store[key] = value; }
            },
            gtag: (...args) => { gtagCalls.push(args); }
        };
        if (randomValue !== undefined) {
            sandbox.Math = { ...Math, random: () => randomValue };
        }
        vm.createContext(sandbox);
        vm.runInContext(fs.readFileSync(scriptPath, 'utf-8'), sandbox);
        return { sandbox, gtagCalls, listeners, clickHandlers, store, textEl, buttonEl };
    }

    it('replaces the third-party Buy Me a Coffee widget with a native anchor on the landing page', () => {
        const html = fs.readFileSync(indexPath, 'utf-8');
        const $ = cheerio.load(html);

        expect(html).not.toContain('cdnjs.buymeacoffee.com');
        const btn = $('#donation-btn');
        expect(btn.attr('href')).toBe('https://www.buymeacoffee.com/gregtracy');
        expect(btn.attr('target')).toBe('_blank');
        expect(btn.attr('rel')).toContain('noopener');
        expect($('#donation-btn-text').text()).toBe('Buy me a coffee');
        expect($('script[src="js/donation-ab-test.js"][defer]').length).toBe(1);
    });

    it('replaces the widget with the same anchor on the /stats page', () => {
        const html = fs.readFileSync(statsPath, 'utf-8');
        const $ = cheerio.load(html);

        expect(html).not.toContain('cdnjs.buymeacoffee.com');
        const btn = $('#donation-btn');
        expect(btn.attr('href')).toBe('https://www.buymeacoffee.com/gregtracy');
        expect(btn.attr('target')).toBe('_blank');
        expect($('#donation-btn-text').text()).toBe('Buy me a coffee');
        expect($('script[src="/js/donation-ab-test.js"][defer]').length).toBe(1);
    });

    it('styles the native button with Buy Me a Coffee branding and drops the scale hack', () => {
        const css = fs.readFileSync(cssPath, 'utf-8');

        expect(css).toContain('.donate-btn');
        expect(css).toContain('#FFDD00');
        expect(css).not.toContain('transform: scale(0.6)');
    });

    it('buckets deterministically: random < 0.5 -> A, >= 0.5 -> B', () => {
        const { sandbox } = runScript();
        const api = sandbox.DonationAbTest;

        expect(api.pickVariant(() => 0.2)).toBe('A');
        expect(api.pickVariant(() => 0.8)).toBe('B');
    });

    it('persists the assigned variant and reuses it on later loads', () => {
        const { sandbox, store } = runScript();
        const api = sandbox.DonationAbTest;
        const storage = {
            getItem: (key) => (key in store ? store[key] : null),
            setItem: (key, value) => { store[key] = value; }
        };

        // Fresh visitor: draws B and persists it.
        expect(api.resolveVariant(storage, () => 0.8)).toBe('B');
        expect(store.apod_donation_variant).toBe('B');
        // Returning visitor: stored variant wins over a fresh draw.
        expect(api.resolveVariant(storage, () => 0.1)).toBe('B');
    });

    it('auto-inits on DOMContentLoaded: sets copy, GA4 user property, and click event', () => {
        const { listeners, gtagCalls, clickHandlers, textEl } = runScript({ storedVariant: 'B' });

        expect(typeof listeners.DOMContentLoaded).toBe('function');
        listeners.DOMContentLoaded();

        expect(textEl.textContent).toBe('Donate');
        expect(gtagCalls).toContainEqual(['set', 'user_properties', { donation_button_variant: 'donate' }]);

        expect(clickHandlers.length).toBe(1);
        clickHandlers[0]();
        expect(gtagCalls).toContainEqual(['event', 'donation_button_click', {
            variant: 'B',
            button_text: 'Donate',
            link_url: 'https://www.buymeacoffee.com/gregtracy'
        }]);
    });

    it('tolerates missing storage and missing gtag without throwing', () => {
        const { sandbox } = runScript();
        const api = sandbox.DonationAbTest;
        const brokenStorage = {
            getItem: () => { throw new Error('denied'); },
            setItem: () => { throw new Error('denied'); }
        };

        expect(() => api.resolveVariant(brokenStorage, () => 0.3)).not.toThrow();
        expect(api.resolveVariant(brokenStorage, () => 0.3)).toBe('A');
        expect(() => api.initDonationAbTest({
            document: { getElementById: () => null },
            storage: brokenStorage,
            gtag: null
        })).not.toThrow();
    });
});
