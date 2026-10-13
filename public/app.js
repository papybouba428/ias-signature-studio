const $=id=>document.getElementById(id),esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let campaigns=[],adminCampaigns=[],settings={};
const origin=location.origin.startsWith('file:')?'http://localhost:3000':location.origin;
const api=async(path,opts={})=>{const r=await fetch(path,{credentials:'same-origin',...opts,headers:{'Content-Type':'application/json',...(opts.headers||{})}});const j=await r.json();if(!r.ok)throw Error(j.error||'Erreur');return j};
function signature(){
const name=esc($('fullName').value.trim()||'Votre nom'),role=esc($('role').value.trim()||'Votre fonction');
const email=$('email').value.trim(),phone=$('phone').value.trim();
const campaignImage=campaigns.length===1&&campaigns[0].image?origin+campaigns[0].image:origin+'/assets/campaigns.gif';
const campaign=campaigns.length?`<td valign="middle" width="225" style="width:225px;padding:8px 0 8px 14px;border-left:2px solid #C99A42"><a href="${origin}/go?utm_source=signature_email&amp;utm_medium=email&amp;utm_campaign=ias_multi" target="_blank" style="text-decoration:none"><img src="${campaignImage}" alt="Découvrez les actualités de l’IAS" width="210" height="72" style="display:block;width:210px;height:72px;border:0"></a><div style="font:10px Arial,sans-serif;color:#9A6A20;padding-top:5px">Découvrez nos actualités →</div></td>`:'';
const item=(text,href)=>`<td valign="middle" style="padding:6px 10px 6px 0;font:11px Arial,sans-serif;color:#271504;white-space:nowrap">${href?`<a href="${href}" style="color:#271504;text-decoration:none">${text}</a>`:text}</td>`;
const separator='<td width="1" style="width:1px;background:#D9B36B;font-size:1px">&nbsp;</td>';
const cells=[item('📍 Dakar, Sénégal','')];
if(phone)cells.push(item('☎ '+esc(phone),'tel:'+encodeURIComponent(phone.replace(/\s/g,''))));
if(email)cells.push(item('✉ '+esc(email),'mailto:'+encodeURIComponent(email)));
if(settings.website)cells.push(item('↗ Site web',esc(settings.website)));
const contact=cells.join(separator);
const socials=[['in',settings.linkedin],['f',settings.facebook],['◎',settings.instagram],['♪',settings.tiktok]];
const socialHtml=socials.filter(x=>x[1]).map(([symbol,url])=>`<a href="${esc(url)}" target="_blank" style="display:inline-block;background:#B58428;color:#fff;text-decoration:none;font:bold 11px Arial,sans-serif;padding:5px 7px;border-radius:20px;margin-left:4px">${symbol}</a>`).join('');
return `<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="740" style="width:740px;max-width:740px;border-collapse:separate;border-spacing:0;background:#fff;font-family:Arial,Helvetica,sans-serif;color:#271504">
<tr><td style="padding:15px 15px 10px 15px">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse"><tr>
<td valign="middle" width="100" style="width:100px;padding:4px 13px 4px 0;border-right:2px solid #C99A42"><img src="${origin}/assets/logo-ias.png" alt="IAS" width="85" style="width:85px;height:auto;display:block;border:0"></td>
<td valign="middle" style="padding:4px 15px"><div style="font:bold 23px Arial,sans-serif;color:#271504;line-height:1.15">${name}</div><div style="font:bold 15px Arial,sans-serif;color:#A87928;padding-top:5px">${role}</div><div style="font:bold 12px Arial,sans-serif;color:#271504;padding-top:10px">Institut des Algorithmes du Sénégal</div><div style="font:italic 10px Arial,sans-serif;color:#816E56;padding-top:4px">Former, connecter, innover : l’IA au service de l’Afrique.</div></td>
${campaign}
</tr></table></td></tr>
<tr><td style="padding:0 15px"><div style="border-top:1px solid #D6AB60;font-size:1px;height:1px">&nbsp;</div></td></tr>
<tr><td style="padding:5px 15px 9px"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse"><tr>
<td valign="middle"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>${contact}</tr></table></td>
<td align="right" valign="middle" style="white-space:nowrap;font:11px Arial,sans-serif;color:#271504"><strong>Suivez l’IAS</strong>${socialHtml}</td>
</tr></table></td></tr></table>`;
}
function update(){ $('preview').innerHTML=signature() }
for(const id of ['fullName','role','email','phone'])$(id).addEventListener('input',update);
$('copyBtn').onclick=async()=>{try{const html=signature();const blob=new Blob([html],{type:'text/html'});if(navigator.clipboard?.write&&window.ClipboardItem){await navigator.clipboard.write([new ClipboardItem({'text/html':blob,'text/plain':new Blob([$('preview').innerText],{type:'text/plain'})})]);$('copyStatus').textContent='Signature formatée copiée. Collez-la dans Outlook.'}else{$('copyStatus').textContent='Copie formatée indisponible sur ce navigateur. Utilisez le téléchargement HTML.'}}catch(e){$('copyStatus').textContent='Copie impossible : utilisez le fichier HTML ou une connexion HTTPS.'}};
$('htmlBtn').onclick=()=>{const b=new Blob([`<!doctype html><html lang="fr"><meta charset="utf-8"><body>${signature()}</body></html>`],{type:'text/html'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='signature-ias.html';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};
function show(page){const isAdmin=page==='admin';$('employee').hidden=isAdmin;$('admin').hidden=!isAdmin;$('employeeTab').classList.toggle('active',!isAdmin);$('adminTab').classList.toggle('active',isAdmin);if(isAdmin)checkAdmin()}
$('employeeTab').onclick=()=>show('employee');$('adminTab').onclick=()=>show('admin');
async function load(){try{[campaigns,settings]=await Promise.all([api('/api/campaigns'),api('/api/settings')]);update()}catch{$('copyStatus').textContent='Serveur hors ligne : déployer ou démarrer l’application pour utiliser les campagnes.';update()}}
async function checkAdmin(){try{const m=await api('/api/me');$('loginBox').hidden=m.admin;$('adminApp').hidden=!m.admin;if(m.admin){await refreshAdmin();await loadSettingsAdmin()}}catch(e){$('loginStatus').textContent=e.message}}
$('loginBtn').onclick=async()=>{try{await api('/api/login',{method:'POST',body:JSON.stringify({password:$('password').value})});$('password').value='';$('loginStatus').textContent='';await checkAdmin()}catch(e){$('loginStatus').textContent=e.message}};
$('logoutBtn').onclick=async()=>{await api('/api/logout',{method:'POST'});await checkAdmin()};
const settingIds={website:'siteLink',linkedin:'linkedinLink',facebook:'facebookLink',instagram:'instagramLink',tiktok:'tiktokLink'};
async function loadSettingsAdmin(){settings=await api('/api/settings');for(const [key,id] of Object.entries(settingIds))$(id).value=settings[key]||'';update()}
$('saveLinksBtn').onclick=async()=>{try{const data={};for(const [key,id] of Object.entries(settingIds))data[key]=$(id).value.trim();await api('/api/admin/settings',{method:'POST',body:JSON.stringify(data)});$('linksStatus').textContent='Liens enregistrés.';await load()}catch(e){$('linksStatus').textContent=e.message}};
function clearForm(){$('campId').value='';$('campTitle').value='';$('campLink').value='';$('campOrder').value=adminCampaigns.length+1;$('campImage').value='';$('campActive').checked=true;$('saveStatus').textContent=''}
$('clearBtn').onclick=clearForm;
$('saveBtn').onclick=async()=>{try{let imageData='';const file=$('campImage').files[0];if(file){if(file.size>5*1024*1024)throw Error('Image trop volumineuse');imageData=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file)})}let req={id:$('campId').value,title:$('campTitle').value,link:$('campLink').value,order:Number($('campOrder').value),active:$('campActive').checked,imageData};await api('/api/admin/campaigns',{method:'POST',body:JSON.stringify(req)});$('saveStatus').textContent='Campagne enregistrée.';clearForm();await refreshAdmin();await load()}catch(e){$('saveStatus').textContent=e.message}};
function campCard(c){const wrap=document.createElement('div');wrap.className='campaign';const im=document.createElement('img');im.src=c.image||'/assets/logo-ias.png';im.alt='';wrap.appendChild(im);const box=document.createElement('div');const strong=document.createElement('strong');strong.textContent=c.title;box.appendChild(strong);const p=document.createElement('p');p.textContent=(c.active?'Active':'Inactive')+' · ordre '+c.order;box.appendChild(p);const edit=document.createElement('button');edit.textContent='Modifier';edit.onclick=()=>{ $('campId').value=c.id;$('campTitle').value=c.title;$('campLink').value=c.link;$('campOrder').value=c.order;$('campActive').checked=c.active;window.scrollTo({top:250,behavior:'smooth'})};box.appendChild(edit);const del=document.createElement('button');del.className='delete';del.textContent='Supprimer';del.onclick=async()=>{if(confirm('Supprimer cette campagne ?')){await api('/api/admin/campaigns/'+encodeURIComponent(c.id),{method:'DELETE'});await refreshAdmin();await load()}};box.appendChild(del);wrap.appendChild(box);return wrap}
async function refreshAdmin(){adminCampaigns=await api('/api/admin/campaigns');const l=$('campaignList');l.replaceChildren();adminCampaigns.forEach(c=>l.appendChild(campCard(c)));if(!adminCampaigns.length)l.textContent='Aucune campagne. Ajoutez votre premier visuel.';const s=await api('/api/admin/stats');const stats=$('stats');stats.replaceChildren();const p=document.createElement('p');p.className='hint';p.textContent='Ouvertures de la page campagnes : '+(s.landing||0);stats.appendChild(p);adminCampaigns.forEach(c=>{const q=document.createElement('p');q.className='hint';q.textContent=c.title+' : '+(s[c.id]||0)+' clic(s)';stats.appendChild(q)})}
load();
