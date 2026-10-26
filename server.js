'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const ROOT=__dirname,PUB=path.join(ROOT,'public');
// DATA_DIR : stockage persistant (Azure Files monté sur /mnt/data en production). Contient les JSON, les visuels (uploads/) et le GIF.
const DATA=path.resolve(process.env.DATA_DIR||path.join(ROOT,'data')),UPLOADS=path.join(DATA,'uploads'),GIF=path.join(DATA,'campaigns.gif');
fs.mkdirSync(UPLOADS,{recursive:true});
// Migration : les visuels étaient auparavant dans public/assets/uploads.
const LEGACY=path.join(PUB,'assets','uploads');if(fs.existsSync(LEGACY))for(const f of fs.readdirSync(LEGACY))if(!fs.existsSync(path.join(UPLOADS,f)))fs.copyFileSync(path.join(LEGACY,f),path.join(UPLOADS,f));
const PORT=Number(process.env.PORT||3000),PROD=process.env.NODE_ENV==='production';
// Authentification : 'azure' = SSO Microsoft via l'authentification App Service (Easy Auth) ; 'local' = administrateur simulé pour le développement.
const AUTH_MODE=process.env.AUTH_MODE||'azure',ADMIN_ROLE=process.env.ADMIN_ROLE||'Signature.Admin';
if(!['azure','local'].includes(AUTH_MODE)){console.error('AUTH_MODE doit valoir azure ou local.');process.exit(1)}
if(AUTH_MODE==='local'&&PROD){console.error('AUTH_MODE=local est interdit en production.');process.exit(1)}
// App Service définit WEBSITE_AUTH_ENABLED=True quand l'authentification est active : c'est elle qui retire et réécrit l'en-tête X-MS-CLIENT-PRINCIPAL.
// Sans elle, l'en-tête pourrait être forgé par n'importe qui : on l'ignore.
const EASY_AUTH=String(process.env.WEBSITE_AUTH_ENABLED).toLowerCase()==='true';
if(AUTH_MODE==='azure'&&!EASY_AUTH)console.warn('Authentification App Service inactive : administration inaccessible (AUTH_MODE=local pour développer).');
const CAM=path.join(DATA,'campaigns.json'),STATS=path.join(DATA,'stats.json'),SETTINGS=path.join(DATA,'settings.json');
if(!fs.existsSync(SETTINGS))fs.writeFileSync(SETTINGS,'{}');if(!fs.existsSync(CAM))fs.writeFileSync(CAM,'[]');if(!fs.existsSync(STATS))fs.writeFileSync(STATS,'{}');
const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const write=(f,v)=>{const tmp=f+'.tmp';fs.writeFileSync(tmp,JSON.stringify(v,null,2));fs.renameSync(tmp,f)};
function json(res,status,obj){const b=JSON.stringify(obj);res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(b)}
function principal(req){
 if(AUTH_MODE==='local')return {name:'Administrateur local',email:'admin@localhost',roles:[ADMIN_ROLE]};
 const raw=req.headers['x-ms-client-principal'];if(!EASY_AUTH||!raw)return null;
 try{const p=JSON.parse(Buffer.from(String(raw),'base64').toString('utf8'));const claims=Array.isArray(p.claims)?p.claims:[];const val=(...t)=>claims.find(c=>t.includes(c.typ))?.val||'';
  const roleTyp=[p.role_typ,'roles','http://schemas.microsoft.com/ws/2008/06/identity/claims/role'];
  return {name:val('name')||val(p.name_typ),email:val('preferred_username','email',p.name_typ),roles:claims.filter(c=>roleTyp.includes(c.typ)).map(c=>String(c.val))}}catch{return null}
}
// Domaines publics de l'outil, acceptés comme Origin des requêtes d'écriture (anti-CSRF). Derrière App Service, l'en-tête
// Host reçu par Node peut différer du domaine du navigateur : on compare donc à une liste fixe (ALLOWED_HOSTS + WEBSITE_HOSTNAME).
const ALLOWED_HOSTS=new Set([...String(process.env.ALLOWED_HOSTS||'').split(','),process.env.WEBSITE_HOSTNAME||''].map(x=>x.trim().toLowerCase()).filter(Boolean));
function isAdmin(p){return !!p&&p.roles.includes(ADMIN_ROLE)}
// Renvoie l'administrateur, ou répond 401 (non connecté) / 403 (sans rôle, ou requête venant d'un autre site) et renvoie null.
function guard(req,res){
 const p=principal(req);if(!p){json(res,401,{error:'Connexion requise'});return null}
 if(!isAdmin(p)){json(res,403,{error:'Votre compte n\'a pas le rôle administrateur'});return null}
 if(req.method!=='GET'&&req.method!=='HEAD'){let o='';try{o=new URL(req.headers.origin).host.toLowerCase()}catch{}if(!o||(o!==String(req.headers.host||'').toLowerCase()&&!ALLOWED_HOSTS.has(o))){console.log(JSON.stringify({refused:'origin',user:p.email||p.name,origin:req.headers.origin||'',host:req.headers.host||'',forwardedHost:req.headers['x-forwarded-host']||'',at:new Date().toISOString()}));json(res,403,{error:'Origine de la requête refusée'});return null}}
 return p;
}
function audit(p,action,detail){console.log(JSON.stringify({audit:action,user:p.email||p.name,...detail,at:new Date().toISOString()}))}
async function body(req){let chunks=[],total=0;for await(const c of req){total+=c.length;if(total>8*1024*1024)throw Error('Fichier trop volumineux (8 Mo max)');chunks.push(c)}return JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}')}
// Génération du GIF dans un processus séparé, sans bloquer le serveur ; une seule génération à la fois.
function runGif(){return new Promise(resolve=>{let err='';const p=spawn(process.env.PYTHON||'python3',[path.join(ROOT,'make_gif.py'),DATA],{timeout:30000});p.stderr.on('data',d=>err+=d);p.on('error',e=>{console.error('GIF:',e.message);resolve(false)});p.on('close',code=>{if(code!==0)console.error('GIF:',err);resolve(code===0)})})}
let gifQueue=Promise.resolve(true);function refresh(){return gifQueue=gifQueue.then(runGif)}
function removeUpload(image){if(!image||!image.startsWith('/assets/uploads/'))return;const f=path.join(UPLOADS,path.basename(image));if(fs.existsSync(f))fs.unlinkSync(f)}
function safeLink(s){try{let u=new URL(s);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.toString():null}catch{return null}}
function escape(s){return String(s).replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]))}
const SOCIAL_KEYS=['website','linkedin','facebook','instagram','tiktok'];
// Liens IAS par défaut, utilisés tant qu'un admin ne les a pas modifiés (une valeur vidée volontairement reste vide).
const DEFAULT_SETTINGS={website:'https://ias.sn/',linkedin:'https://www.linkedin.com/company/institut-des-algorithmes-du-s%C3%A9n%C3%A9gal/',facebook:'https://www.facebook.com/IASSenegal',instagram:'https://www.instagram.com/ias_senegal/',tiktok:'https://www.tiktok.com/@african.ai4good'};
const settings=()=>({...DEFAULT_SETTINGS,...read(SETTINGS)});
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.ico':'image/x-icon'};
// Fichier demandé -> fichier sur disque : visuels et GIF depuis DATA_DIR, le reste depuis public/. null si le chemin sort du dossier autorisé.
function locate(pathname){
 if(pathname==='/assets/campaigns.gif')return GIF;
 const [base,rel]=pathname.startsWith('/assets/uploads/')?[UPLOADS,pathname.slice(16)]:[PUB,pathname==='/'?'index.html':pathname.slice(1)];
 const f=path.resolve(base,rel);return f.startsWith(base+path.sep)?f:null;
}
const server=http.createServer(async(req,res)=>{
 try{
  const u=new URL(req.url,'http://localhost');const pathname=decodeURIComponent(u.pathname);
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  if(PROD)res.setHeader('Strict-Transport-Security','max-age=31536000');
  if(pathname==='/api/me'){const p=principal(req);return json(res,200,{admin:isAdmin(p),authenticated:!!p,name:p?.name||'',email:p?.email||'',mode:AUTH_MODE,loginUrl:'/.auth/login/aad?post_login_redirect_uri=%2F%23admin',logoutUrl:'/.auth/logout?post_logout_redirect_uri=%2F'})}
  if(pathname==='/api/settings'&&req.method==='GET')return json(res,200,settings());
  if(pathname==='/api/admin/settings'&&req.method==='POST'){
   const p=guard(req,res);if(!p)return;
   const b=await body(req),o={};
   for(const key of SOCIAL_KEYS){
    const v=String(b[key]||'').trim();if(v&&!safeLink(v))return json(res,400,{error:'Lien invalide : '+key});
    o[key]=v?safeLink(v):'';
   }
   write(SETTINGS,o);audit(p,'settings',{});return json(res,200,{ok:true});
  }
  if(pathname==='/api/campaigns'&&req.method==='GET')return json(res,200,read(CAM).filter(x=>x.active).map(x=>({id:x.id,title:x.title,image:x.image,active:x.active,order:x.order})).sort((a,b)=>a.order-b.order));
  if(pathname==='/api/admin/campaigns'&&req.method==='GET'){if(!guard(req,res))return;return json(res,200,read(CAM).sort((a,b)=>a.order-b.order))}
  if(pathname==='/api/admin/stats'&&req.method==='GET'){if(!guard(req,res))return;return json(res,200,read(STATS))}
  if(pathname==='/api/admin/campaigns'&&req.method==='POST'){
   const p=guard(req,res);if(!p)return;
   const b=await body(req);const title=String(b.title||'').trim().slice(0,100),link=safeLink(String(b.link||''));if(!title||!link)return json(res,400,{error:'Nom et lien HTTPS/HTTP valides obligatoires'});
   let items=read(CAM),id=String(b.id||'');let old=items.find(x=>x.id===id);if(!old){id=crypto.randomUUID();old={id,image:'',order:items.length+1};items.push(old)}
   old.title=title;old.link=link;old.active=b.active!==false;old.order=Math.max(0,Math.min(10000,Number(b.order)||1));old.image=old.image||'';
   if(b.imageData){const m=/^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/=]+)$/.exec(String(b.imageData));if(!m)return json(res,400,{error:'Image PNG, JPEG, WebP ou GIF uniquement'});const buf=Buffer.from(m[2],'base64');if(buf.length>5*1024*1024)return json(res,400,{error:'Image trop volumineuse'});const ext=m[1]==='jpeg'?'jpg':m[1];let valid=(ext==='png'&&buf.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')))||(ext==='jpg'&&buf.subarray(0,3).equals(Buffer.from('ffd8ff','hex')))||(ext==='webp'&&buf.subarray(0,4).toString()==='RIFF'&&buf.subarray(8,12).toString()==='WEBP')||(ext==='gif'&&['GIF87a','GIF89a'].includes(buf.subarray(0,6).toString()));if(!valid)return json(res,400,{error:'Fichier image invalide'});const fn=id+'.'+ext;if(old.image&&old.image!=='/assets/uploads/'+fn)removeUpload(old.image);fs.writeFileSync(path.join(UPLOADS,fn),buf);old.image='/assets/uploads/'+fn}
   write(CAM,items);audit(p,'campaign.save',{id,title});const gif=await refresh();return json(res,200,{ok:true,gif})
  }
  if(pathname.startsWith('/api/admin/campaigns/')&&req.method==='DELETE'){const p=guard(req,res);if(!p)return;const id=pathname.split('/').pop();const items=read(CAM),gone=items.find(x=>x.id===id);write(CAM,items.filter(x=>x.id!==id));if(gone){removeUpload(gone.image);audit(p,'campaign.delete',{id,title:gone.title})}return json(res,200,{ok:true,gif:await refresh()})}
  // Liens fixes des signatures (/r/linkedin…) : redirigent vers le lien actuel défini par l'admin, sans recopier les signatures. Réseau non renseigné -> site web.
  if(pathname.startsWith('/r/')){const key=pathname.slice(3);const s=settings();const target=SOCIAL_KEYS.includes(key)&&(safeLink(s[key]||'')||safeLink(s.website||''));if(!target)return json(res,404,{error:'Lien non configuré'});const stats=read(STATS);stats['r:'+key]=(stats['r:'+key]||0)+1;write(STATS,stats);res.writeHead(302,{Location:target,'Cache-Control':'no-store'});return res.end()}
  if(pathname==='/go'){
   let items=read(CAM).filter(x=>x.active&&x.link);const stats=read(STATS);stats.landing=(stats.landing||0)+1;write(STATS,stats);
   // Aucune campagne : le bandeau par défaut renvoie vers le site web de l'IAS.
   const site=safeLink(settings().website||'');if(!items.length&&site){res.writeHead(302,{Location:site,'Cache-Control':'no-store'});return res.end()}
   if(items.length===1){const item=items[0];stats[item.id]=(stats[item.id]||0)+1;write(STATS,stats);res.writeHead(302,{Location:item.link,'Cache-Control':'no-store'});return res.end();}
   const cards=items.map(x=>`<a href="/go/${encodeURIComponent(x.id)}" style="text-decoration:none;color:#271504;display:block;background:white;border-radius:12px;overflow:hidden;box-shadow:0 5px 25px #2715041a"><img src="${escape(x.image)}" alt="" style="display:block;width:100%;height:140px;object-fit:cover"><strong style="display:block;padding:14px">${escape(x.title)} →</strong></a>`).join('');res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end(`<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>IAS · Nos actualités</title><body style="font-family:Arial,sans-serif;margin:0;background:#f9f5eb;color:#271504"><main style="max-width:780px;margin:auto;padding:32px 18px"><img src="/assets/logo-ias.png" style="width:75px" alt="IAS"><h1>Découvrez les actualités IAS</h1><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px">${cards||'Aucune actualité pour le moment.'}</div></main></body></html>`)
  }
  if(pathname.startsWith('/go/')){const id=pathname.slice(4);const active=read(CAM).filter(x=>x.active&&safeLink(x.link));let item=active.find(x=>x.id===id);if(!item){if(active.length===1)item=active[0];else{res.writeHead(302,{Location:'/go','Cache-Control':'no-store'});return res.end()}}const stats=read(STATS);stats[item.id]=(stats[item.id]||0)+1;write(STATS,stats);res.writeHead(302,{Location:item.link,'Cache-Control':'no-store'});return res.end()}
  if(req.method!=='GET'&&req.method!=='HEAD')return json(res,405,{error:'Méthode non autorisée'});
  const f=locate(pathname);if(!f)return json(res,403,{error:'Accès refusé'});
  if(!fs.existsSync(f)||!fs.statSync(f).isFile())return json(res,404,{error:'Introuvable'});
  const ext=path.extname(f);res.writeHead(200,{'Content-Type':mime[ext]||'application/octet-stream','Cache-Control':pathname==='/assets/campaigns.gif'?'no-store, no-cache, must-revalidate':'public, max-age=60'});return fs.createReadStream(f).pipe(res)
 }catch(e){console.error(e);if(!res.headersSent)return json(res,500,{error:'Erreur serveur'});res.end()}
});
server.listen(PORT,()=>{refresh();console.log('IAS Signature Studio prêt sur http://localhost:'+server.address().port+' (authentification : '+AUTH_MODE+')')});
