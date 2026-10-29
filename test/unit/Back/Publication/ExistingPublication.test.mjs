import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {stringify} from 'yaml';
import {checkExisting,embeddedMarkdown} from '../../../../scripts/existing-publication.mjs';
import {finalize} from '../../../../scripts/publish-final.mjs';
import {digest} from '../../../../scripts/translation-stage.mjs';

async function fixture(t,{published=null,local=null,liveHash='hash'}={}){
    const projectRoot=await fs.mkdtemp(path.join(os.tmpdir(),'publisher-identity-'));
    t.after(()=>fs.rm(projectRoot,{recursive:true,force:true}));
    await fs.mkdir(path.join(projectRoot,'publication'));await fs.writeFile(path.join(projectRoot,'publication/holds.json'),'[]');
    const source={metadata:{title:'Article',description:'Description',date:'2026-10-29',author:'Author',source:'https://example.org/source',license:null},markdown:'# Article\n\nAuthor text.\n'};
    if(local){await fs.mkdir(path.join(projectRoot,'tmpl/web/ru/blog'),{recursive:true});await fs.writeFile(path.join(projectRoot,'tmpl/web/ru/blog/existing.md'),'---\n'+stringify(source.metadata)+'---\n'+local);}
    const registry=published?{'/ru/blog/existing/':{humanLocale:'ru',metadata:{title:'Article',source_sha256:liveHash}}}:{};
    const fetcher=async url=>{
        const pathname=new URL(url).pathname;
        if(pathname==='/assets/editorial/pages.json')return new Response(JSON.stringify(registry));
        if(published&&pathname==='/ru/blog/existing/')return new Response('<textarea id="markdown-source">'+published+'</textarea>');
        return new Response('Missing',{status:404});
    };
    return {projectRoot,source,sourceSha:'hash',route:'blog/new-slug',fetcher};
}
test('published identical source keeps its existing route without duplicate release',async t=>{
    const f=await fixture(t,{published:'# Article\n\nAuthor text.\n'});
    const result=await checkExisting(f);
    assert.equal(result.status,'already-published');assert.equal(result.route,'blog/existing');assert.equal(result.source_sha256_matches,true);
});
test('a matching source hash never conceals different published content',async t=>{
    const f=await fixture(t,{published:'# Article\n\nDifferent text.\n'});
    const result=await checkExisting(f);assert.equal(result.status,'different-version');assert.equal(result.route,'blog/existing');
    assert.notEqual(result.previous_markdown_sha256,result.approved_markdown_sha256);
});
test('new original needs no existing translation; lookup failures remain explicit',async t=>{
    const f=await fixture(t);assert.equal((await checkExisting(f)).status,'new');
    await assert.rejects(()=>checkExisting({...f,fetcher:async()=>new Response('Error',{status:503})}),/lookup failed/);
    assert.equal(embeddedMarkdown('<textarea id="markdown-source">&amp;lt; &lt;x&gt; &#39;</textarea>'),"&lt; <x> '");
});
test('original inspection allows an unspecified license without choosing one',async t=>{
    const f=await fixture(t);const bytes=Buffer.from(f.source.markdown);
    await fs.writeFile(path.join(f.projectRoot,'source.md'),bytes);
    const file=path.join(f.projectRoot,'approval.json');
    await fs.writeFile(file,JSON.stringify({status:'approved',source_file:'source.md',approved_sha256:digest(bytes),route:f.route,metadata:f.source.metadata}));
    const r=await finalize(file,{projectRoot:f.projectRoot,fetcher:f.fetcher});
    assert.equal(r.existing_status,'new');assert.equal(r.translations_started,false);
    await assert.rejects(()=>finalize(file,{projectRoot:f.projectRoot,fetcher:f.fetcher,execute:true,language:'zh'}),/base language/);
    assert.equal(await fs.stat(path.join(f.projectRoot,'incoming')).then(()=>true,()=>false),false);
});
test('repeating an already published original is a no-op before any translator or build',async t=>{
    const f=await fixture(t,{published:'# Article\n\nAuthor text.\n'});const bytes=Buffer.from(f.source.markdown);
    await fs.writeFile(path.join(f.projectRoot,'source.md'),bytes);
    const file=path.join(f.projectRoot,'approval.json');
    await fs.writeFile(file,JSON.stringify({status:'approved',source_file:'source.md',approved_sha256:digest(bytes),route:f.route,metadata:f.source.metadata}));
    const r=await finalize(file,{projectRoot:f.projectRoot,fetcher:f.fetcher,execute:true,publish:true});
    assert.equal(r.status,'already-published');assert.equal(r.translations_started,false);
    assert.equal(await fs.stat(path.join(f.projectRoot,'incoming')).then(()=>true,()=>false),false);
});
