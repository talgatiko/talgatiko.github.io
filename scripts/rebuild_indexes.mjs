import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseDocument} from 'yaml';
import {marked} from 'marked';
import Catalog from '../src/Back/Publication/Catalog.mjs';
import Source from '../src/Back/Publication/Source.mjs';
import Routing from '../src/Back/Publication/Routing.mjs';
import Policy from '../src/Back/Publication/Policy.mjs';

const BASE = 'https://talgatiko.github.io/';
const words = {
    ru: {projects: 'Проекты', publications: 'Публикации', map: 'Полная карта сайта',
        security: 'Информационная безопасность', it: 'Информационные технологии',
        NSK: 'Новый социальный контракт', articles: 'Материалы', faq: 'NSK-004 · Вопросы и ответы внутри NSK-003'},
    en: {projects: 'Projects', publications: 'Publications', map: 'Complete site map',
        security: 'Information security', it: 'Information technology',
        NSK: 'New Social Contract', articles: 'Materials', faq: 'NSK-004 · FAQ within NSK-003'},
};
const span = (language, text) => `<span lang="${language}">${text}</span>`;
const bilingual = key => `${span('ru', words.ru[key])} / ${span('en', words.en[key])}`;
// Escape authored titles as link labels, including HTML and Markdown punctuation.
const label = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replace(/[\\[\]*_`]/g, '\\$&').replaceAll('\n', ' ');
const identity = item => `${item.locale}:${item.route}`;

export async function rebuild(root) {
    root = path.resolve(root);
    const locales = ['ru', 'en'];
    const tmplConfig = {getRootPath: () => root, getAvailableLocales: () => locales, getDefaultLocale: () => 'en'};
    const config = {getPublicationFamilies: () => []};
    const policy = new Policy({config});
    const routing = new Routing({policy, config, tmplConfig});
    const source = new Source({fs, path, tmplConfig, routing, policy, parseDocument, marked});
    const catalog = new Catalog({fs, path, tmplConfig, routing, source});
    const items = (await Promise.all(['', ...locales].map(locale => catalog.list({locale})))).flat();
    const byId = new Map(items.map(item => [identity(item), item]));
    const web = path.join(root, 'tmpl', 'web');
    // Catalog hides invalid sources for HTTP delivery. Rebuild must fail before
    // writes instead of silently dropping a publication being translated.
    for (const locale of ['', ...locales]) {
        async function check(dir) {
            for (const entry of await fs.readdir(dir, {withFileTypes: true})) {
                if (entry.isSymbolicLink()) throw new Error(`Symlink in publication tree: ${entry.name}`);
                if (locale === '' && dir === web && locales.includes(entry.name)) continue;
                const file = path.join(dir, entry.name);
                if (entry.isDirectory() && /^[A-Za-z0-9_-]+$/.test(entry.name)) await check(file);
                else if (entry.isFile() && /^[A-Za-z0-9_-]+\.md$/.test(entry.name)) {
                    const route = path.relative(path.join(web, locale), file).replaceAll(path.sep, '/').slice(0, -3);
                    if (routing.isPublicRoute(route) && !byId.has(`${locale}:${route}`)) {
                        await source.read({locale, route});
                        throw new Error(`Source missing from catalog: ${locale}:${route}`);
                    }
                }
            }
        }
        await check(path.join(web, locale));
    }
    // Explicit adapter synchronized with StaticExporter.absoluteUrl: Routing owns
    // identity/prefix rules; static HTML canonical URLs always end in a slash.
    const html = item => {
        const url = new URL(routing.getUrl(item).replace(/^\/+/, ''), BASE);
        url.pathname = `${url.pathname.replace(/\/+$/, '')}/`;
        return url.href;
    };
    const md = item => new URL(routing.getMarkdownUrl(item).replace(/^\/+/, ''), BASE).href;
    const formats = item => `[HTML](${html(item)}) · [Markdown](${md(item)})`;
    const row = item => `- ${span(item.locale || 'en', `[${label(item.metadata.title)}](${html(item)})`)} · [Markdown](${md(item)})`;
    const alternatives = item => locales.map(locale => byId.get(`${locale}:${item.route}`))
        .filter(Boolean).map(other => `${other.locale.toUpperCase()}: ${formats(other)}`).join(' · ');
    const get = (locale, route) => {
        const item = byId.get(`${locale}:${route}`);
        if (!item) throw new Error(`Required index missing: ${locale}:${route}`);
        return item;
    };
    const planned = new Map();
    const plan = (item, lines) => {
        if (item.metadata.source_sha256) throw new Error(`Refusing to overwrite article: ${identity(item)}`);
        // Preserve exact metadata, including descriptions, dates and future fields.
        const header = /^---\r?\n[\s\S]*?\r?\n---\r?\n/.exec(item.source)[0];
        const eol = header.includes('\r\n') ? '\r\n' : '\n';
        planned.set(item, header + eol + lines.join('\n').replaceAll('\n', eol) + eol);
    };
    const groups = locale => [...new Set(items.filter(item => item.locale === locale && item.route.includes('/'))
        .map(item => item.route.split('/')[0]))].sort((a, b) =>
            (['NSK', 'security', 'it'].indexOf(a) + 1 || 4) - (['NSK', 'security', 'it'].indexOf(b) + 1 || 4) || a.localeCompare(b, 'en'));
    const groupItems = (locale, group) => items.filter(item => item.locale === locale && item.route.startsWith(`${group}/`));
    const groupIndex = (locale, group) => byId.get(`${locale}:${group}`) || get(locale, `${group}/index`);
    for (const locale of locales) {
        for (const group of groups(locale)) {
            const index = groupIndex(locale, group);
            const members = groupItems(locale, group).filter(item => item !== index);
            const lines = [`# ${label(index.metadata.title)}`, '', alternatives(index), '', `## ${words[locale].articles}`, '', ...members.map(row)];
            if (group === 'NSK') {
                const article = get(locale, 'NSK/texts/nsk-003');
                if (!/<(?:a|h[1-6])\b[^>]*\bid=["']faq["']/.test(article.markdown)) throw new Error(`Missing FAQ anchor: ${locale}`);
                if (byId.has(`${locale}:NSK/texts/nsk-004`)) throw new Error('NSK-004 must remain inside NSK-003.');
                const faq = `- [${words[locale].faq}](${html(article)}#faq)`;
                lines.push('', faq);
                const indexCatalog = get(locale, 'NSK/catalog');
                plan(indexCatalog, [`# ${label(indexCatalog.metadata.title)}`, '', alternatives(indexCatalog), '',
                    row(index), '', ...members.filter(item => item !== indexCatalog).map(row), '', faq]);
            }
            plan(index, lines);
        }
        const home = get(locale, 'index');
        plan(home, [`# ${label(home.metadata.title)}`, '', alternatives(home), '',
            `## ${words[locale].projects}`, '', ...groups(locale).filter(group => group === 'NSK').map(group => row(groupIndex(locale, group))), '',
            `## ${words[locale].publications}`, '', ...groups(locale).filter(group => group !== 'NSK').map(group => row(groupIndex(locale, group))), '',
            `## ${words[locale].map}`, '', ...items.filter(item => item.locale === locale).map(row)]);
    }
    const home = get('', 'index');
    const lines = [`# TALGATICUS / ${span('ru', 'ТАЛГАТИКУС')}`, '', `## ${bilingual('projects')}`, '',
        `- **${bilingual('NSK')}** · RU: ${formats(get('ru', 'NSK/index'))} · EN: ${formats(get('en', 'NSK/index'))}`,
        `- **${span('ru', 'Проекты автора')} / ${span('en', "Author's projects")}** · [${span('ru', 'Профиль и публичные репозитории')} / ${span('en', 'Profile and public repositories')}](https://github.com/talgatiko)`, '',
        `## ${bilingual('publications')}`, ''];
    for (const locale of locales) for (const group of groups(locale).filter(group => group !== 'NSK')) {
        const item = groupIndex(locale, group);
        lines.push(`- **${span(locale, label(words[locale][group] || item.metadata.title))} · ${locale.toUpperCase()}**: ${formats(item)}`);
    }
    lines.push('', `## ${bilingual('map')}`, '', `- ${formats(home)}`);
    for (const locale of locales) {
        lines.push('', `### ${span(locale, locale === 'ru' ? 'Русский' : 'English')}`, '', row(get(locale, 'index')));
        for (const group of groups(locale)) {
            const index = groupIndex(locale, group);
            lines.push('', `#### ${span(locale, label(words[locale][group] || index.metadata.title))}`, '', row(index));
            lines.push(...groupItems(locale, group).filter(item => item !== index).map(row));
        }
        lines.push(...items.filter(item => item.locale === locale && !item.route.includes('/') &&
            item.route !== 'index' && !groups(locale).includes(item.route)).map(row));
    }
    lines.push(...items.filter(item => item.locale === '' && item.route !== 'index').map(row));
    plan(home, lines);
    const urls = new Set(items.flatMap(item => [html(item), md(item)]));
    for (const text of planned.values()) {
        if (text.includes('/new-social-contract/')) throw new Error('Legacy NSK URL in generated index.');
        for (const match of text.matchAll(/\]\((https:\/\/talgatiko\.github\.io\/[^)]*)\)/g)) {
            if (!urls.has(match[1].split('#')[0])) throw new Error(`Uncatalogued index link: ${match[1]}`);
        }
    }
    // Detect concurrent edits before changing any index.
    for (const item of items) {
        if (await fs.readFile(path.join(web, item.locale, `${item.route}.md`), 'utf8') !== item.source) {
            throw new Error(`Source changed during rebuild: ${identity(item)}; retry after the edit finishes.`);
        }
    }
    let changed = 0;
    for (const [item, text] of planned) if (text !== item.source) {
        await fs.writeFile(path.join(web, item.locale, `${item.route}.md`), text, 'utf8');
        changed++;
    }
    return {pages: items.length, indexes: planned.size, changed};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const args = process.argv.slice(2);
    if (args.length && (args.length !== 2 || args[0] !== '--root')) throw new Error('Usage: rebuild_indexes.py [--root PROJECT]');
    const root = args[1] || fileURLToPath(new URL('..', import.meta.url));
    console.log(JSON.stringify(await rebuild(root)));
}
