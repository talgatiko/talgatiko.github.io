import assert from 'node:assert/strict';
import test from 'node:test';
import Config from '../../../../src/Back/Config.mjs';
import Catalog from '../../../../src/Back/Publication/Catalog.mjs';
import Generator from '../../../../src/Back/Discovery/Generator.mjs';

const makeResource = ({route, locale, representation, url, title, indexable = true}) => ({
    item: {route, locale, metadata: {title, indexable}},
    representation,
    url,
});

test('sitemap includes both representations by default', () => {
    const config = new Config({
        cast: {string: value => value, bool: value => value},
        reader: {get: () => ({})},
        tmplConfig: {getAvailableLocales: () => ['ru', 'en']},
    });
    assert.equal(config.getSitemapRepresentations(), 'both');
});

test('catalog lists explicit locale Markdown and the public neutral alias', async () => {
    const makeItem = locale => ({
        locale,
        route: 'security/ib-001',
        family: {presentation: 'publication.html'},
        metadata: {title: locale === 'ru' ? 'Статья' : 'Article', indexable: true},
    });
    const routing = {
        isSite: () => true,
        getMarkdownUrl: ({route, locale}) => locale ? `/${locale}/${route}.md` : `/${route}.md`,
        getUrl: ({route, locale}) => `/${locale}/${route}`,
    };
    const catalog = new Catalog({
        fs: {},
        path: {resolve: (...parts) => parts.join('/')},
        tmplConfig: {getRootPath: () => '.', getAvailableLocales: () => ['en', 'ru']},
        routing,
        source: {},
        dtoTarget: {},
        load: {},
    });
    catalog.list = async ({locale}) => [makeItem(locale)];
    catalog.listNeutral = async () => [makeItem('en')];
    catalog.getPresentation = async () => ({});

    const urls = (await catalog.listRepresentations()).map(resource => resource.url);
    assert.deepEqual(urls.filter(url => url.endsWith('.md')), [
        '/en/security/ib-001.md',
        '/ru/security/ib-001.md',
        '/security/ib-001.md',
    ]);
});

test('discovery lists every published representation and groups Markdown before HTML', async () => {
    const generator = new Generator({
        config: {
            getBaseUrl: () => 'https://talgatiko.github.io/',
            getSitemapRepresentations: () => 'both',
        },
        catalog: {
            listRepresentations: async () => [
                makeResource({route: 'index', locale: '', representation: 'html',
                    url: '/', title: 'TALGATICUS'}),
                makeResource({route: 'index', locale: '', representation: 'markdown',
                    url: '/index.md', title: 'TALGATICUS'}),
                makeResource({route: 'index', locale: '', representation: 'html',
                    url: '/en/index', title: 'TALGATICUS'}),
                makeResource({route: 'index', locale: 'en', representation: 'markdown',
                    url: '/en/index.md', title: 'TALGATICUS'}),
                makeResource({route: 'ib-001', locale: '', representation: 'html',
                    url: '/en/security/ib-001', title: 'English article'}),
                makeResource({route: 'ib-001', locale: 'en', representation: 'markdown',
                    url: '/en/security/ib-001.md', title: 'English article'}),
                makeResource({route: 'ib-001', locale: 'en', representation: 'markdown',
                    url: '/security/ib-001.md', title: 'English article'}),
                makeResource({route: 'ib-001', locale: 'ru', representation: 'html',
                    url: '/ru/security/ib-001', title: 'Русская статья'}),
                makeResource({route: 'ib-001', locale: 'ru', representation: 'markdown',
                    url: '/ru/security/ib-001.md', title: 'Русская статья'}),
                makeResource({route: 'draft', locale: 'ru', representation: 'markdown',
                    url: '/ru/security/draft.md', title: 'Draft', indexable: false}),
            ],
        },
        tmplConfig: {getAvailableLocales: () => ['ru', 'en']},
        fs: {},
        path: {},
    });

    const files = await generator.build({baseUrl: 'https://talgatiko.github.io/', staticHtmlUrls: true});
    const sitemap = [...files.sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(match => match[1]);
    assert.deepEqual(sitemap, [
        'https://talgatiko.github.io/index.md',
        'https://talgatiko.github.io/',
        'https://talgatiko.github.io/en/index.md',
        'https://talgatiko.github.io/en/',
        'https://talgatiko.github.io/en/security/ib-001.md',
        'https://talgatiko.github.io/en/security/ib-001/',
        'https://talgatiko.github.io/security/ib-001.md',
        'https://talgatiko.github.io/ru/security/ib-001.md',
        'https://talgatiko.github.io/ru/security/ib-001/',
    ].sort());
    assert.match(files.llms, /## ib-001\n- RU Markdown: Русская статья — https:\/\/talgatiko\.github\.io\/ru\/security\/ib-001\.md\n- RU HTML: Русская статья — https:\/\/talgatiko\.github\.io\/ru\/security\/ib-001\//);
    assert.match(files.llms, /- EN Markdown: English article[\s\S]*- EN HTML: English article/);
    assert.match(files.llms, /- EN Markdown: English article — https:\/\/talgatiko\.github\.io\/en\/security\/ib-001\.md/);
    assert.match(files.llms, /- EN Markdown: English article — https:\/\/talgatiko\.github\.io\/security\/ib-001\.md/);
    assert.match(files.llms, /## index\n- Site Markdown: TALGATICUS — https:\/\/talgatiko\.github\.io\/index\.md\n- Site HTML: TALGATICUS — https:\/\/talgatiko\.github\.io\//);
    assert.match(files.llms, /- EN Markdown: TALGATICUS — https:\/\/talgatiko\.github\.io\/en\/index\.md\n- EN HTML: TALGATICUS — https:\/\/talgatiko\.github\.io\/en\//);
    assert.doesNotMatch(files.llms, /Draft/);
    assert.match(files.robots, /Allow: \/\nSitemap: https:\/\/talgatiko\.github\.io\/sitemap\.xml/);
});
