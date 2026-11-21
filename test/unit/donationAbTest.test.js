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
        const iconEl = { hidden: false };
        const buttonAttrs = {};
        const buttonEl = {
            setAttribute: (name, value) => { buttonAttrs[name] = value; },
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
                    if (id === 'donation-btn-icon') return iconEl;
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
        return { sandbox, gtagCalls, listeners, clickHandlers, store, textEl, iconEl, buttonEl, buttonAttrs };
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
        const indexHtml = fs.readFileSync(indexPath, 'utf-8');
        const statsHtml = fs.readFileSync(statsPath, 'utf-8');

        expect(css).toContain('.donate-btn');
        expect(css).toContain('#FFDD00');
        expect(css).toContain("font-family: 'Cookie', cursive");
        expect(css).toContain('.donate-btn[data-variant="B"]');
        expect(css).toContain('font-family: var(--font-family)');
        expect(css).not.toContain('transform: scale(0.6)');
        expect(indexHtml).toContain('family=Cookie');
        expect(statsHtml).toContain('family=Cookie');
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

    it('auto-inits on DOMContentLoaded: sets copy, hides icon and switches font on variant B, sets GA4 user property, and click event', () => {
        const { listeners, gtagCalls, clickHandlers, textEl, iconEl, buttonAttrs } = runScript({ storedVariant: 'B' });

        expect(typeof listeners.DOMContentLoaded).toBe('function');
        listeners.DOMContentLoaded();

        expect(textEl.textContent).toBe('Donate');
        expect(iconEl.hidden).toBe(true);
        expect(buttonAttrs['data-variant']).toBe('B');
        expect(gtagCalls).toContainEqual(['set', 'user_properties', { donation_button_variant: 'donate' }]);

        expect(clickHandlers.length).toBe(1);
        clickHandlers[0]();
        expect(gtagCalls).toContainEqual(['event', 'donation_button_click', {
            variant: 'B',
            button_text: 'Donate',
            link_url: 'https://www.buymeacoffee.com/gregtracy'
        }]);
    });

    it('keeps coffee emoji visible and sets data-variant="A" for variant A', () => {
        const { listeners, textEl, iconEl, buttonAttrs } = runScript({ storedVariant: 'A' });

        listeners.DOMContentLoaded();

        expect(textEl.textContent).toBe('Buy me a coffee');
        expect(iconEl.hidden).toBe(false);
        expect(buttonAttrs['data-variant']).toBe('A');
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

    it('orders user_properties ahead of any queued gtag config so initial page_view captures the variant', () => {
        const { sandbox } = runScript();
        const api = sandbox.DonationAbTest;
        const dataLayer = [
            ['js', new Date()],
            ['config', 'G-SRM03RK860']
        ];
        const gtag = (...args) => { dataLayer.push(args); };

        api.initDonationAbTest({
            document: { getElementById: () => null },
            storage: { getItem: () => 'B', setItem: () => {} },
            gtag,
            dataLayer
        });

        const setIdx = dataLayer.findIndex((entry) => entry[0] === 'set' && entry[1] === 'user_properties');
        const configIdx = dataLayer.findIndex((entry) => entry[0] === 'config');
        expect(setIdx).toBeGreaterThan(-1);
        expect(configIdx).toBeGreaterThan(-1);
        expect(setIdx).toBeLessThan(configIdx);
        expect(dataLayer[setIdx][2]).toEqual({ donation_button_variant: 'donate' });
    });

    it('defers gtag config until DOMContentLoaded on both pages so defer script sets user_properties before page_view fires', () => {
        for (const pagePath of [indexPath, statsPath]) {
            const html = fs.readFileSync(pagePath, 'utf-8');
            expect(html).toMatch(/window\.addEventListener\(['"]DOMContentLoaded['"],\s*function\s*\(\)\s*\{\s*gtag\(['"]config['"],\s*['"]G-SRM03RK860['"]\)/);
        }
    });
});
