// @ts-check

import {randomUUID} from 'node:crypto';

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

                const byRoute = new Map();
                for (const item of htmlItems) {
                    const items = byRoute.get(item.route) ?? [];
                    items.push(item);
                    byRoute.set(item.route, items);
                }
                const results = [];
                for (const item of htmlItems) {
                    const presentation = await catalog.getPresentation({item});
                    if (!presentation) continue;
                    /** @type {Record<string, string>} */
                    const alternateUrls = {};
                    for (const alternate of byRoute.get(item.route) ?? []) {
                        if (alternate.locale) alternateUrls[alternate.locale] = absoluteUrl(baseUrl, alternate.route, alternate.locale);
                    }
                    const markdownUrl = routing.getMarkdownUrl({route: item.route, locale: item.locale || undefined});
                    const data = {
                        publication: item,
                        locale: item.locale,
                        allowedLocales: locales,
                        canonicalUrl: absoluteUrl(baseUrl, item.route, item.locale),
                        alternateUrls,
                        markdownAlternateUrl: new URL(markdownUrl.replace(/^\/+/, ''), baseUrl).href,
                        siteBasePath,
                    };
                    const rendered = await render.perform({...presentation, data, options: {}});
                    if (rendered.resultCode !== 'SUCCESS' || typeof rendered.content !== 'string') {
                        throw new Error(`Static publication render failed for ${item.locale || 'neutral'}:${item.route}.`);
                    }
                    for (const name of htmlPaths(item.locale, item.route)) {
                        await write(temporary, name, rendered.content);
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
