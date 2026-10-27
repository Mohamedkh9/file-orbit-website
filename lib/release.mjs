import fs from 'node:fs';
import {createPublicKey,verify} from 'node:crypto';
const config=JSON.parse(fs.readFileSync(new URL('../site.config.json',import.meta.url),'utf8'));
const xml=fs.readFileSync(new URL('../release/update-public-key.xml',import.meta.url),'utf8');
const part=tag=>Buffer.from(xml.match(new RegExp('<'+tag+'>([^<]+)</'+tag+'>'))?.[1]||'','base64').toString('base64url');
const key=createPublicKey({key:{kty:'RSA',n:part('Modulus'),e:part('Exponent')},format:'jwk'});
const repo=`${config.github.owner}/${config.github.releasesRepo}`;
let cached,inflight;
export function validateRelease(release,envelope){
 if(release.draft||release.prerelease||!/^v?\d+\.\d+(?:\.\d+){0,2}$/.test(release.tag_name||''))throw Error('Not a stable versioned release');
 if(envelope.Format!=='FileOrbit.Update.v1'||typeof envelope.Payload!=='string'||envelope.Payload.length>49152||typeof envelope.Signature!=='string'||envelope.Signature.length>1024)throw Error('Invalid update envelope');
 const bytes=Buffer.from(envelope.Payload,'base64');
 if(!verify('RSA-SHA256',bytes,key,Buffer.from(envelope.Signature,'base64')))throw Error('Publisher signature mismatch');
 const manifest=JSON.parse(bytes.toString('utf8'));
 const normalized=v=>v.replace(/^v/,'').split('.').map(Number).concat([0,0,0,0]).slice(0,4).join('.');
 if(manifest.Product!=='File Orbit'||!/^\d+\.\d+(?:\.\d+){0,2}$/.test(manifest.Version||'')||normalized(manifest.Version)!==normalized(release.tag_name)||!/^[a-f0-9]{64}$/i.test(manifest.Sha256||''))throw Error('Release identity mismatch');
 const assets=(release.assets||[]).filter(a=>a.state==='uploaded'&&/^[A-Za-z0-9_.-]+$/.test(a.name));
 const base=`https://github.com/${repo}/releases/download/${release.tag_name}/`;
 const installer=assets.find(a=>a.browser_download_url===manifest.InstallerUrl&&/^FileOrbit-Setup-[\d.]+\.exe$/.test(a.name));
 if(!installer||manifest.InstallerUrl!==base+installer.name||installer.size<1||installer.size>536870912)throw Error('Signed installer URL does not match the published release tag');
 if(installer.digest&&installer.digest.toLowerCase()!=='sha256:'+manifest.Sha256.toLowerCase())throw Error('Published installer digest mismatch');
 const runtime=assets.find(a=>/^FileOrbit-[\d.]+-Public\.zip$/.test(a.name));
 const checksums=assets.find(a=>/^FileOrbit-[\d.]+-SHA256\.txt$/.test(a.name));
 for(const asset of [runtime,checksums])if(asset&&asset.browser_download_url!==base+asset.name)throw Error('Unexpected asset URL');
 const info={displayVersion:manifest.Version.split('.').slice(0,2).join('.'),version:manifest.Version,tag:release.tag_name,installer:installer.name,runtime:runtime?.name||null,checksums:checksums?.name||null,installerBytes:installer.size,signatureStatus:'unsigned',installerSha256:manifest.Sha256.toUpperCase()};
 return {release:info,envelope,urls:{installer:manifest.InstallerUrl,runtime:runtime?.browser_download_url||null,checksums:checksums?.browser_download_url||null},downloads:{installer:'/download/windows',runtime:runtime?'/download/runtime':null,checksums:checksums?'/download/checksums':null}};
}
async function readJson(url,limit){
 const response=await fetch(url,{headers:{'User-Agent':'FileOrbit-Website','Accept':'application/json','Cache-Control':'no-cache'},signal:AbortSignal.timeout(12000),redirect:'follow'});
 if(!response.ok||Number(response.headers.get('content-length'))>limit)throw Error('Release source unavailable');
 const text=await response.text();if(Buffer.byteLength(text)>limit)throw Error('Release response too large');return JSON.parse(text);
}
export function fallbackRelease(){
 const envelope=JSON.parse(fs.readFileSync(new URL('../release/signed-manifest.json',import.meta.url),'utf8'));
 const release=config.release;const base=`https://github.com/${repo}/releases/download/${release.tag}/`;
 return {...validateRelease({tag_name:release.tag,assets:['installer','runtime','checksums'].filter(k=>release[k]).map(k=>({name:release[k],size:k==='installer'?release.installerBytes:1,state:'uploaded',browser_download_url:base+release[k],digest:k==='installer'?'sha256:'+release.installerSha256.toLowerCase():null}))},envelope),stale:true};
}
export async function latestRelease(){
 if(cached&&Date.now()-cached.time<60000)return cached.value;
 if(inflight)return inflight;
 inflight=(async()=>{try{
  const release=await readJson(`https://api.github.com/repos/${repo}/releases/latest`,524288);
  const asset=(release.assets||[]).find(a=>a.name==='latest.json'&&a.state==='uploaded');
  if(!asset||asset.browser_download_url!==`https://github.com/${repo}/releases/download/${release.tag_name}/latest.json`)throw Error('Missing signed update asset');
  const envelope=await readJson(asset.browser_download_url,65536);
  const value={...validateRelease(release,envelope),stale:false};cached={time:Date.now(),value};return value;
 }catch(error){console.warn('Latest release unavailable:',error.message);return cached?.value||fallbackRelease();}finally{inflight=null;}})();return inflight;
}
export function headers(res,stale=false){res.setHeader('Cache-Control','public, max-age=0, s-maxage='+(stale?30:180)+', stale-while-revalidate=60');res.setHeader('X-Content-Type-Options','nosniff');}
