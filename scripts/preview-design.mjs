import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export function previewServer(root) {
    root = path.resolve(root);
    const types = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
        '.jpg': 'image/jpeg', '.webp': 'image/webp', '.xml': 'application/xml; charset=utf-8'};
    return http.createServer(async (req, res) => {
        try {
            const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
            let file = path.resolve(root, `.${pathname}`);
            if (file !== root && !file.startsWith(root + path.sep)) {res.writeHead(403).end(); return;}
            if ((await fs.stat(file)).isDirectory()) {
                if (!pathname.endsWith('/')) {res.writeHead(302, {Location: pathname + '/'}).end(); return;}
                file = path.join(file, 'index.html');
            }
            res.writeHead(200, {'Content-Type': types[path.extname(file)] || 'text/plain; charset=utf-8'});
            res.end(await fs.readFile(file));
        } catch {res.writeHead(404).end('Not found');}
    });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const root = fileURLToPath(new URL('../design-preview/', import.meta.url));
    previewServer(root).listen(8767, '127.0.0.1', () => console.log('Design preview: http://127.0.0.1:8767/'));
}
