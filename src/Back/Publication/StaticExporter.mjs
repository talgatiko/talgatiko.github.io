// @ts-check

import {randomUUID} from 'node:crypto';

/** @param {{html: string, locale: string|undefined, route: string, alternateUrls: Record<string, string>, xDefaultUrl: string|undefined, markdownUrl: string|undefined, canonicalUrl: string, metadata: Record<string, any>}} deps */
const finishHtml = ({html, locale, route, alternateUrls, xDefaultUrl, markdownUrl, canonicalUrl, metadata}) => {
    const lang = locale || 'en';
    /** @param {unknown} value */
    const escapeHtml = value => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    html = html.replace(/<html lang="[^"]*">/, `<html lang="${lang}">`);
    html = html.replace(/\s*<link rel="alternate"[^>]*>/g, '');
    const alternateTags = Object.entries(alternateUrls)
        .map(([language, url]) => `<link rel="alternate" hreflang="${language}" href="${url}">`);
    if (route === 'index' && xDefaultUrl) alternateTags.push(`<link rel="alternate" hreflang="x-default" href="${xDefaultUrl}">`);
    if (markdownUrl) alternateTags.push(`<link rel="alternate" type="text/markdown" href="${markdownUrl}">`);
    const article = Boolean(metadata.source_sha256);
    const openGraph = [
        `<meta property="og:site_name" content="TALGATICUS">`,
        `<meta property="og:title" content="${escapeHtml(metadata.title)}">`,
        `<meta property="og:description" content="${escapeHtml(metadata.description)}">`,
        `<meta property="og:url" content="${canonicalUrl}">`,
        `<meta property="og:type" content="${article ? 'article' : 'website'}">`,
    ];
    if (metadata.author) openGraph.push(`<meta name="author" content="${escapeHtml(metadata.author)}">`);
    const schema = article
        ? {'@context': 'https://schema.org', '@type': 'Article', headline: metadata.title,
            description: metadata.description, inLanguage: lang,
            ...(metadata.author ? {author: {'@type': 'Person', name: metadata.author}} : {}),
            mainEntityOfPage: {'@type': 'WebPage', '@id': canonicalUrl}}
        : route === 'index' && !locale
            ? {'@context': 'https://schema.org', '@type': 'WebSite', name: 'TALGATICUS / ТАЛГАТИКУС', url: canonicalUrl,
                inLanguage: ['ru', 'en']}
            : null;
    if (schema) {
        const json = JSON.stringify(schema).replaceAll('<', '\\u003c').replaceAll('&', '\\u0026')
            .replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029');
        openGraph.push(`<script type="application/ld+json">${json}</script>`);
    }
    html = html.replace('</head>', `    ${[...openGraph, ...alternateTags].join('\n    ')}\n</head>`);
    const languageNav = Object.entries(alternateUrls)
        .map(([language, url]) => `<a href="${url}" lang="${language}">${language.toUpperCase()}</a>`)
        .join(' ');
    if (languageNav) html = html.replace('</nav>', `    ${languageNav}\n</nav>`);
    if (lang === 'ru') {
        html = html.replace(/<aside class="publication-record"[\s\S]*?<\/aside>/, (block) => {
            const labels = new Map([
                ['Publication record', 'Сведения о публикации'], ['Author', 'Автор'],
                ['Date in source record', 'Дата в записи источника'], ['Source version', 'Версия источника'],
                ['Source', 'Источник'], ['License', 'Лицензия'],
            ]);
            for (const [english, russian] of labels) block = block.replaceAll(english, russian);
            return block;
        });
    }
    return html;
};

/**
 * @namespace Fl32_Cms_Back_Publication_StaticExporter
 * @description Builds a finite static projection of the CMS publication catalog.
 */
export default class StaticExporter {
    /**
     * @param {object} deps
     * @param {typeof import('node:fs/promises')} deps.fs
     * @param {typeof import('node:path')} deps.path
     * @param {Fl32_Tmpl_Back_Config} deps.tmplConfig
     * @param {Fl32_Cms_Back_Config} deps.config
     * @param {Fl32_Cms_Back_Publication_Catalog} deps.catalog
     * @param {Fl32_Cms_Back_Publication_Source} deps.source
     * @param {Fl32_Cms_Back_Publication_Routing} deps.routing
     * @param {Fl32_Tmpl_Back_Service_Render} deps.render
     * @param {Fl32_Cms_Back_Discovery_Generator} deps.discovery
     */
    constructor({fs, path, tmplConfig, config, catalog, source, routing, render, discovery}) {
        const root = path.resolve(tmplConfig.getRootPath());

        /** @returns {string} */
        const getBaseUrl = () => {
            const custom = config.getStaticBaseUrl();
            const raw = custom ?? config.getBaseUrl();
            if (!raw) throw new Error('TEQ_CMS__STATIC_BASE_URL or TEQ_CMS__BASE_URL is required for static export.');
            let url;
            try {
                url = new URL(raw);
            } catch {
                throw new Error('TEQ_CMS__STATIC_BASE_URL must be an absolute HTTP or HTTPS URL.');
            }
            if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password || url.search || url.hash) {
                throw new Error('TEQ_CMS__STATIC_BASE_URL must be an absolute HTTP or HTTPS URL without credentials, query, or fragment.');
            }
            const pathname = url.pathname.replace(/\/+$/, '');
            url.pathname = `${pathname}/`;
            return url.href;
        };

        /** @param {string} directory @param {string} name @param {string} content @returns {Promise<void>} */
        const write = async (directory, name, content) => {
            const file = path.resolve(directory, name);
            if (!file.startsWith(`${directory}${path.sep}`)) throw new Error('Static export path escapes its output directory.');
            await fs.mkdir(path.dirname(file), {recursive: true});
            await fs.writeFile(file, content, 'utf8');
        };

        /** @param {string} from @param {string} to @returns {Promise<void>} */
        const copyPublicTree = async (from, to) => {
            const excluded = new Set(['.env', '.git', 'node_modules', 'ctx', 'tmpl', 'var']);
            let stat;
            try {
                stat = await fs.lstat(from);
            } catch (error) {
                if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return;
                throw error;
            }
            if (stat.isSymbolicLink()) throw new Error('The public web directory must not be a symbolic link.');
            if (!stat.isDirectory()) throw new Error('The public web path must be a directory.');
            await fs.mkdir(to, {recursive: true});
            /** @param {string} source @param {string} target @returns {Promise<void>} */
            const walk = async (source, target) => {
                for (const entry of await fs.readdir(source, {withFileTypes: true})) {
                    if (excluded.has(entry.name)) continue;
                    if (entry.isSymbolicLink()) continue;
                    const input = path.join(source, entry.name);
                    const output = path.join(target, entry.name);
                    if (entry.isDirectory()) {
                        await walk(input, output);
                    } else if (entry.isFile()) {
                        if (['robots.txt', 'llms.txt', 'sitemap.xml'].includes(entry.name) && source === from) continue;
                        await fs.mkdir(path.dirname(output), {recursive: true});
                        await fs.copyFile(input, output);
                    }
                }
            };
            await walk(from, to);
        };

        /** @param {string} base @param {string} route @param {string} [locale] @returns {string} */
        const absoluteUrl = (base, route, locale) => {
            const urlPath = routing.getUrl({route, locale}).replace(/^\/+/, '');
            const url = new URL(urlPath, base);
            url.pathname = `${url.pathname.replace(/\/+$/, '')}/`;
            return url.href;
        };

        /** @param {string} locale @param {string} route @returns {string[]} */
        const htmlPaths = (locale, route) => {
            if (!/^[A-Za-z0-9_-]*$/.test(locale) || !/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(route)) {
                throw new Error('Catalog returned an unsafe static publication identity.');
            }
            if (route.startsWith('NSK/') && locale) {
                const projectRoute = route.slice('NSK/'.length);
                if (projectRoute === 'index') return [`NSK/${locale}/index.html`];
                return [`NSK/${locale}/${projectRoute}/index.html`, `NSK/${locale}/${projectRoute}.html`];
            }
            const prefix = locale ? `${locale}/` : '';
            if (route === 'index') return [`${prefix}index.html`];
            return [`${prefix}${route}/index.html`, `${prefix}${route}.html`];
        };

        /**
         * Build in a fresh directory and replace dist only after every output succeeds.
         * @returns {Promise<string[]>}
         */
        this.export = async () => {
            const baseUrl = getBaseUrl();
            const siteBasePath = new URL(baseUrl).pathname.replace(/\/+$/, '');
            const dist = path.resolve(root, 'dist');
            if (!dist.startsWith(`${root}${path.sep}`)) throw new Error('Static export destination escapes the application root.');
            try {
                const existing = await fs.lstat(dist);
                if (existing.isSymbolicLink()) throw new Error('Refusing to replace symbolic link dist/.');
                if (!existing.isDirectory()) throw new Error('Static export destination dist/ must be a directory.');
            } catch (error) {
                if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) throw error;
            }

            const temporary = await fs.mkdtemp(path.join(root, '.cms-static-export-'));
            const backup = path.join(root, `.cms-static-export-backup-${randomUUID()}`);
            let movedExisting = false;
            try {
                await copyPublicTree(path.join(root, 'web'), temporary);
                const locales = tmplConfig.getAvailableLocales();
                /** @type {Fl32_Cms_Back_Publication_Item[]} */
                const markdownItems = [];
                for (const locale of [...(routing.isSite() ? [''] : []), ...locales]) {
                    markdownItems.push(...await catalog.list({locale}));
                }

                /** @type {Fl32_Cms_Back_Publication_Item[]} */
                const htmlItems = [];
                for (const locale of [...(routing.isSite() ? [''] : []), ...locales]) {
                    htmlItems.push(...await catalog.listHtml({locale}));
                }
                if (!htmlItems.some(item => item.locale === '' && item.route === 'index')) {
                    throw new Error('A valid neutral home publication is required for static export.');
                }

                const results = [];
                for (const item of htmlItems) {
                    const presentation = await catalog.getPresentation({item});
                    if (!presentation) continue;
                    /** @type {Record<string, string>} */
                    const alternateUrls = {};
                    for (const locale of locales) {
                        const alternateFile = path.resolve(root, 'tmpl', 'web', locale, `${item.route}.md`);
                        if (alternateFile.startsWith(`${root}${path.sep}`) && await fs.stat(alternateFile).then(stat => stat.isFile()).catch(() => false)) {
                            alternateUrls[locale] = absoluteUrl(baseUrl, item.route, locale);
                        }
                    }
                    const markdownUrl = routing.getMarkdownUrl({route: item.route, locale: item.locale || undefined});
                    const data = {
                        publication: item,
                        locale: item.locale,
                        allowedLocales: locales,
                        canonicalUrl: absoluteUrl(baseUrl, item.route, item.locale),
                        alternateUrls,
                        alternateLanguages: Object.entries(alternateUrls).map(([language, url]) => ({language, url})),
                        xDefaultUrl: item.route === 'index' ? absoluteUrl(baseUrl, 'index', '') : undefined,
                        markdownAlternateUrl: new URL(markdownUrl.replace(/^\/+/, ''), baseUrl).href,
                        siteBasePath,
                    };
                    const rendered = await render.perform({...presentation, data, options: {}});
                    if (rendered.resultCode !== 'SUCCESS' || typeof rendered.content !== 'string') {
                        throw new Error(`Static publication render failed for ${item.locale || 'neutral'}:${item.route}.`);
                    }
                    let html = rendered.content;
                    const mermaidPattern = /<pre><code class="language-mermaid">([\s\S]*?)<\/code><\/pre>/;
                    const mermaidMatch = mermaidPattern.exec(html);
                    if (mermaidMatch) {
                        const locale = item.locale === 'ru' || /[А-Яа-яЁё]/.test(mermaidMatch[1]) ? 'ru' : 'en';
                        const label = locale === 'ru' ? 'Схема процесса обработки запроса' : 'Diagram of the request processing flow';
                        const summary = locale === 'ru'
                            ? 'Событие сохраняется в неизменяемом архиве, из которого собираются контекст и данные для чтения. Система проверяет бюджет, отправляет запрос модели, выполняет ограниченные чтения и сохраняет результат как новое событие.'
                            : 'An event is saved in the immutable archive, which supplies the context and data for reads. The system checks the budget, sends the model request, performs bounded reads, and stores the result as a new event.';
                        const diagram = `<figure class="publication-diagram"><img src="${siteBasePath}/assets/rcm-flow-${locale}.svg" alt="${label}"><figcaption>${summary}</figcaption></figure>`;
                        html = html.replace(mermaidPattern, diagram);
                    }
                    html = finishHtml({
                        html,
                        locale: item.locale,
                        route: item.route,
                        alternateUrls,
                        xDefaultUrl: item.route === 'index' ? absoluteUrl(baseUrl, 'index', '') : undefined,
                        markdownUrl: new URL(markdownUrl.replace(/^\/+/, ''), baseUrl).href,
                        canonicalUrl: absoluteUrl(baseUrl, item.route, item.locale),
                        metadata: item.metadata,
                    });
                    for (const name of htmlPaths(item.locale, item.route)) {
                        await write(temporary, name, html);
                        results.push(name);
                    }
                }

                const neutralByRoute = new Map();
                for (const route of [...new Set(markdownItems.map(item => item.route))]) {
                    neutralByRoute.set(route, await source.readNeutral({route}));
                }
                const markdownWritten = new Set();
                for (const item of markdownItems) {
                    const url = routing.getMarkdownUrl({route: item.route, locale: item.locale || undefined});
                    const name = url.replace(/^\/+/, '');
                    if (markdownWritten.has(name)) continue;
                    markdownWritten.add(name);
                    await write(temporary, name, item.source);
                    results.push(name);
                }
                for (const [route, neutral] of neutralByRoute) {
                    if (!neutral) continue;
                    const name = routing.getMarkdownUrl({route}).replace(/^\/+/, '');
                    if (markdownWritten.has(name)) continue;
                    await write(temporary, name, neutral.source);
                    results.push(name);
                }

                const files = await discovery.build({baseUrl, staticHtmlUrls: true});
                const externalDiscoveryFile = path.resolve(root, 'discovery', 'external-pages.json');
                let externalPages = [];
                try {
                    externalPages = JSON.parse(await fs.readFile(externalDiscoveryFile, 'utf8'));
                } catch (error) {
                    if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) throw error;
                }
                if (!Array.isArray(externalPages)) throw new Error('External discovery pages must be an array.');
                const externalEntries = externalPages.map(page => {
                    if (!page || typeof page !== 'object' || typeof page.url !== 'string' ||
                        typeof page.title !== 'string' || !['site', 'ru', 'en'].includes(page.language)) {
                        throw new Error('Invalid external discovery page entry.');
                    }
                    const url = new URL(page.url, baseUrl);
                    if (url.origin !== new URL(baseUrl).origin || !url.pathname.startsWith('/new-social-contract/') ||
                        url.search || url.hash || !url.pathname.endsWith('/')) {
                        throw new Error(`Unsafe external discovery URL: ${page.url}`);
                    }
                    return {url: url.href, title: page.title, language: page.language};
                });
                const sitemapLocs = new Set([...files.sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(match => match[1]));
                const extraSitemap = externalEntries.filter(page => !sitemapLocs.has(page.url))
                    .map(page => `  <url><loc>${page.url.replaceAll('&', '&amp;')}</loc></url>`);
                files.sitemap = files.sitemap.replace('</urlset>', `${extraSitemap.join('\n')}${extraSitemap.length ? '\n' : ''}</urlset>`);
                if (externalEntries.length) {
                    files.llms = `${files.llms.trimEnd()}\n\n## NSK — текущие страницы на /new-social-contract/\n` +
                        externalEntries.map(page => `- ${page.language === 'site' ? 'Site' : page.language.toUpperCase()} HTML: ${page.title} — ${page.url}`).join('\n') + '\n';
                }
                for (const name of ['robots.txt', 'llms.txt', 'sitemap.xml']) {
                    await write(temporary, name, files[name === 'robots.txt' ? 'robots' : name === 'llms.txt' ? 'llms' : 'sitemap']);
                    results.push(name);
                }
                if (!(await fs.stat(path.join(temporary, 'index.html'))).isFile()) {
                    throw new Error('Static export did not produce dist/index.html.');
                }

                try {
                    await fs.rename(dist, backup);
                    movedExisting = true;
                } catch (error) {
                    if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) throw error;
                }
                try {
                    await fs.rename(temporary, dist);
                } catch (error) {
                    if (movedExisting) await fs.rename(backup, dist);
                    movedExisting = false;
                    throw error;
                }
                if (movedExisting) await fs.rm(backup, {recursive: true, force: true});
                return results;
            } catch (error) {
                await fs.rm(temporary, {recursive: true, force: true});
                if (movedExisting) {
                    try {
                        await fs.rename(backup, dist);
                    } catch {}
                }
                throw error;
            }
        };
    }
}

export const __deps__ = Object.freeze({
    default: Object.freeze({
        fs: 'node:fs/promises',
        path: 'node:path',
        tmplConfig: 'Fl32_Tmpl_Back_Config$',
        config: 'Fl32_Cms_Back_Config$',
        catalog: 'Fl32_Cms_Back_Publication_Catalog$',
        source: 'Fl32_Cms_Back_Publication_Source$',
        routing: 'Fl32_Cms_Back_Publication_Routing$',
        render: 'Fl32_Tmpl_Back_Service_Render$',
        discovery: 'Fl32_Cms_Back_Discovery_Generator$',
    }),
});
