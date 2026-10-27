import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');const dist=path.join(root,'dist');
const routeConfig=JSON.parse(fs.readFileSync(path.join(root,'vercel.json'),'utf8'));
const redirects=new Set([...(routeConfig.redirects||[]),...(routeConfig.rewrites||[])].map(r=>r.source));
const files=fs.readdirSync(dist).filter(n=>n.endsWith('.html'));let checked=0;
for(const name of files){
 const html=fs.readFileSync(path.join(dist,name),'utf8');
 if(!html.includes('lang="ar" dir="rtl"')||!html.includes('name="viewport"')||!html.includes('data-title-en='))throw new Error('Missing language/mobile metadata: '+name);
 if(/<script(?![^>]*\bsrc=)[^>]*>\s*\S/.test(html))throw new Error('Unexpected inline executable script: '+name);
 if(/YOUR_USERNAME|YOUR-PROJECT|lorem ipsum|TODO|placehold\.co/i.test(html))throw new Error('Unfinished placeholder: '+name);
 if(/github/i.test(html))throw new Error('Unbranded public HTML: '+name);
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);if(new Set(ids).size!==ids.length)throw new Error('Duplicate element id: '+name);
 for(const m of html.matchAll(/\b(?:href|src)="([^"]+)"/g)){
  const url=m[1];if(/^(?:https?:|mailto:|data:|javascript:)/.test(url))continue;
  if(redirects.has(url)){checked++;continue;}
  const [raw,anchor]=url.split('#');const target=path.join(dist,raw||name);
  if(raw&&!fs.existsSync(target))throw new Error(`Missing local target ${name}: ${url}`);
  if(anchor&&(!raw||raw.endsWith('.html'))){const content=fs.readFileSync(target,'utf8');if(!content.includes('id="'+anchor+'"'))throw new Error(`Missing anchor ${name}: ${url}`);}
  checked++;
 }
}
const config=JSON.parse(fs.readFileSync(path.join(root,'site.config.json'),'utf8'));
if(!fs.existsSync(path.join(dist,'assets/share-card.png')))throw new Error('Missing social sharing artwork');
if(config.github.owner!=='Mohamedkh9')throw new Error('Unexpected GitHub account');
if(config.developer.email!=='mohamedkhalida999@gmail.com')throw new Error('Unexpected contact');
if(!config.updates.enabled&&fs.existsSync(path.join(dist,'updates/latest.json')))throw new Error('An inactive channel must not publish a live manifest');
for(const type of ['images','pdf','dubbing','settings'])for(const lang of ['ar','en'])if(!fs.existsSync(path.join(dist,'assets/screens',`${type}-${lang}.png`)))throw new Error('Missing actual product screenshot');
console.log(`PASS ${files.length} pages, ${checked} local links/assets, bilingual metadata, known publisher, screenshot sets and update-channel gate.`);
