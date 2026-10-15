// Literary publication projection; source documents remain unchanged.
/** @typedef {Fl32_Cms_Back_Publication_Item & {metadata: Record<string, any>}} EditorialItem */
/** @param {EditorialItem[]} items @param {Fl32_Cms_Back_Publication_Routing} routing @param {string} baseUrl */
export function editorialItems(items, routing, baseUrl) {
    /** @param {{locale: string, route: string}} item */
    const url = item => {
        const value = new URL(routing.getUrl(item).replace(/^\/+/, ''), baseUrl);
        value.pathname = `${value.pathname.replace(/\/+$/, '')}/`;
        return value.href;
    };
    /** @type {Record<string, {blog:string, empty:string, all:string}>} */
    const labels = {ru: {blog: 'Блог', empty: 'Пока нет записей.', all: 'Все записи блога'},
        en: {blog: 'Blog', empty: 'No posts yet.', all: 'All blog posts'}};
    /** @param {string} locale @param {number} limit */
    const feed = (locale, limit) => {
        const posts = items.filter(item => item.locale === locale && item.route.startsWith('blog/') && item.route !== 'blog/index')
            .sort((a, b) => b.metadata.date.localeCompare(a.metadata.date) || a.route.localeCompare(b.route));
        return posts.slice(0, limit).map(item => `## [${item.metadata.title.replace(/[\[\]\\]/g, '\\$&')}](${url(item)})\n\n` +
            `<time datetime="${item.metadata.date}">${item.metadata.date}</time>\n\n${item.metadata.description}\n`).join('\n') || labels[locale].empty;
    };
    const prepared = items.map(item => ({...item}));
    for (const item of prepared) {
        if (!['NSK/index', 'NSK/catalog', 'it', 'security'].includes(item.route)) continue;
        const group = item.route.split('/')[0];
        const members = prepared.filter(other => other !== item && other.locale === item.locale && other.route.startsWith(`${group}/`));
        item.markdown = `# ${item.metadata.title}\n\n` + members.map(other =>
            `- [${other.metadata.title.replace(/[\[\]\\]/g, '\\$&')}](${url(other)})`).join('\n') + '\n';
        if (group === 'NSK') item.markdown += `\n- [${item.locale === 'ru' ? 'Вопросы и ответы' : 'Questions and answers'}](${url({locale: item.locale, route: 'NSK/texts/nsk-003'})}#faq)\n`;
    }
    for (const locale of ['ru', 'en']) {
        const home = prepared.find(item => item.locale === locale && item.route === 'index');
        if (!home) throw new Error(`Missing localized home: ${locale}`);
        home.markdown = `# ${labels[locale].blog}\n\n${feed(locale, 6)}\n\n[${labels[locale].all}](${url({locale, route: 'blog'})})\n`;
        // Blog has its own language routes; existing articles retain their addresses.
        let blog = prepared.find(item => item.locale === locale && item.route === 'blog');
        if (!blog) {
            blog = {...home, route: 'blog', metadata: {...home.metadata, title: labels[locale].blog,
                description: locale === 'ru' ? 'Новые записи блога' : 'New blog posts'}};
            prepared.push(blog);
        }
        blog.markdown = `# ${labels[locale].blog}\n\n${feed(locale, Number.MAX_SAFE_INTEGER)}\n`;
    }
    const neutral = prepared.find(item => !item.locale && item.route === 'index');
    if (!neutral) throw new Error('Missing bilingual home.');
    neutral.markdown = `# Блог / Blog\n\n<section lang="ru">\n\n${feed('ru', 6)}\n\n</section>\n\n` +
        `<section lang="en">\n\n${feed('en', 6)}\n\n</section>\n`;
    const sourceLinks = new Map();
    for (const item of prepared) {
        sourceLinks.set(new URL(url(item)).pathname, url(item));
        const productionHtml = new URL(routing.getUrl(item), 'https://talgatiko.github.io/');
        productionHtml.pathname = `${productionHtml.pathname.replace(/\/+$/, '')}/`;
        sourceLinks.set(productionHtml.pathname, url(item));
        sourceLinks.set(new URL(routing.getMarkdownUrl(item).replace(/^\/+/, ''), baseUrl).pathname, url(item));
        // The source corpus contains canonical links to the production domain.
        sourceLinks.set(new URL(routing.getMarkdownUrl(item).replace(/^\/+/, ''), 'https://talgatiko.github.io/').pathname, url(item));
    }
    for (const item of prepared) {
        item.markdown = item.markdown.replace(/^.*\[RU HTML\].*\[EN Markdown\].*(?:\r?\n|$)/gm, '')
            .replace(/^\[(?:Все статьи \/ All articles|All articles).*\[(?:English|Русский)\].*(?:\r?\n|$)/gm, '');
        /** @param {string} address */
        const rewrite = address => {
            if (address.startsWith('#')) return address;
            const parsed = new URL(address, url(item));
            const owned = parsed.origin === new URL(baseUrl).origin || parsed.origin === 'https://talgatiko.github.io';
            const replacement = owned && sourceLinks.get(parsed.pathname);
            if (replacement) return new URL(replacement).pathname + parsed.search + parsed.hash;
            if (parsed.origin === 'https://talgatiko.github.io') {
                const target = new URL(parsed.pathname.replace(/^\/+/, ''), baseUrl);
                return target.pathname + parsed.search + parsed.hash;
            }
            return address;
        };
        item.markdown = item.markdown.replace(/(\]\(|\bhref=["'])([^\s)"'<>]+)(?=[)"'])/g,
            (match, prefix, address) => prefix + rewrite(address));
        if (item.locale === 'en' && item.route === 'NSK/texts/nsk-003' && !item.markdown.includes('id="three-parties"')) {
            item.markdown = item.markdown.replace(/^(#{1,6} .*three parties.*)$/mi, '<a id="three-parties"></a>\n\n$1');
        }
        item.html = ''; // No second, server-rendered copy of the article body.
    }
    return prepared;
}

/** @param {EditorialItem} item @param {EditorialItem[]} items @param {Fl32_Cms_Back_Publication_Routing} routing @param {string} baseUrl */
export function editorialData(item, items, routing, baseUrl) {
    const locale = item.locale || 'ru';
    /** @param {string} route @param {string} [language] */
    const url = (route, language = locale) => {
        const value = new URL(routing.getUrl({route, locale: language}).replace(/^\/+/, ''), baseUrl);
        value.pathname = `${value.pathname.replace(/\/+$/, '')}/`;
        return value.pathname;
    };
    const section = item.route.split('/')[0];
    const nav = [['NSK/index', 'НСК', 'NSK'], ['it', 'ИТ', 'IT'], ['security', 'ИБ', 'InfoSec'], ['blog', 'Блог', 'Blog']]
        .map(([route, ru, en]) => ({url: url(route), label: locale === 'en' ? en : ru,
            current: (route.startsWith('NSK') ? 'NSK' : route) === section}));
    const map = nav.map((entry, index) => ({...entry, pages: items.filter(other => other.locale === locale &&
        (index === 0 ? other.route.startsWith('NSK/') : other.route === ['NSK', 'it', 'security', 'blog'][index] ||
            other.route.startsWith(`${['NSK', 'it', 'security', 'blog'][index]}/`)))
        .filter(other => other.route !== ['NSK/index', 'it', 'security', 'blog'][index])
        .map(other => ({url: url(other.route), title: other.metadata.title}))}));
    return {navigation: nav, siteMap: map, embeddedMarkdown: item.markdown,
        isHome: item.route === 'index', isNeutral: !item.locale, humanLocale: locale,
        homeUrl: url('index', item.locale || ''),
        sourceLabel: locale === 'en' ? 'Markdown source' : 'Исходный Markdown',
        mapLabel: locale === 'en' ? 'Site map' : 'Карта сайта'};
}
