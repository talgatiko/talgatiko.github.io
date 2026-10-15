/* Trusted author content. Local TeXMe, Marked and Mermaid; no external requests. */
(async () => {
    const assets = new URL('.', document.currentScript.src);
    const input = document.getElementById('markdown-source');
    if (!input) return;
    if (!document.getElementById('reader')) {
        const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = new URL('site.css', assets).href; document.head.append(css);
        try {
            await new Promise((resolve, reject) => {
                const script = document.createElement('script'); script.src = new URL('chrome.js', assets).href;
                script.onload = resolve; script.onerror = reject; document.head.append(script);
            });
            await window.talgaticusChrome(assets, input);
        } catch (error) {
            input.readOnly = true;
            document.documentElement.dataset.rendered = 'failed';
            console.error('Source retained; layout unavailable', error);
            return;
        }
    }
    const reader = document.getElementById('reader');
    if (!input || !reader) return;
    const source = input.value;
    const english = document.documentElement.lang === 'en';
    const load = name => new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = new URL(name, assets).href;
        script.onload = resolve;
        script.onerror = reject;
        document.head.append(script);
    });
    async function start() {
        const markdownURL = new URL('vendor/marked.js', assets).href;
        window.texme = {renderOnLoad: false, style: 'none', useMathJax: false, protectMath: false, markdownURL};
        // TeXMe initializes its parser by loading Marked. Explicit load events
        // avoid renderPage/window.load ordering differences in deferred scripts.
        const ready = new Promise((resolve, reject) => {
            const observer = new MutationObserver(records => {
                for (const record of records) for (const node of record.addedNodes) {
                    if (node.tagName === 'SCRIPT' && node.src === markdownURL) {
                        node.addEventListener('load', () => {observer.disconnect(); resolve();});
                        node.addEventListener('error', () => {observer.disconnect(); reject(new Error('Markdown parser unavailable'));});
                    }
                }
            });
            observer.observe(document.head, {childList: true});
        });
        await load('vendor/texme.js');
        await ready;
        // TeXMe.render keeps the surrounding publication chrome in place.
        reader.innerHTML = window.texme.render(source);
        document.getElementById('source-details').append(input);
        document.documentElement.dataset.rendered = 'true';
        const used = new Set([...document.querySelectorAll('[id]')].map(element => element.id));
        for (const heading of reader.querySelectorAll('h1,h2,h3,h4,h5,h6')) {
            if (heading.id) continue;
            const base = heading.textContent.trim().toLowerCase().replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-|-$/g, '') || 'section';
            let id = base, n = 2;
            while (used.has(id)) id = `${base}-${n++}`;
            heading.id = id;
            used.add(id);
        }
        for (const table of reader.querySelectorAll('table')) {
            const wrap = document.createElement('div');
            wrap.className = 'table-scroll'; wrap.tabIndex = 0;
            wrap.setAttribute('role', 'region'); wrap.setAttribute('aria-label', english ? 'Scrollable table' : 'Прокручиваемая таблица');
            table.before(wrap); wrap.append(table);
        }
        if (location.hash) document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
        const blocks = [...reader.querySelectorAll('pre>code.language-mermaid')];
        if (!blocks.length) {document.documentElement.dataset.diagrams = 'none'; return;}
        await load('vendor/mermaid.js');
        window.mermaid.initialize({startOnLoad: false, securityLevel: 'strict', theme: 'dark'});
        for (const [i, block] of blocks.entries()) {
            try {
                const {svg} = await window.mermaid.render(`diagram-${i}`, block.textContent);
                const figure = document.createElement('figure'); figure.className = 'diagram';
                const wrap = document.createElement('div'); wrap.className = 'diagram-scroll';
                wrap.setAttribute('role', 'img'); wrap.setAttribute('aria-label', english ? 'Request processing flow' : 'Схема обработки запроса');
                wrap.innerHTML = svg; figure.append(wrap); block.parentElement.replaceWith(figure);
            } catch (error) {
                document.getElementById(`ddiagram-${i}`)?.remove();
                document.documentElement.dataset.diagramErrors = 'true';
                console.warn('Mermaid source retained', error);
            }
        }
        document.documentElement.dataset.diagrams = document.documentElement.dataset.diagramErrors ? 'partial' : 'ready';
    }
    start().catch(error => {
        if (!document.getElementById('markdown-source')) reader.append(input);
        const notice = document.createElement('p'); notice.className = 'page-notice'; notice.setAttribute('role', 'alert');
        notice.textContent = english ? 'Rendering failed. The Markdown source remains available.' : 'Оформление не загрузилось. Исходный Markdown доступен.';
        reader.before(notice); document.documentElement.dataset.rendered = 'failed'; console.error(error);
    });
})();
