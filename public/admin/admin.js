/* Chase X Records admin */
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let token=null,me=null,view='dashboard',cache={},period=7,sf='all',bf='all',GCID='';
try{token=JSON.parse(localStorage.getItem('cx-token'))}catch(e){}
const fi=n=>`<i class="fas fa-${n}"></i>`;
function toast(m,t=''){const e=$('#toast');e.textContent=m;e.className='toast on '+t;clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.remove('on'),3000)}
async function api(p,o={}){const r=await fetch('/api'+p,{method:o.method||(o.body?'POST':'GET'),headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:o.body?JSON.stringify(o.body):undefined});
 const j=await r.json().catch(()=>({}));if(!r.ok){if(r.status===401&&token&&p!=='/auth/login'){localStorage.removeItem('cx-token');location.reload()}throw new Error(j.error||'Something went wrong.')}return j}
function openModal(h,wide){$('#box').className='box'+(wide?' wide':'');$('#box').innerHTML=h;$('#modal').classList.add('on')}
let liveCtl=null;
const closeModal=()=>{if(liveCtl){liveCtl.abort();liveCtl=null}$('#modal').classList.remove('on')};
const ask=(t,m,ok='Delete')=>new Promise(res=>{openModal(`<h2>${t}</h2><p class="sub">${m}</p><div class="mf"><button class="btn" id="mn">Cancel</button><button class="btn danger" id="my">${ok}</button></div>`);$('#my').onclick=()=>{closeModal();res(true)};$('#mn').onclick=()=>{closeModal();res(false)}});
function upload(file,onp){return new Promise((res,rej)=>{const x=new XMLHttpRequest();x.open('POST','/api/admin/upload?name='+encodeURIComponent(file.name));x.setRequestHeader('Authorization','Bearer '+token);
 x.upload.onprogress=e=>e.lengthComputable&&onp&&onp(e.loaded/e.total);x.onload=()=>{let j={};try{j=JSON.parse(x.responseText)}catch(e){}x.status<300?res(j.url):rej(new Error(j.error||'Upload failed.'))};x.onerror=()=>rej(new Error('Upload failed. Check the server is running.'));x.send(file)})}
const pick=(accept,multi)=>new Promise(res=>{const i=document.createElement('input');i.type='file';i.accept=accept;i.multiple=!!multi;i.onchange=()=>res([...i.files]);i.click()});
const pal=o=>o&&o.palette&&o.palette.length>=2?o.palette:['#00d4ff','#a855f7','#ec4899'];
const cov=(o,ci)=>{const u=o.artwork||o.image;return `<div class="cov${ci?' ci':''}" style="background:linear-gradient(140deg,${pal(o)[0]},${pal(o)[1]})">${u?`<img src="${esc(u)}" alt="" loading="lazy" onerror="this.remove()">`:''}</div>`};
const PLAT={youtube:['YouTube','ok'],spotify:['Spotify','ok'],soundcloud:['SoundCloud','ok'],audio:['Direct file','ok'],audiomack:['Audiomack · opens outside','warn'],apple:['Apple Music · opens outside','warn'],boomplay:['Boomplay · opens outside','warn'],external:['Other · opens outside','warn'],video:['Video file','warn'],none:['No link','bad']};
const plat=p=>{const x=PLAT[p]||PLAT.none;return `<span class="pill ${x[1]}">${x[0]}</span>`};
const GENRES=['Afro-Pop','Electronic','Dancehall','R&B','Afrobeat','Afro-House','Dance','House','Soul','Pop','Hip-Hop','Reggae','Jazz','Blues','Rock','Alternative','Indie','Folk','Country','Classical','Gospel','World Music','Latin','Funk','Disco'];
const dl=()=>`<datalist id="gl">${[...new Set([...GENRES,...(cache.tracks||[]).map(t=>t.genre).filter(Boolean)])].map(g=>`<option value="${esc(g)}">`).join('')}</datalist>`;
const fm=s=>{s=+s||0;return Math.floor(s/60)+':'+String(s%60).padStart(2,'0')};
const norm=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
const matchArtist=n=>{const k=norm(n);if(!k)return null;return (cache.artists||[]).find(a=>norm(a.name)===k)||(cache.artists||[]).find(a=>norm(a.name).includes(k)||k.includes(norm(a.name)))||null};
const when=d=>new Date(d).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'});

/* ---------- shell ---------- */
const NAV=[['MAIN',[['dashboard','Dashboard','gauge-high','Welcome back. Here is how Chase X Records is doing.']]],
 ['CONTENT',[['tracks','Songs','music','Add songs by link. Details are filled in for you.'],['artists','Artists','users','Artists you produce for and their pages in the app.'],['videos','Videos','film','Everything shown on the Watch tab.']]],
 ['STUDIO',[['bookings','Bookings','calendar-check','Studio sessions and lessons requested through the app.'],['services','Services & pricing','tags','What people can book, and for how long.']]],
 ['SYSTEM',[['reports','Reports','chart-column','Numbers you can download.'],['users','Users','users-gear','People with an account. Give trusted people admin access.'],['settings','Settings','gear','Home text, contact details and social links.']]]];
const ALL=NAV.flatMap(g=>g[1]);
function shell(){$('#root').innerHTML=`<div class="app"><nav class="side" id="side"><div class="logo">${fi('compact-disc')}<span>Chase X Records</span></div><div class="nav-c">${NAV.map(g=>`<h4>${g[0]}</h4>${g[1].map(n=>`<button class="ni" data-v="${n[0]}">${fi(n[2])}<span>${n[1]}</span>${n[0]==='bookings'?'<span class="bg hidden" id="bk">0</span>':''}</button>`).join('')}`).join('')}</div>
 <div class="uf"><div class="av">${fi('user-shield')}</div><div><b>${esc(me.name)}</b><span>Administrator</span></div><button id="out" title="Sign out" aria-label="Sign out">${fi('right-from-bracket')}</button></div></nav>
 <div class="main"><header class="hdr"><button class="menu" id="menu" aria-label="Menu">${fi('bars')}</button><div class="hl"><h1 id="pt"></h1><p id="ps"></p></div><div class="sb">${fi('magnifying-glass')}<input id="gs" placeholder="Search this page..." aria-label="Search this page"></div>
 <a class="ib" href="/" target="_blank" title="Open the app" aria-label="Open the app" style="display:grid;place-items:center">${fi('mobile-screen')}</a><button class="ib" id="bell" title="Pending bookings" aria-label="Pending bookings">${fi('bell')}<span class="n hidden" id="bn">0</span></button><button class="ib" id="fs" title="Full screen" aria-label="Full screen">${fi('expand')}</button></header><div id="view"></div></div></div>`;
 $$('.ni[data-v]').forEach(b=>b.onclick=()=>{go(b.dataset.v);$('#side').classList.remove('open')});$('#out').onclick=()=>{localStorage.removeItem('cx-token');localStorage.removeItem('cx-user');location.reload()};
 $('#menu').onclick=()=>$('#side').classList.toggle('open');$('#bell').onclick=()=>go('bookings');$('#fs').onclick=()=>document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen();
 $('#gs').oninput=e=>{const q=e.target.value.toLowerCase();$$('#view tbody tr,#view .grid3>.card,#view .li').forEach(r=>{r.style.display=r.textContent.toLowerCase().includes(q)?'':'none'})}}
function badge(n){['#bk','#bn'].forEach(s=>{const e=$(s);if(e){e.textContent=n;e.classList.toggle('hidden',!n)}})}
async function go(v){view=v;const n=ALL.find(x=>x[0]===v);$$('.ni[data-v]').forEach(b=>b.classList.toggle('on',b.dataset.v===v));$('#pt').textContent=n[1];$('#ps').textContent=n[3];$('#gs').value='';window.scrollTo(0,0);
 $('#view').innerHTML='<div class="empty">'+fi('circle-notch fa-spin')+'Loading...</div>';
 try{await VIEWS[v]()}catch(e){$('#view').innerHTML=`<div class="empty">${fi('triangle-exclamation')}${esc(e.message)}</div>`}}

/* ---------- dashboard ---------- */
async function dashboard(){const [s,t,a,v]=await Promise.all([api('/admin/stats?days='+period),api('/admin/tracks'),api('/admin/artists'),api('/admin/videos')]);cache.tracks=t;cache.artists=a;badge(s.counts.pending);
 const c=s.counts,mx=Math.max(1,...s.daily.map(d=>d.n)),tot=s.daily.reduce((x,d)=>x+d.n,0);
 const nl=t.filter(x=>!x.link&&x.status==='published').length,dr=t.filter(x=>x.status==='draft').length,np=a.filter(x=>!x.image).length;
 $('#view').innerHTML=`<div class="stats">${[['play','plays','Total plays'],['headphones','plays7','Plays this week'],['music','tracks','Songs'],['users','artists','Artists'],['film','views','Video views'],['user-group','users','App users'],['calendar-check','bookings','Bookings'],['hourglass-half','pending','Waiting for you']].map(x=>`<div class="card stat"><div class="ico">${fi(x[0])}</div><div><b>${Number(c[x[1]]||0).toLocaleString()}</b><span>${x[2]}</span></div></div>`).join('')}</div>
 <div class="grid2"><div class="card"><div class="bar" style="margin-bottom:12px"><h3 style="margin:0">Plays <span class="mut" style="font-weight:400;font-size:13px">· ${tot.toLocaleString()} in this period</span></h3><select id="pr" style="width:auto">${[7,30,90].map(d=>`<option value="${d}" ${d===period?'selected':''}>Last ${d} days</option>`).join('')}</select></div><div class="chart">${s.daily.map(d=>`<div title="${d.day}: ${d.n}"><i style="height:${Math.round(d.n/mx*100)}%"></i>${s.daily.length<=10?`${d.day}<b>${d.n}</b>`:''}</div>`).join('')}</div></div>
 <div class="card"><h3>Top songs</h3>${s.top.map((x,i)=>`<div class="li"><b class="mut" style="width:18px">${i+1}</b>${cov(x)}<div class="t"><b>${esc(x.title)}</b><span>${esc(x.artist||'')}</span></div><b>${x.plays}</b></div>`).join('')||`<div class="empty">${fi('music')}No plays yet.</div>`}</div></div>
 <div class="grid2"><div class="card"><h3>Needs your attention</h3>${[[nl,`${nl} published song${nl===1?' has':'s have'} no link, so nothing plays`,'tracks','link-slash'],[dr,`${dr} draft song${dr===1?' is':'s are'} not live yet`,'tracks','file-pen'],[np,`${np} artist${np===1?' has':'s have'} no photo`,'artists','image'],[s.counts.pending,`${s.counts.pending} booking${s.counts.pending===1?' is':'s are'} waiting for a reply`,'bookings','calendar']].filter(x=>x[0]).map(x=>`<div class="att">${fi(x[3])}<span>${x[1]}</span><button class="btn sm" data-g="${x[2]}">Open</button></div>`).join('')||`<div class="empty">${fi('circle-check')}All good. Nothing needs attention.</div>`}</div>
 <div class="card"><h3>Quick actions</h3><div style="display:grid;gap:10px"><button class="btn pri" id="qa1">${fi('plus')} Add a song from a link</button><button class="btn" id="qa2">${fi('layer-group')} Add many songs at once</button><button class="btn" id="qa3">${fi('film')} Add a video</button><button class="btn" id="qa4">${fi('user-plus')} Add an artist</button></div></div></div>
 <div class="card"><h3>Waiting for confirmation</h3>${s.pending.map(b=>`<div class="li"><div class="t"><b>${esc(b.name)}</b><span>${esc(b.service||b.kind)} · ${esc(b.date)} at ${esc(b.slot)}</span></div><button class="btn sm pri" data-ok="${b.id}">Confirm</button></div>`).join('')||`<div class="empty">${fi('inbox')}No pending bookings.</div>`}</div>`;
 $('#pr').onchange=e=>{period=+e.target.value;dashboard()};$$('[data-g]').forEach(b=>b.onclick=()=>go(b.dataset.g));
 $$('[data-ok]').forEach(b=>b.onclick=async()=>{await api('/admin/bookings/'+b.dataset.ok,{method:'PATCH',body:{status:'confirmed'}});toast('Confirmed','ok');dashboard()});
 $('#qa1').onclick=()=>songModal();$('#qa2').onclick=()=>bulkModal();$('#qa3').onclick=()=>videoModal();$('#qa4').onclick=()=>artistModal()}

/* ---------- songs ---------- */
async function tracks(){const [t,a]=await Promise.all([api('/admin/tracks'),api('/admin/artists')]);cache.tracks=t;cache.artists=a;
 const isW=x=>{const g=x.tags||[];if(g.includes('no-workout'))return false;return g.some(v=>/workout|gym|run/i.test(v))||x.bpm>=100};
 const F=[['all','All',t.length],['published','Live',t.filter(x=>x.status==='published').length],['draft','Drafts',t.filter(x=>x.status==='draft').length],['nolink','No link',t.filter(x=>!x.link).length],['workout','Workout',t.filter(isW).length]];
 const rows=t.filter(x=>sf==='all'||(sf==='nolink'?!x.link:sf==='workout'?isW(x):x.status===sf));
 $('#view').innerHTML=`<div class="bar"><div class="l">${F.map(f=>`<button class="chip ${sf===f[0]?'on':''}" data-f="${f[0]}">${f[1]} · ${f[2]}</button>`).join('')}</div><div class="l"><button class="btn" id="abtog" title="Keep a silent player running that measures songs that have no BPM, including new ones you add"></button><button class="btn" id="bpmall" title="Measure the BPM of songs that have none">${fi('gauge-high')} Detect BPMs</button><button class="btn" id="bulk">${fi('layer-group')} Add many</button><button class="btn pri" id="add">${fi('plus')} Add song</button></div></div>
 <div class="card tw"><table><thead><tr><th>Song</th><th>Link</th><th>BPM</th><th>Plays</th><th>Likes</th><th>Status</th><th></th></tr></thead><tbody>${rows.map(x=>`<tr><td><div class="cell">${cov(x)}<div class="t"><b>${esc(x.title)}</b><span>${esc(x.artist||'No artist')}${x.genre?' · '+esc(x.genre):''}</span></div></div></td><td>${plat(x.platform)}</td><td>${x.bpm?x.bpm+(x.bpm_source&&x.bpm_source!=='manual'?' <small class="mut" title="Measured automatically ('+x.bpm_source+')">auto</small>':''):'-'}</td><td>${x.plays}</td><td>${x.likes}</td>
 <td><button class="pill ${x.status==='published'?'ok':''}" data-st="${x.id}" title="Click to switch" style="border:0;cursor:pointer">${x.status==='published'?'Live':'Draft'}</button></td>
 <td><div class="acts">${x.link?`<a class="btn sm" href="${esc(x.link)}" target="_blank" rel="noopener" title="Open link">${fi('arrow-up-right-from-square')}</a>`:''}<button class="btn sm" data-e="${x.id}">${fi('pen')}</button><button class="btn sm danger" data-d="${x.id}">${fi('trash')}</button></div></td></tr>`).join('')||`<tr><td colspan="7"><div class="empty">${fi('music')}No songs here yet. Paste a link to add your first one.</div></td></tr>`}</tbody></table></div>`;
 $$('[data-f]').forEach(b=>b.onclick=()=>{sf=b.dataset.f;tracks()});$('#add').onclick=()=>songModal();$('#bpmall').onclick=bpmCenter;$('#abtog').onclick=()=>autoBpm(!AB.on);syncAb();
 $('#bulk').onclick=()=>bulkModal();
 $$('[data-e]').forEach(b=>b.onclick=()=>songModal(t.find(x=>x.id==b.dataset.e)));
 $$('[data-st]').forEach(b=>b.onclick=async()=>{const x=t.find(y=>y.id==b.dataset.st);await api('/admin/tracks/'+x.id,{method:'PUT',body:{status:x.status==='published'?'draft':'published'}});toast(x.status==='published'?'Moved to drafts':'Song is live','ok');tracks()});
 $$('[data-d]').forEach(b=>b.onclick=async()=>{const x=t.find(y=>y.id==b.dataset.d);if(await ask('Delete "'+esc(x.title)+'"?','Its play count and likes will be deleted too. This cannot be undone.')){await api('/admin/tracks/'+x.id,{method:'DELETE'});toast('Deleted');tracks()}})}

function artistOpts(sel){return `<option value="">No artist</option>${(cache.artists||[]).map(a=>`<option value="${a.id}" ${String(sel)===String(a.id)?'selected':''}>${esc(a.name)}</option>`).join('')}<option value="__new">+ New artist...</option>`}
async function ensureArtist(selVal,newName,genre){if(selVal==='__new'){const n=(newName||'').trim();if(!n)return null;const ex=matchArtist(n);if(ex&&norm(ex.name)===norm(n))return ex.id;const r=await api('/admin/artists',{body:{name:n,genre:genre||null,palette:['#00d4ff','#a855f7','#ec4899'],status:'active'}});cache.artists.push({id:r.id,name:n});return r.id}return selVal?+selVal:null}

function songModal(row){const v=row?{...row}:{status:'published',palette:['#00d4ff','#a855f7','#ec4899'],tags:[]};let det=null;
 openModal(`<h2>${row?'Edit song':'Add a song'}</h2><p class="sub">Paste the link and the details are filled in for you. Check them, then save.</p>${dl()}
 <div class="fetch"><input id="lk" type="url" placeholder="Paste a YouTube, Spotify, SoundCloud, Apple Music or .mp3 link" value="${esc(v.link||'')}"><button class="btn pri" id="ft">${fi('wand-magic-sparkles')} Get details</button></div><div class="hint" id="lh"></div><div class="cols" style="margin-top:8px;align-items:center"><button type="button" class="btn" id="aau">${fi('file-audio')} Upload audio file</button><small style="color:var(--mut,#8aa)">Optional. Upload an mp3 (up to 60 MB) to host it yourself: listeners can then save it for offline, and the BPM is measured for you.</small></div>
 <div class="prev"><div id="pv">${cov(v)}</div><div class="t" style="min-width:0"><b id="pt2" style="font-size:16px">${esc(v.title||'Song title')}</b><span id="pa2">${esc(v.artist||'Artist')}</span><div style="margin-top:8px" id="pp">${plat(v.platform||'none')}</div></div></div>
 <form id="sf"><div class="g2"><div class="f"><label>Title</label><input id="ti" required value="${esc(v.title||'')}"></div><div class="f"><label>Artist</label><select id="ar">${artistOpts(v.artist_id)}</select><input id="arn" class="hidden" style="margin-top:8px" placeholder="New artist name"></div></div>
 <div class="g2"><div class="f"><label>Genre</label><input id="ge" list="gl" value="${esc(v.genre||'')}" placeholder="Type or choose"></div><div class="f"><label>BPM</label><div class="cols"><input id="bp" type="number" min="40" max="260" value="${v.bpm||''}"><button type="button" class="btn" id="bd" title="Measure from the link">Detect</button><button type="button" class="btn" id="bf" title="Measure from an audio file on your computer">From file</button><button type="button" class="btn" id="bt" title="Tap along to the beat">Tap</button><button type="button" class="btn" id="bl" title="Play the YouTube, SoundCloud or Spotify link and measure it by listening">Listen</button></div><div id="lv" style="margin-top:8px"></div><small id="bh">Songs at 100 BPM or faster show on the Workout page by themselves. Leave it empty to measure it automatically.</small></div></div>
 <div class="f"><label>Artwork</label><div class="cols"><input id="aw" type="url" placeholder="Image link, or upload one" value="${esc(v.artwork||'')}"><button type="button" class="btn" id="au">${fi('upload')} Upload</button></div></div>
 <div class="g2"><div class="f"><label>Length (seconds)</label><input id="du" type="number" min="0" value="${v.duration||''}"><small id="dh">Optional. The player learns the real length when it plays.</small></div><div class="f"><label>Release date</label><input id="rd" type="date" value="${esc(String(v.release_date||'').slice(0,10))}"></div></div>
 <div class="f"><label>Tags</label><input id="tg" value="${esc((v.tags||[]).join(', '))}" placeholder="workout, new, gospel"><small>Add <b>workout</b> to always show it on the Workout page, or <b>no-workout</b> to keep it off.</small></div>
 <div class="f"><label>Cover colours (used when there is no artwork)</label><div class="cols">${[0,1,2].map(i=>`<input type="color" id="c${i}" value="${esc(pal(v)[i]||'#00d4ff')}">`).join('')}</div></div>
 <div class="g2"><div class="f"><label class="cols"><input type="checkbox" id="fe" ${v.featured?'checked':''}> Show in "Made for you" on Home</label></div><div class="f"><label>Status</label><select id="st"><option value="published" ${v.status==='published'?'selected':''}>Live</option><option value="draft" ${v.status==='draft'?'selected':''}>Draft (hidden)</option></select></div></div>
 <div class="mf"><button type="button" class="btn" id="cn">Cancel</button><button class="btn pri" id="sv">${fi('check')} Save song</button></div></form>`,true);
 const set=(id,val,force)=>{const e=$('#'+id);if(val&&(force||!e.value))e.value=val};
 const live=()=>{$('#pt2').textContent=$('#ti').value||'Song title';const sel=$('#ar');$('#pa2').textContent=sel.value==='__new'?($('#arn').value||'New artist'):(sel.selectedOptions[0]?.text.replace('No artist','Artist')||'Artist');
  const u=$('#aw').value;$('#pv').innerHTML=cov({artwork:u,palette:[$('#c0').value,$('#c1').value]})};
 const showNew=()=>$('#arn').classList.toggle('hidden',$('#ar').value!=='__new');
 async function fetchInfo(force){const u=$('#lk').value.trim(),h=$('#lh');if(!/^https?:\/\//i.test(u)){h.className='hint';h.textContent='';return}
  const dup=(cache.tracks||[]).find(x=>x.link===u&&(!row||x.id!==row.id));
  h.className='hint';h.innerHTML=fi('circle-notch fa-spin')+' Reading the link...';$('#ft').disabled=true;
  try{det=await api('/admin/link-info?url='+encodeURIComponent(u));$('#pp').innerHTML=plat(det.platform);
   set('ti',det.title,force);set('aw',det.artwork,force);if(det.duration)set('du',det.duration,force);
   if(det.artist&&($('#ar').value===''||force)){const m=matchArtist(det.artist);if(m)$('#ar').value=m.id;else{$('#ar').value='__new';$('#arn').value=det.artist}showNew()}
   $('#dh').textContent=$('#du').value?'= '+fm($('#du').value)+' minutes':'Optional.';
   h.className='hint '+(det.title?'ok':'err');h.innerHTML=(dup?fi('triangle-exclamation')+' This link is already in your library as "'+esc(dup.title)+'". ':'')+(det.title?fi('circle-check')+' Details found. Check them below.':fi('triangle-exclamation')+' '+esc(det.notes.join(' ')))+(det.title&&det.notes.length?' <span class="mut">'+esc(det.notes.join(' '))+'</span>':'');live()
  }catch(e){h.className='hint err';h.textContent=e.message}$('#ft').disabled=false}
 $('#ft').onclick=()=>fetchInfo(true);let t0;$('#lk').oninput=()=>{clearTimeout(t0);t0=setTimeout(()=>fetchInfo(false),600)};
 ['ti','aw','c0','c1','arn'].forEach(i=>$('#'+i).addEventListener('input',live));$('#ar').onchange=()=>{showNew();live()};
 $('#du').oninput=()=>$('#dh').textContent=$('#du').value?'= '+fm($('#du').value)+' minutes':'Optional.';
 $('#au').onclick=async()=>{const [f]=await pick('image/*');if(!f)return;$('#au').disabled=true;try{$('#aw').value=await upload(f);live();toast('Artwork uploaded','ok')}catch(e){toast(e.message,'bad')}$('#au').disabled=false};
/* BPM helpers: detect from the link, measure an audio file, or tap along */
 let bpmSrc=v.bpm_source||(v.bpm?'manual':null),taps=[];const bh=(m,c)=>{const h=$('#bh');if(!h)return;h.className=c||'';h.innerHTML=m};
 $('#bp').oninput=()=>{bpmSrc='manual'};
 const gotBpm=r=>{if(r.bpm){$('#bp').value=r.bpm;bpmSrc=r.source;bh(fi('circle-check')+' '+r.bpm+' BPM '+({audio:'measured from the audio file',file:'measured from the file',deezer:'found in the Deezer database',listen:'measured by listening to the song'}[r.source]||'')+(r.confidence==='low'?'. Not sure about this one, please check it.':'.'),'ok')}else bh(fi('triangle-exclamation')+' Could not measure it. '+esc((r.notes||[]).join(' '))+' Try From file or Tap.','err')};
 $('#bd').onclick=async()=>{const b=$('#bd');b.disabled=true;bh(fi('circle-notch fa-spin')+' Measuring...');try{const sel=$('#ar');gotBpm(await api('/admin/bpm/link',{body:{link:$('#lk').value.trim(),artist:sel.value==='__new'?$('#arn').value:(sel.selectedOptions[0]?.text||'').replace('No artist',''),title:$('#ti').value.trim()}}))}catch(e){bh(esc(e.message),'err')}b.disabled=false};
 $('#bf').onclick=async()=>{const [f]=await pick('audio/*,.mp3,.wav,.m4a,.ogg,.flac');if(!f)return;const b=$('#bf');b.disabled=true;bh(fi('circle-notch fa-spin')+' Measuring '+esc(f.name)+'...');try{const r=await fetch('/api/admin/bpm/file',{method:'POST',headers:{'Content-Type':'application/octet-stream',Authorization:'Bearer '+token},body:f});const j=await r.json();if(!r.ok)throw new Error(j.error||'Could not measure that file.');gotBpm(j)}catch(e){bh(esc(e.message),'err')}b.disabled=false};
 $('#aau').onclick=async()=>{const [f]=await pick('audio/*,.mp3,.m4a,.aac,.wav,.ogg,.flac');if(!f)return;const b=$('#aau');b.disabled=true;try{$('#lh').innerHTML=fi('circle-notch fa-spin')+' Uploading '+esc(f.name)+'...';const url=await upload(f,p=>{const h=$('#lh');if(h)h.innerHTML=fi('circle-notch fa-spin')+' Uploading '+Math.round(p*100)+'%'});$('#lk').value=url;$('#lh').innerHTML=fi('circle-check')+' Uploaded. Save the song and its BPM is measured automatically.';if(!$('#bp').value)bh('The BPM will be measured after you save.')}catch(e){$('#lh').textContent=e.message}b.disabled=false};
 $('#bl').onclick=async()=>{const link=$('#lk').value.trim();
  if(!BpmLive.embedFor(link)){bh(fi('triangle-exclamation')+' Listening works with YouTube, SoundCloud and Spotify links. Paste one in the link box first.','err');return}
  if(!BpmLive.supported()){bh(fi('triangle-exclamation')+' Listening needs desktop Chrome or Edge. Use Tap or From file instead.','err');return}
  const b=$('#bl');b.disabled=true;bh(fi('circle-notch fa-spin')+' In the box that appears, choose <b>This tab</b> and tick <b>Also share tab audio</b>.');
  liveCtl=new AbortController();let cap;
  try{cap=await BpmLive.startCapture();const r=await BpmLive.measureLink(cap,link,{host:$('#lv'),signal:liveCtl.signal,onProgress:p=>bh(fi('headphones')+' Listening... '+Math.min(48,Math.round(p.heard))+' of 48 seconds of music'+(p.heard<1&&p.waited>6?'. Press play in the player if it did not start.':''))});gotBpm({bpm:r.bpm,source:'listen',confidence:r.confidence})}
  catch(e){bh(esc(e.message),'err')}
  finally{BpmLive.stopCapture(cap);const v=$('#lv');if(v)v.innerHTML='';const bb=$('#bl');if(bb)bb.disabled=false}};
 $('#bt').onclick=()=>{const n=performance.now();if(taps.length&&n-taps[taps.length-1]>2500)taps=[];taps.push(n);if(taps.length<4){bh('Keep tapping to the beat ('+taps.length+'/4)');return}const iv=[];for(let i=1;i<taps.length;i++)iv.push(taps[i]-taps[i-1]);iv.sort((a,b)=>a-b);$('#bp').value=Math.round(60000/iv[Math.floor(iv.length/2)]);bpmSrc='tap';bh(fi('hand-pointer')+' '+$('#bp').value+' BPM from your taps. Keep going to refine it.','ok')};
 $('#cn').onclick=closeModal;if(row&&row.artist_id)showNew();
 $('#sf').onsubmit=async e=>{e.preventDefault();const b=$('#sv');b.disabled=true;
  try{const aid=await ensureArtist($('#ar').value,$('#arn').value,$('#ge').value);
   const body={title:$('#ti').value.trim(),artist_id:aid,genre:$('#ge').value.trim()||null,link:$('#lk').value.trim()||null,artwork:$('#aw').value.trim()||null,bpm:$('#bp').value?+$('#bp').value:null,bpm_source:$('#bp').value?(bpmSrc||'manual'):null,duration:$('#du').value?+$('#du').value:0,
    tags:$('#tg').value.split(',').map(s=>s.trim().toLowerCase()).filter(Boolean),palette:[$('#c0').value,$('#c1').value,$('#c2').value],featured:$('#fe').checked,status:$('#st').value};if($('#rd').value)body.release_date=$('#rd').value;
   await api(row?'/admin/tracks/'+row.id:'/admin/tracks',{method:row?'PUT':'POST',body});closeModal();toast('Song saved','ok');go('tracks');if(window.autoBpmKick)autoBpmKick()}catch(err){toast(err.message,'bad');b.disabled=false}}}

/* ---------- bulk add ---------- */
function bulkModal(){const items=[];
 openModal(`<h2>Add many songs at once</h2><p class="sub">Paste one link per line. Details are read for each, then you review and add them all.</p>${dl()}
 <div class="f"><textarea id="bl" rows="6" placeholder="https://www.youtube.com/watch?v=...\nhttps://open.spotify.com/track/...\nhttps://soundcloud.com/..."></textarea></div>
 <div class="g2"><div class="f"><label>Artist for all</label><select id="ba"><option value="">Detect from each link</option>${(cache.artists||[]).map(a=>`<option value="${a.id}">${esc(a.name)}</option>`).join('')}</select></div><div class="f"><label>Genre for all</label><input id="bg" list="gl" placeholder="Optional"></div></div>
 <div class="g2"><div class="f"><label>Add as</label><select id="bs"><option value="draft">Draft (review later)</option><option value="published">Live now</option></select></div><div class="f"><label class="cols" style="margin-top:28px"><input type="checkbox" id="bc" checked> Create artists that do not exist yet</label></div></div>
 <div class="mf" style="margin-top:0"><button class="btn" id="bx">Cancel</button><button class="btn pri" id="bf2">${fi('wand-magic-sparkles')} Read the links</button></div><div id="br" style="margin-top:18px"></div>`,true);
 $('#bx').onclick=closeModal;
 const draw=()=>{const ok=items.filter(i=>!i.skip&&i.title);$('#br').innerHTML=`<div class="card tw" style="background:var(--bg)"><table><tbody>${items.map((i,k)=>`<tr><td style="width:60px">${i.loading?fi('circle-notch fa-spin'):cov({artwork:i.artwork,palette:['#00d4ff','#a855f7']})}</td><td><input data-t="${k}" value="${esc(i.title)}" placeholder="Title" ${i.loading?'disabled':''}><div class="cols" style="margin-top:6px"><input data-a="${k}" value="${esc(i.artist)}" placeholder="Artist"><span>${plat(i.platform)}</span></div>${i.note?`<small class="mut">${esc(i.note)}</small>`:''}</td><td style="width:50px"><button class="btn sm danger" data-x="${k}" aria-label="Remove">${fi('xmark')}</button></td></tr>`).join('')}</tbody></table></div>
  ${items.length?`<div class="mf"><button class="btn pri" id="bgo" ${ok.length&&!items.some(i=>i.loading)?'':'disabled'}>${fi('check')} Add ${ok.length} song${ok.length===1?'':'s'}</button></div>`:''}`;
  $$('[data-t]').forEach(e=>e.oninput=()=>{items[e.dataset.t].title=e.value});$$('[data-a]').forEach(e=>e.oninput=()=>{items[e.dataset.a].artist=e.value});$$('[data-x]').forEach(b=>b.onclick=()=>{items.splice(+b.dataset.x,1);draw()});
  const go2=$('#bgo');if(go2)go2.onclick=save};
 $('#bf2').onclick=async()=>{const urls=[...new Set($('#bl').value.split(/\s+/).filter(u=>/^https?:\/\//i.test(u)))];if(!urls.length)return toast('Paste at least one link.','bad');
  items.length=0;urls.forEach(u=>items.push({url:u,title:'',artist:'',artwork:'',duration:0,platform:'none',loading:true,skip:false,note:''}));
  const dup=new Set((cache.tracks||[]).map(t=>t.link));draw();let n=0;
  const work=async()=>{while(n<items.length){const i=items[n++];try{const d=await api('/admin/link-info?url='+encodeURIComponent(i.url));Object.assign(i,{title:d.title,artist:d.artist||'',artwork:d.artwork,duration:d.duration,platform:d.platform,note:dup.has(i.url)?'Already in your library.':d.notes.join(' ')});if(dup.has(i.url))i.skip=true}catch(e){i.note=e.message}i.loading=false;draw()}};
  await Promise.all([work(),work(),work()])};
 async function save(){const b=$('#bgo');b.disabled=true;const list=items.filter(i=>!i.skip&&i.title);let done=0;
  try{for(const i of list){const sel=$('#ba').value;let aid=sel?+sel:null;if(!aid&&i.artist){const m=matchArtist(i.artist);if(m)aid=m.id;else if($('#bc').checked)aid=await ensureArtist('__new',i.artist,$('#bg').value)}
   await api('/admin/tracks',{body:{title:i.title.trim(),artist_id:aid,genre:$('#bg').value.trim()||null,link:i.url,artwork:i.artwork||null,duration:i.duration||0,palette:['#00d4ff','#a855f7','#ec4899'],tags:[],featured:false,status:$('#bs').value}});done++;b.textContent='Adding '+done+' / '+list.length+'...'}
   closeModal();toast(done+' song'+(done===1?'':'s')+' added','ok');go('tracks')}catch(e){toast(e.message+' ('+done+' added before the error)','bad');b.disabled=false}}}

/* ---------- artists ---------- */
async function artists(){const [a,t]=await Promise.all([api('/admin/artists'),api('/admin/tracks')]);cache.artists=a;cache.tracks=t;
 $('#view').innerHTML=`<div class="bar"><span class="mut">${a.length} artist${a.length===1?'':'s'}</span><button class="btn pri" id="add">${fi('plus')} Add artist</button></div>
 <div class="grid3">${a.map(x=>{const ts=t.filter(y=>y.artist_id===x.id);return `<div class="card ac"><div class="top">${cov(x,1)}<div class="t"><b style="font-size:16px">${esc(x.name)}</b><span>${esc(x.genre||'Artist')}</span></div><span class="pill ${x.status==='active'?'ok':''}" style="margin-left:auto">${x.status==='active'?'Active':'Hidden'}</span></div>
  ${x.bio?`<p>${esc(x.bio)}</p>`:''}<div class="mut" style="font-size:13px">${ts.length} song${ts.length===1?'':'s'} · ${ts.reduce((n,y)=>n+y.plays,0)} plays</div><div class="row"><button class="btn sm" data-e="${x.id}">${fi('pen')} Edit</button><button class="btn sm" data-s="${x.id}" title="Add a song for this artist">${fi('music')} Add song</button><button class="btn sm danger" data-d="${x.id}" aria-label="Delete">${fi('trash')}</button></div></div>`}).join('')||`<div class="empty card" style="grid-column:1/-1">${fi('users')}No artists yet. Add the artists you produce for.</div>`}</div>`;
 $('#add').onclick=()=>artistModal();$$('[data-e]').forEach(b=>b.onclick=()=>artistModal(a.find(x=>x.id==b.dataset.e)));
 $$('[data-s]').forEach(b=>b.onclick=()=>songModal({status:'published',palette:pal({}),tags:[],artist_id:+b.dataset.s}));
 $$('[data-d]').forEach(b=>b.onclick=async()=>{const x=a.find(y=>y.id==b.dataset.d),n=t.filter(y=>y.artist_id===x.id).length;if(await ask('Delete '+esc(x.name)+'?',n?`Their ${n} song${n===1?'':'s'} will stay in the app but will show no artist.`:'This cannot be undone.')){await api('/admin/artists/'+x.id,{method:'DELETE'});toast('Deleted');artists()}})}
function artistModal(row){const v=row||{status:'active',palette:['#00d4ff','#a855f7','#ec4899']};
 openModal(`<h2>${row?'Edit artist':'Add an artist'}</h2><p class="sub">Artists show on the Artists page of the app with all their songs.</p>${dl()}<form id="af">
 <div class="g2"><div class="f"><label>Name</label><input id="an" required value="${esc(v.name||'')}"></div><div class="f"><label>Genre</label><input id="ag" list="gl" value="${esc(v.genre||'')}"></div></div>
 <div class="f"><label>Bio</label><textarea id="ab" rows="3" placeholder="A line or two about the artist">${esc(v.bio||'')}</textarea></div>
 <div class="f"><label>Photo</label><div class="cols"><input id="ai" type="url" placeholder="Image link, or upload one" value="${esc(v.image||'')}"><button type="button" class="btn" id="au">${fi('upload')} Upload</button></div></div>
 <div class="g2"><div class="f"><label>Instagram</label><input id="ig" value="${esc(v.instagram||'')}" placeholder="@handle or link"></div><div class="f"><label>Status</label><select id="as"><option value="active" ${v.status==='active'?'selected':''}>Active (shown)</option><option value="inactive" ${v.status!=='active'?'selected':''}>Hidden</option></select></div></div>
 <div class="f"><label>Cover colours</label><div class="cols">${[0,1,2].map(i=>`<input type="color" id="c${i}" value="${esc(pal(v)[i]||'#00d4ff')}">`).join('')}</div></div>
 <div class="mf"><button type="button" class="btn" id="cn">Cancel</button><button class="btn pri">${fi('check')} Save artist</button></div></form>`);
 $('#cn').onclick=closeModal;$('#au').onclick=async()=>{const [f]=await pick('image/*');if(!f)return;try{$('#ai').value=await upload(f);toast('Photo uploaded','ok')}catch(e){toast(e.message,'bad')}};
 $('#af').onsubmit=async e=>{e.preventDefault();const body={name:$('#an').value.trim(),genre:$('#ag').value.trim()||null,bio:$('#ab').value.trim()||null,image:$('#ai').value.trim()||null,instagram:$('#ig').value.trim()||null,status:$('#as').value,palette:[$('#c0').value,$('#c1').value,$('#c2').value]};
  try{await api(row?'/admin/artists/'+row.id:'/admin/artists',{method:row?'PUT':'POST',body});closeModal();toast('Artist saved','ok');go('artists')}catch(err){toast(err.message,'bad')}}}

/* ---------- videos (Watch tab) ---------- */
const isFileUrl=u=>/\.(mp4|webm|mov)(\?|$)/i.test(u||'');
const vkind=v=>(v.parts&&v.parts.length)?['Uploaded','pr']:isFileUrl(v.url)?['Video link','pr']:/youtu/.test(v.url||'')?['YouTube','ok']:['No source','bad'];
async function videos(){const [v,t]=await Promise.all([api('/admin/videos'),api('/admin/tracks')]);cache.videos=v;cache.tracks=t;
 $('#view').innerHTML=`<div class="bar"><span class="mut">The first video is the one the Home "Watch video" button opens.</span><button class="btn pri" id="add">${fi('plus')} Add video</button></div>
 <div class="grid3">${v.map((x,i)=>{const k=vkind(x),yt=(x.url||'').match(/(?:v=|youtu\.be\/|embed\/|shorts\/|live\/)([\w-]{11})/),th=x.poster||(yt?`https://i.ytimg.com/vi/${yt[1]}/hqdefault.jpg`:'');return `<div class="card vc ac"><div class="thumb" style="background:linear-gradient(140deg,#00d4ff55,#a855f755)">${th?`<img src="${esc(th)}" alt="" loading="lazy" onerror="this.remove()">`:''}${fi('play')}</div>
  <div class="top" style="gap:8px"><div class="t" style="flex:1"><b>${esc(x.title)}</b><span>${esc(x.subtitle||'')}</span></div><span class="pill ${k[1]}">${k[0]}</span></div>
  <div class="mut" style="font-size:13px">${x.views} view${x.views===1?'':'s'}${x.parts&&x.parts.length>1?' · '+x.parts.length+' files play in order':''} · <span class="pill ${x.status==='published'?'ok':''}">${x.status==='published'?'Live':'Draft'}</span></div>
  <div class="row"><button class="btn sm" data-e="${x.id}">${fi('pen')} Edit</button><button class="btn sm" data-u="${x.id}" ${i===0?'disabled':''} title="Move up" aria-label="Move up">${fi('arrow-up')}</button><button class="btn sm" data-w="${x.id}" ${i===v.length-1?'disabled':''} title="Move down" aria-label="Move down">${fi('arrow-down')}</button><button class="btn sm danger" data-d="${x.id}" aria-label="Delete" style="margin-left:auto">${fi('trash')}</button></div></div>`}).join('')||`<div class="empty card" style="grid-column:1/-1">${fi('film')}No videos yet. Add a link or upload a video file.</div>`}</div>`;
 $('#add').onclick=()=>videoModal();$$('[data-e]').forEach(b=>b.onclick=()=>videoModal(v.find(x=>x.id==b.dataset.e)));
 const move=async(id,dir)=>{const i=v.findIndex(x=>x.id==id),j=i+dir;if(j<0||j>=v.length)return;const o=[...v];[o[i],o[j]]=[o[j],o[i]];await Promise.all(o.map((x,k)=>api('/admin/videos/'+x.id,{method:'PUT',body:{sort:k}})));videos()};
 $$('[data-u]').forEach(b=>b.onclick=()=>move(b.dataset.u,-1));$$('[data-w]').forEach(b=>b.onclick=()=>move(b.dataset.w,1));
 $$('[data-d]').forEach(b=>b.onclick=async()=>{const x=v.find(y=>y.id==b.dataset.d);if(await ask('Delete "'+esc(x.title)+'"?','It will disappear from the Watch tab.')){await api('/admin/videos/'+x.id,{method:'DELETE'});toast('Deleted');videos()}})}

function videoModal(row){const v=row||{status:'published'};let parts=[...(v.parts||[])],mode=parts.length?'up':'link';
 openModal(`<h2>${row?'Edit video':'Add a video'}</h2><p class="sub">Videos appear on the Watch tab. Use a link, or upload the video file itself.</p><form id="vf">
 <div class="g2"><div class="f"><label>Title</label><input id="vt" required value="${esc(v.title||'')}"></div><div class="f"><label>Subtitle</label><input id="vs" value="${esc(v.subtitle||'')}" placeholder="Chase X Records"></div></div>
 <div class="seg" role="tablist"><button type="button" data-m="link">${fi('link')} Video link</button><button type="button" data-m="up">${fi('upload')} Upload file</button></div>
 <div id="m-link"><div class="f"><div class="fetch" style="margin:0"><input id="vu" type="url" placeholder="YouTube link, or a direct link to an .mp4 file" value="${esc(v.url||'')}"><button type="button" class="btn pri" id="vg">${fi('wand-magic-sparkles')} Get details</button></div><small id="vh">YouTube links fill in the title and thumbnail for you.</small></div></div>
 <div id="m-up" class="hidden"><div class="f"><div class="drop"><div style="flex:1"><b>Video files</b><div class="mut" style="font-size:13px">mp4, webm or mov, up to 250 MB each. Several files play one after another without any numbering.</div><div class="prog hidden" id="vp"><i></i></div></div><button type="button" class="btn" id="vb">${fi('upload')} Choose file(s)</button></div><div class="parts" id="pl"></div></div></div>
 <div class="f"><label>Thumbnail</label><div class="cols"><input id="vi" type="url" placeholder="Image link, or upload one (YouTube is automatic)" value="${esc(v.poster||'')}"><button type="button" class="btn" id="vu2">${fi('image')} Upload</button></div></div>
 <div class="g2"><div class="f"><label>Linked song</label><select id="vk"><option value="">None</option>${(cache.tracks||[]).map(t=>`<option value="${t.id}" ${String(v.track_id)===String(t.id)?'selected':''}>${esc(t.title)}</option>`).join('')}</select><small>Adds a Video button in that song's player.</small></div>
 <div class="f"><label>Status</label><select id="vst"><option value="published" ${v.status==='published'?'selected':''}>Live</option><option value="draft" ${v.status==='draft'?'selected':''}>Draft (hidden)</option></select></div></div>
 <div class="mf"><button type="button" class="btn" id="cn">Cancel</button><button class="btn pri" id="vv">${fi('check')} Save video</button></div></form>`,true);
 const drawParts=()=>{$('#pl').innerHTML=parts.map((p,i)=>`<div class="li"><div class="t"><b>${esc(p.split('/').pop())}</b></div><button type="button" class="btn sm" data-pu="${i}" ${i===0?'disabled':''} aria-label="Move up">${fi('arrow-up')}</button><button type="button" class="btn sm" data-pd="${i}" ${i===parts.length-1?'disabled':''} aria-label="Move down">${fi('arrow-down')}</button><button type="button" class="btn sm danger" data-px="${i}" aria-label="Remove">${fi('xmark')}</button></div>`).join('');
  $$('[data-pu]').forEach(b=>b.onclick=()=>{const i=+b.dataset.pu;[parts[i-1],parts[i]]=[parts[i],parts[i-1]];drawParts()});$$('[data-pd]').forEach(b=>b.onclick=()=>{const i=+b.dataset.pd;[parts[i+1],parts[i]]=[parts[i],parts[i+1]];drawParts()});$$('[data-px]').forEach(b=>b.onclick=()=>{parts.splice(+b.dataset.px,1);drawParts()})};
 const setMode=m=>{mode=m;$$('.seg button').forEach(b=>b.classList.toggle('on',b.dataset.m===m));$('#m-link').classList.toggle('hidden',m!=='link');$('#m-up').classList.toggle('hidden',m!=='up')};
 $$('.seg button').forEach(b=>b.onclick=()=>setMode(b.dataset.m));setMode(mode);drawParts();$('#cn').onclick=closeModal;
 $('#vg').onclick=async()=>{const u=$('#vu').value.trim(),h=$('#vh');if(!u)return;h.textContent='Reading the link...';try{const d=await api('/admin/link-info?url='+encodeURIComponent(u));if(d.title&&!$('#vt').value)$('#vt').value=d.title;if(d.artwork&&!$('#vi').value)$('#vi').value=d.artwork;h.textContent=d.title?'Details found.':'Could not read details. Type them in.'}catch(e){h.textContent=e.message}};
 $('#vb').onclick=async()=>{const fs=await pick('video/*',true);if(!fs.length)return;const bar=$('#vp'),b=bar.firstElementChild;bar.classList.remove('hidden');
  try{for(let i=0;i<fs.length;i++){b.style.width='0';parts.push(await upload(fs[i],p=>b.style.width=((i+p)/fs.length*100)+'%'));drawParts()}toast('Upload complete','ok')}catch(e){toast(e.message,'bad')}bar.classList.add('hidden')};
 $('#vu2').onclick=async()=>{const [f]=await pick('image/*');if(!f)return;try{$('#vi').value=await upload(f);toast('Thumbnail uploaded','ok')}catch(e){toast(e.message,'bad')}};
 $('#vf').onsubmit=async e=>{e.preventDefault();if(mode==='up'&&!parts.length)return toast('Upload at least one video file.','bad');if(mode==='link'&&!$('#vu').value.trim())return toast('Paste a video link.','bad');
  const body={title:$('#vt').value.trim(),subtitle:$('#vs').value.trim()||null,url:mode==='link'?$('#vu').value.trim():null,parts:mode==='up'?parts:[],poster:$('#vi').value.trim()||null,track_id:$('#vk').value?+$('#vk').value:null,status:$('#vst').value};
  if(!row)body.sort=(cache.videos||[]).length;try{await api(row?'/admin/videos/'+row.id:'/admin/videos',{method:row?'PUT':'POST',body});closeModal();toast('Video saved','ok');go('videos')}catch(err){toast(err.message,'bad')}}}

/* ---------- bookings ---------- */
async function bookings(){const rows=await api('/admin/bookings'),p=rows.filter(r=>r.status==='pending').length;badge(p);
 const F=[['all','All'],['pending','Pending'],['confirmed','Confirmed'],['studio','Studio'],['lesson','Lessons'],['done','Done'],['cancelled','Cancelled']];
 const r=rows.filter(x=>bf==='all'||x.status===bf||x.kind===bf);
 $('#view').innerHTML=`<div class="bar"><div class="l">${F.map(f=>`<button class="chip ${bf===f[0]?'on':''}" data-f="${f[0]}">${f[1]}</button>`).join('')}</div></div><div class="card tw"><table><thead><tr><th>Who</th><th>What</th><th>When</th><th>Notes</th><th>Status</th></tr></thead><tbody>${r.map(x=>{const w=String(x.phone).replace(/\D/g,'');return `<tr><td class="t"><b>${esc(x.name)}</b><span><a href="https://wa.me/${w}" target="_blank" rel="noopener">${fi('whatsapp').replace('fas','fab')} ${esc(x.phone)}</a></span></td><td>${esc(x.service||x.kind)}<br><span class="pill pr">${x.kind==='lesson'?'Lesson':'Studio'}</span></td><td>${esc(x.date)}<br><span class="mut">${esc(x.slot)}</span></td><td style="max-width:240px">${esc(x.notes||'')}</td>
 <td><select data-b="${x.id}" style="width:140px">${['pending','confirmed','done','cancelled'].map(s=>`<option ${s===x.status?'selected':''}>${s}</option>`).join('')}</select></td></tr>`}).join('')||`<tr><td colspan="5"><div class="empty">${fi('calendar')}Nothing here.</div></td></tr>`}</tbody></table></div>`;
 $$('[data-f]').forEach(b=>b.onclick=()=>{bf=b.dataset.f;bookings()});
 $$('[data-b]').forEach(s=>s.onchange=async()=>{try{await api('/admin/bookings/'+s.dataset.b,{method:'PATCH',body:{status:s.value}});toast('Updated','ok');bookings()}catch(e){toast(e.message,'bad')}})}

/* ---------- services ---------- */
async function services(){const s=await api('/admin/services');
 $('#view').innerHTML=`<div class="bar"><span class="mut">Price 0 hides the price in the app.</span><button class="btn pri" id="add">${fi('plus')} Add service</button></div><div class="card tw"><table><thead><tr><th>Service</th><th>Type</th><th>Price (UGX)</th><th>Minutes</th><th>Bookable</th><th></th></tr></thead><tbody>${s.map(x=>`<tr><td class="t"><b>${esc(x.name)}</b><span>${esc(x.description||'')}</span></td><td><span class="pill pr">${x.kind==='lesson'?'Lesson':'Studio'}</span></td><td>${x.price?Number(x.price).toLocaleString():'-'}</td><td>${x.duration_min}</td><td>${x.active?'<span class="pill ok">Yes</span>':'<span class="pill">Hidden</span>'}</td><td><div class="acts"><button class="btn sm" data-e="${x.id}">${fi('pen')}</button><button class="btn sm danger" data-d="${x.id}">${fi('trash')}</button></div></td></tr>`).join('')||`<tr><td colspan="6"><div class="empty">${fi('tags')}No services yet.</div></td></tr>`}</tbody></table></div>`;
 $('#add').onclick=()=>svcModal();$$('[data-e]').forEach(b=>b.onclick=()=>svcModal(s.find(x=>x.id==b.dataset.e)));
 $$('[data-d]').forEach(b=>b.onclick=async()=>{if(await ask('Delete this service?','Past bookings keep their date and time.')){await api('/admin/services/'+b.dataset.d,{method:'DELETE'});toast('Deleted');services()}})}
function svcModal(row){const v=row||{kind:'studio',active:true,duration_min:60,price:0,sort:0};
 openModal(`<h2>${row?'Edit service':'Add a service'}</h2><p class="sub">Studio services and lessons people can book in the app.</p><form id="sf"><div class="g2"><div class="f"><label>Type</label><select id="sk"><option value="studio" ${v.kind==='studio'?'selected':''}>Studio</option><option value="lesson" ${v.kind==='lesson'?'selected':''}>Lesson</option></select></div><div class="f"><label>Name</label><input id="sn" required value="${esc(v.name||'')}"></div></div>
 <div class="f"><label>Short description</label><input id="sd" value="${esc(v.description||'')}"></div><div class="g2"><div class="f"><label>Price (UGX)</label><input id="sp" type="number" min="0" value="${v.price||0}"></div><div class="f"><label>Length (minutes)</label><input id="sm" type="number" min="15" step="15" value="${v.duration_min||60}"></div></div>
 <div class="g2"><div class="f"><label>Order</label><input id="so" type="number" value="${v.sort||0}"></div><div class="f"><label class="cols" style="margin-top:28px"><input type="checkbox" id="sa" ${v.active?'checked':''}> Available to book</label></div></div>
 <div class="mf"><button type="button" class="btn" id="cn">Cancel</button><button class="btn pri">${fi('check')} Save</button></div></form>`);$('#cn').onclick=closeModal;
 $('#sf').onsubmit=async e=>{e.preventDefault();const body={kind:$('#sk').value,name:$('#sn').value.trim(),description:$('#sd').value.trim()||null,price:+$('#sp').value||0,duration_min:+$('#sm').value||60,sort:+$('#so').value||0,active:$('#sa').checked};
  try{await api(row?'/admin/services/'+row.id:'/admin/services',{method:row?'PUT':'POST',body});closeModal();toast('Saved','ok');go('services')}catch(err){toast(err.message,'bad')}}}

/* ---------- reports ---------- */
function csv(name,rows){const k=Object.keys(rows[0]||{a:1}),q=v=>'"'+String(v??'').replace(/"/g,'""')+'"',b=new Blob([[k.map(q).join(','),...rows.map(r=>k.map(c=>q(r[c])).join(','))].join('\n')],{type:'text/csv'}),a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=name+'-'+new Date().toISOString().slice(0,10)+'.csv';a.click();toast('Downloaded','ok')}
async function reports(){const [t,a,b,u]=await Promise.all([api('/admin/tracks'),api('/admin/artists'),api('/admin/bookings'),api('/admin/users')]);
 const by=a.map(x=>{const ts=t.filter(y=>y.artist_id===x.id);return{name:x.name,songs:ts.length,plays:ts.reduce((n,y)=>n+y.plays,0),likes:ts.reduce((n,y)=>n+y.likes,0)}}).sort((x,y)=>y.plays-x.plays);
 const m={};b.forEach(x=>{const k=x.date.slice(0,7);m[k]=m[k]||{month:k,studio:0,lesson:0};m[k][x.kind]++});const bm=Object.values(m).sort((x,y)=>y.month.localeCompare(x.month));
 $('#view').innerHTML=`<div class="bar"><span class="mut">Download any table as a spreadsheet (CSV).</span><div class="l"><button class="btn" id="d1">${fi('download')} Songs</button><button class="btn" id="d2">${fi('download')} Bookings</button><button class="btn" id="d3">${fi('download')} Users</button></div></div>
 <div class="grid2" style="grid-template-columns:1fr 1fr"><div class="card"><h3>Plays by artist</h3>${by.map(x=>`<div class="li"><div class="t"><b>${esc(x.name)}</b><span>${x.songs} songs · ${x.likes} likes</span></div><b>${x.plays}</b></div>`).join('')||`<div class="empty">No artists yet.</div>`}</div>
 <div class="card"><h3>Bookings by month</h3>${bm.map(x=>`<div class="li"><div class="t"><b>${x.month}</b><span>${x.studio} studio · ${x.lesson} lessons</span></div><b>${x.studio+x.lesson}</b></div>`).join('')||`<div class="empty">No bookings yet.</div>`}</div></div>
 <div class="card"><h3>All songs by plays</h3>${[...t].sort((x,y)=>y.plays-x.plays).slice(0,15).map((x,i)=>`<div class="li"><b class="mut" style="width:22px">${i+1}</b>${cov(x)}<div class="t"><b>${esc(x.title)}</b><span>${esc(x.artist||'')}</span></div><span class="mut">${x.likes} likes</span><b style="min-width:40px;text-align:right">${x.plays}</b></div>`).join('')||`<div class="empty">No songs yet.</div>`}</div>`;
 $('#d1').onclick=()=>csv('songs',t.map(x=>({title:x.title,artist:x.artist,genre:x.genre,link:x.link,platform:x.platform,bpm:x.bpm,plays:x.plays,likes:x.likes,status:x.status,released:x.release_date})));
 $('#d2').onclick=()=>csv('bookings',b);$('#d3').onclick=()=>csv('users',u.map(x=>({name:x.name,email:x.email,role:x.role,joined:x.created_at})))}

/* ---------- users ---------- */
async function users(){const rows=await api('/admin/users');
 $('#view').innerHTML=`<div class="card tw"><table><thead><tr><th>Name</th><th>Email</th><th>Joined</th><th>Role</th><th></th></tr></thead><tbody>${rows.map(u=>`<tr><td><b>${esc(u.name)}</b></td><td>${esc(u.email)}</td><td>${when(u.created_at)}</td><td><span class="pill ${u.role==='admin'?'pr':''}">${u.role==='admin'?'Admin':'User'}</span></td><td><div class="acts">${u.id===me.id?'<span class="mut">You</span>':`<button class="btn sm" data-u="${u.id}" data-r="${u.role==='admin'?'user':'admin'}">${u.role==='admin'?'Remove admin':'Make admin'}</button>`}</div></td></tr>`).join('')}</tbody></table></div>`;
 $$('[data-u]').forEach(b=>b.onclick=async()=>{if(b.dataset.r==='admin'&&!await ask('Make this person an admin?','They will be able to change songs, videos, bookings and users.','Make admin'))return;try{await api('/admin/users/'+b.dataset.u,{method:'PATCH',body:{role:b.dataset.r}});toast('Updated','ok');users()}catch(e){toast(e.message,'bad')}})}

/* ---------- settings ---------- */
async function settings(){const [s,t]=await Promise.all([api('/admin/settings'),api('/admin/tracks')]);
 const G=[['Home screen','house',[['hero_title','Headline','text'],['hero_sub','Sub-line','text'],['hero_track','Song the Listen button plays','track']]],
  ['Contact','phone',[['contact_phone','Phone number','tel','+256 7XX XXX XXX'],['contact_whatsapp','WhatsApp number (with country code)','tel','2567XXXXXXXX'],['contact_email','Email','email'],['contact_location','Location','text','Mbale City, Eastern Region, Uganda']]],
  ['Social links','share-nodes',[['social_instagram','Instagram','url','https://instagram.com/...'],['social_youtube','YouTube channel','url','https://youtube.com/@...'],['social_tiktok','TikTok','url'],['social_twitter','X (Twitter)','url'],['social_spotify','Spotify artist page','url']]],
  ['Booking','calendar-check',[['slots','Times people can book (comma separated)','text','10:00,12:00,14:00,16:00']]],
  ['Workout page','dumbbell',[['workout_min_bpm','Show songs at or above this BPM on the Workout page','number','100']]]];
 $('#view').innerHTML=`<div class="grid3" style="grid-template-columns:repeat(auto-fit,minmax(380px,1fr))">${G.map((g,gi)=>`<form class="card" data-g="${gi}"><h3>${fi(g[1])} ${g[0]}</h3>${g[2].map(([k,l,ty,ph])=>`<div class="f"><label>${l}</label>${ty==='track'?`<select name="${k}">${t.map(x=>`<option value="${x.id}" ${String(s[k])===String(x.id)?'selected':''}>${esc(x.title)}</option>`).join('')}</select>`:`<input name="${k}" type="${ty}" value="${esc(s[k]||'')}" placeholder="${esc(ph||'')}">`}</div>`).join('')}<button class="btn pri">${fi('floppy-disk')} Save</button></form>`).join('')}</div>`;
 $$('form[data-g]').forEach(f=>f.onsubmit=async e=>{e.preventDefault();try{await api('/admin/settings',{method:'PUT',body:Object.fromEntries(new FormData(f))});toast('Saved','ok')}catch(err){toast(err.message,'bad')}})}

const VIEWS={dashboard,tracks,artists,videos,bookings,services,reports,users,settings};

/* ---------- login ---------- */
function login(msg=''){$('#root').innerHTML=`<div class="login"><form id="lf"><div class="logo">${fi('compact-disc')}Chase X Records</div><p class="mut" style="margin-bottom:22px">Admin sign in</p><div class="f"><label>Email</label><input name="email" type="email" required autocomplete="username"></div><div class="f"><label>Password</label><input name="password" type="password" required autocomplete="current-password"></div><p class="err" id="le" role="alert">${esc(msg)}</p><button class="btn pri" style="width:100%">${fi('right-to-bracket')} Sign in</button><div class="or">or</div><div class="gb" id="gb"></div></form></div>`;
 $('#lf').onsubmit=async e=>{e.preventDefault();try{enter(await api('/auth/login',{body:Object.fromEntries(new FormData(e.target))}))}catch(err){$('#le').textContent=err.message}};
 if(GCID){const s=document.createElement('script');s.src='https://accounts.google.com/gsi/client';s.onload=()=>{google.accounts.id.initialize({client_id:GCID,callback:async r=>{try{enter(await api('/auth/google',{body:{credential:r.credential}}))}catch(err){$('#le').textContent=err.message}}});google.accounts.id.renderButton($('#gb'),{theme:'filled_black',size:'large',shape:'pill',text:'signin_with',width:300})};document.head.appendChild(s)}else $('#gb').innerHTML='<span class="mut" style="font-size:12px">Google sign-in appears here once GOOGLE_CLIENT_ID is set.</span>'}
function enter(r){if(r.user.role!=='admin'){$('#le').textContent='This account is not an admin.';return}token=r.token;me=r.user;localStorage.setItem('cx-token',JSON.stringify(token));localStorage.setItem('cx-user',JSON.stringify(me));shell();go('dashboard');api('/admin/bookings').then(b=>badge(b.filter(x=>x.status==='pending').length)).catch(()=>{})}
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal()});
$('#modal').addEventListener('mousedown',e=>{if(e.target.id==='modal')closeModal()});
(async()=>{try{GCID=(await api('/config')).googleClientId||''}catch(e){}
 if(!token)return login();try{const r=await api('/me');if(r.user.role!=='admin')return login('Sign in with an admin account.');me=r.user;shell();go('dashboard');api('/admin/bookings').then(b=>badge(b.filter(x=>x.status==='pending').length)).catch(()=>{})}catch(e){login()}})();


/* ================= Detect BPMs: shows what happened, and lets you finish the rest by listening ================= */
const PLN={youtube:'YouTube',spotify:'Spotify',soundcloud:'SoundCloud',apple:'Apple Music',audiomack:'Audiomack',audio:'an audio file',none:'no link'};
async function bpmCenter(){
 openModal(`<h2>${fi('gauge-high')} Detect BPMs</h2><p class="sub" id="bsub">Checking your songs...</p><div id="bres"></div><div class="mf"><button class="btn" id="bcl">Close</button></div>`,true);
 $('#bcl').onclick=()=>{closeModal();go('tracks')};const t0=Date.now();
 let q;try{q=await api('/admin/bpm/missing',{method:'POST',body:{}})}catch(e){$('#bsub').textContent=e.message;return}
 if(q.queued){
  $('#bsub').innerHTML=fi('circle-notch fa-spin')+` Measuring ${q.queued} song${q.queued>1?'s':''}. Songs that link to an audio file are measured directly; the others are looked up in the Deezer database.`;
  for(let i=0;i<150;i++){await new Promise(r=>setTimeout(r,1500));if(!$('#bres'))return;let st;try{st=await api('/admin/bpm/status')}catch(e){break}if(st.pending===0)break}
 }
 if(!$('#bres'))return;
 let st={log:[]};try{st=await api('/admin/bpm/status')}catch(e){}
 const got=(st.log||[]).filter(l=>l.at>=t0-2000&&l.bpm),notes={};(st.log||[]).filter(l=>l.at>=t0-2000&&!l.bpm).forEach(l=>notes[l.id]=l.notes||[]);
 const all=await api('/admin/tracks'),left=all.filter(t=>!t.bpm&&t.link);
 const why=t=>{const n=(notes[t.id]||[]).filter(x=>!/Deezer/.test(x)).join(' ');return t.platform==='audio'?(n||'Could not read the audio file.'):`It streams from ${PLN[t.platform]||'a link'}, which does not share its audio, so it cannot be measured from the link.`};
 const canListen=left.filter(t=>BpmLive.embedFor(t.link));
 $('#bsub').innerHTML=got.length||left.length?`${got.length?fi('circle-check')+` <b>${got.length}</b> measured. `:''}${left.length?`<b>${left.length}</b> still need${left.length>1?'':'s'} a BPM.`:'Every song now has a BPM.'}`:'Every song already has a BPM.';
 $('#bres').innerHTML=(got.length?`<h3 style="margin:14px 0 6px">Measured</h3>${got.map(l=>`<div class="row" style="justify-content:space-between;padding:6px 0"><span>${esc(l.title)}</span><b>${l.bpm} BPM <small class="mut">${l.source==='deezer'?'from Deezer':'from the audio'}</small></b></div>`).join('')}`:'')
  +(left.length?`<h3 style="margin:16px 0 6px">Still without a BPM</h3><div id="lvl">${left.map(t=>`<div class="row" style="justify-content:space-between;gap:12px;padding:6px 0" data-t="${t.id}"><span><b>${esc(t.title)}</b><br><small class="mut">${esc(why(t))}</small></span><span class="mut" data-s="${t.id}"></span></div>`).join('')}</div>
   ${canListen.length&&BpmLive.supported()?`<p class="sub" style="margin-top:12px">${canListen.length} of these can be measured by <b>listening</b>: the songs play here one after another and the tempo is worked out from the sound. Nothing is recorded or saved. Your browser will ask to share this tab: choose <b>This tab</b> and tick <b>Also share tab audio</b>. It takes about a minute per song, so leave this window open.</p><button class="btn pri" id="blis">${fi('headphones')} Measure ${canListen.length} song${canListen.length>1?'s':''} by listening</button>`:`<p class="sub" style="margin-top:12px">${canListen.length?'Listening needs desktop Chrome or Edge. ':''}You can also open a song and use <b>Tap</b> (tap along to the beat) or <b>From file</b> (pick your own copy of the song).</p>`}`:'');
 if($('#blis'))$('#blis').onclick=()=>listenBatch(canListen);
}
async function listenBatch(list){
 const box=$('#bres');box.insertAdjacentHTML('afterbegin',`<div id="lvp" style="margin-bottom:8px"></div><div class="hint" id="lvs"></div>`);
 const b=$('#blis');if(b)b.replaceWith(Object.assign(document.createElement('button'),{className:'btn',id:'lvstop',textContent:'Stop'}));
 const ctl=liveCtl=new AbortController();$('#lvstop').onclick=()=>ctl.abort();
 let cap;try{cap=await BpmLive.startCapture()}catch(e){$('#lvs').className='hint err';$('#lvs').textContent=e.message;return}
 let done=0;
 for(const t of list){
  if(ctl.signal.aborted||!$('#lvs'))break;
  const mark=(h)=>{const c=$(`[data-s="${t.id}"]`);if(c)c.innerHTML=h};
  mark(fi('circle-notch fa-spin'));
  try{
   const r=await BpmLive.measureLink(cap,t.link,{host:$('#lvp'),signal:ctl.signal,onProgress:p=>{const e=$('#lvs');if(e)e.innerHTML=`${fi('headphones')} <b>${esc(t.title)}</b>: ${Math.min(48,Math.round(p.heard))} of 48 seconds heard (${done+1} of ${list.length})`+(p.heard<1&&p.waited>6?'. Press play in the player if it did not start.':'')}});
   await api('/admin/tracks/'+t.id,{method:'PUT',body:{bpm:r.bpm,bpm_source:'listen'}});done++;mark(`<b style="color:var(--ok,#3bff8a)">${r.bpm} BPM</b>`);
  }catch(e){if(ctl.signal.aborted)break;mark(`<small style="color:var(--bad,#ff6b6b)">${esc(e.message)}</small>`)}
 }
 BpmLive.stopCapture(cap);const lp=$('#lvp');if(lp)lp.innerHTML='';
 const e=$('#lvs');if(e){e.className='hint ok';e.innerHTML=`${fi('circle-check')} Done. ${done} of ${list.length} measured. Reload the song list to see the new BPMs. Check them by ear: if a YouTube video starts with an advert or a long intro, the reading can be off.`}
 const st=$('#lvstop');if(st)st.remove();
}


/* ================= Background listening =================
   A hidden, silent player measures every YouTube / SoundCloud / Spotify song that has no BPM, one after another, and keeps
   watching for new songs. The browser asks once (per visit) to share this tab's sound; after that it runs by itself while this
   admin page stays open (it can be minimised or in another window). */
const AB={on:false,cap:null,ctl:null,busy:false,wake:null,fail:(()=>{try{return JSON.parse(localStorage.getItem('cx-bpmfail')||'{}')}catch(e){return{}}})()};
const abWait=ms=>new Promise(r=>{const t=setTimeout(r,ms);AB.wake=()=>{clearTimeout(t);r()}});
window.autoBpmKick=()=>{if(AB.wake)AB.wake()};
function abChip(html){
 let c=$('#abchip');
 if(!c){c=document.createElement('div');c.id='abchip';c.style.cssText='position:fixed;left:16px;bottom:16px;z-index:60;background:#101a14;color:#e9f3ec;border:1px solid #2a3b30;border-radius:14px;padding:10px 14px;font-size:13px;max-width:340px;box-shadow:0 8px 30px #0009;display:flex;gap:10px;align-items:center';
  c.innerHTML='<span id="abt" style="flex:1"></span><button class="btn sm" id="abx"></button><div id="abh" style="position:fixed;left:-9999px;top:0;width:320px;height:220px;overflow:hidden"></div>';document.body.appendChild(c)}
 $('#abt').innerHTML=html;
 const x=$('#abx');x.textContent=AB.on?'Stop':'Resume';x.onclick=()=>autoBpm(!AB.on);
}
function abGone(){const c=$('#abchip');if(c)c.remove()}
function syncAb(){
 const b=$('#abtog');if(b){b.className='btn'+(AB.on?' pri':'');b.innerHTML=`${fi('headphones')} Background listening: ${AB.on?'On':'Off'}`}
 if(!AB.on&&localStorage.getItem('cx-autobpm')==='1')abChip('Background BPM listening was on. Resume it?');
}
async function autoBpm(on){
 if(on&&!AB.on){
  if(!BpmLive.supported()){toast('Background listening needs desktop Chrome or Edge.','bad');return}
  try{AB.cap=await BpmLive.startCapture({silent:true})}catch(e){toast(e.message,'bad');return}
  AB.on=true;AB.ctl=new AbortController();localStorage.setItem('cx-autobpm','1');syncAb();abChip('Starting...');abLoop();
 }else if(!on){
  AB.on=false;localStorage.removeItem('cx-autobpm');if(AB.ctl)AB.ctl.abort();if(AB.wake)AB.wake();BpmLive.stopCapture(AB.cap);AB.cap=null;abGone();syncAb();
 }
}
async function abLoop(){
 if(AB.busy)return;AB.busy=true;
 try{
  while(AB.on){
   if(AB.cap&&AB.cap.ended){AB.on=false;BpmLive.stopCapture(AB.cap);AB.cap=null;toast('Sharing stopped, so background listening is off.','bad');abGone();syncAb();break}
   let todo=[];
   try{todo=(await api('/admin/tracks')).filter(t=>!t.bpm&&t.link&&BpmLive.embedFor(t.link)&&!(AB.fail[t.id]>Date.now()-864e5))}catch(e){}
   if(!todo.length){abChip(`${fi('headphones')} Listening for new songs to measure. Leave this page open.`);await abWait(45000);continue}
   for(const t of todo){
    if(!AB.on)break;
    try{
     const r=await BpmLive.measureLink(AB.cap,t.link,{host:$('#abh'),signal:AB.ctl.signal,onProgress:p=>abChip(`${fi('headphones')} Measuring <b>${esc(t.title)}</b>: ${Math.round(p.heard)} of ${Math.round(p.seconds)} s (${todo.indexOf(t)+1} of ${todo.length})`)});
     await api('/admin/tracks/'+t.id,{method:'PUT',body:{bpm:r.bpm,bpm_source:'listen'}});
     toast(`${t.title}: ${r.bpm} BPM`,'ok');if(view==='tracks'&&!$('#modal').classList.contains('on'))go('tracks');
    }catch(e){
     if(!AB.on)break;
     AB.fail[t.id]=Date.now();localStorage.setItem('cx-bpmfail',JSON.stringify(AB.fail));
     toast(`Could not measure "${t.title}": ${e.message}`,'bad');
    }
   }
  }
 }finally{AB.busy=false}
}
