const $=id=>document.getElementById(id),esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let campaigns=[],adminCampaigns=[],settings={};
const origin=location.origin.startsWith('file:')?'http://localhost:3000':location.origin;
// Session Microsoft expirée : l'authentification App Service répond 401 sans contenu. On tente un renouvellement
// (/.auth/refresh) puis on rejoue la requête une fois ; sinon, message clair au lieu d'une erreur de lecture JSON.
const refreshSession=async()=>{try{return (await fetch('/.auth/refresh',{credentials:'same-origin'})).ok}catch{return false}};
// Repli : si l'authentification App Service refuse une écriture authentifiée par cookie (403 sans contenu), on la rejoue
// avec le jeton de session (id_token lu sur /.auth/me) en Authorization: Bearer, mode accepté par la plateforme.
const sessionToken=async()=>{try{return (await (await fetch('/.auth/me',{credentials:'same-origin'})).json())[0]?.id_token||''}catch{return ''}};
const api=async(path,opts={},retry=true)=>{const r=await fetch(path,{credentials:'same-origin',referrerPolicy:'same-origin',...opts,headers:{'Content-Type':'application/json',...(opts.headers||{})}});
if(r.status===401&&retry&&await refreshSession())return api(path,opts,false);
if(r.status===403&&retry&&r.headers.get('content-length')==='0'){const tok=await sessionToken();if(tok)return api(path,{...opts,headers:{...(opts.headers||{}),Authorization:'Bearer '+tok}},false)}
const t=await r.text();let j={};try{j=t?JSON.parse(t):{}}catch{}
if(r.status===401&&!j.error)throw Error('Votre session a expiré : rechargez la page pour vous reconnecter.');
if(!r.ok)throw Error(j.error||'Erreur '+r.status);return j};
function signature(o={}){
const name=esc($('fullName').value.trim()||'Votre nom'),role=esc($('role').value.trim()||'Votre fonction');
const email=$('email').value.trim(),phone=$('phone').value.trim();
// Signature fluide : 100 % de la largeur, 600 px maximum, lignes courtes. Sur mobile, Gmail et Outlook l'affichent
// sans la réduire (pas de media queries : Outlook retire les balises <style> des signatures).
// Icônes et logo en PNG hébergés (les symboles Unicode s'affichent en emojis variables selon les messageries).
// Liens fixes vers le serveur : /go (campagnes) et /r/<réseau> redirigent vers les destinations définies par l'admin,
// donc les signatures déjà installées suivent les changements sans être recopiées.
const list=o.campaigns||campaigns,A=origin+'/assets/signature/',single=list.length===1;
// Lien neutre pour le destinataire (ni « campagne » ni paramètres de suivi visibles au survol).
const link=origin+'/go';
const text='font-family:Arial,Helvetica,sans-serif;color:#271504;text-decoration:none';
const ico=(file,size,alt)=>`<img src="${A}${file}.png" width="${size}" height="${size}" alt="${alt}" style="display:block;width:${size}px;height:${size}px;border:0">`;
const item=(file,alt,html)=>`<td valign="middle" style="padding:0 14px 0 0;white-space:nowrap"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td valign="middle" width="18" style="width:18px">${ico(file,18,alt)}</td><td valign="middle" style="padding-left:6px;font-size:12px;${text};white-space:nowrap">${html}</td></tr></table></td>`;
const a=(href,label)=>`<a href="${esc(href)}" style="${text}">${label}</a>`;
const row=cells=>`<tr><td style="padding:8px 0 0 0"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>${cells.join('')}</tr></table></td></tr>`;
const contacts=[],line2=[];
// Plusieurs numéros séparés par / , ou ; : un lien tel: par numéro.
const phones=phone.split(/[\/,;]/).map(x=>x.trim()).filter(Boolean);
if(phones.length)contacts.push(item('phone','Tél.',phones.map(x=>a('tel:'+x.replace(/[^+0-9]/g,''),esc(x))).join(' &nbsp;/&nbsp; ')));
if(email)line2.push(item('mail','Email',a('mailto:'+email,esc(email))));
if(settings.website)line2.push(item('web','Site web',a(origin+'/r/website','Site web')));
const socials=[['linkedin','LinkedIn'],['facebook','Facebook'],['instagram','Instagram'],['tiktok','TikTok']]
 .map(([key,label])=>`<td valign="middle" width="28" style="width:28px;padding-left:3px"><a href="${origin}/r/${key}" target="_blank" title="${label}" style="text-decoration:none">${ico(key,24,label)}</a></td>`).join('');
return `<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="width:100%;max-width:600px;border-collapse:collapse;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#271504">
<tr><td style="padding:12px 0 12px 0"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td valign="middle" width="80" style="width:80px;padding-right:16px;border-right:2px solid #C99A42"><img src="${A}logo.png" alt="IAS" width="80" style="display:block;width:80px;height:auto;border:0"></td>
<td valign="middle" style="padding-left:16px"><div style="font:bold 22px Arial,Helvetica,sans-serif;color:#271504;line-height:1.15">${name}</div><div style="font:bold 14px Arial,Helvetica,sans-serif;color:#A87928;padding-top:4px">${role}</div><div style="font:bold 12px Arial,Helvetica,sans-serif;color:#271504;padding-top:8px">Institut des Algorithmes du Sénégal</div><div style="font:italic 11px Arial,Helvetica,sans-serif;color:#816E56;padding-top:3px">Former, connecter, innover : l’IA au service de l’Afrique.</div></td>
</tr></table></td></tr>
<tr><td style="border-top:1px solid #D6AB60;font-size:1px;line-height:1px;height:1px">&nbsp;</td></tr>
${contacts.length?row(contacts):''}${line2.length?row(line2):''}
<tr><td style="padding:8px 0 10px 0"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse"><tr>
<td valign="middle"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>${item('location','Adresse','Dakar, Sénégal')}</tr></table></td>
<td align="right" valign="middle"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td valign="middle" style="font:bold 11px Arial,Helvetica,sans-serif;color:#271504;white-space:nowrap;padding-right:2px">Suivez l’IAS</td>${socials}</tr></table></td>
</tr></table></td></tr>
<tr><td style="padding:0 0 4px 0"><a href="${esc(link)}" target="_blank" style="text-decoration:none"><img src="${o.banner||origin+'/assets/campaigns.gif'}" alt="${esc(single?list[0].title:list.length?'Actualités de l’IAS':'')}" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0;outline:none"></a></td></tr>
${list.length?`<tr><td style="padding:0 0 8px 0;font:11px Arial,Helvetica,sans-serif"><a href="${esc(link)}" target="_blank" style="color:#9A6A20;text-decoration:underline">${single?'En savoir plus →':'Découvrir les actualités de l’IAS →'}</a></td></tr>`:''}
</table>`;
}
function update(){ $('preview').innerHTML=signature();if(!$('adminApp').hidden)campPreview() }
for(const id of ['fullName','role','email','phone'])$(id).addEventListener('input',update);
$('copyBtn').onclick=async()=>{try{const html=signature();const blob=new Blob([html],{type:'text/html'});if(navigator.clipboard?.write&&window.ClipboardItem){await navigator.clipboard.write([new ClipboardItem({'text/html':blob,'text/plain':new Blob([$('preview').innerText],{type:'text/plain'})})]);$('copyStatus').textContent='Signature formatée copiée. Collez-la dans Outlook.'}else{$('copyStatus').textContent='Copie formatée indisponible sur ce navigateur. Utilisez le téléchargement HTML.'}}catch(e){$('copyStatus').textContent='Copie impossible : utilisez le fichier HTML ou une connexion HTTPS.'}};
$('htmlBtn').onclick=()=>{const b=new Blob([`<!doctype html><html lang="fr"><meta charset="utf-8"><body>${signature()}</body></html>`],{type:'text/html'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='signature-ias.html';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};
function show(page){const isAdmin=page==='admin';$('employee').hidden=isAdmin;$('admin').hidden=!isAdmin;$('employeeTab').classList.toggle('active',!isAdmin);$('adminTab').classList.toggle('active',isAdmin);if(isAdmin)checkAdmin()}
$('employeeTab').onclick=()=>show('employee');$('adminTab').onclick=()=>show('admin');
async function load(){try{[campaigns,settings]=await Promise.all([api('/api/campaigns'),api('/api/settings')]);update()}catch{$('copyStatus').textContent='Serveur hors ligne : déployer ou démarrer l’application pour utiliser les campagnes.';update()}}
let me={};
async function checkAdmin(){try{me=await api('/api/me');$('loginBox').hidden=me.admin;$('adminApp').hidden=!me.admin;$('loginStatus').textContent=me.authenticated&&!me.admin?'Connecté en tant que '+(me.email||me.name)+', mais ce compte n’a pas le rôle administrateur.':'';$('loginBtn').textContent=me.authenticated?'Changer de compte Microsoft':'Se connecter avec Microsoft';$('logoutBtn').hidden=me.mode==='local';$('adminWho').textContent=me.admin?(me.name||me.email):'';if(me.admin){await refreshAdmin();await loadSettingsAdmin();campPreview()}}catch(e){$('loginStatus').textContent=e.message}}
$('loginBtn').onclick=()=>{location.href=me.loginUrl||'/.auth/login/aad'};
$('logoutBtn').onclick=()=>{location.href=me.logoutUrl||'/.auth/logout'};
const settingIds={website:'siteLink',linkedin:'linkedinLink',facebook:'facebookLink',instagram:'instagramLink',tiktok:'tiktokLink'};
async function loadSettingsAdmin(){settings=await api('/api/settings');for(const [key,id] of Object.entries(settingIds))$(id).value=settings[key]||'';update()}
$('saveLinksBtn').onclick=async()=>{try{const data={};for(const [key,id] of Object.entries(settingIds))data[key]=$(id).value.trim();await api('/api/admin/settings',{method:'POST',body:JSON.stringify(data)});$('linksStatus').textContent='Liens enregistrés.';await load()}catch(e){$('linksStatus').textContent=e.message}};
function clearForm(){$('campId').value='';$('campTitle').value='';$('campLink').value='';$('campOrder').value=adminCampaigns.length+1;$('campImage').value='';$('campActive').checked=true;$('saveStatus').textContent='';campPreview('')}
$('clearBtn').onclick=clearForm;
// Aperçu avant publication : même cadrage que make_gif.py (600x204, image entière, bandes #271504), dans la signature.
function bannerFrom(src){return new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>{const W=600,H=204,c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d');x.fillStyle='#271504';x.fillRect(0,0,W,H);const k=Math.min(W/im.width,H/im.height),w=Math.round(im.width*k),h=Math.round(im.height*k);x.drawImage(im,(W-w)>>1,(H-h)>>1,w,h);resolve(c.toDataURL('image/png'))};im.onerror=()=>reject(Error('Image illisible'));im.src=src})}
// Emplacement affiché tant qu'aucun visuel n'est choisi.
function bannerPlaceholder(){const W=600,H=204,c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d');x.fillStyle='#F5EBD8';x.fillRect(0,0,W,H);x.setLineDash([8,6]);x.strokeStyle='#C99A42';x.lineWidth=2;x.strokeRect(6,6,W-12,H-12);x.fillStyle='#9C6B1D';x.textAlign='center';x.font='bold 18px Arial';x.fillText('Votre visuel de campagne',W/2,H/2-6);x.font='13px Arial';x.fillText('1200×408 conseillé (ratio 3:1) · PNG, JPG, WebP ou GIF',W/2,H/2+18);return c.toDataURL('image/png')}
// Aperçu en temps réel : nom, lien, visuel et statut mettent à jour la signature à chaque modification.
let campSrc='',campBanner={src:null,url:''};
async function campPreview(src){
 if(src!==undefined)campSrc=src;
 try{if(campBanner.src!==campSrc)campBanner={src:campSrc,url:campSrc?await bannerFrom(campSrc):bannerPlaceholder()}}catch(e){campBanner={src:campSrc,url:bannerPlaceholder()};$('saveStatus').textContent=e.message}
 const title=$('campTitle').value.trim()||'Nom de la campagne',link=$('campLink').value.trim();
 $('campPreview').innerHTML=signature({banner:campBanner.url,campaigns:[{title}]});
 const info=['« '+title+' » (texte affiché si les images sont bloquées)',link?'Clic sur la bannière → '+link:'Clic sur la bannière → page de destination à renseigner'];
 if(!$('campActive').checked)info.push('Campagne inactive : elle ne sera pas affichée dans les signatures.');
 $('campPreviewInfo').textContent=info.join(' · ');
}
// Lecture en data: (la CSP autorise img-src data: mais pas blob:).
const readFile=f=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error('Fichier illisible'));r.readAsDataURL(f)});
$('campImage').onchange=async()=>{const f=$('campImage').files[0];$('saveStatus').textContent='';try{campPreview(f?await readFile(f):'')}catch(e){$('saveStatus').textContent=e.message}};
for(const id of ['campTitle','campLink'])$(id).addEventListener('input',()=>campPreview());
$('campActive').addEventListener('change',()=>campPreview());
$('saveBtn').onclick=async()=>{try{let imageData='';const file=$('campImage').files[0];if(file){if(file.size>5*1024*1024)throw Error('Image trop volumineuse');imageData=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file)})}let req={id:$('campId').value,title:$('campTitle').value,link:$('campLink').value,order:Number($('campOrder').value),active:$('campActive').checked,imageData};await api('/api/admin/campaigns',{method:'POST',body:JSON.stringify(req)});$('saveStatus').textContent='Campagne enregistrée.';clearForm();await refreshAdmin();await load()}catch(e){$('saveStatus').textContent=e.message}};
function campCard(c){const wrap=document.createElement('div');wrap.className='campaign';const im=document.createElement('img');im.src=c.image||'/assets/logo-ias.png';im.alt='';wrap.appendChild(im);const box=document.createElement('div');const strong=document.createElement('strong');strong.textContent=c.title;box.appendChild(strong);const p=document.createElement('p');p.textContent=(c.active?'Active':'Inactive')+' · ordre '+c.order;box.appendChild(p);const edit=document.createElement('button');edit.textContent='Modifier';edit.onclick=()=>{ $('campId').value=c.id;$('campTitle').value=c.title;$('campLink').value=c.link;$('campOrder').value=c.order;$('campActive').checked=c.active;$('campImage').value='';campPreview(c.image);window.scrollTo({top:250,behavior:'smooth'})};box.appendChild(edit);const del=document.createElement('button');del.className='delete';del.textContent='Supprimer';del.onclick=async()=>{if(confirm('Supprimer cette campagne ?')){await api('/api/admin/campaigns/'+encodeURIComponent(c.id),{method:'DELETE'});await refreshAdmin();await load()}};box.appendChild(del);wrap.appendChild(box);return wrap}
async function refreshAdmin(){adminCampaigns=await api('/api/admin/campaigns');const l=$('campaignList');l.replaceChildren();adminCampaigns.forEach(c=>l.appendChild(campCard(c)));if(!adminCampaigns.length)l.textContent='Aucune campagne. Ajoutez votre premier visuel.';const s=await api('/api/admin/stats');const stats=$('stats');stats.replaceChildren();const p=document.createElement('p');p.className='hint';p.textContent='Ouvertures de la page campagnes : '+(s.landing||0);stats.appendChild(p);adminCampaigns.forEach(c=>{const q=document.createElement('p');q.className='hint';q.textContent=c.title+' : '+(s[c.id]||0)+' clic(s)';stats.appendChild(q)})}
load();if(location.hash==='#admin')show('admin');
