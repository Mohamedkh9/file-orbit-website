import {createPublicKey,verify} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dist=path.join(root,'dist');
const config=JSON.parse(fs.readFileSync(path.join(root,'site.config.json'),'utf8'));
const required=['index','guide','releases','privacy','terms','support','404'];
const legalName=/^[A-Za-z0-9_.-]+$/;
if(!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(config.github.owner)||!legalName.test(config.github.releasesRepo))throw new Error('Invalid GitHub account or release repository');
if(!/^\d+\.\d+(?:\.\d+){0,2}$/.test(config.release.version)||!legalName.test(config.release.tag))throw new Error('Invalid release version/tag');
for(const key of ['installer','runtime','checksums'])if(!legalName.test(config.release[key]))throw new Error('Invalid release asset filename');
const production=process.env.VERCEL_PROJECT_PRODUCTION_URL||'';
let origin=(config.siteOrigin|| (production?'https://'+production:'')).replace(/\/$/,'');
if(origin){const u=new URL(origin);if(u.protocol!=='https:'||u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw new Error('Site origin must be a bare HTTPS origin');origin=u.origin;}
const downloads={installer:'/download/windows',runtime:'/download/runtime',checksums:'/download/checksums'};
const routes=JSON.parse(fs.readFileSync(path.join(root,'vercel.json'),'utf8')).redirects||[];
for(const [key,source]of Object.entries(downloads)){
 const destination=`https://github.com/${config.github.owner}/${config.github.releasesRepo}/releases/download/${config.release.tag}/${config.release[key]}`;
 if(!routes.some(r=>r.source===source&&r.destination===destination&&r.permanent===false))throw new Error('Update vercel.json download redirect for '+key+' before publishing this release');
}
const {github,...publicConfig}=config;
fs.writeFileSync(path.join(dist,'assets/site-config.js'),'window.FILE_ORBIT_SITE = '+JSON.stringify({...publicConfig,downloads,siteOrigin:origin},null,2)+';\n');
const icons=JSON.parse(fs.readFileSync(path.join(dist,'assets/icons.json'),'utf8'));
fs.writeFileSync(path.join(dist,'assets/icons.js'),'window.FILE_ORBIT_ICONS = '+JSON.stringify(icons)+';\n');
for(const page of required){
 const file=path.join(dist,page+'.html');let html=fs.readFileSync(file,'utf8');
 if(!html.includes('assets/icons.js'))html=html.replace('<script defer src="assets/app.js">','<script defer src="assets/icons.js"></script><script defer src="assets/app.js">');
 if(page==='404'&&!html.includes('<base '))html=html.replace('<head>','<head><base href="/">');
 html=html.replace(/<link rel="canonical"[^>]*>/g,'').replace(/<meta property="og:url"[^>]*>/g,'').replace(/<link rel="alternate" hreflang="[^>]*>/g,'');
 html=html.replace(/(<meta property="og:image" content=")[^"]*(")/,`$1${origin}/assets/share-card.png$2`);
 if(origin&&page!=='404'){const url=origin+(page==='index'?'/':'/'+page);html=html.replace('</head>',`<link rel="canonical" href="${url}"><meta property="og:url" content="${url}"><link rel="alternate" hreflang="ar" href="${url}?lang=ar"><link rel="alternate" hreflang="en" href="${url}?lang=en"></head>`);html=html.replace(/(<meta property="og:image" content=")[^"]*(")/,`$1${origin}/assets/share-card.png$2`);}
 fs.writeFileSync(file,html);
}
const feed=path.join(dist,'updates/latest.json');
if(config.updates.enabled){
 if(config.updates.mode!=='publisher-key'&&(config.release.signatureStatus!=='signed'||!/^[A-Fa-f0-9]{64}$/.test(config.updates.publisherCertificateSha256)))throw new Error('Automatic feed requires a verified publisher identity');
 if(config.updates.signedManifestFile!=='release/signed-manifest.json')throw new Error('Use release/signed-manifest.json produced by the signing workflow');
 const envelope=JSON.parse(fs.readFileSync(path.join(root,config.updates.signedManifestFile),'utf8'));
 let manifest=envelope;
 if(config.updates.mode==='publisher-key'){
  if(config.updates.publicKeyFile!=='release/update-public-key.xml'||envelope.Format!=='FileOrbit.Update.v1')throw new Error('Invalid publisher-key update format');
  const xml=fs.readFileSync(path.join(root,config.updates.publicKeyFile),'utf8');
  const part=tag=>Buffer.from(xml.match(new RegExp('<'+tag+'>([^<]+)</'+tag+'>'))?.[1]||'','base64');
  if(part('Modulus').length<384)throw new Error('Update key must be RSA-3072 or stronger');
  const key=createPublicKey({key:{kty:'RSA',n:part('Modulus').toString('base64url'),e:part('Exponent').toString('base64url')},format:'jwk'});
  const bytes=Buffer.from(envelope.Payload||'','base64');
  if(!verify('RSA-SHA256',bytes,key,Buffer.from(envelope.Signature||'','base64')))throw new Error('Invalid update signature');
  manifest=JSON.parse(bytes.toString('utf8'));if(manifest.Product!=='File Orbit')throw new Error('Update product mismatch');
 }
 const expected=`https://github.com/${config.github.owner}/${config.github.releasesRepo}/releases/download/${config.release.tag}/${config.release.installer}`;
 if(manifest.Version!==config.release.version||manifest.InstallerUrl!==expected||!/^[A-Fa-f0-9]{64}$/.test(manifest.Sha256))throw new Error('Signed manifest does not match the configured release');
 fs.writeFileSync(feed,JSON.stringify(envelope,null,2)+'\n');
}else if(fs.existsSync(feed))fs.unlinkSync(feed);
fs.writeFileSync(path.join(dist,'robots.txt'),'User-agent: *\nAllow: /\n'+(origin?'Sitemap: '+origin+'/sitemap.xml\n':''));
const sitemap=path.join(dist,'sitemap.xml');if(origin)fs.writeFileSync(sitemap,'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+required.filter(p=>p!=='404').map(p=>'<url><loc>'+origin+(p==='index'?'/':'/'+p)+'</loc></url>').join('')+'</urlset>\n');else if(fs.existsSync(sitemap))fs.unlinkSync(sitemap);
console.log('Built File Orbit website: '+required.length+' bilingual pages. Public update feed: '+(config.updates.enabled?'enabled':'not enabled')+'.');
await import('./check.mjs');
