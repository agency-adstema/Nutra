#!/usr/bin/env node
/**
 * Make missing JPEG posters for all R2 videos described in spisak_videa.csv.
 *
 * Run once after: npx wrangler login
 *   node scripts/make-posters.mjs
 * Check work without publishing:
 *   node scripts/make-posters.mjs --dry-run
 *
 * No posters or MP4s are saved in the repository. Temp JPGs are deleted.
 * The public bucket prefix comes from src/config/video.json.
 */
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const cfg = JSON.parse(await readFile(new URL('../src/config/video.json', import.meta.url), 'utf8'));
const BASE = cfg.videoBaseUrl.replace(/\/$/, '');
const BUCKET = cfg.bucket;
const PREFIX = cfg.objectPrefix;
const csvUrl = `${BASE}/spisak_videa.csv`;
const dryRun = process.argv.includes('--dry-run');

function r2Url(path) {
  const parts = path.replace(/\\/g, '/').split('/');
  if (parts.some(p => !p || p === '.' || p === '..')) throw new Error('Unsafe R2 key '+path);
  return BASE + '/' + parts.map(encodeURIComponent).join('/');
}

function parseDelimited(text) {
  // UTF-8 BOM, ; delimiter, newline-in-quotes and escaped double quotes.
  text = text.replace(/^\uFEFF/, '');
  let rows=[],row=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c==='"'){
      if(quoted && text[i+1]==='"'){cell+='"';i++;}
      else quoted=!quoted;
    } else if(c===';' && !quoted){row.push(cell);cell='';}
    else if(!quoted && (c==='\r'||c==='\n')){
      if(c==='\r'&&text[i+1]==='\n')i++;
      row.push(cell);cell='';
      if(row.some(s=>s.trim()))rows.push(row);
      row=[];
    } else cell+=c;
  }
  if(quoted)throw new Error('CSV has unterminated quoted field');
  if(cell||row.length){row.push(cell);rows.push(row)}
  return rows;
}

async function status(url) {
  const response=await fetch(url,{method:'HEAD',signal:AbortSignal.timeout(15000)});
  return response.status;
}

function executable(name,argv,{allowFailure=false,shell=false}={}){
  const run=spawnSync(name,argv,{encoding:'utf8',stdio:'pipe',maxBuffer:4*1024*1024,shell});
  if(run.error || run.status!==0){
    const message=(run.error?.message || run.stderr || run.stdout || '').trim().slice(-1200);
    if(!allowFailure) throw new Error(`${name} exited ${run.status}: ${message}`);
    return {ok:false,message};
  }
  return {ok:true,message:(run.stdout||'').slice(-400)};
}

const csvResponse=await fetch(csvUrl,{signal:AbortSignal.timeout(30000)});
if(!csvResponse.ok)throw new Error('Failed to download R2 CSV: '+csvResponse.status+' '+csvUrl);
const table=parseDelimited(await csvResponse.text());
const headers=table.shift()?.map(s=>s.trim().toLowerCase());
if(headers?.join(';')!=='proizvod;fajl;datum;instagram_link;opis'){
  throw new Error('Unexpected CSV header: '+JSON.stringify(headers));
}

const temp=await mkdtemp(join(tmpdir(),'zdravica-r2-posters-'));
const records={uploaded:[],existing:[],missingVideos:[],errors:[],pending:[]};
try {
  executable('ffmpeg',['-version']);
  const seen=new Set();
  for(let i=0;i<table.length;i++){
    const [product,fileRaw] = table[i];
    const file=(fileRaw||'').trim().replace(/\\/g,'/');
    if(!/^[^/]+\/[A-Za-z0-9_. -]+\.mp4$/i.test(file) || file.includes('..')){
      records.errors.push({file,reason:'Invalid file path'});continue;
    }
    if(seen.has(file))continue;
    seen.add(file);
    const posterPath=file.replace(/\.mp4$/i,'.jpg');
    const posterUrl=r2Url(posterPath);
    const videoUrl=r2Url(file);
    let posterStatus,videoStatus;
    try { posterStatus=await status(posterUrl); }
    catch(e){records.errors.push({file,reason:'Poster HEAD failed: '+e.message});continue;}
    if(posterStatus===200){records.existing.push(posterPath);continue;}
    if(posterStatus!==404){
      records.errors.push({file,reason:'Poster HEAD returned HTTP '+posterStatus});continue;
    }
    try { videoStatus=await status(videoUrl); }
    catch(e){records.errors.push({file,reason:'Video HEAD failed: '+e.message});continue;}
    if(videoStatus===404){records.missingVideos.push(file);continue;}
    if(videoStatus!==200 && videoStatus!==206){
      records.errors.push({file,reason:'Video HEAD returned HTTP '+videoStatus});continue;
    }
    if(dryRun){records.pending.push(posterPath);continue;}
    const out=join(temp,`video-${i+1}.jpg`);
    const frame=executable('ffmpeg',[
      '-hide_banner','-loglevel','error','-y',
      '-ss','1','-i',videoUrl,'-frames:v','1',
      '-vf','scale=480:-2','-q:v','4',out
    ],{allowFailure:true});
    if(!frame.ok){records.errors.push({file,reason:'ffmpeg: '+frame.message});continue;}
    // Exact R2 key, with literal spaces (not %20), under the chosen bucket.
    const objectKey=`${BUCKET}/${PREFIX}/${posterPath}`;
    const upload=executable('npx',['wrangler','r2','object','put',objectKey,
      '--file',out,'--content-type=image/jpeg',
      '--cache-control=public, max-age=31536000, immutable','--remote'
    ],{allowFailure:true,shell:process.platform==='win32'});
    if(!upload.ok){records.errors.push({file,reason:'Wrangler: '+upload.message});continue;}
    records.uploaded.push(posterPath);
    console.log(`[UPLOADED] ${posterPath}`);
  }
} finally {
  await rm(temp,{recursive:true,force:true});
}
console.log('\n===== ZDRAVICA R2 POSTER REPORT =====');
console.log(JSON.stringify({
  csvRows:table.length,
  posterAlreadyExists:records.existing.length,
  uploaded:records.uploaded.length,
  missingVideoCount:records.missingVideos.length,
  errorsCount:records.errors.length,
  ...(dryRun?{wouldUpload:records.pending.length}:{}),
  missingVideos:records.missingVideos,
  errors:records.errors,
},null,2));
process.exitCode=records.errors.length?1:0;
