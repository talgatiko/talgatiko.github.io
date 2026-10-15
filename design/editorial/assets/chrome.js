/* Shared literary layout. Page-specific settings contain metadata, never article text. */
window.talgaticusChrome = async (assets, input) => {
    const response = await fetch(new URL('pages.json', assets));
    if (!response.ok) throw new Error('Page settings unavailable');
    const settings = (await response.json())[location.pathname];
    if (!settings) throw new Error('Unknown publication address');
    const {metadata: m, humanLocale: lang} = settings;
    const en = lang === 'en';
    const e = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
    const a = (url, label, extra = '') => `<a href="${e(url)}"${extra}>${e(label)}</a>`;
    document.documentElement.lang = lang;
    document.title = m.title;
    for (const [name, content] of [['viewport', 'width=device-width, initial-scale=1'], ['description', m.description], ['color-scheme', 'dark']]) {
        const meta = document.createElement('meta'); meta.name = name; meta.content = content || ''; document.head.append(meta);
    }
    const canonical = document.createElement('link'); canonical.rel = 'canonical'; canonical.href = settings.canonicalUrl; document.head.append(canonical);
    for (const other of settings.alternateLanguages) {
        const link = document.createElement('link'); link.rel = 'alternate'; link.hreflang = other.language;
        link.href = new URL(other.url, settings.canonicalUrl).href; document.head.append(link);
    }
    document.body.className = settings.isHome ? 'home' : 'page';
    document.body.insertAdjacentHTML('afterbegin', `<a class="skip" href="#reader">${en ? 'Skip to content' : 'К тексту'}</a>
      <header class="masthead"><div class="edition-line"><span>TALGATICUS</span><span>${settings.isNeutral ? 'Русский · English' : en ? 'Essays and projects' : 'Статьи и проекты'}</span></div>
      ${a(settings.homeUrl, en ? 'TALGATICUS' : 'ТАЛГАТИКУС', ' class="wordmark"')}
      <nav aria-label="${en ? 'Sections' : 'Разделы'}">${settings.navigation.map(n => a(n.url, n.label, n.current ? ' aria-current="page"' : '')).join('')}</nav>
      <div class="languages" aria-label="${en ? 'Language' : 'Язык'}">${settings.alternateLanguages.map(o => a(o.url, o.language.toUpperCase(), ` lang="${e(o.language)}" hreflang="${e(o.language)}"${o.language === lang ? ' aria-current="page"' : ''}`)).join('')}</div></header>
      <main id="reader" class="reader"></main>`);
    input.readOnly = true; input.setAttribute('aria-label', settings.sourceLabel);
    document.getElementById('reader').append(input);
    const fields = [['author', en ? 'Author' : 'Автор'], ['date', en ? 'Date in source record' : 'Дата в записи источника'], ['source', en ? 'Source' : 'Источник'], ['source_sha256', 'SHA-256'], ['license', en ? 'License' : 'Лицензия']];
    const record = fields.filter(([key]) => m[key]).map(([key, label]) => `<dt>${e(label)}</dt><dd>${key === 'source' ? a(m[key], m[key]) : e(m[key])}</dd>`).join('');
    document.body.insertAdjacentHTML('beforeend', `<section class="reading-end"><details id="source-details"><summary>${e(settings.sourceLabel)}</summary></details>
      ${record ? `<details class="publication-record"><summary>${en ? 'Publication record' : 'Сведения о публикации'}</summary><dl>${record}</dl></details>` : ''}</section>
      <footer class="site-map"><div class="footer-label">${e(settings.mapLabel)}</div><div class="map-columns">${settings.siteMap.map(g => `<section><h2>${a(g.url, g.label)}</h2><ul>${g.pages.map(p => `<li>${a(p.url, p.title)}</li>`).join('')}</ul></section>`).join('')}</div>
      <div class="footer-bottom"><span>TALGATICUS / ТАЛГАТИКУС</span>${a('https://github.com/talgatiko', 'GitHub')}</div></footer>`);
};
