// @ts-check

/**
 * @namespace Fl32_Cms_Back_Discovery_Generator
 * @description Generates public discovery files from configured Markdown publications.
 */
export default class Generator {
    /**
     * @param {object} deps
     * @param {Fl32_Cms_Back_Config} deps.config
     * @param {Fl32_Cms_Back_Publication_Catalog} deps.catalog
     * @param {Fl32_Tmpl_Back_Config} deps.tmplConfig
     * @param {typeof import('node:fs/promises')} deps.fs
     * @param {typeof import('node:path')} deps.path
     */
    constructor({config, catalog, tmplConfig, fs, path}) {
        /**
         * @param {object} [options]
         * @param {string} [options.baseUrl] Optional full public base URL for static exports.
         * @param {boolean} [options.staticHtmlUrls] Add trailing slashes to HTML sitemap URLs.
         * @returns {Promise<Fl32_Cms_Back_Discovery_Files>}
         */
        this.build = async ({baseUrl: suppliedBaseUrl, staticHtmlUrls = false} = {}) => {
            const rawBase = suppliedBaseUrl ?? config.getBaseUrl();
            if (!rawBase) throw new Error('TEQ_CMS__BASE_URL is required for discovery generation.');
            const base = new URL(rawBase);
            if (!['http:', 'https:'].includes(base.protocol) || (!suppliedBaseUrl && base.pathname !== '/') || base.search ||
                base.hash || base.username || base.password) {
                throw new Error('Discovery base URL must be an absolute HTTP URL without credentials, query, or fragment.');
            }
            base.pathname = `${base.pathname.replace(/\/+$/, '')}/`;
            /** @type {string[]} */
            const locales = tmplConfig.getAvailableLocales();
            const selection = config.getSitemapRepresentations();
            const inventory = await catalog.listRepresentations();
            const resources = inventory.filter(resource => resource.item.metadata.indexable !== false);
            /** @param {Fl32_Cms_Back_Publication_Resource} resource @returns {string} */
            const getLocale = resource => {
                if (locales.includes(resource.item.locale)) return resource.item.locale;
                const firstSegment = resource.url.replace(/^\/+/, '').split('/')[0];
                return locales.includes(firstSegment) ? firstSegment : '';
            };
            /** @param {Fl32_Cms_Back_Publication_Resource} resource @returns {string} */
            const toPublicUrl = resource => {
                let pathname = resource.url.replace(/^\/+/, '');
                if (staticHtmlUrls && resource.representation === 'html') {
                    if (resource.item.route === 'index') {
                        const locale = getLocale(resource);
                        pathname = locale ? `${locale}/` : '';
                    } else {
                        const clean = pathname.replace(/\/+$/, '');
                        pathname = clean ? `${clean}/` : '';
                    }
                }
                return new URL(pathname, base).href;
            };
            const sitemapUrls = [...new Set(resources
                .filter(resource => selection === 'both' || resource.representation === selection)
                .map(toPublicUrl))].sort();
            const robots = `User-agent: *\nAllow: /\nSitemap: ${new URL('sitemap.xml', base).href}\n`;
            /** @type {Map<string, number>} */
            const localeOrder = new Map([['', 0]]);
            locales.forEach((locale, index) => localeOrder.set(locale, index + 1));
            const representationOrder = new Map([['markdown', 0], ['html', 1]]);
            const llmsResources = [...resources].sort((a, b) => {
                const routeOrder = a.item.route.localeCompare(b.item.route);
                if (routeOrder) return routeOrder;
                const languageOrder = (localeOrder.get(getLocale(a)) ?? Number.MAX_SAFE_INTEGER) -
                    (localeOrder.get(getLocale(b)) ?? Number.MAX_SAFE_INTEGER);
                if (languageOrder) return languageOrder;
                return (representationOrder.get(a.representation) ?? Number.MAX_SAFE_INTEGER) -
                    (representationOrder.get(b.representation) ?? Number.MAX_SAFE_INTEGER);
            });
            const llmsGroups = new Map();
            for (const resource of llmsResources) {
                const route = resource.item.route;
                if (!llmsGroups.has(route)) llmsGroups.set(route, []);
                const locale = getLocale(resource) || 'site';
                const language = locale === 'site' ? 'Site' : locale.toUpperCase();
                const format = resource.representation === 'markdown' ? 'Markdown' : 'HTML';
                const title = resource.item.metadata.title;
                llmsGroups.get(route).push(`- ${language} ${format}: ${title} — ${toPublicUrl(resource)}`);
            }
            const llms = [
                '# TALGATICUS / ТАЛГАТИКУС',
                '',
                'Published pages. Markdown is the primary content format; HTML is provided for browsers.',
                '',
                ...[...llmsGroups.entries()].flatMap(([route, entries]) => [`## ${route}`, ...entries, '']),
            ].join('\n');
            /** @param {string} value @returns {string} */
            function escapeXml(value) {
                return value.replace(/[&<>"']/g,
                    char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'})[char] ?? char);
            }
            const sitemap = [
                '<?xml version="1.0" encoding="UTF-8"?>',
                '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
                ...sitemapUrls.map(url => `  <url><loc>${escapeXml(url)}</loc></url>`),
                '</urlset>',
                '',
            ].join('\n');
            return {robots, llms, sitemap};
        };

        /** @returns {Promise<string[]>} */
        this.write = async () => {
            const content = await this.build();
            const root = path.resolve(tmplConfig.getRootPath());
            const directory = path.join(root, 'web');
            await fs.mkdir(directory, {recursive: true});
            if (!(await fs.lstat(directory)).isDirectory()) {
                throw new Error('The public web directory must be a real directory.');
            }
            const entries = [
                ['robots.txt', content.robots],
                ['llms.txt', content.llms],
                ['sitemap.xml', content.sitemap],
            ];
            for (const [name] of entries) {
                const file = path.join(directory, name);
                try {
                    if ((await fs.lstat(file)).isSymbolicLink()) {
                        throw new Error(`Refusing to replace symbolic link: ${file}`);
                    }
                } catch (error) {
                    if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) throw error;
                }
            }
            const files = entries.map(([name]) => path.join(directory, name));
            for (let index = 0; index < entries.length; index++) {
                await fs.writeFile(files[index], entries[index][1], 'utf8');
            }
            return files;
        };
    }
}

export const __deps__ = Object.freeze({
    default: Object.freeze({
        config: 'Fl32_Cms_Back_Config$',
        catalog: 'Fl32_Cms_Back_Publication_Catalog$',
        tmplConfig: 'Fl32_Tmpl_Back_Config$',
        fs: 'node:fs/promises',
        path: 'node:path',
    }),
});
