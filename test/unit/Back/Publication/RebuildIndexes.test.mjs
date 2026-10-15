import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {marked} from 'marked';
import {rebuild} from '../../../../scripts/rebuild_indexes.mjs';

const repo = fileURLToPath(new URL('../../../../', import.meta.url));
async function fixture(t) {
    const temporaryBase = process.env.TEQ_INDEX_TEST_TMPDIR || os.tmpdir();
    await fs.mkdir(temporaryBase, {recursive: true});
    const root = await fs.mkdtemp(path.join(temporaryBase, 'talgaticus-index-test-'));
    t.after(() => fs.rm(root, {recursive: true, force: true}));
    await fs.cp(path.join(repo, 'tmpl'), path.join(root, 'tmpl'), {recursive: true});
    return root;
}
async function snapshot(root) {
    const result = new Map();
    async function walk(dir) {
        for (const entry of await fs.readdir(dir, {withFileTypes: true})) {
            const file = path.join(dir, entry.name);
            if (entry.isDirectory()) await walk(file);
            else if (entry.name.endsWith('.md')) result.set(path.relative(root, file).replaceAll(path.sep, '/'), await fs.readFile(file));
        }
    }
    await walk(path.join(root, 'tmpl', 'web'));
    return result;
}
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const header = bytes => /^---\r?\n[\s\S]*?\r?\n---\r?\n/.exec(bytes.toString())[0];
const indexFiles = new Set(['index.md', ...['ru', 'en'].flatMap(locale =>
    ['index.md', 'security.md', 'it.md', 'NSK/index.md', 'NSK/catalog.md'].map(route => `${locale}/${route}`))]
    .map(file => `tmpl/web/${file}`));

test('real command preserves every article and metadata; full bilingual map is byte-idempotent', async t => {
    const root = await fixture(t);
    const before = await snapshot(root);
    const command = spawnSync('python', [path.join(repo, 'scripts/rebuild_indexes.py'), '--root', root], {encoding: 'utf8'});
    assert.equal(command.status, 0, command.stderr);
    assert.equal(JSON.parse(command.stdout).pages, 43);
    const after = await snapshot(root);
    assert.equal(after.size, before.size);
    for (const [file, bytes] of before) {
        assert.equal(header(after.get(file)), header(bytes), `metadata changed: ${file}`);
        if (!indexFiles.has(file)) assert.equal(hash(after.get(file)), hash(bytes), `article changed: ${file}`);
    }
    const home = after.get('tmpl/web/index.md').toString();
    assert.ok(home.indexOf('Проекты') < home.indexOf('Публикации</span>'));
    assert.ok(home.indexOf('Публикации</span>') < home.indexOf('Полная карта сайта'));
    assert.match(home, /description_ru:/);
    assert.match(home, /description_en:/);
    assert.match(home, /lang="ru"/);
    assert.match(home, /lang="en"/);
    assert.doesNotMatch(home, /new-social-contract/);
    for (const file of after.keys()) {
        let route = file.slice('tmpl/web/'.length).replace(/\.md$/, '');
        route = route.replace(/^(ru|en)\/NSK\//, 'NSK/$1/');
        const html = route === 'index' ? '' : route.replace(/\/index$/, '');
        assert.ok(home.includes(`https://talgatiko.github.io/${route}.md`), `missing Markdown: ${route}`);
        assert.ok(home.includes(`https://talgatiko.github.io/${html}${html ? '/' : ''}`), `missing HTML: ${route}`);
    }
    for (const locale of ['ru', 'en']) {
        const catalog = after.get(`tmpl/web/${locale}/NSK/catalog.md`).toString();
        for (const id of ['001', '002', '003', '005', '006', '007', '008', '009', '010']) {
            assert.ok(catalog.includes(`/NSK/${locale}/texts/nsk-${id}/`));
            assert.ok(catalog.includes(`/NSK/${locale}/texts/nsk-${id}.md`));
        }
        assert.match(catalog, /NSK-004/);
        assert.ok(catalog.includes(`/NSK/${locale}/texts/nsk-003/#faq`));
        assert.doesNotMatch(catalog, /\/nsk-004[/.]/);
    }
    assert.equal((await rebuild(root)).changed, 0);
    const again = await snapshot(root);
    for (const [file, bytes] of after) assert.deepEqual(again.get(file), bytes, file);
});

test('new one-language article with YAML metadata is discovered without fabricated translation', async t => {
    const root = await fixture(t);
    const file = path.join(root, 'tmpl/web/en/security/new-article.md');
    await fs.writeFile(file, '---\ntitle: "New [article] <test>"\ndescription: >-\n  A multiline YAML description.\ndate: "2026-10-15"\nsource_sha256: "keep-me"\n---\n\nAuthor text.\n');
    const bytes = await fs.readFile(file);
    await rebuild(root);
    const home = await fs.readFile(path.join(root, 'tmpl/web/index.md'), 'utf8');
    assert.ok(home.includes('/en/security/new-article/'));
    assert.ok(home.includes('/en/security/new-article.md'));
    assert.ok(!home.includes('/ru/security/new-article'));
    assert.ok(home.includes('New \\[article\\] &lt;test&gt;'));
    assert.deepEqual(await fs.readFile(file), bytes);
});

test('invalid article and missing FAQ stop generation before any index write', async t => {
    for (const failure of ['metadata', 'faq']) {
        const root = await fixture(t);
        const file = path.join(root, 'tmpl/web/en/NSK/texts/nsk-003.md');
        const text = await fs.readFile(file, 'utf8');
        await fs.writeFile(file, failure === 'metadata' ? text.replace(/^title:.*$/m, 'title: 42') : text.replace('id="faq"', 'id="removed-faq"'));
        const before = await snapshot(root);
        await assert.rejects(rebuild(root), failure === 'metadata' ? /requires title/ : /Missing FAQ/);
        const after = await snapshot(root);
        for (const [name, bytes] of before) assert.deepEqual(after.get(name), bytes, name);
    }
});

test('temporary export resolves every internal path and all generated anchors; authored anchor defects stay unchanged', async t => {
    const root = await fixture(t);
    const originals = await snapshot(root);
    const originalHtml = new Map();
    for (const [file, bytes] of originals) {
        const route = file.slice('tmpl/web/'.length).replace(/\.md$/, '').replace(/^(ru|en)\/NSK\//, 'NSK/$1/');
        const urlPath = route === 'index' ? '/' : '/' + route.replace(/\/index$/, '') + '/';
        originalHtml.set(urlPath, marked.parse(bytes.toString().slice(header(bytes).length)));
    }
    const existingMissingAnchors = new Set();
    for (const [urlPath, html] of originalHtml) for (const match of html.matchAll(/href="([^"]+)"/g)) {
        const url = new URL(match[1].replaceAll('&amp;', '&'), 'https://talgatiko.github.io' + urlPath);
        if (url.origin !== 'https://talgatiko.github.io' || !url.hash || !originalHtml.has(url.pathname)) continue;
        const anchor = decodeURIComponent(url.hash.slice(1));
        const target = originalHtml.get(url.pathname);
        if (!target.includes(`id="${anchor}"`) && !target.includes(`id='${anchor}'`)) existingMissingAnchors.add(url.href);
    }
    for (const name of ['src', 'bootstrap', 'scripts', 'web', 'discovery', 'package.json']) {
        await fs.cp(path.join(repo, name), path.join(root, name), {recursive: true});
    }
    try {
        await fs.symlink(path.join(repo, 'node_modules'), path.join(root, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
    } catch (error) {
        if (!['EPERM', 'EACCES'].includes(error.code)) throw error;
        // Restricted Windows sandboxes may disallow junction creation. Reuse the
        // installed dependencies by copying; no network/install is required.
        await fs.cp(path.join(repo, 'node_modules'), path.join(root, 'node_modules'), {recursive: true, dereference: true});
    }
    await rebuild(root);
    const build = spawnSync(process.execPath, ['--experimental-loader', './scripts/windows-drive-loader.mjs',
        './node_modules/@teqfw/cli/bin/teq.mjs', '--host', 'talgaticus-site', '--host-root', root, 'cms:export'], {
        cwd: root, encoding: 'utf8', timeout: 60000,
        env: {...process.env, TEQ_CMS__STATIC_BASE_URL: 'https://talgatiko.github.io/',
            TEQFW_TMPL__ALLOWED_LOCALES: 'en,ru', TEQFW_TMPL__DEFAULT_LOCALE: 'en', TEQFW_TMPL__ENGINE: 'nunjucks'},
    });
    assert.equal(build.status, 0, build.stdout + build.stderr);
    const dist = path.join(root, 'dist');
    const generatedHtmlFiles = new Set([...indexFiles].flatMap(file => {
        const route = file.slice('tmpl/web/'.length).replace(/\.md$/, '').replace(/^(ru|en)\/NSK\//, 'NSK/$1/');
        return route === 'index' || route.endsWith('/index') ? [`${route}.html`] : [`${route}.html`, `${route}/index.html`];
    }));
    let checked = 0;
    const observedMissingAnchors = new Set();
    async function check(dir) {
        for (const entry of await fs.readdir(dir, {withFileTypes: true})) {
            const file = path.join(dir, entry.name);
            if (entry.isDirectory()) await check(file);
            else if (entry.name.endsWith('.html')) {
                const text = await fs.readFile(file, 'utf8');
                const page = 'https://talgatiko.github.io/' + path.relative(dist, file).replaceAll(path.sep, '/');
                for (const match of text.matchAll(/(?:href|src)="([^"]+)"/g)) {
                    const url = new URL(match[1].replaceAll('&amp;', '&'), page);
                    if (url.origin !== 'https://talgatiko.github.io') continue;
                    assert.ok(!url.pathname.includes('/new-social-contract/'), url.href);
                    let target = path.join(dist, decodeURIComponent(url.pathname));
                    if (url.pathname.endsWith('/')) target = path.join(target, 'index.html');
                    assert.ok((await fs.stat(target)).isFile(), `${page} -> ${url.href}`);
                    if (url.hash) {
                        const targetText = await fs.readFile(target, 'utf8');
                        const anchor = decodeURIComponent(url.hash.slice(1));
                        if (!targetText.includes(`id="${anchor}"`) && !targetText.includes(`id='${anchor}'`)) {
                            const exportedPath = path.relative(dist, file).replaceAll(path.sep, '/');
                            assert.ok(!generatedHtmlFiles.has(exportedPath), `generated index has missing anchor: ${page} -> ${url.href}`);
                            assert.ok(existingMissingAnchors.has(url.href), `new missing anchor: ${page} -> ${url.href}`);
                            observedMissingAnchors.add(url.href);
                        }
                    }
                    checked++;
                }
            }
        }
    }
    await check(dist);
    assert.deepEqual(observedMissingAnchors, existingMissingAnchors);
    const sitemap = await fs.readFile(path.join(dist, 'sitemap.xml'), 'utf8');
    const urls = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(match => match[1]);
    assert.equal(new Set(urls).size, 86);
    assert.doesNotMatch(sitemap, /new-social-contract/);
    const llms = await fs.readFile(path.join(dist, 'llms.txt'), 'utf8');
    for (const url of urls) {
        assert.ok(llms.includes(url), `missing llms URL: ${url}`);
        const pathname = new URL(url).pathname;
        assert.ok((await fs.stat(path.join(dist, pathname, pathname.endsWith('/') ? 'index.html' : ''))).isFile(), url);
    }
    t.diagnostic(`Verified ${checked} internal links/assets and ${urls.length} discovery URLs in a temporary build. Existing authored missing anchors: ${JSON.stringify([...observedMissingAnchors])}`);
});
