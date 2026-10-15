const path = require('node:path');
const fs = require('node:fs/promises');
const assert = require('node:assert/strict');

(async () => {
    const playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
    const {previewServer} = await import('./preview-design.mjs');
    const root = path.resolve(__dirname, '..');
    const server = previewServer(path.join(root, 'design-preview'));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const browser = await playwright.chromium.launch({headless: true,
        ...(process.env.PLAYWRIGHT_EXECUTABLE ? {executablePath: process.env.PLAYWRIGHT_EXECUTABLE} : {})});
    const out = process.env.DESIGN_SCREENSHOTS;
    if (out) await fs.mkdir(out, {recursive: true});
    const errors = [], external = [], failed = [];
    try {
        const context = await browser.newContext({viewport: {width: 1280, height: 900}});
        const page = await context.newPage();
        page.on('pageerror', error => errors.push(error.message));
        page.on('request', request => {if (!request.url().startsWith(base) && !request.url().startsWith('data:')) external.push(request.url());});
        page.on('response', response => {if (response.status() >= 400) failed.push(response.url());});
        for (const [route, name] of [['/', 'home'], ['/ru/security/ib-002/', 'article'], ['/NSK/ru/texts/nsk-003/', 'nsk'],
            ['/ru/it/reversible-context-memory/', 'diagram'], ['/en/it/intinode-v4/', 'english'], ['/ru/blog/', 'blog']]) {
            await page.goto(base + route);
            await page.waitForFunction(() => document.documentElement.dataset.rendered === 'true');
            await page.waitForFunction(() => ['none', 'ready', 'partial'].includes(document.documentElement.dataset.diagrams));
            assert.equal(await page.locator('.masthead nav a').count(), 4);
            assert.equal(await page.locator('#markdown-source').count(), 1);
            assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(24, 26, 27)');
            assert(await page.locator('#reader h1').count() > 0);
            if (name === 'home') assert(!(await page.locator('#reader').innerText()).includes('Разные пароли'));
            if (name === 'diagram') {
                assert.equal(await page.locator('html').getAttribute('data-diagrams'), 'ready');
                assert(await page.locator('.diagram svg').count() > 0);
                assert(await page.locator('.table-scroll table').count() > 0);
            }
            const deadMarkdown = await page.locator('#reader a[href]').evaluateAll(links => links.map(link =>
                new URL(link.getAttribute('href'), location.href)).filter(url =>
                url.hostname === location.hostname && url.pathname.endsWith('.md')).map(url => url.href));
            assert.deepEqual(deadMarkdown, []);
            if (name === 'nsk') {
                await page.goto(base + route + '#faq');
                await page.waitForFunction(() => document.documentElement.dataset.rendered === 'true');
                assert.equal(await page.locator('#faq').count(), 1);
            }
            if (out && ['home', 'article'].includes(name)) await page.screenshot({path: path.join(out, `${name}-desktop.png`), fullPage: true});
            await page.setViewportSize({width: 390, height: 844});
            assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Mobile overflow: ${route}`);
            if (out && name === 'article') await page.screenshot({path: path.join(out, 'article-mobile.png'), fullPage: true});
            await page.setViewportSize({width: 1280, height: 900});
        }
        await page.goto(base + '/');
        await page.locator('.masthead nav a', {hasText: 'ИБ'}).click();
        await page.waitForURL(base + '/ru/security/');
        await page.waitForFunction(() => document.documentElement.dataset.rendered === 'true');
        await page.locator('.languages a', {hasText: 'EN'}).click();
        await page.waitForURL(base + '/en/security/');
        await page.waitForFunction(() => document.documentElement.dataset.rendered === 'true');
        const noScript = await browser.newContext({javaScriptEnabled: false});
        const raw = await noScript.newPage();
        await raw.goto(base + '/ru/security/ib-002/');
        assert(await raw.locator('#markdown-source').isVisible());
        assert((await raw.locator('#markdown-source').inputValue()).includes('Алиса открывает сайт магазина'));
        assert.equal(external.length, 0, 'Unexpected external resources: ' + external.join(', '));
        assert.deepEqual(errors, []);
        assert.deepEqual(failed, []);
        console.log('Browser OK: 6 real routes, RU/EN, dark theme, four sections, mobile, Mermaid, FAQ, readable source without JS, no external resources.');
    } finally {await browser.close(); await new Promise(resolve => server.close(resolve));}
})().catch(error => {console.error(error);process.exitCode = 1;});
