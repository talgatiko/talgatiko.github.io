import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {readSource} from './translation-stage.mjs';

export const normalize = text => text.replace(/\r\n/g,'\n').trim().normalize('NFC');
const hash = text => createHash('sha256').update(normalize(text)).digest('hex');
const titleKey = title => title.trim().normalize('NFC').toLowerCase();
export function embeddedMarkdown(html) {
    const match=/<textarea\b[^>]*\bid=["']markdown-source["'][^>]*>([\s\S]*?)<\/textarea>/i.exec(html);
    if(!match)throw new Error('Published page has no embedded Markdown; cannot establish article identity');
    return match[1].replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi,(_,entity)=>{
        if(entity.startsWith('#'))return String.fromCodePoint(entity[1].toLowerCase()==='x'?parseInt(entity.slice(2),16):Number(entity.slice(1)));
        return {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}[entity.toLowerCase()];
    });
}
export const articleUrl = (base,locale,route) => new URL((route.startsWith('NSK/')?'NSK/'+locale+'/'+route.slice(4):locale+'/'+route)+'/',base).href;

export async function checkExisting({projectRoot,source,sourceSha,route,locale='ru',base='https://talgatiko.github.io/',fetcher=fetch}) {
    const catalog=[];
    const folder=path.join(projectRoot,'tmpl/web',locale);
    async function walk(dir){for(const e of await fs.readdir(dir,{withFileTypes:true})){
        const file=path.join(dir,e.name);
        if(e.isDirectory())await walk(file);
        else if(e.isFile()&&e.name.endsWith('.md')){
            const item=readSource(await fs.readFile(file,'utf8'));
            catalog.push({...item,route:path.relative(folder,file).replaceAll(path.sep,'/').slice(0,-3)});
        }
    }}
    try{await walk(folder);}catch(e){if(e.code!=='ENOENT')throw e;}
    const request=async url=>{
        const fresh=new URL(url);fresh.searchParams.set('publisher_check',Date.now().toString());url=fresh.href;
        const response=await fetcher(url,{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(15000)});
        if(response.status!==200&&response.status!==404)throw new Error('Publication lookup failed: HTTP '+response.status+' '+url);
        return response;
    };
    const registryResponse=await request(new URL('assets/editorial/pages.json',base).href);
    if(registryResponse.status!==200)throw new Error('Published registry unavailable; duplicate check incomplete');
    const registry=await registryResponse.json();
    const candidates=new Map();
    const qualifies=item=>item.route===route||titleKey(String(item.metadata.title||''))===titleKey(source.metadata.title)||
        item.metadata.source_sha256===sourceSha||item.metadata.approval_sha256===sourceSha||normalize(item.markdown||'')===normalize(source.markdown);
    for(const item of catalog)if(qualifies(item))candidates.set(item.route,{local:item});
    for(const [url,config]of Object.entries(registry)){
        if(config.humanLocale!==locale||config.isNeutral)continue;
        const pathname=new URL(url,base).pathname;
        const itemRoute=pathname.startsWith('/NSK/'+locale+'/')?'NSK/'+pathname.slice(('/NSK/'+locale+'/').length).replace(/\/$/,''):pathname.slice(('/'+locale+'/').length).replace(/\/$/,'');
        const item={route:itemRoute,metadata:config.metadata||{}};
        if(qualifies(item))candidates.set(itemRoute,{...candidates.get(itemRoute),registry:config});
    }
    if(!candidates.size)candidates.set(route,{});
    if(candidates.size>1)throw new Error('ARTICLE_IDENTITY_CONFLICT: multiple existing routes: '+[...candidates.keys()].join(', '));
    const [stableRoute,record]=[...candidates][0];
    const url=articleUrl(base,locale,stableRoute);
    const response=await request(url);
    if(response.status===404){
        if(record.registry)throw new Error('Published registry points to missing page; duplicate check incomplete');
        const localSame=!record.local||normalize(record.local.markdown)===normalize(source.markdown);
        return {status:record.local?(localSame?'staged':'different-version'):'new',route:stableRoute,url,local:!!record.local,live:false,
            ...(record.local&&!localSame?{previous_markdown_sha256:hash(record.local.markdown),approved_markdown_sha256:hash(source.markdown)}:{})};
    }
    const markdown=embeddedMarkdown(await response.text());
    const liveTitle=/^#\s+(.+)$/m.exec(markdown)?.[1]||record.registry?.metadata?.title||'';
    const same=titleKey(liveTitle)===titleKey(source.metadata.title)&&normalize(markdown)===normalize(source.markdown);
    return {status:same?'already-published':'different-version',route:stableRoute,url,local:!!record.local,live:true,
        title:liveTitle,source_sha256:record.registry?.metadata?.source_sha256||null,source_sha256_matches:record.registry?.metadata?.source_sha256===sourceSha,
        previous_markdown_sha256:hash(markdown),approved_markdown_sha256:hash(source.markdown)};
}
