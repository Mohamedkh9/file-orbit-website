import {latestRelease,headers} from '../lib/release.mjs';
export default async function handler(req,res){
 if(!['GET','HEAD'].includes(req.method)){res.setHeader('Allow','GET, HEAD');return res.status(405).end();}
 try{const data=await latestRelease();headers(res,data.stale);return res.status(200).json(data.envelope);}
 catch{res.setHeader('Retry-After','30');return res.status(503).json({error:'Update feed temporarily unavailable'});}
}
