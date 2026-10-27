import {latestRelease,headers} from '../lib/release.mjs';
export default async function handler(req,res){
 if(!['GET','HEAD'].includes(req.method)){res.setHeader('Allow','GET, HEAD');return res.status(405).end();}
 const type=req.query?.asset;if(!['installer','runtime','checksums'].includes(type))return res.status(400).end('Invalid download');
 try{const data=await latestRelease();const url=data.urls[type];if(!url)return res.status(404).end('This file is not included in the latest release');headers(res,data.stale);res.setHeader('Location',url);return res.status(307).end();}
 catch{res.setHeader('Retry-After','30');return res.status(503).end('Download temporarily unavailable');}
}
