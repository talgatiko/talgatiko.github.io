import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {stringify} from 'yaml';
import {root,digest,requireApproval,translate,translatedSource,readSource} from './translation-stage.mjs';
import {checkExisting,articleUrl,normalize} from './existing-publication.mjs';

// The original is a complete release. Each optional translation is a separate release.
export async function finalize(manifestFile,{execute=false,publish=false,language=null,projectRoot=root,fetcher=fetch}={}) {
    manifestFile=path.resolve(manifestFile);
    const manifestBytes=await fs.readFile(manifestFile),manifest=JSON.parse(manifestBytes);
    const sourceFile=path.resolve(path.dirname(manifestFile),manifest.source_file);
    const bytes=await fs.readFile(sourceFile);requireApproval(manifest,bytes);
    const plain=bytes.toString('utf8');
    const source=plain.startsWith('---\n')||plain.startsWith('---\r\n')?readSource(plain):{metadata:{...manifest.metadata},markdown:plain};
    const locale=manifest.base_language||'ru';
    if(!['ru','en','zh'].includes(locale))throw new Error('Unsupported base language');
    if(language&&(!['en','zh'].includes(language)||language===locale))throw new Error('Unsupported translation language');
    if(!/^(?:(?:blog|it|security)\/[A-Za-z0-9_-]+|NSK\/texts\/[A-Za-z0-9_-]+)$/.test(manifest.route))throw new Error('Invalid publication route');
    for(const key of ['title','description','date','author','source'])if(typeof source.metadata?.[key]!=='string'||!source.metadata[key])throw new Error('Missing publication metadata: '+key);
    // An unspecified license is omitted, never silently chosen for the author.
    if(source.metadata.license==null)delete source.metadata.license;
    const holds=JSON.parse(await fs.readFile(path.join(projectRoot,'publication/holds.json'),'utf8'));
    if(holds.some(h=>h.status==='paused'&&(h.source_basename===path.basename(sourceFile)||h.title===source.metadata.title))&&manifest.explicit_resume_approved!==true)throw new Error('PUBLICATION_PAUSED: explicit author resume approval required');
    const assertApproved=async()=>{
        const current=await fs.readFile(manifestFile);requireApproval(JSON.parse(current),await fs.readFile(sourceFile));
        if(digest(current)!==digest(manifestBytes))throw new Error('Approval manifest changed during release');
    };
    const base=manifest.site_base||'https://talgatiko.github.io/';
    const lookup=await checkExisting({projectRoot,source,sourceSha:digest(bytes),route:manifest.route,locale,base,fetcher});
    const result={...lookup,source_sha256:digest(bytes),base_language:locale,translations_started:false};
    const report=value=>{console.log(JSON.stringify(value));return value;};
    if(lookup.status==='already-published'&&!language)return report(result);
    if(lookup.status==='different-version'&&manifest.replace_existing!==true)throw new Error('EXISTING_VERSION_DIFFERS: preserve route '+lookup.route+'; explicit replacement approval required; '+JSON.stringify(lookup));
    if(!execute&&!publish)return report({...result,status:'approved-final-source',existing_status:lookup.status});
    if(language&&lookup.status!=='already-published')throw new Error('Publish and verify the base language before releasing a translation');
    const targetLocale=language||locale,route=lookup.route;
    const relativePath=`tmpl/web/${targetLocale}/${route}.md`;
    const gitArgs=['-c',`safe.directory=${projectRoot}`];
    if(manifest.git_identity?.name&&manifest.git_identity?.email)gitArgs.push('-c','user.name='+manifest.git_identity.name,'-c','user.email='+manifest.git_identity.email);
    const git=(args,stdio='pipe')=>spawnSync('git',[...gitArgs,...args],{cwd:projectRoot,encoding:'utf8',stdio,windowsHide:true});
    const assertGitScope=()=>{
        for(const args of [['diff','--name-only'],['diff','--cached','--name-only']]){
            const r=git(args);if(r.status!==0)throw new Error('Git preflight failed');
            const other=r.stdout.trim().split(/\r?\n/).filter(Boolean).filter(p=>p!==relativePath);
            if(other.length)throw new Error('Unrelated tracked/staged changes: '+other.join(', '));
        }
    };
    if(publish){
        if(git(['rev-parse','--verify','HEAD']).status!==0||git(['var','GIT_AUTHOR_IDENT']).status!==0)throw new Error('Git HEAD or identity unavailable');
        assertGitScope();
    }
    const stage=path.join(projectRoot,'incoming/final-translations',route.replaceAll('/','_'),digest(bytes));
    await fs.mkdir(stage,{recursive:true});await fs.writeFile(path.join(stage,'source.original.md'),bytes);
    const metadata={...source.metadata,source_sha256:digest(bytes),approval_sha256:manifest.approved_sha256};
    let text='---\n'+stringify(metadata)+'---\n'+source.markdown,translationRecord=null;
    if(language){
        await assertApproved();
        translationRecord=await translate(source,language,path.join(stage,language));
        const translated={metadata:{...metadata,title:translationRecord.translation.title},markdown:translationRecord.translation.markdown};
        const targetLookup=await checkExisting({projectRoot,source:translated,sourceSha:digest(bytes),route,locale:language,base,fetcher});
        if(targetLookup.route!==route)throw new Error('Translation route conflicts with original');
        if(targetLookup.status==='already-published')return report({...targetLookup,translations_started:true});
        if(targetLookup.status==='different-version'&&manifest.replace_existing!==true)throw new Error('EXISTING_TRANSLATION_DIFFERS: explicit replacement approval required');
        text=translatedSource({...source,metadata},translationRecord,language,digest(bytes));
    }
    await assertApproved();
    const target=path.join(projectRoot,relativePath);
    try{
        const current=readSource(await fs.readFile(target,'utf8'));
        const next=readSource(text);
        if(normalize(current.markdown)!==normalize(next.markdown)&&manifest.replace_existing!==true)throw new Error('Local article differs; explicit replacement approval required');
    }catch(e){if(e.code!=='ENOENT')throw e;}
    await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,text);
    const env={...process.env,TEQ_CMS__STATIC_BASE_URL:base,TEQFW_TMPL__ALLOWED_LOCALES:'en,ru',TEQFW_TMPL__DEFAULT_LOCALE:'en',TEQFW_TMPL__ENGINE:'nunjucks'};
    if(language==='zh'||locale==='zh')env.TEQFW_TMPL__ALLOWED_LOCALES='en,ru,zh';
    const build=spawnSync(process.execPath,['--experimental-loader','./scripts/windows-drive-loader.mjs','./node_modules/@teqfw/cli/bin/teq.mjs','cms:export'],{cwd:projectRoot,env,stdio:'inherit',windowsHide:true});
    if(build.status!==0)throw new Error('Static export failed; no push performed');
    const page=await fs.readFile(path.join(projectRoot,'dist',new URL(articleUrl(base,targetLocale,route)).pathname,'index.html'),'utf8');
    if(!page.includes('id="markdown-source"'))throw new Error('Article export missing');
    await assertApproved();
    if(publish){
        assertGitScope();
        const latest=await checkExisting({projectRoot,source:language?{metadata:{...metadata,title:translationRecord.translation.title},markdown:translationRecord.translation.markdown}:source,sourceSha:digest(bytes),route,locale:targetLocale,base,fetcher});
        if(latest.status==='already-published')return report(latest);
        if(latest.status==='different-version'&&manifest.replace_existing!==true)throw new Error('Live version changed during release; explicit replacement approval required');
        for(const args of [['add','--',relativePath],['commit','-m','Publish '+targetLocale+' article: '+source.metadata.title],['push','origin','main']])if(git(args,'inherit').status!==0)throw new Error('Git publication failed: '+args[0]);
    }
    const release={status:publish?'pushed-awaiting-pages-verification':'release-built-not-published',url:articleUrl(base,targetLocale,route),route,locale:targetLocale,source_sha256:digest(bytes),translations_started:!!language,translations_pending:language?[]:['en','zh'],engine:translationRecord?.engine||null};
    await fs.writeFile(path.join(stage,'release-'+targetLocale+'.json'),JSON.stringify(release,null,2));return report(release);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
    const args=process.argv.slice(2),i=args.indexOf('--manifest'),l=args.indexOf('--language');
    if(i<0)throw new Error('Usage: --manifest APPROVAL.json [--finalize|--publish] [--language en|zh]');
    await finalize(args[i+1],{execute:args.includes('--finalize'),publish:args.includes('--publish'),language:l<0?null:args[l+1]});
}
