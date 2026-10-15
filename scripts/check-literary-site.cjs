const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

(async () => {
    const root = path.resolve(__dirname, '..');
    const dist = path.join(root, 'dist');
    const reportDir = path.join(root, 'docs/codex-dialogs/2026-10-15-literary-migration');
    const baseline = JSON.parse(await fs.readFile(path.join(reportDir, 'BASELINE.json'), 'utf8'));
    const settings = JSON.parse(await fs.readFile(path.join(dist, 'assets/editorial/pages.json'), 'utf8'));
    const {previewServer} = await import('./preview-design.mjs');
    const server = process.env.SITE_BASE_URL ? null : previewServer(dist);
    if (server) await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = process.env.SITE_BASE_URL || `http://127.0.0.1:${server.address().port}`;
    const playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
    const browser = await playwright.chromium.launch({headless: true,
        ...(process.env.PLAYWRIGHT_EXECUTABLE ? {executablePath: process.env.PLAYWRIGHT_EXECUTABLE} : {})});
    const pages = new Map(), errors = [], missingResponses = [], externalResources = [];
    const redirects = new Map();
    try {
        for (const [file, oldIds] of Object.entries(baseline.html)) {
            const text = await fs.readFile(path.join(dist, file), 'utf8');
            const refresh = /http-equiv="refresh" content="0;url=([^"]+)"/.exec(text);
            if (refresh) redirects.set('/' + file, refresh[1]);
            else assert(text.startsWith('<!doctype html><meta charset="utf-8"><script'), file);
        }
        for (const [file, oldHash] of Object.entries(baseline.sources)) {
            assert.equal(crypto.createHash('sha256').update(await fs.readFile(path.join(root, file))).digest('hex'), oldHash, file);
        }
        const context = await browser.newContext({viewport: {width: 1280, height: 900}});
        const page = await context.newPage();
        page.on('pageerror', e => errors.push(e.message));
        page.on('response', r => {if (r.status() >= 400) missingResponses.push([r.status(), r.url()]);});
        page.on('request', r => {if (!r.url().startsWith(base) && !r.url().startsWith('data:')) externalResources.push(r.url());});
        for (const [route, config] of Object.entries(settings)) {
            await page.goto(base + route);
            await page.waitForFunction(() => document.documentElement.dataset.rendered === 'true');
            await page.waitForFunction(() => ['none', 'ready', 'partial'].includes(document.documentElement.dataset.diagrams));
            assert.equal(await page.locator('.masthead nav a').count(), 4, route);
            assert.equal(await page.locator('#markdown-source').count(), 1, route);
            assert.equal(await page.locator('html').getAttribute('lang'), config.humanLocale, route);
            assert.equal(await page.title(), config.metadata.title, route);
            const graph = await page.evaluate(() => ({ids: [...document.querySelectorAll('[id],a[name]')].map(n => n.id || n.name),
                links: [...document.querySelectorAll('a[href]')].map(a => a.href), source: document.getElementById('markdown-source').value}));
            pages.set(route, graph);
            const html = await fs.readFile(path.join(dist, route, 'index.html'), 'utf8');
            assert.equal((html.match(/<textarea\b/g) || []).length, 1);
            assert(!html.includes('<header') && !html.includes('<main'), route);
            if (config.metadata.source_sha256) {
                const sourcePath = path.join(root, 'tmpl/web', config.humanLocale, route.startsWith('/NSK/')
                    ? 'NSK/texts/' + route.split('/').filter(Boolean).at(-1) + '.md'
                    : route.split('/').filter(Boolean).slice(1).join('/') + '.md');
                assert((await fs.readFile(sourcePath, 'utf8')).includes(config.metadata.source_sha256), route);
            }
            for (const alternate of config.alternateLanguages) {
                const peer = settings[alternate.url]; assert(peer, `${route} -> ${alternate.url}`);
                if (!config.isNeutral) assert(peer.alternateLanguages.some(p => p.url === route), `Nonreciprocal language link: ${route}`);
            }
            await page.setViewportSize({width: 390, height: 844});
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
            assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), route + ' ' + JSON.stringify(await page.evaluate(() => ({width: innerWidth, scroll: document.documentElement.scrollWidth, elements: [...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > innerWidth + 1).map(e => [e.tagName, e.className, e.textContent.slice(0, 90), e.getBoundingClientRect().right]).slice(0, 8)}))));
            await page.setViewportSize({width: 1280, height: 900});
        }
        let links = 0, anchors = 0;
        for (const [route, graph] of pages) for (const href of graph.links) {
            const url = new URL(href); if (url.origin !== new URL(base).origin) continue;
            links++;
            assert(!url.pathname.endsWith('.md'), `${route}: ${href}`);
            const target = redirects.get(url.pathname) || url.pathname;
            const peer = pages.get(target);
            if (peer) {
                if (url.hash) {anchors++; assert(peer.ids.includes(decodeURIComponent(url.hash.slice(1))), `${route}: ${href}`);}
            } else assert((await fs.stat(path.join(dist, target))).isFile(), `${route}: ${href}`);
        }
        for (const [file, ids] of Object.entries(baseline.html)) {
            const route = '/' + file.replace(/index\.html$/, '');
            const peer = pages.get(route) || pages.get(redirects.get('/' + file));
            assert(peer, file); for (const id of ids) assert(peer.ids.includes(id), `Lost anchor: ${file}#${id}`);
        }
        const sitemap = await fs.readFile(path.join(dist, 'sitemap.xml'), 'utf8');
        const llms = await fs.readFile(path.join(dist, 'llms.txt'), 'utf8');
        const urls = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1]);
        assert.equal(urls.length, pages.size);
        for (const url of urls) {assert(pages.has(new URL(url).pathname)); assert(llms.includes(url));}
        assert(!sitemap.includes('.md'));
        const noScript = await browser.newContext({javaScriptEnabled: false});
        const raw = await noScript.newPage(); await raw.goto(base + '/NSK/ru/texts/nsk-003/');
        assert(await raw.locator('#markdown-source').isVisible());
        assert((await raw.locator('#markdown-source').inputValue()).includes('id="faq"'));
        for (const alias of redirects.keys()) assert.equal((await context.request.get(base + alias)).status(), 200);
        for (const [file, ids] of Object.entries(baseline.html)) if (redirects.has('/' + file)) {
            for (const id of ids) {
                await page.goto(base + '/' + file + '?legacy=1#' + encodeURIComponent(id));
                await page.waitForURL(base + redirects.get('/' + file) + '?legacy=1#' + encodeURIComponent(id));
                await page.waitForFunction(() => document.documentElement.dataset.rendered === 'true');
                assert(await page.locator(`[id="${id}"]`).count(), file + '#' + id);
            }
        }
        assert.deepEqual(errors, []); assert.deepEqual(missingResponses, []); assert.deepEqual(externalResources, []);
        const report = {base, pages: pages.size, preserved_html_addresses: Object.keys(baseline.html).length,
            compatibility_redirects: redirects.size, internal_links: links, fragment_links: anchors, discovery_urls: urls.length,
            unchanged_sources: Object.keys(baseline.sources).length, errors};
        await fs.writeFile(process.env.REPORT_PATH || path.join(reportDir, 'LOCAL.json'), JSON.stringify(report, null, 2));
        console.log(JSON.stringify(report, null, 2));
    } finally {await browser.close(); if (server) await new Promise(resolve => server.close(resolve));}
})().catch(e => {console.error(e); process.exitCode = 1;});
