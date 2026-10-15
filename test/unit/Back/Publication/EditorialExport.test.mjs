import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import nunjucks from 'nunjucks';
import {parseDocument} from 'yaml';
import {marked} from 'marked';
import Catalog from '../../../../src/Back/Publication/Catalog.mjs';
import Source from '../../../../src/Back/Publication/Source.mjs';
import Routing from '../../../../src/Back/Publication/Routing.mjs';
import Policy from '../../../../src/Back/Publication/Policy.mjs';
import StaticExporter from '../../../../src/Back/Publication/StaticExporter.mjs';
import Generator from '../../../../src/Back/Discovery/Generator.mjs';

const project = fileURLToPath(new URL('../../../../', import.meta.url));

async function fixture(t) {
    const scratch = path.join(project, 'tmp');
    await fs.mkdir(scratch, {recursive: true});
    const root = await fs.mkdtemp(path.join(scratch, 'talgaticus-editorial-'));
    t.after(() => {
        assert.equal(path.dirname(root), scratch);
        return fs.rm(root, {recursive: true, force: true});
    });
    await fs.cp(path.join(project, 'tmpl/web'), path.join(root, 'tmpl/web'), {recursive: true});
    // The baseline fixture also runs before the design directory exists.
    await fs.cp(path.join(project, 'design'), path.join(root, 'design'), {recursive: true}).catch(e => {
        if (e.code !== 'ENOENT') throw e;
    });
    await fs.mkdir(path.join(root, 'web'), {recursive: true});
    await fs.mkdir(path.join(root, 'dist'), {recursive: true});
    await fs.writeFile(path.join(root, 'dist/keep.txt'), 'existing export');
    const tmplConfig = {getRootPath: () => root, getAvailableLocales: () => ['ru', 'en'], getDefaultLocale: () => 'en'};
    const config = {getPublicationFamilies: () => [], getBaseUrl: () => 'https://example.org/site/',
        getStaticBaseUrl: () => 'https://example.org/site/', getSitemapRepresentations: () => 'html'};
    const policy = new Policy({config});
    const routing = new Routing({policy, config, tmplConfig});
    const source = new Source({fs, path, tmplConfig, routing, policy, parseDocument, marked});
    const catalog = new Catalog({fs, path, tmplConfig, routing, source,
        dtoTarget: {create: value => value}, load: {perform: async () => ({resultCode: 'SUCCESS',
            template: await fs.readFile(path.join(root, 'tmpl/web/publication.html'), 'utf8')})}});
    const discovery = new Generator({config, catalog, tmplConfig, fs, path});
    const env = new nunjucks.Environment(null, {autoescape: true});
    const render = {perform: async ({template, data}) => ({resultCode: 'SUCCESS', content: env.renderString(template, data)})};
    const exporter = new StaticExporter({fs, path, tmplConfig, config, catalog, source, routing, render, discovery});
    return {root, exporter};
}

test('editorial preview uses the CMS corpus, embeds Markdown and preserves the current export', async t => {
    const {root, exporter} = await fixture(t);
    const files = await exporter.export({designPreview: true});
    assert.equal(await fs.readFile(path.join(root, 'dist/keep.txt'), 'utf8'), 'existing export');
    assert(files.includes('NSK/ru/texts/nsk-003/index.html'));
    assert(!files.some(file => file.endsWith('.md')));
    const home = await fs.readFile(path.join(root, 'design-preview/index.html'), 'utf8');
    assert.match(home, /textarea id="markdown-source"/);
    assert.match(home.split('\n')[0], /^<!doctype html><meta charset="utf-8"><script src="\/site\/assets\/editorial\/page.js" defer><\/script><textarea id="markdown-source">$/);
    assert(!home.includes('<main'));
    assert(!home.includes('Разные пароли'));
    assert.match(home, /Пока нет записей/);
    const article = await fs.readFile(path.join(root, 'design-preview/ru/security/ib-002/index.html'), 'utf8');
    assert(article.includes('Алиса открывает сайт магазина'));
    assert(!/href="https:\/\/example.org\/[^\"]+\.md(?:["#?])/.test(article));
    assert.match(article, /\/site\/assets\/editorial\/page.js/);
    const sitemap = await fs.readFile(path.join(root, 'design-preview/sitemap.xml'), 'utf8');
    assert(!sitemap.includes('.md'));
    assert(sitemap.includes('/site/NSK/ru/texts/nsk-003/'));
    const shortNsk = await fs.readFile(path.join(root, 'design-preview/NSK/ru/texts/nsk-002/index.html'), 'utf8');
    assert(!/\]\([^)]*\.md(?:[)#?])/.test(shortNsk));
    assert(shortNsk.includes('/site/NSK/ru/texts/nsk-003/'));
    const section = await fs.readFile(path.join(root, 'design-preview/ru/security/index.html'), 'utf8');
    assert(!section.includes('[Markdown]'));
    const settings = JSON.parse(await fs.readFile(path.join(root, 'design-preview/assets/editorial/pages.json'), 'utf8'));
    assert.equal(settings['/site/ru/security/ib-002/'].alternateLanguages.length, 2);
    assert.equal(settings['/site/NSK/ru/texts/nsk-003/'].humanLocale, 'ru');
    assert(!JSON.stringify(settings).includes('Алиса открывает сайт магазина'));
});

test('only new blog articles enter the feed; translations, dates and escaped source survive', async t => {
    const {root, exporter} = await fixture(t);
    const dir = path.join(root, 'tmpl/web/ru/blog');
    await fs.mkdir(dir, {recursive: true});
    for (const [name, date, title] of [['older', '2026-10-01', 'Ранняя запись'], ['newer', '2026-10-02', 'Поздняя запись']]) {
        await fs.writeFile(path.join(dir, `${name}.md`), `---\ntitle: "${title}"\ndescription: "Точный анонс"\ndate: "${date}"\n---\n\n# ${title}\n\nТекст </textarea> & <span>пример</span>.\n`);
    }
    await exporter.export({designPreview: true});
    const home = await fs.readFile(path.join(root, 'design-preview/ru/index.html'), 'utf8');
    assert(home.indexOf('Поздняя запись') < home.indexOf('Ранняя запись'));
    assert.match(home, /2026-10-02/);
    const article = await fs.readFile(path.join(root, 'design-preview/ru/blog/newer/index.html'), 'utf8');
    assert.equal((article.match(/<textarea\b/g) || []).length, 1);
    assert.match(article, /&lt;\/textarea&gt;/);
    assert(!/hreflang="en"/.test(article));
    const llms = await fs.readFile(path.join(root, 'design-preview/llms.txt'), 'utf8');
    assert.match(llms, /textarea#markdown-source/);
});

test('production literary export retains HTML aliases without duplicate article bodies or public Markdown', async t => {
    const {root, exporter} = await fixture(t);
    const files = await exporter.export({literary: true});
    assert(files.includes('NSK/en/texts/nsk-003/index.html'));
    assert(files.includes('NSK/en/texts/nsk-003.html'));
    assert(!files.some(file => file.endsWith('.md')));
    const primary = await fs.readFile(path.join(root, 'dist/NSK/en/texts/nsk-003/index.html'), 'utf8');
    assert(primary.startsWith('<!doctype html><meta charset="utf-8"><script'));
    assert(primary.includes('id="three-parties"'));
    const alias = await fs.readFile(path.join(root, 'dist/NSK/en/texts/nsk-003.html'), 'utf8');
    assert(alias.includes('http-equiv="refresh"'));
    assert(alias.includes('redirect.js'));
    assert(!alias.includes('<textarea'));
    const settings = JSON.parse(await fs.readFile(path.join(root, 'dist/assets/editorial/pages.json'), 'utf8'));
    assert.equal(Object.keys(settings).length, 45);
    const sitemap = await fs.readFile(path.join(root, 'dist/sitemap.xml'), 'utf8');
    assert.equal((sitemap.match(/<loc>/g) || []).length, 45);
    assert(!sitemap.includes('.md'));
});
