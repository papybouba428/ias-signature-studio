'use strict';
// Tests de bout en bout : chaque groupe démarre un vrai serveur sur un port libre, avec un dossier de données temporaire.
const {test,describe,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const http=require('node:http'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');

const ROOT=path.join(__dirname,'..');
const PYTHON=process.env.PYTHON||(process.platform==='win32'?'python':'python3');
const PNG='data:image/png;base64,'+fs.readFileSync(path.join(ROOT,'public','assets','logo-ias.png')).toString('base64');

function start(env){
 const data=fs.mkdtempSync(path.join(os.tmpdir(),'ias-test-'));
 const proc=spawn(process.execPath,[path.join(ROOT,'server.js')],{env:{PATH:process.env.PATH,SYSTEMROOT:process.env.SYSTEMROOT,PORT:'0',DATA_DIR:data,PYTHON,...env}});
 let out='',err='';proc.stderr.on('data',d=>err+=d);
 const ready=new Promise((resolve,reject)=>{
  proc.stdout.on('data',d=>{out+=d;const m=/localhost:(\d+)/.exec(out);if(m)resolve(Number(m[1]))});
  proc.on('exit',code=>reject(Object.assign(Error('serveur arrêté : '+err),{code})));
 });
 return {data,proc,ready,stop(){proc.kill();fs.rmSync(data,{recursive:true,force:true})}};
}
// Identité telle que l'authentification App Service la transmet (en-tête X-MS-CLIENT-PRINCIPAL, JSON en base64).
function identity(roles=[],email='prenom.nom@ias.sn'){
 const claims=[{typ:'name',val:'Prénom Nom'},{typ:'preferred_username',val:email},...roles.map(r=>({typ:'roles',val:r}))];
 return Buffer.from(JSON.stringify({auth_typ:'aad',name_typ:'preferred_username',role_typ:'roles',claims})).toString('base64');
}
// Requête HTTP brute (fetch normaliserait les chemins comme /../).
function request(port,method,urlPath,{headers={},body}={}){
 return new Promise((resolve,reject)=>{
  const data=body===undefined?undefined:JSON.stringify(body);
  const req=http.request({host:'localhost',port,method,path:urlPath,headers:{...(data?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(data)}:{}),...headers}},res=>{
   const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>{const text=Buffer.concat(chunks).toString('utf8');let json;try{json=JSON.parse(text)}catch{}resolve({status:res.statusCode,headers:res.headers,text,json})});
  });
  req.on('error',reject);if(data)req.write(data);req.end();
 });
}
const ADMIN={'x-ms-client-principal':identity(['Signature.Admin'])};
const write=port=>({...ADMIN,origin:'http://localhost:'+port});

describe('SSO Microsoft (AUTH_MODE=azure, authentification App Service active)',()=>{
 let s,port;
 before(async()=>{s=start({AUTH_MODE:'azure',WEBSITE_AUTH_ENABLED:'True'});port=await s.ready});
 after(()=>s.stop());

 test('sans identité : 401',async()=>{assert.equal((await request(port,'GET','/api/admin/campaigns')).status,401)});
 test('compte IAS sans le rôle : 403',async()=>{
  const r=await request(port,'GET','/api/admin/campaigns',{headers:{'x-ms-client-principal':identity([])}});
  assert.equal(r.status,403);
 });
 test('compte avec un autre rôle : 403',async()=>{
  assert.equal((await request(port,'GET','/api/admin/stats',{headers:{'x-ms-client-principal':identity(['Lecteur'])}})).status,403);
 });
 test('administrateur : 200',async()=>{assert.equal((await request(port,'GET','/api/admin/campaigns',{headers:ADMIN})).status,200)});
 test('en-tête d’identité illisible : 401',async()=>{
  assert.equal((await request(port,'GET','/api/admin/campaigns',{headers:{'x-ms-client-principal':'pas-du-base64-json'}})).status,401);
 });
 test('/api/me renvoie l’identité et le statut',async()=>{
  const r=await request(port,'GET','/api/me',{headers:ADMIN});
  assert.equal(r.json.admin,true);assert.equal(r.json.email,'prenom.nom@ias.sn');assert.equal(r.json.name,'Prénom Nom');
  const anon=await request(port,'GET','/api/me');assert.equal(anon.json.admin,false);assert.equal(anon.json.authenticated,false);
 });
 test('ancienne connexion par mot de passe supprimée',async()=>{
  const r=await request(port,'POST','/api/login',{body:{password:'x'}});assert.notEqual(r.status,200);
 });

 test('POST admin sans en-tête Origin : 403',async()=>{
  assert.equal((await request(port,'POST','/api/admin/settings',{headers:ADMIN,body:{}})).status,403);
 });
 test('POST admin depuis un autre site : 403',async()=>{
  assert.equal((await request(port,'POST','/api/admin/settings',{headers:{...ADMIN,origin:'https://site-malveillant.example'},body:{}})).status,403);
 });
 test('POST admin depuis l’outil : 200',async()=>{
  const r=await request(port,'POST','/api/admin/settings',{headers:write(port),body:{website:'https://ias.sn'}});
  assert.equal(r.status,200);assert.equal((await request(port,'GET','/api/settings')).json.website,'https://ias.sn/');
 });

 test('lien javascript: refusé',async()=>{
  assert.equal((await request(port,'POST','/api/admin/campaigns',{headers:write(port),body:{title:'X',link:'javascript:alert(1)'}})).status,400);
 });
 test('lien avec identifiants refusé',async()=>{
  assert.equal((await request(port,'POST','/api/admin/campaigns',{headers:write(port),body:{title:'X',link:'https://user:pass@ias.sn'}})).status,400);
 });
 test('faux fichier image refusé',async()=>{
  const fake='data:image/png;base64,'+Buffer.from('ceci n’est pas une image').toString('base64');
  assert.equal((await request(port,'POST','/api/admin/campaigns',{headers:write(port),body:{title:'X',link:'https://ias.sn',imageData:fake}})).status,400);
 });
 test('image de plus de 5 Mo refusée',async()=>{
  const big='data:image/png;base64,'+Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),Buffer.alloc(5*1024*1024+1)]).toString('base64');
  const r=await request(port,'POST','/api/admin/campaigns',{headers:write(port),body:{title:'X',link:'https://ias.sn',imageData:big}});
  assert.equal(r.status,400);
 });
});

describe('Campagnes, GIF et redirections /go',()=>{
 let s,port;
 const save=body=>request(port,'POST','/api/admin/campaigns',{headers:write(port),body});
 before(async()=>{s=start({AUTH_MODE:'azure',WEBSITE_AUTH_ENABLED:'True'});port=await s.ready});
 after(()=>s.stop());

 test('aucune campagne : /go renvoie vers le site IAS par défaut',async()=>{
  const r=await request(port,'GET','/go');assert.equal(r.status,302);assert.equal(r.headers.location,'https://ias.sn/');
 });
 let first;
 test('création : visuel stocké dans DATA_DIR et GIF généré',async()=>{
  const r=await save({title:'SALTIS',link:'https://www.saltis-techinov.org/',order:1,imageData:PNG});
  assert.equal(r.status,200);assert.equal(r.json.gif,true,'génération du GIF (Python + Pillow requis)');
  first=(await request(port,'GET','/api/admin/campaigns',{headers:ADMIN})).json[0];
  assert.ok(fs.existsSync(path.join(s.data,'uploads',first.id+'.png')));
  const img=await request(port,'GET',first.image);assert.equal(img.status,200);assert.equal(img.headers['content-type'],'image/png');
  const gif=await request(port,'GET','/assets/campaigns.gif');
  assert.equal(gif.status,200);assert.equal(gif.headers['content-type'],'image/gif');assert.match(gif.headers['cache-control'],/no-store/);
 });
 test('le GIF reste public, sans identité',async()=>{assert.equal((await request(port,'GET','/assets/campaigns.gif')).status,200)});
 test('une campagne : /go redirige directement et compte le clic',async()=>{
  const r=await request(port,'GET','/go');assert.equal(r.status,302);assert.equal(r.headers.location,'https://www.saltis-techinov.org/');
  const stats=(await request(port,'GET','/api/admin/stats',{headers:ADMIN})).json;
  assert.equal(stats.landing,2);assert.equal(stats[first.id],1);
 });
 test('ancien lien /go/<id> inconnu : renvoie vers la seule campagne active',async()=>{
  const r=await request(port,'GET','/go/ancienne-campagne');assert.equal(r.status,302);assert.equal(r.headers.location,'https://www.saltis-techinov.org/');
 });
 let second;
 test('deux campagnes : /go affiche la page de sélection',async()=>{
  await save({title:'Billetterie',link:'https://www.saltis-techinov.org/billetterie',order:2,imageData:PNG});
  second=(await request(port,'GET','/api/admin/campaigns',{headers:ADMIN})).json.find(c=>c.title==='Billetterie');
  const r=await request(port,'GET','/go');assert.equal(r.status,200);assert.match(r.text,/SALTIS/);assert.match(r.text,/Billetterie/);
  const r2=await request(port,'GET','/go/'+second.id);assert.equal(r2.status,302);assert.equal(r2.headers.location,'https://www.saltis-techinov.org/billetterie');
  const r3=await request(port,'GET','/go/inconnue');assert.equal(r3.status,302);assert.equal(r3.headers.location,'/go');
 });
 test('suppression : campagne et visuel effacés',async()=>{
  const r=await request(port,'DELETE','/api/admin/campaigns/'+encodeURIComponent(second.id),{headers:write(port)});
  assert.equal(r.status,200);
  assert.ok(!fs.existsSync(path.join(s.data,'uploads',second.id+'.png')));
  assert.equal((await request(port,'GET','/api/campaigns')).json.length,1);
 });
 test('suppression sans en-tête Origin : 403',async()=>{
  assert.equal((await request(port,'DELETE','/api/admin/campaigns/'+encodeURIComponent(first.id),{headers:ADMIN})).status,403);
 });
 test('/go reste accessible pendant la génération du GIF',async()=>{
  const saving=save({title:'SALTIS',link:'https://www.saltis-techinov.org/',id:first.id,order:1,imageData:PNG});
  const t=Date.now();const r=await request(port,'GET','/go');const elapsed=Date.now()-t;
  assert.equal(r.status,302);assert.ok(elapsed<1000,'réponse en '+elapsed+' ms');await saving;
 });
});

describe('Fichiers et en-têtes de sécurité',()=>{
 let s,port;
 before(async()=>{s=start({AUTH_MODE:'azure',WEBSITE_AUTH_ENABLED:'True'});port=await s.ready;fs.writeFileSync(path.join(s.data,'secret.txt'),'privé')});
 after(()=>s.stop());

 for(const p of ['/%2e%2e/server.js','/..%2fserver.js','/assets/uploads/..%2fcampaigns.json','/assets/uploads/..%2fsecret.txt','/assets/uploads/%2e%2e%2f%2e%2e%2fserver.js']){
  test('traversée de répertoire refusée : '+p,async()=>{
   const r=await request(port,'GET',p);assert.ok([403,404].includes(r.status),'statut '+r.status);assert.doesNotMatch(r.text,/use strict|privé|"id"/);
  });
 }
 test('page d’accueil servie avec les en-têtes de sécurité',async()=>{
  const r=await request(port,'GET','/');assert.equal(r.status,200);
  assert.equal(r.headers['x-frame-options'],'DENY');assert.match(r.headers['content-security-policy'],/frame-ancestors 'none'/);
  assert.equal(r.headers['x-content-type-options'],'nosniff');
 });
});

describe('Configuration du démarrage',()=>{
 test('sans authentification App Service, l’en-tête d’identité est ignoré',async()=>{
  const s=start({AUTH_MODE:'azure'});const port=await s.ready;
  try{assert.equal((await request(port,'GET','/api/admin/campaigns',{headers:ADMIN})).status,401)}finally{s.stop()}
 });
 test('mode local : administrateur simulé',async()=>{
  const s=start({AUTH_MODE:'local'});const port=await s.ready;
  try{const r=await request(port,'GET','/api/me');assert.equal(r.json.admin,true);assert.equal(r.json.mode,'local')}finally{s.stop()}
 });
 test('mode local interdit en production',async()=>{
  const s=start({AUTH_MODE:'local',NODE_ENV:'production'});
  await assert.rejects(s.ready,e=>e.code===1);s.stop();
 });
 test('HSTS envoyé en production',async()=>{
  const s=start({AUTH_MODE:'azure',WEBSITE_AUTH_ENABLED:'True',NODE_ENV:'production'});const port=await s.ready;
  try{assert.match((await request(port,'GET','/')).headers['strict-transport-security'],/max-age=/)}finally{s.stop()}
 });
});

describe('Liens fixes des réseaux (/r/<réseau>)',()=>{
 let s,port;
 before(async()=>{s=start({AUTH_MODE:'local'});port=await s.ready});
 after(()=>s.stop());

 test('par défaut : liens officiels IAS',async()=>{
  const r=await request(port,'GET','/r/linkedin');assert.equal(r.status,302);assert.match(r.headers.location,/linkedin\.com\/company\/institut-des-algorithmes/);
  assert.equal((await request(port,'GET','/api/settings')).json.tiktok,'https://www.tiktok.com/@african.ai4good');
 });
 test('réseau inconnu : 404',async()=>{assert.equal((await request(port,'GET','/r/../settings.json')).status,404)});
 test('modifié par l’admin : redirection et comptage ; réseau vidé -> site web',async()=>{
  const r=await request(port,'POST','/api/admin/settings',{headers:{origin:'http://localhost:'+port},body:{website:'https://www.ias.sn',linkedin:'https://www.linkedin.com/school/ias',facebook:''}});
  assert.equal(r.status,200);
  const li=await request(port,'GET','/r/linkedin');assert.equal(li.status,302);assert.equal(li.headers.location,'https://www.linkedin.com/school/ias');
  const fb=await request(port,'GET','/r/facebook');assert.equal(fb.status,302);assert.equal(fb.headers.location,'https://www.ias.sn/');
  const stats=(await request(port,'GET','/api/admin/stats')).json;assert.equal(stats['r:linkedin'],2);
 });
});

describe('Bandeau par défaut (aucune campagne)',()=>{
 let s,port;
 before(async()=>{s=start({AUTH_MODE:'local'});port=await s.ready});
 after(()=>s.stop());
 test('/go sans campagne renvoie vers le site web s’il est défini',async()=>{
  await request(port,'POST','/api/admin/settings',{headers:{origin:'http://localhost:'+port},body:{website:'https://www.ias.sn'}});
  const r=await request(port,'GET','/go');assert.equal(r.status,302);assert.equal(r.headers.location,'https://www.ias.sn/');
 });
});

describe('Anti-CSRF derrière un proxy (Host interne différent du domaine public)',()=>{
 let s,port;
 before(async()=>{s=start({AUTH_MODE:'azure',WEBSITE_AUTH_ENABLED:'True',ALLOWED_HOSTS:'signature.ias.sn'});port=await s.ready});
 after(()=>s.stop());
 const post=origin=>request(port,'POST','/api/admin/settings',{headers:{...ADMIN,origin},body:{website:'https://ias.sn/'}});
 test('Origin du domaine public autorisé : 200',async()=>{assert.equal((await post('https://signature.ias.sn')).status,200)});
 test('Origin d’un autre site : 403',async()=>{assert.equal((await post('https://evil.example')).status,403)});
 test('sans Origin : 403',async()=>{assert.equal((await request(port,'POST','/api/admin/settings',{headers:ADMIN,body:{}})).status,403)});
});
