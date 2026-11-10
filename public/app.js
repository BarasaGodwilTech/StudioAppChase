/* Chase X Records - app. Songs are streaming LINKS (YouTube, Spotify, SoundCloud, direct mp3);
   playback happens inside the app's own player, plays are counted on the source platform too. */
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const sv=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}},ld=(k,d)=>{try{return JSON.parse(localStorage.getItem(k))??d}catch(e){return d}};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const S={tracks:[],artists:[],videos:[],services:[],settings:{},likes:new Set(ld('cx-token',null)?ld('cx-liked',[]):[]),bookings:[]};
let token=ld('cx-token',null),user=ld('cx-user',null),prefs=Object.assign({ap:1,a:1},ld('cx-prefs',{}));
let curTab=null,xseg=0,bseg=0,filter='All',q='',wf=0,vi=0,vload=-1,lp=0,plays=0;
let svc=-1,day=0,slot=-1,taken=[],bsent=false,bbusy=false,bf=Object.assign({name:'',phone:'',notes:''},{});
const PL={youtube:'YouTube',spotify:'Spotify',soundcloud:'SoundCloud',audio:'the web',audiomack:'Audiomack',apple:'Apple Music',boomplay:'Boomplay',external:'the web',none:''};
const nf=n=>{n=+n||0;return n>=1e6?(n/1e6).toFixed(1).replace(/\.0$/,'')+'M':n>=1e4?Math.round(n/1e3)+'K':n>=1e3?(n/1e3).toFixed(1).replace(/\.0$/,'')+'K':String(n)};
let recent=ld('cx-recent',[]),after=null,amsg='';
const SPIN='<span class="btn ld" style="width:30px;height:30px;background:none;box-shadow:none"><span></span></span>';
const TABS=[['home','Home','home'],['explore','Explore','search'],['watch','Watch','tv'],['book','Book','cal'],['you','You','user']];
const ic=(n,c='')=>`<svg class="ic ${c}"><use href="#i-${n}"/></svg>`;
const fm=s=>{s=Math.max(0,s||0);return Math.floor(s/60)+':'+String(Math.floor(s%60)).padStart(2,'0')};
const TK=id=>S.tracks.find(t=>t.id===+id),AR=id=>S.artists.find(a=>a.id===+id);
const pal=o=>o&&o.palette&&o.palette.length>=3?o.palette:['#3BFF8A','#0A6B42','#FFB224'];
const sty=o=>{const p=pal(o);return `--a:${p[0]};--b:${p[1]};--c:${p[2]}`};
const art=(o,c='',img)=>{const u=img||o.artwork||o.image;return `<div class="art ${c}" style="${sty(o)}">${u?`<img src="${esc(u)}" alt="" loading="lazy" onerror="this.remove()">`:''}</div>`};
const greet=()=>{const h=new Date().getHours();return h<12?'Good morning':h<18?'Good afternoon':'Good evening'};
const ini=()=>(user&&user.name?user.name[0]:'G').toUpperCase();
const pad=n=>String(n).padStart(2,'0'),iso=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const RM=matchMedia('(prefers-reduced-motion:reduce)').matches;
function toast(m){const e=$('#toast');e.textContent=m;e.classList.add('on');clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.remove('on'),3200)}
async function api(path,o={}){const r=await fetch('/api'+path,{method:o.method||(o.body?'POST':'GET'),headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:o.body?JSON.stringify(o.body):undefined});
 const j=await r.json().catch(()=>({}));if(!r.ok){if(r.status===401&&token&&path==='/me')signOut(true);throw new Error(j.error||'Something went wrong.')}return j}

/* ================= PLAYER ENGINE ================= */
const P={q:[],cur:null,playing:false,loading:false,time:0,dur:0,shuf:false,rep:false,listened:0,lt:0,counted:false,ended:false,nx:null,warmed:false,vol:+ld('cx-vol',1)};
let ACT=null;const D={};
const st=(n,v)=>ACT===n&&onState(v),tm=(n,t,d)=>ACT===n&&onTime(t,d),en=n=>ACT===n&&onEnd(),er=n=>ACT===n&&onErr();
const need=(src,test)=>new Promise((res,rej)=>{if(test())return res();if(!document.querySelector(`script[data-s="${src}"]`)){const s=document.createElement('script');s.src=src;s.dataset.s=src;s.onerror=()=>rej(new Error('blocked'));document.head.appendChild(s)}
 const iv=setInterval(()=>{if(test()){clearInterval(iv);res()}},100);setTimeout(()=>{clearInterval(iv);rej(new Error('timeout'))},12000)});
window.onYouTubeIframeAPIReady=()=>{};window.onSpotifyIframeApiReady=a=>{window.__sp=a};
const host=(html)=>$('#eng').insertAdjacentHTML('beforeend',`<div class="hostyt">${html}</div>`);

D.youtube={vol(v){this.ps.forEach(p=>{try{p&&p.setVolume&&p.setVolume(v*100)}catch(e){}})},ps:[null,null],ok:[0,0],rd:[null,null],cued:['',''],i:0,iv:null,get p(){return this.ps[this.i]},
 mk(slot,id){const me=this;const pr=new Promise(res=>{const el='ytp'+slot;host(`<div id="${el}"></div>`);
  const pl=new YT.Player(el,{width:200,height:200,videoId:id||undefined,playerVars:{playsinline:1,controls:0,rel:0,origin:location.origin},
   events:{onReady:()=>{me.ok[slot]=1;res(pl)},onStateChange:e=>{if(me.ps[me.i]!==pl)return;e.data===1?st('youtube',true):e.data===2?st('youtube',false):e.data===0&&en('youtube')},onError:()=>{if(me.ps[me.i]===pl)er('youtube')}}});
  me.ps[slot]=pl});me.rd[slot]=pr;return pr},
 async load(t,id){await need('https://www.youtube.com/iframe_api',()=>window.YT&&YT.Player);const o=1-this.i;
  if(!this.ps[this.i]){this.cued[this.i]=id;await this.mk(this.i,id);this.p.playVideo()}
  else{if(!this.ok[this.i])await this.rd[this.i];
   if(this.ps[o]&&this.ok[o]&&this.cued[o]===id){try{this.p.pauseVideo()}catch(e){}this.cued[this.i]='';this.i=o;this.p.playVideo();
    const slot=this.i,me=this;setTimeout(()=>{if(ACT==='youtube'&&me.i===slot&&P.cur===t.id){try{const s=me.p.getPlayerState();if(s===5||s===-1)me.p.loadVideoById(id)}catch(e){}}},3000)}
   else if(this.cued[this.i]===id&&this.p.getPlayerState&&this.p.getPlayerState()===5)this.p.playVideo();
   else{this.cued[this.i]=id;this.p.loadVideoById(id)}}
  clearInterval(this.iv);this.iv=setInterval(()=>{try{tm('youtube',this.p.getCurrentTime(),this.p.getDuration())}catch(e){}},250)},
 warm(id){if(!(window.YT&&YT.Player)||!id)return;const o=1-this.i;if(this.cued[o]===id)return;
  if(!this.ps[o]){this.cued[o]=id;this.mk(o,id)}else if(this.ok[o]){this.cued[o]=id;try{this.ps[o].cueVideoById(id)}catch(e){this.cued[o]=''}}},
 prime(id){if(this.ps[0]||!id||!(window.YT&&YT.Player))return;this.cued[0]=id;this.mk(0,id)},
 play(){this.p&&this.p.playVideo()},pause(){this.p&&this.p.pauseVideo()},seek(s){this.p&&this.p.seekTo(s,true)},stop(){clearInterval(this.iv);this.ps.forEach(p=>{try{p&&p.pauseVideo()}catch(e){}})}};

D.soundcloud={vol(v){try{this.w&&this.w.setVolume(v*100)}catch(e){}},w:null,d:0,async load(t,url){await need('https://w.soundcloud.com/player/api.js',()=>window.SC&&SC.Widget);this.d=0;
 const o='&auto_play=true&hide_related=true&visual=false&show_comments=false',gd=()=>this.w.getDuration(ms=>this.d=ms/1000);
 if(!this.w){host(`<iframe id="scp" allow="autoplay" src="https://w.soundcloud.com/player/?url=${encodeURIComponent(url)+o}"></iframe>`);this.w=SC.Widget($('#scp'));const E=SC.Widget.Events;
  this.w.bind(E.READY,gd);this.w.bind(E.PLAY,()=>st('soundcloud',true));this.w.bind(E.PAUSE,()=>st('soundcloud',false));this.w.bind(E.FINISH,()=>en('soundcloud'));this.w.bind(E.ERROR,()=>er('soundcloud'));
  this.w.bind(E.PLAY_PROGRESS,e=>tm('soundcloud',e.currentPosition/1000,this.d))}
 else this.w.load(url,{auto_play:true,hide_related:true,visual:false,callback:gd})},
 play(){this.w&&this.w.play()},pause(){this.w&&this.w.pause()},seek(s){this.w&&this.w.seekTo(s*1000)},stop(){this.w&&this.w.pause()}};

D.spotify={c:null,async load(t,uri){await need('https://open.spotify.com/embed/iframe-api/v1',()=>window.__sp);
 if(!this.c){host('<div id="spp"></div>');await new Promise(res=>window.__sp.createController($('#spp'),{uri,width:200,height:200},c=>{this.c=c;
  c.addListener('ready',()=>c.play());c.addListener('playback_update',e=>{const d=e.data;st('spotify',!d.isPaused);tm('spotify',d.position/1000,d.duration/1000);if(d.duration&&d.isPaused&&d.position>=d.duration-400)en('spotify')});res()}))}
 else{this.c.loadUri(uri);this.c.play()}},
 play(){this.c&&this.c.resume?this.c.resume():this.c&&this.c.play()},pause(){this.c&&this.c.pause()},seek(s){this.c&&this.c.seek(s)},stop(){try{this.c.pause()}catch(e){}}};

D.audio={vol(v){this.els.forEach(e=>e.volume=v)},els:[new Audio(),new Audio()],i:0,pre:'',init:0,get a(){return this.els[this.i]},
 bind(){if(this.init)return;this.init=1;this.els.forEach(el=>{const on=(ev,f)=>el.addEventListener(ev,()=>{if(el===this.a)f()});on('play',()=>st('audio',true));on('pause',()=>st('audio',false));on('ended',()=>en('audio'));on('error',()=>er('audio'));on('timeupdate',()=>tm('audio',el.currentTime,el.duration||0))})},
 load(t,url){this.bind();if(this.pre===url&&!this.els[1-this.i].error){this.a.pause();this.i=1-this.i;this.pre=''}else{this.pre='';this.a.src=url}return this.a.play().catch(()=>{})},
 warm(url){this.bind();if(!url||this.pre===url)return;const n=this.els[1-this.i];n.preload='auto';n.src=url;n.load();this.pre=url},
 play(){this.a.play().catch(()=>{})},pause(){this.a.pause()},seek(s){this.a.currentTime=s},stop(){this.els.forEach(e=>e.pause())}};

function ref(t){const l=t.link||'';
 if(t.platform==='youtube'){const m=l.match(/(?:v=|youtu\.be\/|embed\/|shorts\/|live\/)([\w-]{11})/);return m&&m[1]}
 if(t.platform==='spotify'){const m=l.match(/spotify\.com\/(?:intl-[a-z]+\/)?(track|episode)\/(\w+)/);return m&&`spotify:${m[1]}:${m[2]}`}
 return l}
function listFor(k){if(k==='L')return [...S.likes].filter(TK);if(k==='T')return S.tracks.filter(t=>t.plays>0).sort((a,b)=>b.plays-a.plays).slice(0,5).map(t=>t.id);if(k==='w')return S.tracks.filter(isW).map(t=>t.id);if(k&&k[0]==='a')return S.tracks.filter(t=>t.artist_id===+k.slice(1)).map(t=>t.id);return S.tracks.map(t=>t.id)}
/* Workout = tagged workout/gym/run, or fast enough (BPM at or above the limit, default 100). Tag a song no-workout to keep it out. */
const isW=t=>{const g=t.tags||[];if(g.some(x=>/^no-?workout$/i.test(x)))return false;if(g.some(x=>/workout|gym|run/i.test(x)))return true;return t.bpm>=(+(S.settings&&S.settings.workout_min_bpm)||100)};

async function playTrack(id,key){const t=TK(id);if(!t)return;
 const ids=listFor(key);P.q=ids.includes(t.id)?ids:S.tracks.map(x=>x.id);
 const kind=D[t.platform]?t.platform:null,r=kind&&ref(t);
 Object.assign(P,{cur:t.id,time:0,dur:t.duration||0,counted:false,listened:0,ended:false,playing:false,loading:!!r,lt:Date.now(),nx:null,warmed:false});
 recent=[t.id,...recent.filter(x=>x!==t.id)].slice(0,12);sv('cx-recent',recent);
 plays++;bars();renderCur();sync();
 if(!kind||!r){P.loading=false;sync();toast(t.link?`This link opens on ${PL[t.platform]}. Tap Open to listen there.`:'This track has no listening link yet.');return}
 if(ACT&&ACT!==kind)D[ACT].stop();ACT=kind;
 try{await D[kind].load(t,r)}catch(e){onErr()}setMedia(t)}
function setVol(){const d=ACT&&D[ACT];if(d&&d.vol)d.vol(P.vol)}
function onState(b){P.playing=b;if(b){setVol();P.loading=false;P.lt=Date.now();if(!P.warmed){P.warmed=true;setTimeout(warmNext,1800)}}sync()}
function onTime(t,d){P.time=t||0;if(d&&isFinite(d)&&d>0)P.dur=d;
 if(P.playing){const n=Date.now();P.listened+=Math.min(1,(n-P.lt)/1000);P.lt=n;
  if(!P.counted&&P.listened>=(P.dur>0&&P.dur<60?P.dur*.5:30)){P.counted=true;const cid=P.cur;fetch('/api/tracks/'+cid+'/play',{method:'POST'}).then(r=>r.ok?r.json():null).then(j=>{const t=TK(cid);if(j&&t&&j.plays>t.plays){t.plays=j.plays;updSc(cid)}}).catch(()=>{});const t=TK(cid);if(t){t.plays++;updSc(cid)}}}else P.lt=Date.now();tick()}
function onEnd(){if(P.ended)return;P.ended=true;if(P.rep&&ACT){P.counted=false;P.listened=0;D[ACT].seek(0);D[ACT].play();P.ended=false}else nextT()}
function onErr(){P.loading=false;P.playing=false;sync();const t=TK(P.cur);toast(`Could not play that link in the app. Tap Open to listen on ${PL[t&&t.platform]||'the source'}.`)}
function peekNext(){if(!P.q.length)return null;const i=P.q.indexOf(P.cur);
 if(P.shuf&&P.q.length>1){if(P.nx==null||P.nx===P.cur||!P.q.includes(P.nx))P.nx=P.q.filter(x=>x!==P.cur)[Math.floor(Math.random()*(P.q.length-1))];return P.nx}
 return P.q[(i+1)%P.q.length]}
function nextT(){const n=peekNext();if(n!=null)playTrack(n)}
/* Gets the next song ready in the background so it starts without a gap */
window.cxMedia={toggle:()=>toggle(),next:()=>nextT(),prev:()=>prevT()};
function warmNext(){const n=peekNext(),t=n!=null&&n!==P.cur&&TK(n);if(!t)return;if(t.artwork)(new Image).src=t.artwork;const d=D[t.platform],r=d&&d.warm&&ref(t);if(r)try{d.warm(r)}catch(e){}}
/* Streams: load the players ahead of the first tap, so the first song does not wait for them */
function warmup(){const pf=new Set(S.tracks.map(t=>t.platform));
 if(pf.has('youtube'))need('https://www.youtube.com/iframe_api',()=>window.YT&&YT.Player).catch(()=>{});
 if(pf.has('soundcloud'))need('https://w.soundcloud.com/player/api.js',()=>window.SC&&SC.Widget).catch(()=>{});
 if(pf.has('spotify'))need('https://open.spotify.com/embed/iframe-api/v1',()=>window.__sp).catch(()=>{})}
addEventListener('pointerdown',()=>{const t=TK(S.settings.hero_track)||S.tracks.find(x=>x.platform==='youtube');
 if(t&&t.platform==='youtube'){const r=ref(t);need('https://www.youtube.com/iframe_api',()=>window.YT&&YT.Player).then(()=>D.youtube.prime(r)).catch(()=>{})}},{once:true,passive:true});
const srcLine=t=>(PL[t.platform]&&t.platform!=='none'?'Streaming from '+PL[t.platform]:'No link yet')+' · '+nf(t.plays)+' stream'+(t.plays===1?'':'s');
function updSc(id){const t=TK(id);if(!t)return;$$('[data-sc="'+id+'"] b').forEach(b=>b.textContent=nf(t.plays));if(P.cur===id){const e=$('#nsrc');if(e)e.textContent=srcLine(t)}}
function prevT(){if(P.time>3&&ACT){D[ACT].seek(0)}else{const i=P.q.indexOf(P.cur);playTrack(P.q[(i-1+P.q.length)%P.q.length])}}
function toggle(){if(P.cur==null){const t=TK(S.settings.hero_track)||S.tracks[0];return t&&playTrack(t.id)}
 if(!ACT)return toast('Nothing to play for this track yet.');P.playing?D[ACT].pause():D[ACT].play()}
function seekFrac(f){if(ACT&&P.dur){D[ACT].seek(f*P.dur);P.time=f*P.dur;tick()}}
function setMedia(t){if(!('mediaSession' in navigator))return;try{
 navigator.mediaSession.metadata=new MediaMetadata({title:t.title,artist:t.artist||'Chase X Records',album:'Chase X Records',artwork:t.artwork?[{src:new URL(t.artwork,location.href).href}]:[]});
 const h=(a,f)=>{try{navigator.mediaSession.setActionHandler(a,f)}catch(e){}};h('play',toggle);h('pause',toggle);h('nexttrack',nextT);h('previoustrack',prevT);
 h('seekto',e=>{if(P.dur)seekFrac(e.seekTime/P.dur)});h('enterpictureinpicture',prefs.ap?()=>pip():null)}catch(e){}}

/* ---------- Picture-in-picture (floating mini player window) ---------- */
let pw=null;
const PIPCSS='*{box-sizing:border-box}body{margin:0;background:#0C1310;color:#F5FAF6;font:600 14px system-ui,sans-serif;overflow:hidden}.p{display:flex;gap:12px;align-items:center;padding:12px;height:100vh}.a{width:76px;height:76px;border-radius:16px;flex:none;background-size:cover;background-position:center}.m{flex:1;min-width:0}.m b,.m span{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.m span{color:#B4C4BA;font-weight:500;font-size:12px}.m i{display:block;height:4px;border-radius:2px;background:#243229;margin:10px 0 8px;overflow:hidden}.m u{display:block;height:100%;width:0;background:#3BFF8A}.c{display:flex;gap:4px;align-items:center}button{all:unset;width:34px;height:34px;display:grid;place-items:center;border-radius:50%;cursor:pointer}button:hover{background:#243229}button.g{background:#3BFF8A;color:#04130B}svg{width:18px;height:18px;fill:currentColor}';
const pI={prev:'<svg viewBox="0 0 24 24"><path d="M19 20 9 12l10-8z"/><path d="M5 4h2v16H5z"/></svg>',next:'<svg viewBox="0 0 24 24"><path d="m5 4 10 8-10 8z"/><path d="M17 4h2v16h-2z"/></svg>',play:'<svg viewBox="0 0 24 24"><path d="M7 4 20 12 7 20z"/></svg>',pause:'<svg viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>'};
async function pip(){
 if(pw){pw.close();return}
 if(P.cur==null)return toast('Play a song first, then open the floating player.');
 if(!('documentPictureInPicture' in window))return toast('The floating player needs Chrome or Edge on a computer. On phones, add the app to your home screen and use lock-screen controls.');
 try{pw=await documentPictureInPicture.requestWindow({width:360,height:124})}catch(e){return toast('Could not open the floating player.')}
 const d=pw.document;d.head.insertAdjacentHTML('beforeend','<style>'+PIPCSS+'</style>');
 d.body.innerHTML=`<div class="p"><div class="a" id="pa"></div><div class="m"><b id="pt"></b><span id="pr"></span><i><u id="pb"></u></i></div><div class="c"><button data-a="prev" aria-label="Previous">${pI.prev}</button><button class="g" data-a="toggle" id="pp" aria-label="Play or pause"></button><button data-a="next" aria-label="Next">${pI.next}</button></div></div>`;
 d.body.addEventListener('click',e=>{const a=e.target.closest('button');if(!a)return;a.dataset.a==='prev'?prevT():a.dataset.a==='next'?nextT():toggle()});
 pw.addEventListener('pagehide',()=>{pw=null});pipSync()}
function pipSync(){if(!pw)return;const d=pw.document,t=TK(P.cur);if(!t||!d.getElementById('pt'))return;
 d.getElementById('pt').textContent=t.title;d.getElementById('pr').textContent=t.artist||'';d.getElementById('pp').innerHTML=P.playing?pI.pause:pI.play;
 d.getElementById('pb').style.width=(P.dur?P.time/P.dur*100:0)+'%';const a=d.getElementById('pa'),p=pal(t);
 a.style.backgroundImage=t.artwork?`url("${t.artwork}")`:`linear-gradient(150deg,${p[0]},${p[1]})`}
document.addEventListener('visibilitychange',()=>{if(document.hidden&&prefs.ap&&P.playing&&!pw&&'documentPictureInPicture' in window)pip().catch(()=>{});vsync()});

/* ================= UI PIECES ================= */
const row=(t,k='',rk)=>{const on=P.cur===t.id,l=S.likes.has(t.id);return `<div class="row${on?' on':''}" data-a="play" data-i="${t.id}" data-l="${k}" role="button" tabindex="0" aria-label="Play ${esc(t.title)} by ${esc(t.artist||'')}">${rk?`<span class="rk">${rk}</span>`:''}${art(t,'s')}<div class="mt"><b>${esc(t.title)}</b><span>${esc(t.artist||'Chase X')}${t.genre?' · '+esc(t.genre):''}</span></div>${k==='w'&&t.bpm?`<span class="bpm">${t.bpm} BPM</span>`:''}<span class="sc" data-sc="${t.id}">${ic('chart')}<b>${nf(t.plays)}</b></span><span class="eq"><i></i><i></i><i></i></span><button class="ib" data-a="like" data-i="${t.id}" aria-pressed="${l}" aria-label="${l?'Unlike':'Like'} ${esc(t.title)}">${ic('heart',l?'f pk':'')}</button></div>`};
const card=t=>`<button class="card" data-a="play" data-i="${t.id}" aria-label="Play ${esc(t.title)}">${art(t)}<b>${esc(t.title)}</b><span>${esc(t.artist||'')}</span></button>`;
const acard=a=>`<button class="card" data-a="artist" data-i="${a.id}" aria-label="${esc(a.name)}">${art(a)}<b>${esc(a.name)}</b><span>${esc(a.genre||'Artist')}</span></button>`;
const empty=(m)=>`<p class="empty">${m}</p>`;
const yid=s=>{const m=String(s||'').match(/(?:v=|youtu\.be\/|embed\/|shorts\/|live\/)([\w-]{11})/);return m?m[1]:''};
const isFile=v=>(v.parts&&v.parts.length)||/\.(mp4|webm|mov)(\?|$)/i.test(v.url||''),srcs=v=>v.parts&&v.parts.length?v.parts:[v.url];
const vthumb=v=>isFile(v)?(v.poster?`<img class="yt" src="${esc(v.poster)}" alt="" loading="lazy" onerror="this.remove()">`:''):v.poster?`<img class="yt" src="${esc(v.poster)}" alt="" loading="lazy" onerror="this.remove()">`:yid(v.url)?`<img class="yt" src="https://i.ytimg.com/vi/${yid(v.url)}/hqdefault.jpg" alt="" loading="lazy" onerror="this.remove()">`:'';
const vid=i=>{const v=S.videos[i],t=TK(v.track_id)||{};return `<button class="vid" data-a="yt" data-i="${i}" aria-label="Play video: ${esc(v.title)}">${art(t)}${vthumb(v)}<span class="pb${isFile(v)?' lc':''}">${ic('play','f')}</span><span class="yl glass">${isFile(v)?'Official video':yid(v.url)?'YouTube':'Video'}</span></button>`};
const embed=i=>{const v=S.videos[i];fetch('/api/videos/'+v.id+'/view',{method:'POST'}).catch(()=>{});
 if(isFile(v)){const L=srcs(v);return `<video id="lv" controls playsinline autoplay ${v.poster?`poster="${esc(v.poster)}"`:''} src="${esc(L[lp]||L[0])}"></video>`}
 const y=yid(v.url);return y?`<iframe title="${esc(v.title)}" src="https://www.youtube-nocookie.com/embed/${y}?autoplay=1&playsinline=1&rel=0&modestbranding=1" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`
 :`<div style="position:absolute;inset:0;display:grid;place-items:center;padding:20px;text-align:center;background:#121B17;color:#B4C4BA">No video link added yet.</div>`};
const price=s=>s.price>0?`<small>UGX ${Number(s.price).toLocaleString()} · ${s.duration_min} min</small>`:`<small>${s.duration_min} min</small>`;

/* ================= SCREENS ================= */
function home(){const s=S.settings;$('#hg').textContent=greet();$('#hn').textContent=user?user.name:'Guest';
 const hv=$('#hav');hv.innerHTML=user&&user.avatar?`<img src="${esc(user.avatar)}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover" referrerpolicy="no-referrer">`:esc(ini());
 $('#ht').textContent=s.hero_title||'Chase X';$('#hs').textContent=s.hero_sub||'';
 const fe=S.tracks.filter(t=>t.featured),mf=fe.length?fe:S.tracks.slice(0,6);
 const lk=[...S.likes].map(TK).filter(Boolean),rc=recent.map(TK).filter(Boolean).slice(0,10),tp=S.tracks.filter(t=>t.plays>0).sort((a,b)=>b.plays-a.plays).slice(0,5);
 $('#hrest').innerHTML=`<div class="quick rise" style="--d:1"><button class="qk" data-a="go2" data-t="explore" data-s="1"><i>${ic('users')}</i>Artists</button><button class="qk" data-a="go2" data-t="explore" data-s="2"><i>${ic('dumb')}</i>Workout</button><button class="qk" data-a="go2" data-t="book" data-s="1"><i>${ic('cap')}</i>Lessons</button><button class="qk" data-a="go2" data-t="book" data-s="0"><i>${ic('mic')}</i>Studio</button></div>
 ${token?'':`<div class="gate rise" style="--d:2"><i>${ic('heart')}</i><div><b>Save songs and book sessions</b><span>Sign in to like songs and request bookings.</span></div><button class="gb" data-a="signin">Sign in</button></div>`}
 ${rc.length?`<div class="sec rise" style="--d:2"><h2>Recently played</h2></div><div class="shelf rise" style="--d:3">${rc.map(card).join('')}</div>`:''}
 <div class="sec rise" style="--d:2"><h2>Made for you</h2><button class="lnk" data-a="go2" data-t="explore" data-s="0">See all</button></div>
 <div class="shelf rise" style="--d:3">${mf.map(card).join('')||empty('No songs yet.')}</div>
 ${lk.length?`<div class="sec rise" style="--d:3"><h2>Your likes</h2><button class="lnk" data-a="tab" data-t="liked">See all</button></div><div class="shelf rise" style="--d:4">${lk.slice(0,12).map(card).join('')}</div>`:''}
 ${tp.length?`<div class="sec rise" style="--d:4"><h2>Top streams</h2></div><div class="rows rise" style="--d:4">${tp.map((t,i)=>row(t,'T',i+1)).join('')}</div>`:''}
 ${S.artists.length?`<div class="sec rise" style="--d:4"><h2>Artists</h2><button class="lnk" data-a="go2" data-t="explore" data-s="1">See all</button></div><div class="shelf ashelf rise" style="--d:5">${S.artists.map(acard).join('')}</div>`:''}
 ${S.videos.length?`<div class="sec rise" style="--d:5"><h2>Watch</h2><button class="lnk" data-a="tab" data-t="watch">See all</button></div><div class="shelf vs rise" style="--d:6">${S.videos.map((v,i)=>vid(i)).join('')}</div>`:''}
 <button class="promo rise" style="--d:6" data-a="go2" data-t="book" data-s="0"><span class="tile">${ic('mic')}</span><div><b>Book the studio</b><span>Recording, mixing, mastering and lessons</span></div>${ic('go')}</button>
 <div class="sec rise" style="--d:7"><h2>New releases</h2></div><div class="rows rise" style="--d:7">${S.tracks.slice(0,8).map(t=>row(t)).join('')}</div>`}

function explore(){const segs=['Songs','Artists','Workout'];
 let h=`<div class="hd rise"><h1>Explore</h1></div><div class="seg2 rise" style="--n:3;--i:${xseg}">${segs.map((s,i)=>`<button data-a="xseg" data-i="${i}" aria-pressed="${i===xseg}">${s}</button>`).join('')}</div>`;
 if(xseg===0){const gens=[...new Set(S.tracks.map(t=>t.genre).filter(Boolean))];
  h+=`<label class="search rise" style="--d:1">${ic('search')}<input id="qi" type="search" placeholder="Search songs, artists, genres" aria-label="Search" value="${esc(q)}"></label><div class="chips rise" style="--d:2">${['All',...gens].map(g=>`<button class="chip" data-a="chip" data-g="${esc(g)}" aria-pressed="${g===filter}">${esc(g)}</button>`).join('')}</div><div id="xres"></div>`}
 else if(xseg===1)h+=`<div class="rise" style="--d:1">${S.artists.map(a=>`<button class="arow" data-a="artist" data-i="${a.id}">${art(a)}<div><b>${esc(a.name)}</b><span>${esc(a.genre||'Artist')} · ${S.tracks.filter(t=>t.artist_id===a.id).length} songs</span></div><span class="go">${ic('go')}</span></button>`).join('')||empty('No artists yet.')}</div>`;
 else{const B=[['All',0,999],['Warm-up',0,109],['Cardio',110,134],['Sprint',135,999]],w=S.tracks.filter(isW).filter(t=>wf===0||(t.bpm>=B[wf][1]&&t.bpm<=B[wf][2])).sort((a,b)=>(a.bpm||0)-(b.bpm||0));
  h+=`<div class="hero2 rise" style="--d:1"><h1>Workout</h1><p>High-energy tracks from Chase X Records to keep you moving.</p><button class="btn" data-a="wplay"${w.length?'':' disabled'}><svg class="ic f" style="width:18px;height:18px"><use href="#i-play"/></svg><span>Play all</span></button></div>
  <div class="chips rise" style="--d:2;margin-top:0">${B.map((b,i)=>`<button class="chip" data-a="wf" data-i="${i}" aria-pressed="${i===wf}">${b[0]}</button>`).join('')}</div><div class="rows rise" style="--d:3;margin-top:12px">${w.map(t=>row(t,'w')).join('')||empty('No workout songs yet. In the admin, add the tag "workout" to a song.')}</div>`}
 $('#explore').innerHTML=h;if(xseg===0){xres();const i=$('#qi');i.oninput=e=>{q=e.target.value;xres()}}}
function xres(){const qq=q.toLowerCase(),r=S.tracks.filter(t=>(filter==='All'||t.genre===filter)&&(t.title+(t.artist||'')+(t.genre||'')).toLowerCase().includes(qq));
 $('#xres').innerHTML=`<div class="sec"><h2>${q||filter!=='All'?r.length+' result'+(r.length===1?'':'s'):'All songs'}</h2></div><div class="rows">${r.map(t=>row(t)).join('')||empty('No matches. Try another word or genre.')}</div>`}

function openArtist(id){const a=AR(id);if(!a)return;const ts=S.tracks.filter(t=>t.artist_id===a.id);
 $('#artist').innerHTML=`<button class="ib bd" data-a="aclose" aria-label="Back">${ic('chev')}</button><div class="ahead">${art(a)}<h1>${esc(a.name)}</h1><small style="color:var(--t3)">${esc(a.genre||'')}</small><small style="color:var(--t3)">${nf(ts.reduce((n,t)=>n+(t.plays||0),0))} streams</small>${a.bio?`<p>${esc(a.bio)}</p>`:''}
 <div class="cta" style="margin-top:10px"><button class="btn" data-a="aplay" data-i="${a.id}"${ts.length?'':' disabled'}>${ic('play','f')}<span>Play</span></button>${a.instagram?`<a class="btn btn2" style="margin:0;width:auto;padding:0 22px;height:52px;text-decoration:none" href="${esc(/^http/.test(a.instagram)?a.instagram:'https://instagram.com/'+a.instagram.replace('@',''))}" target="_blank" rel="noopener">Instagram</a>`:''}</div></div>
 <div class="sec"><h2>Songs</h2></div><div class="rows">${ts.map(t=>row(t,'a'+a.id)).join('')||empty('No songs yet.')}</div>`;
 $('#artist').dataset.id=a.id;$('#artist').inert=false;$('#artist').classList.add('on');$('#artist').scrollTop=0}
const closeArtist=()=>{$('#artist').classList.remove('on');$('#artist').inert=true;$('#artist').dataset.id=''};

function watch(){if(!S.videos.length){$('#watch').innerHTML=`<div class="hd"><h1>Watch</h1></div>${empty('No videos yet.')}`;return}
 const v=S.videos[vi]||S.videos[0],ch=S.settings.social_youtube||S.settings.channel_url;
 $('#watch').innerHTML=`<div class="hd rise"><div><small>Chase X videos</small><h1>Watch</h1></div></div>
 <div class="rise" style="--d:1" id="wp">${vload===vi?`<div class="vid">${embed(vi)}</div>`:vid(vi)}</div>
 <div class="rise" style="--d:2;margin:16px 0 4px"><h2>${esc(v.title)}</h2><p style="margin:2px 0 14px;color:var(--t2)">${esc(v.subtitle||'')}</p>
 <div style="display:flex;gap:10px">${isFile(v)&&(document.pictureInPictureEnabled||NPIP)?`<button class="btn btn2" style="margin:0;height:50px" data-a="vpip">${ic('pip')}<span>Floating</span></button>`:''}${ch?`<a class="btn btn2" style="margin:0;height:50px;text-decoration:none" href="${esc(ch)}" target="_blank" rel="noopener noreferrer">${ic('ext')}<span>YouTube channel</span></a>`:''}</div></div>
 <div class="sec rise" style="--d:3"><h2>More from Chase X</h2></div><div class="rise" style="--d:4">${S.videos.map((x,i)=>i===vi?'':`<div class="row" data-a="vsel" data-i="${i}" role="button" tabindex="0">${art(TK(x.track_id)||{},'s')}<div class="mt"><b>${esc(x.title)}</b><span>${esc(x.subtitle||'')}</span></div>${ic('tv')}</div>`).join('')||empty('That is every video for now.')}</div>`}

function book(){const kind=bseg?'lesson':'studio',list=S.services.filter(s=>s.kind===kind),dn=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],d0=new Date(),ds=[...Array(14)].map((_,i)=>{const d=new Date(d0);d.setDate(d0.getDate()+i);return d});
 const slots=(S.settings.slots||'10:00,12:00,14:00,16:00,18:00,20:00').split(',').map(s=>s.trim()).filter(Boolean),today=day===0,nowH=d0.getHours()+d0.getMinutes()/60;
 const past=s=>today&&(+s.split(':')[0]+(+s.split(':')[1]||0)/60)<=nowH+1;
 const w=(S.settings.contact_whatsapp||'').replace(/\D/g,''),sel=list[svc];
 $('#book').innerHTML=`<div class="bgh"><div class="bgv"><video data-bg src="videos/hero-2.mp4" poster="videos/poster-2.jpg" muted loop playsinline preload="metadata" aria-hidden="true" tabindex="-1"></video></div><div class="bt"><small>Chase X Records</small><h1>${bseg?'Music lessons':'Studio time'}</h1></div></div>
 <div class="seg2 rise" style="--n:2;--i:${bseg}"><button data-a="bseg" data-i="0" aria-pressed="${!bseg}">Studio</button><button data-a="bseg" data-i="1" aria-pressed="${!!bseg}">Lessons</button></div>
 ${bsent?`<div class="pc rise" style="flex-direction:column;align-items:flex-start;gap:6px"><h2>Request sent</h2><p>We will confirm by phone shortly. ${sel?esc(sel.name)+' · '+ds[day].toDateString()+' at '+esc(slots[slot]||''):''}</p>${w?`<a class="btn" style="margin-top:8px;text-decoration:none" target="_blank" rel="noopener" href="https://wa.me/${w}?text=${encodeURIComponent('Hi Chase X Records, I just requested '+(sel?sel.name:'a session')+' on '+ds[day].toDateString()+' at '+(slots[slot]||'')+'.')}">${ic('wa')}<span>Message us on WhatsApp</span></a>`:''}${S.settings.contact_phone?`<a class="btn btn2" style="margin-top:8px;text-decoration:none" href="tel:${esc(S.settings.contact_phone.replace(/[^+\d]/g,''))}"><span>Call the studio</span></a>`:''}<button class="btn btn2" data-a="bagain" style="margin-top:8px"><span>Book another</span></button></div>`:
 `<div class="sec rise" style="margin-top:0"><h2>1 · ${bseg?'Lesson':'Service'}</h2></div><div class="sg rise">${list.map((s,i)=>`<button class="svc" data-a="svc" data-i="${i}" aria-pressed="${i===svc}"><b>${esc(s.name)}</b><span>${esc(s.description||'')}</span>${price(s)}</button>`).join('')||empty('Nothing to book here yet.')}</div>
 <div class="sec rise"><h2>2 · Day</h2></div><div class="days rise">${ds.map((d,i)=>`<button class="day" data-a="day" data-i="${i}" aria-pressed="${i===day}"><small>${dn[d.getDay()]}</small><b>${d.getDate()}</b></button>`).join('')}</div>
 <div class="sec rise"><h2>3 · Time</h2></div><div class="slots rise">${slots.map((s,i)=>`<button class="slot" data-a="slot" data-i="${i}" aria-pressed="${i===slot}" aria-disabled="${taken.includes(s)||past(s)}">${s}</button>`).join('')}</div>
 ${token?'':`<div class="gate rise"><i>${ic('user')}</i><div><b>Sign in to book</b><span>You need an account so we can confirm your booking.</span></div><button class="gb" data-a="signin">Sign in</button></div>`}
 <div class="sec rise"><h2>4 · Your details</h2></div><div class="rise"><div class="fld"><label for="bn">Name</label><div class="inw"><input id="bn" data-f="name" value="${esc(bf.name||(user?user.name:''))}" autocomplete="name"></div></div><div class="fld"><label for="bp2">Phone (WhatsApp if possible)</label><div class="inw"><input id="bp2" data-f="phone" type="tel" value="${esc(bf.phone)}" placeholder="07XX XXX XXX" autocomplete="tel"></div></div><div class="fld"><label for="bo">Notes (optional)</label><textarea id="bo" data-f="notes" rows="2" placeholder="Songs, goals, what you need">${esc(bf.notes)}</textarea></div></div>
 <button class="btn rise${bbusy?' ld':''}" style="margin-top:14px" data-a="dobook"><span>${token?'Request this ':'Sign in to request this '}${bseg?'lesson':'session'}</span></button>`}`}
async function loadTaken(){const d=new Date();d.setDate(d.getDate()+day);try{taken=await api(`/bookings/taken?kind=${bseg?'lesson':'studio'}&date=${iso(d)}`)}catch(e){taken=[]}if(curTab==='book')book();vsync()}

const SOC=[['instagram','Instagram'],['youtube','YouTube'],['tiktok','TikTok'],['twitter','X'],['spotify','Spotify']];
function socials(){const st=S.settings,l=SOC.filter(x=>st['social_'+x[0]]);return l.length?`<div class="sec rise" style="--d:4;margin-top:22px"><h2>Follow Chase X</h2></div><div class="chips rise" style="--d:4;margin:0">${l.map(x=>`<a class="chip" style="text-decoration:none;display:inline-flex;align-items:center;gap:6px" href="${esc(st['social_'+x[0]])}" target="_blank" rel="noopener noreferrer">${esc(x[1])}</a>`).join('')}</div>`:''}
function you(){const u=user||{name:'Guest',email:''},ad=user&&user.role==='admin';
 $('#you').innerHTML=`<div class="hd rise"><h1>Account</h1></div>
 <div class="pc rise" style="--d:1"><div class="av">${user&&user.avatar?`<img src="${esc(user.avatar)}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover" referrerpolicy="no-referrer">`:esc(ini())}</div><div><h2>${esc(u.name)}</h2><p>${esc(u.email||'Guest session')}</p></div></div>
 <div class="stats rise" style="--d:2"><div><b>${S.likes.size}</b><span>Liked</span></div><div><b>${plays}</b><span>Played</span></div><div><b>${S.bookings.length}</b><span>Bookings</span></div></div>
 ${S.likes.size?`<div class="sec rise" style="--d:3;margin-top:22px"><h2>Liked songs</h2><button class="lnk" data-a="tab" data-t="liked">See all</button></div><div class="shelf rise" style="--d:3">${[...S.likes].map(TK).filter(Boolean).slice(0,10).map(card).join('')}</div>`:''}
 ${S.bookings.length?`<div class="sec rise" style="--d:3;margin-top:22px"><h2>My bookings</h2></div><div class="rise" style="--d:3">${S.bookings.slice(0,5).map(b=>`<div class="bk"><div><b>${esc(b.service||b.kind)}</b><span>${esc(b.date)} · ${esc(b.slot)}</span></div><span class="st ${esc(b.status)}">${esc(b.status)}</span></div>`).join('')}</div>`:''}
 <div class="rise" style="--d:4;margin-top:14px">${[['ap','Floating player when I leave the tab (desktop)'],['a','Autoplay hero video']].map(s=>`<div class="sr"><span id="l${s[0]}">${s[1]}</span><button class="sw" role="switch" aria-labelledby="l${s[0]}" aria-checked="${!!prefs[s[0]]}" data-a="sw" data-k="${s[0]}"></button></div>`).join('')}</div>
 ${socials()}
 ${ad?`<a class="btn btn2 rise" style="--d:5;margin-top:18px;text-decoration:none" href="/admin">${ic('user')}<span>Open admin panel</span></a>`:''}
 <button class="btn btn2 rise" style="--d:5;margin-top:12px;${user?'color:var(--er)':''}" data-a="${user?'out':'signin'}"><span>${user?'Sign out':'Sign in or create account'}</span></button>`}

function liked(){const ts=[...S.likes].map(TK).filter(Boolean);
 $('#liked').innerHTML=`<div class="lkh rise"><div class="lkt">${ic('heart','f')}</div><div><small>Playlist</small><h1>Liked songs</h1><p>${token?ts.length+' song'+(ts.length===1?'':'s'):'Sign in to save songs here'}</p></div></div>
 ${token?`<div class="cta rise" style="--d:1;margin:0 0 16px"><button class="btn" data-a="lplay"${ts.length?'':' disabled'}>${ic('play','f')}<span>Play all</span></button><button class="btn btn2" data-a="lshuf"${ts.length?'':' disabled'}>${ic('shuf')}<span>Shuffle</span></button></div><div class="rows rise" style="--d:2">${ts.map(t=>row(t,'L')).join('')||empty('Tap the heart on any song and it will show up here.')}</div>`
 :`<div class="gate rise" style="--d:1"><i>${ic('heart')}</i><div><b>Your liked songs live here</b><span>Sign in to like songs and keep them all in one place.</span></div><button class="gb" data-a="signin">Sign in</button></div>`}`}
const R={home,explore,watch,book,you,liked};
function go(n){const ix=k=>{const j=TABS.findIndex(x=>x[0]===k);return j<0?TABS.findIndex(x=>x[0]==='you'):j},i=ix(n),pi=curTab?ix(curTab):i,d=i>=pi?1:-1;curTab=n;$('#app').classList.remove('nh');closeArtist();
 $$('.scr').forEach(s=>{const on=s.id===n,was=s.classList.contains('on');if(on&&!was){s.style.setProperty('--dx',(28*d)+'px');void s.offsetWidth}else if(!on&&was)s.style.setProperty('--dx',(-28*d)+'px');
  s.classList.toggle('on',on);s.classList.toggle('fresh',on);s.inert=!on;if(on){s.scrollTop=0;clearTimeout(s.ft);s.ft=setTimeout(()=>s.classList.remove('fresh'),1200)}});
 R[n]();$('#tabs').style.setProperty('--i',i);$('#tabs').dataset.s=n;$$('.tab').forEach(b=>b.dataset.t===n?b.setAttribute('aria-current','page'):b.removeAttribute('aria-current'));if(n==='book')loadTaken();sbar();vsync()}
const renderCur=()=>{sbar();if(curTab&&R[curTab]){const sc=$('#'+curTab).scrollTop;R[curTab]();$('#'+curTab).scrollTop=sc;if(curTab==='book')vsync()}const a=$('#artist');if(a.dataset.id)openArtist(a.dataset.id)};

function mini(){const t=TK(P.cur),m=$('#mini');m.classList.toggle('on',!!t);
 if(!t){m.innerHTML='<div class="ml"><div class="mo idle"><span>Pick a song to start listening</span></div></div>';return}
 const l=S.likes.has(t.id);
 m.innerHTML=`<div class="ml"><div class="mo" data-a="open" role="button" tabindex="0" aria-label="Open player">${art(t,'s')}<div class="mt"><b>${esc(t.title)}</b><span>${esc(P.loading?'Loading...':t.artist||'')}</span></div></div><button class="ib lk" data-a="like" data-i="${t.id}" aria-pressed="${l}" aria-label="${l?'Unlike':'Like'} ${esc(t.title)}">${ic('heart',l?'f pk':'')}</button></div>
 <div class="mc"><div class="mb2"><button class="ib x" data-a="shuf" aria-pressed="${P.shuf}" aria-label="Shuffle">${ic('shuf')}</button><button class="ib x" data-a="prev" aria-label="Previous">${ic('prev','f')}</button><button class="ib pp" data-a="toggle" aria-label="${P.playing?'Pause':'Play'}">${P.loading?SPIN:ic(P.playing?'pause':'play','f')}</button><button class="ib x" data-a="next" aria-label="Next">${ic('next')}</button><button class="ib x" data-a="rep" aria-pressed="${P.rep}" aria-label="Repeat">${ic('rep')}</button></div>
 <div class="msb"><span id="mt1">${fm(P.time)}</span><div class="msk" id="msk" role="slider" aria-label="Seek" tabindex="0"><i></i></div><span id="mt2">${P.dur?fm(P.dur):'0:00'}</span></div></div>
 <div class="mx"><div class="vol" id="vol" role="slider" aria-label="Volume" tabindex="0" style="--p:${P.vol}">${ic('vol')}<div class="vk"><i></i></div></div><span class="sc" data-sc="${t.id}">${ic('chart')}<b>${nf(t.plays)}</b><em>streams</em></span><button class="ib" data-a="open" aria-label="Open full player">${ic('up')}</button></div><span class="mbar" id="mb"></span>`;tick()}
function np(){const t=TK(P.cur);if(!t)return;const l=S.likes.has(t.id),v=S.videos.findIndex(x=>x.track_id===t.id);
 $('#npa').setAttribute('style',sty(t));$('#npa').innerHTML=t.artwork?`<img src="${esc(t.artwork)}" alt="" onerror="this.remove()">`:'';$('#np').style.setProperty('--g',pal(t)[0]);
 $('#nti').textContent=t.title;$('#nar').textContent=(t.artist||'')+(t.genre?' · '+t.genre:'');$('#nsrc').textContent=srcLine(t);
 const k=$('#nlk');k.dataset.i=t.id;k.setAttribute('aria-pressed',l);k.innerHTML=ic('heart',l?'f pk':'');
 $('#np').classList.toggle('pl',P.playing);$('#bp').innerHTML=P.loading?'<span class="btn ld" style="width:30px;height:30px;background:none;box-shadow:none"><span></span></span>':ic(P.playing?'pause':'play','f');$('#bp').setAttribute('aria-label',P.playing?'Pause':'Play');
 $('#npx').innerHTML=(t.link?`<button class="btn btn2" data-a="src">${ic('ext')}<span>Open on ${esc(PL[t.platform]||'link')}</span></button>`:'')+(v>=0?`<button class="btn btn2" data-a="vtab" data-i="${v}">${ic('tv')}<span>Video</span></button>`:'')}
function bars(){const s=P.cur||1;$('#wv').innerHTML=[...Array(46)].map((_,i)=>`<i style="--h:${Math.round(10+40*Math.abs(Math.sin(i*.7+s)*Math.cos(i*.23)))}px"></i>`).join('')}
function tick(){const p=P.dur?P.time/P.dur:0,b=$$('#wv i');b.forEach((e,i)=>e.classList.toggle('p',i/b.length<p));$('#t1').textContent=fm(P.time);$('#t2').textContent=P.dur?'-'+fm(P.dur-P.time):'0:00';const m=$('#mb');if(m)m.style.setProperty('--p',p);const sk=$('#msk');if(sk)sk.style.setProperty('--p',p);const a1=$('#mt1'),a2=$('#mt2');if(a1){a1.textContent=fm(P.time);a2.textContent=P.dur?fm(P.dur):'0:00'}pipSync()}
let lastMk='';
function sync(){$('#app').classList.toggle('pl',P.playing);mini();np();tick();pipSync();
 if(window.ChaseXNative&&ChaseXNative.media){const t=TK(P.cur),mk=(t?t.id:'')+':'+!!P.playing;if(t&&mk!==lastMk){lastMk=mk;try{ChaseXNative.media(t.title,t.artist||'Chase X Records',!!P.playing)}catch(e){}}}
if('mediaSession' in navigator)navigator.mediaSession.playbackState=P.playing?'playing':'paused'}
function onCurChange(){bars()}

/* ================= ACTIONS ================= */
async function like(id){id=+id;
 if(!token)return needAuth('Sign in to like songs.',()=>like(id));
 const had=S.likes.has(id),t=TK(id),put=()=>{sv('cx-liked',[...S.likes]);renderCur();sync()};
 if(had)S.likes.delete(id);else S.likes=new Set([id,...S.likes]);
 if(t)t.likes=Math.max(0,(t.likes||0)+(had?-1:1));put();
 try{await api(`/tracks/${id}/like`,{method:'POST',body:{}})}
 catch(e){if(had)S.likes=new Set([id,...S.likes]);else S.likes.delete(id);if(t)t.likes=Math.max(0,(t.likes||0)+(had?1:-1));put();toast(e.message||'Could not save that like.')}}
function needAuth(msg,act){after={tab:curTab,act:act||null};amsg=msg||'';showAuth()}
const openNP=o=>{$('#np').classList.toggle('on',o);$('#np').inert=!o};
document.addEventListener('click',e=>{const b=e.target.closest('[data-a]');if(!b)return;const a=b.dataset.a,i=+b.dataset.i;
 switch(a){
 case'tab':go(b.dataset.t);break;
 case'go2':if(b.dataset.t==='explore')xseg=+b.dataset.s;else{bseg=+b.dataset.s;svc=-1;slot=-1;bsent=false}go(b.dataset.t);break;
 case'play':playTrack(i,b.dataset.l);break;
 case'toggle':e.stopPropagation();toggle();break;
 case'open':if(P.cur==null)toggle();openNP(true);break;
 case'close':openNP(false);break;
 case'like':e.stopPropagation();like(b.dataset.i);break;
 case'next':nextT();break;case'prev':prevT();break;
 case'shuf':P.shuf=!P.shuf;P.nx=null;$$('[data-a=shuf]').forEach(x=>x.setAttribute('aria-pressed',P.shuf));if(P.playing)warmNext();break;
 case'rep':P.rep=!P.rep;$$('[data-a=rep]').forEach(x=>x.setAttribute('aria-pressed',P.rep));break;
 case'pip':pip();break;
 case'src':{const t=TK(P.cur);if(t&&t.link)window.open(t.link,'_blank','noopener')}break;
 case'heroPlay':{const t=TK(S.settings.hero_track)||S.tracks[0];t?playTrack(t.id):toast('No songs yet.')}break;
 case'heroVideo':vi=0;lp=0;vload=0;go('watch');if(P.playing&&ACT)D[ACT].pause();break;
 case'xseg':xseg=i;explore();break;
 case'chip':filter=b.dataset.g===filter?'All':b.dataset.g;explore();break;
 case'wf':wf=i;explore();break;
 case'wplay':{const w=S.tracks.filter(isW).sort((a,b)=>(a.bpm||0)-(b.bpm||0));if(w.length){P.shuf=false;playTrack(w[0].id,'w')}}break;
 case'artist':openArtist(i);break;case'aclose':closeArtist();break;
 case'aplay':{const ts=S.tracks.filter(t=>t.artist_id===i);if(ts.length)playTrack(ts[0].id,'a'+i)}break;
 case'yt':{if(P.playing&&ACT)D[ACT].pause();lp=0;if(b.closest('#watch')){vload=i;vi=i;watch()}else{vi=i;vload=i;go('watch')}}break;
  case'vsel':vi=i;lp=0;vload=-1;watch();$('#watch').scrollTop=0;break;
 case'vtab':openNP(false);vi=i;lp=0;vload=-1;go('watch');break;
 case'vpip':{const v=$('#lv');if(!v)break;if(NPIP){const f=v.requestFullscreen||v.webkitRequestFullscreen;try{Promise.resolve(f.call(v)).then(()=>setTimeout(()=>ChaseXNative.pip(),350)).catch(()=>toast('Floating video is not available here.'))}catch(e){toast('Floating video is not available here.')}}else v.requestPictureInPicture&&v.requestPictureInPicture().catch(()=>toast('Floating video is not available here.'))}break;
 case'bseg':bseg=i;svc=-1;slot=-1;bsent=false;book();loadTaken();break;
 case'svc':svc=i;book();break;
 case'day':day=i;slot=-1;book();loadTaken();break;
 case'slot':if(b.getAttribute('aria-disabled')==='true')return toast('That time is not available. Try another slot.');slot=i;book();break;
 case'bagain':bsent=false;svc=-1;slot=-1;book();break;
 case'dobook':doBook();break;
 case'am':mode=+b.dataset.m;authUI();break;
 case'pw':{const x=b.previousElementSibling,s=x.type==='password';x.type=s?'text':'password';b.setAttribute('aria-pressed',s);b.setAttribute('aria-label',s?'Hide password':'Show password')}break;
 case'forgot':toast('Password reset by email is not set up yet. Message the studio to reset it, or use Continue with Google.');break;
 case'guest':enterGuest();break;
 case'signin':after={tab:curTab,act:null};amsg='';showAuth();break;
 case'lplay':{const l=[...S.likes].filter(TK);if(l.length){P.shuf=false;P.nx=null;playTrack(l[0],'L')}}break;
 case'lshuf':{const l=[...S.likes].filter(TK);if(l.length){P.shuf=true;P.nx=null;playTrack(l[Math.floor(Math.random()*l.length)],'L')}}break;
 case'out':signOut();break;
 case'sw':{const k=b.dataset.k;prefs[k]=prefs[k]?0:1;sv('cx-prefs',prefs);b.setAttribute('aria-checked',!!prefs[k]);vsync();setMedia(TK(P.cur)||{})}break;
 case'gapp':location.href='/auth/google/start';break;
 case'gfall':toast('Google sign-in is not set up yet. Add GOOGLE_CLIENT_ID to the .env file.');break;
 }});
document.addEventListener('input',e=>{const f=e.target.dataset&&e.target.dataset.f;if(f)bf[f]=e.target.value});
document.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('.row,.mo')){e.preventDefault();e.target.click()}
 if(e.code==='Space'&&!/INPUT|TEXTAREA|SELECT|BUTTON/.test(e.target.tagName)&&!e.target.closest('[role=button],[role=slider]')&&P.cur!=null&&$('#auth').classList.contains('gone')){e.preventDefault();toggle()}
 if(e.key==='Escape'){openNP(false);closeArtist()}
 if(e.target.id==='wv'&&/Arrow(Right|Left)/.test(e.key)&&P.dur)seekFrac(Math.max(0,Math.min(1,(P.time+(e.key==='ArrowRight'?5:-5))/P.dur)))});
document.addEventListener('pointerdown',e=>{const vk=e.target.closest&&e.target.closest('.vk');if(vk){const r=vk.getBoundingClientRect(),f=ev=>{P.vol=Math.max(0,Math.min(1,(ev.clientX-r.left)/r.width));sv('cx-vol',P.vol);setVol();const v=$('#vol');if(v)v.style.setProperty('--p',P.vol)};f(e);const up=()=>{removeEventListener('pointermove',f);removeEventListener('pointerup',up)};addEventListener('pointermove',f);addEventListener('pointerup',up);return}
 const k=e.target.closest&&e.target.closest('.msk');if(!k)return;const r=k.getBoundingClientRect(),f=ev=>seekFrac(Math.max(0,Math.min(1,(ev.clientX-r.left)/r.width)));f(e);const up=()=>{removeEventListener('pointermove',f);removeEventListener('pointerup',up)};addEventListener('pointermove',f);addEventListener('pointerup',up)});
$('#wv').addEventListener('pointerdown',e=>{const s=ev=>{const r=$('#wv').getBoundingClientRect();seekFrac(Math.max(0,Math.min(1,(ev.clientX-r.left)/r.width)))};s(e);const up=()=>{removeEventListener('pointermove',s);removeEventListener('pointerup',up)};addEventListener('pointermove',s);addEventListener('pointerup',up)});
document.addEventListener('ended',e=>{if(e.target.id==='lv'){const v=S.videos[vi];if(v&&lp<(v.parts||[]).length-1){lp++;vload=vi;watch()}}},true);

async function doBook(){if(!token)return needAuth('Sign in to book a session.');const kind=bseg?'lesson':'studio',list=S.services.filter(s=>s.kind===kind),s=list[svc];
 if(!s)return toast('Pick a service first.');if(slot<0)return toast('Pick a time.');
 const slots=(S.settings.slots||'').split(',').map(x=>x.trim()).filter(Boolean),d=new Date();d.setDate(d.getDate()+day);
 const name=(bf.name||(user?user.name:'')).trim();if(bbusy)return;bbusy=true;book();
 try{await api('/bookings',{body:{service_id:s.id,date:iso(d),slot:slots[slot],name,phone:bf.phone,email:user?user.email:'',notes:bf.notes}});bsent=true;toast('Request sent. We will confirm shortly.');refreshMe()}
 catch(e){toast(e.message);loadTaken()}bbusy=false;book()}
async function refreshMe(){if(!token)return;try{const j=await api('/me');user=j.user;sv('cx-user',user);S.likes=new Set(j.likes);S.bookings=j.bookings;sv('cx-liked',[...S.likes]);renderCur()}catch(e){}}

/* ================= AUTH ================= */
let mode=0,GCID='';
const EMAIL=/^\S+@\S+\.\S+$/;
const fld=(id,l,ty,ph,ac)=>`<div class="fld"><label for="${id}">${l}</label><div class="inw" id="w${id}"><input id="${id}" type="${ty}" placeholder="${ph}" autocomplete="${ac}" aria-describedby="${id}e">${ty==='password'?`<button type="button" class="ib" data-a="pw" aria-label="Show password" aria-pressed="false">${ic('eye')}</button>`:''}</div><p class="er" id="${id}e" role="alert"></p></div>`;
const APP=/ChaseXApp/.test(navigator.userAgent);
const NPIP=!!(window.ChaseXNative&&ChaseXNative.canPip&&ChaseXNative.canPip());
const GSVG='<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';
function authUI(){const m=mode;$('#at').textContent=m?'Create your account':'Welcome back';$('#as').textContent=amsg||(m?'Save songs, book sessions and lessons, and watch exclusive videos.':'Sign in to pick up where you left off.');
 $('#tg').style.setProperty('--i',m);$$('#tg button').forEach((b,i)=>b.setAttribute('aria-pressed',i===m));
 $('#ff').innerHTML=(m?fld('nm','Full name','text','Your name','name'):'')+fld('em','Email','email','you@example.com','email')+fld('pw','Password','password',m?'At least 8 characters':'Your password',m?'new-password':'current-password')+(m?'<div class="str" id="stm" data-s="0" aria-live="polite"><i></i><i></i><i></i><span>Use 8+ characters</span></div>':'<button type="button" class="lnk fg" data-a="forgot">Forgot password?</button>');
 $('#sb span').textContent=m?'Create account':'Sign in';const p=$('#pw');
 if(m)p.oninput=()=>{const v=p.value,s=(v.length>=8)+(/[a-z]/.test(v)&&/[A-Z]/.test(v))+(/\d|[^A-Za-z0-9]/.test(v)&&v.length>=8),n=v?Math.max(1,s):0,e=$('#stm');e.dataset.s=n;e.lastChild.textContent=['Use 8+ characters','Weak','Okay','Strong'][n]}}
function val(){const v=id=>($('#'+id)||{}).value||'',E={};if(mode&&v('nm').trim().length<2)E.nm='Enter your name.';if(!EMAIL.test(v('em')))E.em='Enter a valid email address.';if(v('pw').length<8)E.pw=mode?'Use at least 8 characters.':'Enter your password (8+ characters).';
 ['nm','em','pw'].forEach(id=>{const e=$('#'+id);if(!e)return;$('#w'+id).dataset.bad=!!E[id];$('#'+id+'e').textContent=E[id]||''});const f=Object.keys(E)[0];if(f)$('#'+f).focus();return !f}
function enter(res){sv('cx-guest',0);token=res.token;user=res.user;sv('cx-token',token);sv('cx-user',user);const pend=after&&after.act;hideAuth();refreshMe().then(async()=>{if(pend)await pend();const gl=ld('cx-gl',[]);if(gl.length){sv('cx-gl',[]);let n=0;for(const id of gl){if(TK(id)&&!S.likes.has(+id)){try{await api(`/tracks/${id}/like`,{method:'POST',body:{}});S.likes=new Set([+id,...S.likes]);n++}catch(e){}}}if(n){sv('cx-liked',[...S.likes]);renderCur();toast(n+' liked song'+(n>1?'s':'')+' added to your account')}}});toast('Welcome, '+user.name)}
function enterGuest(){sv('cx-guest',1);token=null;user=null;sv('cx-token',null);sv('cx-user',null);hideAuth()}
function hideAuth(){$('#auth').classList.add('gone');$('#auth').inert=true;amsg='';const a=after;after=null;go(a&&a.tab&&R[a.tab]?a.tab:'home')}
function showAuth(){mode=0;$('#auth').classList.remove('gone');$('#auth').inert=false;authUI();$$('.scr').forEach(s=>s.classList.remove('on'));renderGoogle();vsync()}
function signOut(quiet){if(ACT)D[ACT].pause();P.playing=false;P.cur=null;mini();sv('cx-guest',0);token=null;user=null;S.likes=new Set();S.bookings=[];sv('cx-token',null);sv('cx-user',null);sv('cx-liked',[]);after=null;amsg='';openNP(false);if(pw)pw.close();showAuth();if(!quiet)toast('Signed out.')}
$('#af').addEventListener('submit',async e=>{e.preventDefault();if(!val())return;const b=$('#sb');b.classList.add('ld');
 try{const v=id=>$('#'+id).value;enter(await api(mode?'/auth/register':'/auth/login',{body:{name:mode?v('nm').trim():'',email:v('em').trim(),password:v('pw')}}))}
 catch(err){const f=/email|account/i.test(err.message)?'em':'pw';$('#w'+f).dataset.bad=true;$('#'+f+'e').textContent=err.message;toast(err.message)}b.classList.remove('ld')});

/* Google sign-in: Google's own button (correct logo and branding); the credential is verified on the server */
function renderGoogle(){const box=$('#gbtn');
 if(APP&&GCID){box.innerHTML=`<button class="gfall" type="button" data-a="gapp">${GSVG}<span>Continue with Google</span></button>`;return}
 if(!GCID){box.innerHTML=`<button class="gfall" type="button" data-a="gfall">${GSVG}<span>Continue with Google</span></button>`;return}
 need('https://accounts.google.com/gsi/client',()=>window.google&&google.accounts&&google.accounts.id).then(()=>{
  google.accounts.id.initialize({client_id:GCID,callback:async r=>{try{enter(await api('/auth/google',{body:{credential:r.credential}}))}catch(err){toast(err.message)}}});
  box.innerHTML='';google.accounts.id.renderButton(box,{theme:'filled_black',size:'large',shape:'pill',text:'continue_with',logo_alignment:'left',width:Math.min(380,Math.max(220,box.clientWidth||300))})
 }).catch(()=>{box.innerHTML=`<button class="gfall" type="button" data-a="gfall">${GSVG}<span>Continue with Google</span></button>`})}

/* ================= HERO VIDEO ================= */
const HP=['videos/hero-1.mp4','videos/hero-2.mp4','videos/hero-3.mp4'],HQ=['videos/poster-1.jpg','videos/poster-2.jpg','videos/poster-3.jpg'];
let hi=0,hf='hva',hsw=false;const hvEl=id=>document.getElementById(id);
function hprog(){const v=hvEl(hf);$$('#story b').forEach((b,i)=>b.style.setProperty('--p',i<hi?1:i>hi?0:(v.duration?Math.min(1,v.currentTime/v.duration):0)))}
function hprime(){const k=(hi+1)%HP.length,bk=hvEl(hf==='hva'?'hvb':'hva');if(bk.getAttribute('src')!==HP[k]){bk.poster=HQ[k];bk.src=HP[k];bk.load()}}
function hnext(){if(hsw)return;hsw=true;const fr=hvEl(hf),id=hf==='hva'?'hvb':'hva',bk=hvEl(id);hi=(hi+1)%HP.length;bk.currentTime=0;bk.play().catch(()=>{});bk.classList.add('on');fr.classList.remove('on');setTimeout(()=>{fr.pause();hf=id;hsw=false;hprog();hprime()},950)}
['hva','hvb'].forEach(id=>{const v=hvEl(id);v.addEventListener('timeupdate',()=>{if(id!==hf)return;hprog();if(v.duration&&v.duration-v.currentTime<.95)hnext()});v.addEventListener('ended',()=>{if(id===hf)hnext()})});
function vsync(){const vis=!document.hidden&&!RM,au=$('#auth').classList.contains('gone'),hv=hvEl(hf);
 vis&&prefs.a&&au&&$('#home').classList.contains('on')?hv.play().catch(()=>{}):hv.pause();
 $$('video[data-bg]').forEach(v=>{const sc=v.closest('.scr,.auth'),run=vis&&sc&&(sc.id==='auth'?!au:au&&sc.classList.contains('on'));run?v.play().catch(()=>{}):v.pause()})}

/* ================= SIDEBAR (tablet and desktop) ================= */
function sbar(){const l=$('#sbl'),u=$('#sbu');if(!l||!u)return;
 const rc=recent.map(TK).filter(Boolean).slice(0,5),av=user&&user.avatar?`<img src="${esc(user.avatar)}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover" referrerpolicy="no-referrer">`:esc(ini());
 l.innerHTML=`<h3>Your library</h3><button class="lib" data-a="tab" data-t="liked"${curTab==='liked'?' aria-current="page"':''}><i>${ic('heart','f')}</i><div><b>Liked songs</b><span>${token?S.likes.size+' song'+(S.likes.size===1?'':'s'):'Sign in to save songs'}</span></div></button>`+(rc.length?`<h3 style="margin-top:18px">Recently played</h3>${rc.map(t=>`<button class="lib" data-a="play" data-i="${t.id}">${art(t,'s')}<div><b>${esc(t.title)}</b><span>${esc(t.artist||'Chase X')}</span></div></button>`).join('')}`:'');
 u.innerHTML=`<button class="lib" data-a="tab" data-t="you" aria-label="Account"><span class="av">${av}</span><div><b>${esc(user?user.name:'Guest')}</b><span>${user?'Signed in':'Browsing as guest'}</span></div></button>${token?'':'<button class="gb" data-a="signin">Sign in</button>'}`}

/* ================= BOOT ================= */
$('#tabs').innerHTML=`<div class="sbh"><span class="logo">${ic('disc')}</span><div><b>CHASE X</b><small>Records</small></div></div><div class="sbn">${TABS.map(t=>`<button class="tab" data-a="tab" data-t="${t[0]}">${ic(t[2])}<span>${t[1]}</span></button>`).join('')}</div><div class="sbl" id="sbl"></div><div class="sbu" id="sbu"></div>`;
hprime();hprog();
(async()=>{
if(!token){const gl=ld('cx-liked',[]);if(gl.length){sv('cx-gl',gl);sv('cx-liked',[])}}
 const cb=ld('cx-boot',null),apply=b=>Object.assign(S,{tracks:b.tracks,artists:b.artists,videos:b.videos,services:b.services,settings:b.settings});
 const fresh=Promise.all([api('/config'),api('/bootstrap')]);fresh.catch(()=>{});
 if(cb&&cb.b&&cb.b.tracks){apply(cb.b);GCID=cb.g||''}
 else{try{const [c,b]=await fresh;GCID=c.googleClientId||'';apply(b);sv('cx-boot',{g:GCID,b})}catch(e){toast('Cannot reach the server. Check your connection and try again.')}}
 if(cb&&cb.b&&cb.b.tracks)fresh.then(([c,b])=>{GCID=c.googleClientId||GCID;apply(b);sv('cx-boot',{g:GCID,b});renderCur()}).catch(()=>{});
 authUI();bars();
 {const ac=new URLSearchParams(location.search).get('ac');if(ac){history.replaceState(null,'','/');try{enter(await api('/auth/app-exchange',{body:{code:ac}}))}catch(e){toast(e.message)}}}
 if(token){hideAuth();refreshMe()}else if(ld('cx-guest',0)){hideAuth()}else showAuth();
 setTimeout(()=>$('#splash').classList.add('gone'),600);
 (window.requestIdleCallback||setTimeout)(warmup);
})();

if('serviceWorker' in navigator)addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));
