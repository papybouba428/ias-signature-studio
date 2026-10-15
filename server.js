'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const ROOT=__dirname,PUB=path.join(ROOT,'public'),DATA=path.join(ROOT,'data');
fs.mkdirSync(DATA,{recursive:true});fs.mkdirSync(path.join(PUB,'assets','uploads'),{recursive:true});
const PORT=Number(process.env.PORT||3000),PASSWORD=process.env.IAS_ADMIN_PASSWORD||'';
if(!PASSWORD||PASSWORD.length<12){console.error('Définir IAS_ADMIN_PASSWORD (au moins 12 caractères) avant le démarrage.');process.exit(1)}
const SECRET=process.env.IAS_SESSION_SECRET||'';
if(SECRET.length<32){console.error('Définir IAS_SESSION_SECRET (au moins 32 caractères).');process.exit(1)}
const CAM=path.join(DATA,'campaigns.json'),STATS=path.join(DATA,'stats.json'),SETTINGS=path.join(DATA,'settings.json');
if(!fs.existsSync(SETTINGS))fs.writeFileSync(SETTINGS,'{}');if(!fs.existsSync(CAM))fs.writeFileSync(CAM,'[]');if(!fs.existsSync(STATS))fs.writeFileSync(STATS,'{}');
const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const write=(f,v)=>{const tmp=f+'.tmp';fs.writeFileSync(tmp,JSON.stringify(v,null,2));fs.renameSync(tmp,f)};
function json(res,status,obj){const b=JSON.stringify(obj);res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(b)}
function cookie(req){return (req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('ias_session='))?.slice(12)}
function auth(req){const x=cookie(req);if(!x)return false;const parts=x.split('.');if(parts.length!==2)return false;const sig=crypto.createHmac('sha256',SECRET).update(parts[0]).digest('hex');if(sig.length!==parts[1].length||!crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(parts[1])))return false;const v=parts[0].split(':');return v.length===2&&Number(v[1])>Date.now()}
function token(){const payload=crypto.randomBytes(20).toString('hex')+':'+(Date.now()+8*60*60*1000);return payload+'.'+crypto.createHmac('sha256',SECRET).update(payload).digest('hex')}
async function body(req){let chunks=[],total=0;for await(const c of req){total+=c.length;if(total>8*1024*1024)throw Error('Fichier trop volumineux (8 Mo max)');chunks.push(c)}return JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}')}
const hits=new Map();function allow(key){const v=hits.get(key)||{at:Date.now(),n:0};if(Date.now()-v.at>15*60*1000){v.at=Date.now();v.n=0}v.n++;hits.set(key,v);return v.n<=10}
function refresh(){const p=spawnSync(process.env.PYTHON||'python3',[path.join(ROOT,'make_gif.py'),ROOT],{encoding:'utf8',timeout:30000});if(p.status!==0)console.error('GIF:',p.stderr);return p.status===0}
function safeLink(s){try{let u=new URL(s);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.toString():null}catch{return null}}
function escape(s){return String(s).replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]))}
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.ico':'image/x-icon'};
http.createServer(async(req,res)=>{
 try{
  const u=new URL(req.url,'http://localhost');const pathname=decodeURIComponent(u.pathname);
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  if(pathname==='/api/login'&&req.method==='POST'){
   if(!allow(req.socket.remoteAddress||'unknown'))return json(res,429,{error:'Trop de tentatives'});
   const b=await body(req);let supplied=String(b.password||'');const a=crypto.createHash('sha256').update(supplied).digest(),z=crypto.createHash('sha256').update(PASSWORD).digest();if(!crypto.timingSafeEqual(a,z))return json(res,401,{error:'Mot de passe incorrect'});
   res.setHeader('Set-Cookie',`ias_session=${token()}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${process.env.NODE_ENV==='production'?'; Secure':''}`);return json(res,200,{ok:true})
  }
  if(pathname==='/api/logout'&&req.method==='POST'){res.setHeader('Set-Cookie','ias_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return json(res,200,{ok:true})}
  if(pathname==='/api/settings'&&req.method==='GET')return json(res,200,read(SETTINGS));
  if(pathname==='/api/admin/settings'&&req.method==='POST'){
   if(!auth(req))return json(res,401,{error:'Accès refusé'});
   const b=await body(req),o={};
   for(const key of ['website','linkedin','facebook','instagram','tiktok']){
    const v=String(b[key]||'').trim();if(v&&!safeLink(v))return json(res,400,{error:'Lien invalide : '+key});
    o[key]=v?safeLink(v):'';
   }
   write(SETTINGS,o);return json(res,200,{ok:true});
  }
  if(pathname==='/api/me')return json(res,200,{admin:auth(req)});
  if(pathname==='/api/campaigns'&&req.method==='GET')return json(res,200,read(CAM).filter(x=>x.active).map(x=>({id:x.id,title:x.title,image:x.image,active:x.active,order:x.order})).sort((a,b)=>a.order-b.order));
  if(pathname==='/api/admin/campaigns'&&req.method==='GET'){if(!auth(req))return json(res,401,{error:'Accès refusé'});return json(res,200,read(CAM).sort((a,b)=>a.order-b.order))}
  if(pathname==='/api/admin/stats'&&req.method==='GET'){if(!auth(req))return json(res,401,{error:'Accès refusé'});return json(res,200,read(STATS))}
  if(pathname==='/api/admin/campaigns'&&req.method==='POST'){
   if(!auth(req))return json(res,401,{error:'Accès refusé'});
   const b=await body(req);const title=String(b.title||'').trim().slice(0,100),link=safeLink(String(b.link||''));if(!title||!link)return json(res,400,{error:'Nom et lien HTTPS/HTTP valides obligatoires'});
   let items=read(CAM),id=String(b.id||'');let old=items.find(x=>x.id===id);if(!old){id=crypto.randomUUID();old={id,image:'',order:items.length+1};items.push(old)}
   old.title=title;old.link=link;old.active=b.active!==false;old.order=Math.max(0,Math.min(10000,Number(b.order)||1));old.image=old.image||'';
   if(b.imageData){const m=/^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/=]+)$/.exec(String(b.imageData));if(!m)return json(res,400,{error:'Image PNG, JPEG, WebP ou GIF uniquement'});const buf=Buffer.from(m[2],'base64');if(buf.length>5*1024*1024)return json(res,400,{error:'Image trop volumineuse'});const ext=m[1]==='jpeg'?'jpg':m[1];let valid=(ext==='png'&&buf.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')))||(ext==='jpg'&&buf.subarray(0,3).equals(Buffer.from('ffd8ff','hex')))||(ext==='webp'&&buf.subarray(0,4).toString()==='RIFF'&&buf.subarray(8,12).toString()==='WEBP')||(ext==='gif'&&['GIF87a','GIF89a'].includes(buf.subarray(0,6).toString()));if(!valid)return json(res,400,{error:'Fichier image invalide'});const fn=id+'.'+ext;fs.writeFileSync(path.join(PUB,'assets','uploads',fn),buf);old.image='/assets/uploads/'+fn}
   write(CAM,items);const gif=refresh();return json(res,200,{ok:true,gif})
  }
  if(pathname.startsWith('/api/admin/campaigns/')&&req.method==='DELETE'){if(!auth(req))return json(res,401,{error:'Accès refusé'});const id=pathname.split('/').pop();write(CAM,read(CAM).filter(x=>x.id!==id));return json(res,200,{ok:true,gif:refresh()})}
  if(pathname==='/go'){
   let items=read(CAM).filter(x=>x.active&&x.link);const stats=read(STATS);stats.landing=(stats.landing||0)+1;write(STATS,stats);
   if(items.length===1){const item=items[0];stats[item.id]=(stats[item.id]||0)+1;write(STATS,stats);res.writeHead(302,{Location:item.link,'Cache-Control':'no-store'});return res.end();}
   const cards=items.map(x=>`<a href="/go/${encodeURIComponent(x.id)}" style="text-decoration:none;color:#271504;display:block;background:white;border-radius:12px;overflow:hidden;box-shadow:0 5px 25px #2715041a"><img src="${escape(x.image)}" alt="" style="display:block;width:100%;height:140px;object-fit:cover"><strong style="display:block;padding:14px">${escape(x.title)} →</strong></a>`).join('');res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end(`<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>IAS · Nos actualités</title><body style="font-family:Arial,sans-serif;margin:0;background:#f9f5eb;color:#271504"><main style="max-width:780px;margin:auto;padding:32px 18px"><img src="/assets/logo-ias.png" style="width:75px" alt="IAS"><h1>Découvrez les actualités IAS</h1><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px">${cards||'Aucune campagne active.'}</div></main></body></html>`)
  }
  if(pathname.startsWith('/go/')){const id=pathname.slice(4);const active=read(CAM).filter(x=>x.active&&safeLink(x.link));let item=active.find(x=>x.id===id);if(!item){if(active.length===1)item=active[0];else{res.writeHead(302,{Location:'/go','Cache-Control':'no-store'});return res.end()}}const stats=read(STATS);stats[item.id]=(stats[item.id]||0)+1;write(STATS,stats);res.writeHead(302,{Location:item.link,'Cache-Control':'no-store'});return res.end()}
  if(req.method!=='GET'&&req.method!=='HEAD')return json(res,405,{error:'Méthode non autorisée'});
  let f=path.resolve(PUB,'.'+(pathname==='/'?'/index.html':pathname));if(!(f===PUB||f.startsWith(PUB+path.sep)))return json(res,403,{error:'Accès refusé'});
  if(!fs.existsSync(f)||!fs.statSync(f).isFile())return json(res,404,{error:'Introuvable'});
  const ext=path.extname(f);res.writeHead(200,{'Content-Type':mime[ext]||'application/octet-stream','Cache-Control':pathname==='/assets/campaigns.gif'?'no-store, no-cache, must-revalidate':'public, max-age=60'});return fs.createReadStream(f).pipe(res)
 }catch(e){console.error(e);return json(res,500,{error:'Erreur serveur'})}
}).listen(PORT,()=>{refresh();console.log('IAS Signature Studio prêt sur http://localhost:'+PORT)});
