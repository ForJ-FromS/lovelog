/* ============================================================
   LOVELOG v3 — Frost Bird 레이아웃 차용 템플릿 (실동작)
   대문 이미지 · 디데이 · BGM · 대문 비밀번호 · 카테고리 추가
   글쓰기(비밀글 암호화) · 갤러리 · 글 삭제 · 공유 링크
   ============================================================ */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, updateDoc, runTransaction, serverTimestamp,
  collection, query, orderBy, getDocs, addDoc, deleteDoc }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const $ = s => document.querySelector(s);
const esc = s => String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const VIEWS=['view-setup','view-loading','view-login','view-signup','view-gate','view-page'];
const CLEAN = !location.hostname.endsWith('github.io');   // 커스텀 도메인이면 깔끔 주소
const urlFor=(h,p)=> CLEAN ? '/'+h+(p?'/'+p:'') : './?u='+h+(p?'&p='+p:'');
const show = id => VIEWS.forEach(v=>$('#'+v).classList.toggle('hidden',v!==id));
const enc=new TextEncoder(), dec=new TextDecoder();

if(!firebaseConfig.apiKey || firebaseConfig.apiKey.includes('여기에')){ show('view-setup'); throw new Error('cfg'); }
const app=initializeApp(firebaseConfig), auth=getAuth(app), db=getFirestore(app);

const st = { me:null, myHandle:null, handle:null, page:null, posts:[], gallery:[],
             guest:[], cat:'recent', q:'', cur:null, curBody:null, mine:false };
const fmtTs=t=>{ try{ const d=t?.toDate?t.toDate():new Date();
  return `${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
}catch(e){ return ''; } };

const heroList=()=> (st.page?.heroImgs&&st.page.heroImgs.length)
  ? st.page.heroImgs : (st.page?.heroImg?[st.page.heroImg]:[]);
const heroObj=s=> typeof s==='string' ? {img:s,x:50,y:50,z:100} : {x:50,y:50,z:100,...s};
const heroObjs=()=> heroList().map(heroObj);
async function resolveImgs(p){
  try{
    const ids=[...new Set([
      ...(p.heroImgs||[]).map(o=>o&&o.ref).filter(Boolean),
      p.enterRef||null, p.bgRef||null].filter(Boolean))];
    if(!ids.length) return;
    const m={};
    await Promise.all(ids.map(async id=>{
      try{ const s=await getDoc(doc(db,'pages',st.handle,'imgs',id));
        if(s.exists()) m[id]=s.data().d||''; }catch(e){}
    }));
    (p.heroImgs||[]).forEach(o=>{ if(o&&o.ref) o.img=m[o.ref]||o.img||''; });
    if(p.enterRef) p.enterImg=m[p.enterRef]||p.enterImg||'';
    if(p.bgRef) p.bgImg=m[p.bgRef]||p.bgImg||'';
  }catch(e){}
}
const setHeroBg=(el,o)=>{ el.style.backgroundImage=`url(${o.img})`;
  el.style.backgroundPosition=`${o.x}% ${o.y}%`;
  el.style.backgroundSize = o.z>100 ? o.z+'% auto' : 'cover'; };

/* ---------- 유틸 ---------- */
const b64=b=>btoa(String.fromCharCode(...new Uint8Array(b)));
const ub64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
async function sha256(t){ const h=await crypto.subtle.digest('SHA-256',enc.encode(t));
  return [...new Uint8Array(h)].map(x=>x.toString(16).padStart(2,'0')).join(''); }
async function keyOf(pw,salt){ const km=await crypto.subtle.importKey('raw',enc.encode(pw),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:150000,hash:'SHA-256'},km,
    {name:'AES-GCM',length:256},false,['encrypt','decrypt']); }
async function encTxt(pw,t){ const s=crypto.getRandomValues(new Uint8Array(16)),
  iv=crypto.getRandomValues(new Uint8Array(12)), k=await keyOf(pw,s),
  ct=await crypto.subtle.encrypt({name:'AES-GCM',iv},k,enc.encode(t));
  return JSON.stringify({s:b64(s),i:b64(iv),d:b64(ct)}); }
async function decTxt(pw,blob){ const o=JSON.parse(blob), k=await keyOf(pw,ub64(o.s));
  return dec.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:ub64(o.i)},k,ub64(o.d))); }
function compress(file,maxW,q){ return new Promise((res,rej)=>{
  const img=new Image(); img.onload=()=>{ const sc=Math.min(1,maxW/img.width),
    c=document.createElement('canvas'); c.width=Math.round(img.width*sc);
    c.height=Math.round(img.height*sc);
    const x=c.getContext('2d'); x.drawImage(img,0,0,c.width,c.height);
    let alpha=false;
    if(file.type!=='image/jpeg'){
      try{ const d=x.getImageData(0,0,c.width,c.height).data;
        const step=Math.max(4,(Math.floor(d.length/4/6000)||1)*4);
        for(let i=3;i<d.length;i+=step){ if(d[i]<250){ alpha=true; break; } }
      }catch(_){}
    }
    res(alpha ? c.toDataURL('image/png') : c.toDataURL('image/jpeg',q)); };
  img.onerror=rej; img.src=URL.createObjectURL(file); });}
async function compressTo(file,maxW,targetKB){
  let w=maxW, out='';
  for(let pass=0; pass<3; pass++){
    for(const q of [.72,.6,.5,.42,.34]){
      out=await compress(file,w,q);
      if(out.length<=targetKB*1370) return out;
    }
    w=Math.round(w*.8);
  }
  return out;
}
const kb=s=>Math.round(String(s||'').length/1370);
function hexToHsl(hex){
  const r=parseInt(hex.slice(1,3),16)/255,g=parseInt(hex.slice(3,5),16)/255,b=parseInt(hex.slice(5,7),16)/255;
  const mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn,l=(mx+mn)/2;
  let hh=222,s=0;
  if(d){ s=d/(1-Math.abs(2*l-1));
    let x; if(mx===r) x=((g-b)/d)%6; else if(mx===g) x=(b-r)/d+2; else x=(r-g)/d+4;
    hh=Math.round((x*60+360)%360); }
  return [hh, Math.round(s*100), Math.round(l*100)];
}
function hueFromHex(hex){ return hexToHsl(hex)[0]; }
function applyColor(hh,s,l){
  const r=document.documentElement.style;
  r.setProperty('--h', hh);
  r.setProperty('--sf', Math.max(.12, Math.min(1.3, (s??60)/60)).toFixed(3));
  r.setProperty('--lo', Math.max(-4, Math.min(8, ((l??55)-55)*.18)).toFixed(2)+'%');
}
function hslToHex(hh,sp,lp){
  const s=(sp??60)/100,l=(lp??62)/100,aa=s*Math.min(l,1-l),
  f=n=>{const k=(n+hh/30)%12;const c=l-aa*Math.max(-1,Math.min(k-3,9-k,1));
    return Math.round(c*255).toString(16).padStart(2,'0')};
  return '#'+f(0)+f(8)+f(4);
}
function hexFromHue(hh){ return hslToHex(hh,60,62); }
const ytId=u=>{ const m=String(u||'').match(/(?:youtu\.be\/|v=|shorts\/|embed\/)([A-Za-z0-9_-]{11})/); return m?m[1]:null; };
const ytList=u=>{ const m=String(u||'').match(/[?&]list=([A-Za-z0-9_-]+)/); return m?m[1]:null; };
function dday(dstr){ const d=new Date(dstr+'T00:00:00'), n=new Date(); n.setHours(0,0,0,0);
  const f=Math.round((n-d)/86400000); return f>=0?'D+'+(f+1):'D'+f; }
const today=()=>{ const d=new Date();
  return d.getFullYear()+'.'+String(d.getMonth()+1).padStart(2,'0')+'.'+String(d.getDate()).padStart(2,'0'); };
const bodyHTML=t=>t.split(/\n{2,}/).map(p=>'<p>'+esc(p).replace(/\n/g,'<br>')+'</p>').join('');
const cleanHTML=h=>h
  .replace(/<script[\s\S]*?<\/script\s*>/gi,'')
  .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi,'')
  .replace(/javascript:/gi,'');
const htmlText=h=>{ const d2=document.createElement('div');
  d2.innerHTML=String(h).replace(/<br\s*\/?>/gi,'\n').replace(/<\/p>/gi,'\n\n');
  return d2.textContent.replace(/\n{3,}/g,'\n\n').trim(); };

/* ---------- 스티커 ---------- */
function renderStickers(){
  const layer=$('#stk-layer'); if(!layer) return;
  const arr=st.page?.stickers||[];
  document.body.classList.toggle('mine', !!st.mine);
  layer.innerHTML='';
  arr.forEach((s,i)=>{
    const d=document.createElement('div'); d.className='stk';
    const isM=window.innerWidth<=720;
    const sx=(isM&&s.mx!=null)?s.mx:s.x, sy=(isM&&s.my!=null)?s.my:s.y;
    d.style.left=sx+'%'; d.style.top=sy+'px';
    d.style.width=(s.size||120)+'px'; d.style.height=(s.size||120)+'px';
    d.style.transform=`rotate(${s.rot||0}deg)`;
    d.innerHTML=`<img src="${s.img}" alt="">`;
    layer.appendChild(d);
    if(!st.mine) return;
    d.addEventListener('pointerdown',ev=>{
      ev.preventDefault(); d.setPointerCapture(ev.pointerId);
      const rect=layer.getBoundingClientRect(), sz=s.size||120;
      const mM=window.innerWidth<=720;
      const cx=(mM&&s.mx!=null)?s.mx:s.x, cy=(mM&&s.my!=null)?s.my:s.y;
      const dx=ev.clientX-(rect.left+(cx/100)*rect.width),
            dy=ev.clientY-(rect.top+cy);
      const move=e2=>{
        let xp=e2.clientX-rect.left-dx,
            yp=e2.clientY-rect.top-dy;
        xp=Math.max(-sz/2, Math.min(rect.width-sz/2, xp));
        yp=Math.max(-sz/2, Math.min(rect.height-sz/2, yp));
        const nx=(xp/rect.width)*100;
        if(mM){ s.mx=nx; s.my=yp; } else { s.x=nx; s.y=yp; }
        d.style.left=nx+'%'; d.style.top=yp+'px';
      };
      const up=async()=>{
        d.removeEventListener('pointermove',move);
        d.removeEventListener('pointerup',up);
        try{ await updateDoc(doc(db,'pages',st.handle),{stickers:arr}); }catch(e){}
      };
      d.addEventListener('pointermove',move);
      d.addEventListener('pointerup',up);
    });
  });
}
function renderStkList(){
  const box=$('#stk-list'); if(!box) return;
  const arr=st.page.stickers||[];
  box.innerHTML = arr.length? arr.map((s,i)=>`
    <div class="stk-row">
      <img src="${s.img}">
      <span style="font-size:10px;color:var(--muted)">크기</span>
      <input type="range" data-ss="${i}" min="50" max="260" value="${s.size||120}">
      <span style="font-size:10px;color:var(--muted)">회전</span>
      <input type="range" data-sr="${i}" min="-45" max="45" value="${s.rot||0}">
      <button class="rmv" data-sx="${i}">✕</button>
    </div>`).join('')
    :'<p class="pl-empty">아직 스티커가 없어요.</p>';
  const save=async()=>{ try{ await updateDoc(doc(db,'pages',st.handle),{stickers:st.page.stickers}); }catch(e){} };
  box.querySelectorAll('[data-ss]').forEach(r=>r.addEventListener('input',()=>{
    st.page.stickers[+r.dataset.ss].size=+r.value; renderStickers(); }));
  box.querySelectorAll('[data-ss]').forEach(r=>r.addEventListener('change',save));
  box.querySelectorAll('[data-sr]').forEach(r=>r.addEventListener('input',()=>{
    st.page.stickers[+r.dataset.sr].rot=+r.value; renderStickers(); }));
  box.querySelectorAll('[data-sr]').forEach(r=>r.addEventListener('change',save));
  box.querySelectorAll('[data-sx]').forEach(b=>b.onclick=async()=>{
    st.page.stickers.splice(+b.dataset.sx,1);
    await save(); renderStkList(); renderStickers();
  });
}

/* ---------- 인장/상단 ---------- */
function renderSeal(){
  $('#seal-txt').textContent = st.myHandle ? 'LOVELOG · @'+st.myHandle.toUpperCase() : 'LOVELOG';
  const a=$('#seal-auth');
  if(st.me){ a.textContent='OUT'; a.onclick=()=>signOut(auth); }
  else if(st.handle){ a.textContent='IN'; a.onclick=()=>signInWithPopup(auth,new GoogleAuthProvider()).catch(()=>{}); }
  else a.textContent='';
}

/* ---------- 페이지 로드 ---------- */
async function loadPage(handle){
  st.handle=handle;
  // 딥링크 글ID를 주소 정리 '전에' 확보 (정리하면서 쿼리가 지워지므로)
  let pm0=new URLSearchParams(location.search).get('p');
  if(!pm0){ const seg=location.pathname.split('/').filter(Boolean);
    if(seg[0]===handle && seg[1]) pm0=seg[1]; }
  st.deepPost=pm0||null;
  // 첫 진입 시 주소를 깔끔 경로로 정리 (luvlog.me/?u=jeste → luvlog.me/jeste)
  if(CLEAN){
    history.replaceState(null,'', urlFor(handle, pm0||undefined));
  }
  const snap=await getDoc(doc(db,'pages',handle));
  if(!snap.exists()){ show('view-page');
    $('#pg-name').textContent='없는 페이지예요'; $('#pg-sub').textContent='@'+handle; return; }
  st.page=snap.data();
  await resolveImgs(st.page);
  st.mine = st.me && st.page.owner===st.me.uid;
  applyColor(st.page.hue ?? 222, st.page.sat, st.page.lum);
  // 입장 대문: 방문 시 1회(세션) + 비번 홈은 비번 입력
  const needPw = st.page.gate && !st.mine
    && sessionStorage.getItem('gate_'+handle)!==st.page.gate;
  const seen = sessionStorage.getItem('ent_'+handle);
  if(!st.mine && (needPw || !seen)){
    applyColor(st.page.hue ?? 222, st.page.sat, st.page.lum);
    const cover = st.page.enterImg || heroObjs()[0]?.img || '';
    $('#enter-cover').style.backgroundImage = cover?`url(${cover})`:'';
    $('#enter-over').textContent = '@'+handle.toUpperCase();
    $('#gate-name').textContent = st.page.name || handle;
    $('#enter-text').textContent = st.page.enterText || '';
    $('#gate-pw-wrap').classList.toggle('hidden', !needPw);
    $('#gate-login').classList.toggle('hidden', !!st.me);
    $('#gate-login').onclick=()=>signInWithPopup(auth,new GoogleAuthProvider()).catch(()=>{});
    show('view-gate');
    $('#gate-go').onclick = async ()=>{
      if(needPw){
        const hsh=await sha256($('#gate-pw').value);
        if(hsh!==st.page.gate){ $('#gate-err').textContent='비밀번호가 맞지 않아요.'; return; }
        sessionStorage.setItem('gate_'+handle, hsh);
      }
      sessionStorage.setItem('ent_'+handle,'1');
      enterPage();
    };
    return;
  }
  enterPage();
}
async function enterPage(){
  const p=st.page, h=st.handle;
  applyColor(p.hue ?? 222, p.sat, p.lum);
  document.title=(p.name||h)+' — LOVELOG';
  $('#pg-name').textContent=p.name||h;
  $('#pg-name').style.color = p.titleColor||'';
  $('#pg-sub').textContent=p.sub||'';
  $('#pg-over').textContent='@'+h.toUpperCase();
  const hs=heroObjs();
  clearInterval(st.heroTimer);
  const hA=$('#pg-hero'), hB=$('#pg-hero2');
  if(hs[0]) setHeroBg(hA,hs[0]); else hA.style.backgroundImage='';
  hA.style.opacity=1; hB.style.opacity=0;
  if(hs.length>1){
    let i=0, front=true;
    st.heroTimer=setInterval(()=>{
      i=(i+1)%hs.length;
      const showEl=front?hB:hA, hideEl=front?hA:hB;
      setHeroBg(showEl,hs[i]);
      showEl.style.opacity=1; hideEl.style.opacity=0; front=!front;
    }, 5000);
  }
  const dd0=(p.ddays||[])[0];
  $('#pg-dday-main').innerHTML = dd0?`<p class="n">${esc(dday(dd0.date))}</p><p class="t">${esc(dd0.title)}</p>`:'';
  // 레이아웃 · 테마
  document.body.classList.toggle('light', !!p.light);
  document.body.classList.toggle('style-blog', homeStyle()==='blog');
  document.body.classList.remove('theme-win98','theme-vhs');
  if(p.theme && p.theme!=='default') document.body.classList.add('theme-'+p.theme);
  document.body.classList.toggle('side-left', p.sidePos==='left');
  document.body.classList.toggle('side-both', p.sidePos==='both');
  document.documentElement.style.setProperty('--dim', (p.bgDim??78)/100);
  document.body.classList.toggle('glass', !!p.glass);
  if(bgmPlaying() && bgmHandle!==st.handle) bgmStop();
  document.body.classList.toggle('no-dots', p.dots===false);
  document.body.classList.toggle('stk-hide-m', !!p.stkHideM);
  document.body.classList.toggle('font-serif', p.font==='serif');
  document.title = p.name ? p.name : 'LOVELOG';
  let fl=document.getElementById('favlink');
  if(p.fav){ if(!fl){ fl=document.createElement('link'); fl.rel='icon'; fl.id='favlink'; document.head.appendChild(fl); } fl.href=p.fav; }
  else if(fl) fl.remove();
  let ucss=document.getElementById('user-css');
  if(!ucss){ ucss=document.createElement('style'); ucss.id='user-css'; document.head.appendChild(ucss); }
  ucss.textContent = p.customCss||'';
  let ccss=document.getElementById('cursor-css');
  if(!ccss){ ccss=document.createElement('style'); ccss.id='cursor-css'; document.head.appendChild(ccss); }
  ccss.textContent = p.curImg ? `body,body *{cursor:url(${p.curImg}) 4 4, auto !important}` : '';
  spkSync();
  $('#bgphoto').style.backgroundImage = p.bgImg?`url(${p.bgImg})`:'';
  document.body.classList.toggle('has-bg', !!p.bgImg);
  const headEl=document.querySelector('.head');
  if(p.headMode==='side'){ headEl.classList.add('v'); $('#aside').prepend(headEl); }
  else { headEl.classList.remove('v');
    const anchor=$('#catbar'); anchor.parentNode.insertBefore(headEl, anchor); }
  $('#btn-write').classList.toggle('hidden',!st.mine);
  $('#btn-deco').classList.toggle('hidden',!st.mine);
  show('view-page');
  await loadContent();
  if(homeStyle()==='blog'){ st.cat='recent'; applyView(); }
  else { st.cat='home'; applyView(); }
  document.querySelector('.strip-sec').classList.toggle('hidden', !(galOn()&&stripOn()));
  renderWidgets(); renderCatbar(); renderList(); renderGal(); renderStickers();
  // 딥링크 — loadPage에서 보관해둔 글ID를 1회 소비
  const pm=st.deepPost; st.deepPost=null;
  if(pm){ st.cat='recent'; applyView(); renderWidgets(); renderList(); openPost(pm); }
}
async function loadContent(){
  const [ps,gs,gb]=await Promise.all([
    getDocs(query(collection(db,'pages',st.handle,'posts'),orderBy('ts','desc'))),
    getDocs(query(collection(db,'pages',st.handle,'gallery'),orderBy('ts','desc'))),
    getDocs(query(collection(db,'pages',st.handle,'guest'),orderBy('ts','desc')))
  ]);
  st.posts=ps.docs.map(d=>({id:d.id,...d.data()}));
  st.gallery=gs.docs.map(d=>({id:d.id,...d.data()}));
  st.guest=gb.docs.map(d=>({id:d.id,...d.data()}));
}

/* ---------- 사이드 위젯 렌더 ---------- */
function cats(){ return st.page.cats||['archive','ooc']; }
function gcats(){ return st.page.gcats||[]; }
const isG=c=>gcats().includes(c);
function sideCfg(){
  let s;
  if(st.page.side && st.page.side.length) s=st.page.side;
  else{
    s=[{t:'search'},{t:'category'}];
    if(st.page.ddays&&st.page.ddays.length) s.push({t:'dday'});
    if(ytId(st.page.bgm?.url)) s.push({t:'bgm'});
  }
  return s.map(w=>({col:DEFCOL[w.t]||'r', ...w}));
}
/* 홈 중앙 붙박이: 고정글 + 최신글 */
function latestBlock(box){
  const pin=st.posts.find(p=>p.pinned);
  if(pin){
    const pd=document.createElement('a'); pd.className='pin';
    pd.innerHTML=`<span class="tag">◈ PINNED</span>
      <p class="t">${esc(pin.title)}${pin.secret?' 🔒':''}</p>
      ${pin.excerpt?`<p class="ex">${esc(pin.excerpt)}</p>`:''}
      <p class="meta">${esc(pin.cat)} · ${esc(pin.date)}</p>`;
    pd.onclick=()=>{ goBoard('recent'); openPost(pin.id); };
    box.appendChild(pd);
  }
  const d=document.createElement('div'); d.className='side sw-latest';
  const arr=st.posts.filter(p=>!p.pinned).slice(0,5);
  d.innerHTML=`<p class="label">LATEST</p><div class="mini-rows">`+
    (arr.length?arr.map(p2=>`<a data-lid="${p2.id}">
      <span class="dot">◈</span><span class="t">${esc(p2.title)}${p2.secret?' 🔒':''}</span>
      <span class="dt">${esc((p2.date||'').slice(5))}</span></a>`).join('')
    :'<p class="pl-empty">아직 글이 없습니다.</p>')+
    `</div><p class="cat-add" style="display:block" id="latest-more">전체 보기 →</p>`;
  box.appendChild(d);
  d.querySelectorAll('[data-lid]').forEach(el=>el.onclick=()=>{
    goBoard('recent'); openPost(el.dataset.lid); });
  d.querySelector('#latest-more').onclick=()=>goBoard('recent');
  return d;
}
const WNAME={latest:'최신글',notice:'공지',chat:'채팅로그',img:'이미지',profile:'프로필',search:'검색',category:'카테고리',
  dday:'디데이',bgm:'BGM',quote:'인용구',links:'링크',banner:'배너칸'};
const DEFCOL={search:'l',category:'l',profile:'l',latest:'c',quote:'c',notice:'c',chat:'c',img:'l',
  dday:'r',bgm:'r',links:'r',banner:'r'};
const homeStyle=()=>st.page?.homeStyle||'grid';
const galOn=()=>st.page?.galOn!==false;
const stripOn=()=>st.page?.stripOn!==false;
function goHome(){
  if(homeStyle()==='blog'){ goBoard('recent'); return; }
  st.cat='home'; applyView(); renderWidgets(); renderCatbar();
}
function goBoard(cat){ st.cat=cat||'recent'; applyView(); renderWidgets(); renderList(); backToList(); renderCatbar(); }
function catStyle(){
  return st.page.catStyle || (st.page.catBar===false ? 'widget' : 'bar');
}
function renderCatbar(){
  const bar=$('#catbar');
  if(homeStyle()==='blog' || catStyle()!=='bar'){ bar.classList.add('hidden'); return; }
  bar.classList.remove('hidden');
  const homeOn = homeStyle()==='blog' ? st.cat==='recent' : st.cat==='home';
  const ci=st.page.catImgs||{};
  const pill=(key,label,on)=> ci[key]
    ? `<a data-c="${esc(key)}" class="pillimg ${on?'on':''}"><img src="${ci[key]}" alt="${esc(label)}" draggable="false"></a>`
    : `<a data-c="${esc(key)}" class="${on?'on':''}">${esc(label)}</a>`;
  bar.innerHTML = pill('home','HOME',homeOn)+
    cats().map(c=>pill(c,c.toUpperCase(),st.cat===c)).join('')+
    (galOn()?pill('__gal','GALLERY',st.cat==='__gal'):'')+
    pill('__gb','GUESTBOOK',st.cat==='__gb')+
    (homeStyle()==='blog'?'':pill('recent','ALL',st.cat==='recent'));
  bar.querySelectorAll('a').forEach(el=>el.onclick=()=>{
    el.dataset.c==='home' ? goHome() : goBoard(el.dataset.c);
  });
}
function applyView(){
  const home = st.cat==='home';
  $('#home-grid').classList.toggle('hidden', !home);
  $('#board').classList.toggle('hidden', home);
  const isHomeView = home || (homeStyle()==='blog' && st.cat==='recent');
  document.body.classList.toggle('in-board', !isHomeView);
}

/* ── 위젯 드래그 앤 드롭 (주인장 전용) ── */
function bindDrag(d){
  if(!st.mine) return;
  d.draggable=true;
  d.addEventListener('dragstart',e=>{
    e.dataTransfer.setData('text/plain', d.dataset.wi);
    e.dataTransfer.effectAllowed='move';
    setTimeout(()=>d.classList.add('dragging'),0);
  });
  d.addEventListener('dragend',()=>{
    d.classList.remove('dragging');
    document.querySelectorAll('.side.dropzone').forEach(x=>x.classList.remove('dropzone'));
  });
  d.addEventListener('dragover',e=>{ e.preventDefault(); d.classList.add('dropzone'); });
  d.addEventListener('dragleave',()=>d.classList.remove('dropzone'));
  d.addEventListener('drop',e=>{
    e.preventDefault(); e.stopPropagation();
    d.classList.remove('dropzone');
    dropWidget(+e.dataTransfer.getData('text/plain'), +d.dataset.wi, d.parentElement.id);
  });
}
['aside','aside-l','hcol-l','hcol-c','hcol-r'].forEach(id=>{
  const c=document.getElementById(id); if(!c) return;
  c.addEventListener('dragover',e=>{ e.preventDefault();
    if(!e.target.closest || !e.target.closest('.side')) c.classList.add('dropzone-end'); });
  c.addEventListener('dragleave',()=>c.classList.remove('dropzone-end'));
  c.addEventListener('drop',e=>{
    c.classList.remove('dropzone-end');
    if(e.target.closest && e.target.closest('.side')) return;
    e.preventDefault();
    dropWidget(+e.dataTransfer.getData('text/plain'), -1, id);
  });
});
async function dropWidget(from, to, contId){
  if(isNaN(from)) return;
  const arr=JSON.parse(JSON.stringify(sideCfg()));
  if(from<0||from>=arr.length) return;
  const [w]=arr.splice(from,1);
  w.col = contId==='hcol-l' ? 'l'
        : contId==='hcol-c' ? 'c'
        : contId==='hcol-r' ? 'r'
        : contId==='aside-l' ? 'l' : 'r';
  if(to<0){ arr.push(w); }
  else{
    let ins=to; if(from<to) ins=to-1;
    if(ins<0) ins=0; if(ins>arr.length) ins=arr.length;
    arr.splice(ins,0,w);
  }
  st.page.side=arr;
  renderSide();
  try{ await updateDoc(doc(db,'pages',st.handle),{side:arr}); }
  catch(e){ alert('순서 저장 실패: '+e.message); }
}
let spkOn=false, spkPri='#9db4ff', spkLast=0;
function spkSync(){
  spkOn=!!st.page?.sparkle;
  spkPri=getComputedStyle(document.body).getPropertyValue('--pri').trim()||'#9db4ff';
}
document.addEventListener('mousemove',e=>{
  if(!spkOn) return;
  const now=performance.now(); if(now-spkLast<22) return; spkLast=now;
  const cols=[spkPri,spkPri,'#ffffff','#fff3d8'];
  for(let i=0;i<2;i++){
    const s=document.createElement('div');
    const size=3+Math.random()*4;
    s.style.cssText='position:fixed;pointer-events:none;z-index:9999;border-radius:50%;'
      +'left:'+(e.clientX+(Math.random()*16-8))+'px;top:'+(e.clientY+(Math.random()*16-8))+'px;'
      +'width:'+size+'px;height:'+size+'px;'
      +'background:'+cols[Math.floor(Math.random()*cols.length)]+';'
      +'box-shadow:0 0 5px '+spkPri+';'
      +'transition:transform .7s ease-out, opacity .7s ease-out';
    document.body.appendChild(s);
    requestAnimationFrame(()=>{ 
      s.style.transform='translate('+(Math.random()*30-15)+'px,'+(20+Math.random()*20)+'px) scale(.2)';
      s.style.opacity='0'; });
    setTimeout(()=>s.remove(),760);
  }
});
document.addEventListener('contextmenu',e=>{
  if(!st.page || st.page.protectImg===false) return;
  if(e.target.closest('img,#pg-hero,#pg-hero2,.g-item,.stk,.pin')) e.preventDefault();
});
document.addEventListener('dragstart',e=>{
  if(!st.page || st.page.protectImg===false) return;
  if(e.target.tagName==='IMG' && !e.target.closest('[draggable="true"]')) e.preventDefault();
});
let bgmCur='', bgmHandle='';
const bgmPlaying=()=>!!document.querySelector('#bgm-dock-fr iframe');
function bgmStart(src){ bgmCur=src; bgmHandle=st.handle;
  $('#bgm-dock-fr').innerHTML=`<iframe style="width:200px;height:112px;border:0;border-radius:9px;display:block" src="${src}" allow="autoplay; encrypted-media"></iframe>`;
  $('#bgm-dock').classList.remove('hidden'); }
function bgmStop(){ bgmCur=''; bgmHandle='';
  $('#bgm-dock-fr').innerHTML=''; $('#bgm-dock').classList.add('hidden'); }
$('#bgm-dock-x').onclick=()=>{ bgmStop(); renderSide(); };
function renderWidgets(){ renderSide(); }
function renderSide(){
  const p=st.page;
  const home = st.cat==='home';
  const boxR=$('#aside'), boxL=$('#aside-l'),
        hL=$('#hcol-l'), hC=$('#hcol-c'), hR=$('#hcol-r');
  const both = p.sidePos==='both';
  const headEl=document.querySelector('#aside .head, #aside-l .head');
  boxR.innerHTML=''; boxL.innerHTML='';
  hL.innerHTML=''; hC.innerHTML=''; hR.innerHTML='';
  if(headEl) (both?boxL:boxR).appendChild(headEl);
  if(home && !sideCfg().some(w=>w.t==='latest')) latestBlock(hC);
  const isM = window.innerWidth<=640;
  const mOrd=(w,i)=>w.mo ?? (({c:0,l:1,r:2}[w.col||'r']||2)*100+i);
  let seq = sideCfg().map((w,wi)=>({w,wi}));
  if(home && isM) seq=seq.sort((A,B)=>mOrd(A.w,A.wi)-mOrd(B.w,B.wi));
  seq.forEach(({w,wi})=>{
    const pos = p.sidePos==='left'?'l' : p.sidePos==='both'?'b' : 'r';
    const box = (home && isM) ? hC
      : home
      ? (pos==='b' ? (w.col==='l'?hL : w.col==='c'?hC : hR)
        : pos==='l' ? (w.col==='c'?hC : hL)
        : (w.col==='c'?hC : hR))
      : ((both && w.col==='l') ? boxL : boxR);
    if(w.t==='latest'){
      if(!home) return;
      const el=latestBlock(box);
      el.dataset.wi=wi; bindDrag(el);
      return;
    }
    const d=document.createElement('div'); d.className='side sw-'+w.t;
    d.dataset.wi=wi; bindDrag(d);
    if(w.t==='search'){
      d.innerHTML=`<p class="label">SEARCH</p>
        <div class="s-search">⌕ <input id="q" placeholder="search"></div>`;
      box.appendChild(d);
      d.querySelector('#q').addEventListener('input',e=>{
        st.q=e.target.value.trim().toLowerCase(); renderList(); });
      return;
    }
    if(w.t==='category'){
      if(catStyle()==='bar' && homeStyle()!=='blog') return;   // 알약 바 모드에선 사이드 카테고리 숨김(블로그형 제외)
      const cnt=c=> isG(c) ? st.gallery.filter(x=>x.cat===c).length
                           : st.posts.filter(x=>x.cat===c).length;
      d.innerHTML=`<p class="label">CATEGORY</p><ul id="cats">`+
        cats().map(c=>`<li><a data-c="${esc(c)}" class="${st.cat===c?'on':''}">
          <span>${esc(c)}</span>
          <span class="n">${cnt(c)}</span></a></li>`).join('')+
        (galOn()?`<li><a data-c="__gal" class="${st.cat==='__gal'?'on':''}"><span>GALLERY</span><span class="n">${st.gallery.length}</span></a></li>`:'')+
        `<li><a data-c="__gb" class="${st.cat==='__gb'?'on':''}"><span>GUESTBOOK</span><span class="n">${st.guest.length}</span></a></li>`+
        `<li><a data-c="recent" class="${st.cat==='recent'?'on':''}"><span>전체</span><span class="n">${st.posts.length}</span></a></li></ul>`;
      box.appendChild(d);
      d.querySelectorAll('#cats a').forEach(el=>el.onclick=()=>goBoard(el.dataset.c));
      return;
    }
    if(w.t==='dday'){
      if(!(p.ddays&&p.ddays.length)){
        if(st.mine){ d.innerHTML=`<p class="label">D-DAY</p><p style="font-size:11px;color:var(--muted)">✦ 꾸미기 → 위젯 → 디데이 ✎에서 날짜를 추가하세요</p>`; box.appendChild(d); }
        return;
      }
      d.innerHTML=`<p class="label">D-DAY</p>`+p.ddays.map(x=> x.img
        ? `<div class="dd-card" style="background-image:url(${x.img})">
             <div class="in2"><span class="t">${esc(x.title)}</span><span class="n">${esc(dday(x.date))}</span></div></div>`
        : `<div class="dd-item"><span class="t">${esc(x.title)}</span><span class="n">${esc(dday(x.date))}</span></div>`).join('');
      box.appendChild(d); return;
    }
    if(w.t==='bgm'){
      const vid=ytId(p.bgm?.url), list=ytList(p.bgm?.url);
      if(!vid && !list){
        if(st.mine){ d.innerHTML=`<p class="label">BGM</p><p style="font-size:11px;color:var(--muted)">✦ 꾸미기 → 위젯 → BGM ✎에 유튜브 영상/플레이리스트 링크를 넣으세요</p>`; box.appendChild(d); }
        return;
      }
      const cover = vid
        ? `<img src="https://img.youtube.com/vi/${vid}/hqdefault.jpg" alt="">`
        : `<span class="mus">♪</span>`;
      d.innerHTML=`<p class="label">NOW PLAYING</p>
        <div class="bgm-w">
          <span class="bgm-cov">${cover}</span>
          <span class="bgm-meta"><b>${esc(p.bgm.title|| (list?'플레이리스트':'배경음악'))}</b>
            <span class="bgm-eq"><i></i><i></i><i></i><i></i><i></i></span></span>
          <span class="bgm-btn2">▶</span>
        </div><div class="bgm-fr"></div>`;
      box.appendChild(d);
      const src = list
        ? `https://www.youtube.com/embed/videoseries?list=${list}&autoplay=1`
        : `https://www.youtube.com/embed/${vid}?autoplay=1&loop=1&playlist=${vid}`;
      const btn=d.querySelector('.bgm-btn2');
      const on=bgmPlaying()&&bgmCur===src;
      btn.textContent=on?'❚❚':'▶'; d.classList.toggle('playing',on);
      btn.onclick=()=>{
        if(bgmPlaying()&&bgmCur===src) bgmStop(); else bgmStart(src);
        renderSide(); };
      return;
    }
    if(w.t==='profile'){
      d.className+=' w-profile';
      d.innerHTML=(w.img?`<img src="${w.img}" alt="" draggable="false" style="max-height:${+(w.h)||210}px">`:'')+
        (w.text?`<p class="cap">${esc(w.text)}</p>`:'');
      box.appendChild(d); return;
    }
    if(w.t==='img'){
      if(!w.img){ if(st.mine){ d.innerHTML=`<p class="label">${esc(w.label||'IMAGE')}</p><p class="pl-empty">✎ 편집에서 사진을 올려주세요.</p>`; box.appendChild(d); } return; }
      d.className+=' w-img';
      const pic=`<img src="${w.img}" alt="" draggable="false">`;
      d.innerHTML=(w.label===''?'':`<p class="label">${esc(w.label||'IMAGE')}</p>`)
        +(w.url?`<a href="${esc(w.url)}" target="_blank" rel="noopener" class="iw">${pic}</a>`:`<span class="iw">${pic}</span>`)
        +(w.text?`<p class="iw-cap">${esc(w.text).replace(/\n/g,'<br>')}</p>`:'');
      box.appendChild(d); return;
    }
    if(w.t==='chat'){
      const ls=(w.lines||[]).filter(l=>l.text||l.name);
      if(!ls.length && !st.mine) return;
      d.className+=' w-chat ch-'+(w.style||'msg');
      const imgs=w.imgs!==false;
      const lum=hx=>{ try{ const n=parseInt(hx.slice(1),16);
        return (((n>>16)&255)*.299+((n>>8)&255)*.587+(n&255)*.114)/255; }catch(e){ return .5; } };
      const sv=[];
      if(w.cL) sv.push(`--chL:${w.cL}`, `--chLt:${lum(w.cL)>.62?'#1a1a1a':'#fff'}`);
      if(w.cR) sv.push(`--chR:${w.cR}`, `--chRt:${lum(w.cR)>.62?'#1a1a1a':'#fff'}`);
      if(w.fs) sv.push(`--chFs:${w.fs}px`);
      if(w.font==='serif') sv.push(`--chFf:'Noto Serif KR',serif`);
      if(w.font==='mono') sv.push(`--chFf:'IBM Plex Mono',monospace`);
      if(sv.length) d.setAttribute('style', sv.join(';'));
      d.innerHTML=`<p class="label">CHAT</p>`+(ls.length?`<div class="ch-box">`+ls.map(l=>`
        <div class="ch-line ${l.side==='r'?'r':'l'}">
          ${imgs&&l.img?`<img class="ch-p" src="${l.img}" alt="" draggable="false">`:''}
          <div class="ch-b">${l.name?`<span class="ch-n">${esc(l.name)}</span>`:''}<p>${esc(l.text)}</p></div>
        </div>`).join('')+`</div>`
        :'<p class="pl-empty">✎ 편집에서 대사를 추가해주세요.</p>');
      box.appendChild(d); return;
    }
    if(w.t==='notice'){
      if(!w.title && !w.text && !st.mine) return;
      d.className+=' w-notice';
      d.innerHTML=`<p class="label">NOTICE</p>
        ${w.title?`<p class="nt-t">${esc(w.title)}</p>`:''}
        ${w.text?`<p class="nt-x">${esc(w.text).replace(/\n/g,'<br>')}</p>`
          :(!w.title&&st.mine?'<p class="pl-empty">✎ 편집에서 내용을 채워주세요.</p>':'')}`;
      box.appendChild(d); return;
    }
    if(w.t==='quote'){
      d.className+=' w-quote';
      d.innerHTML=`<span class="qm">❝</span><p>${esc(w.text||'').replace(/\n/g,'<br>')}</p>`;
      box.appendChild(d); return;
    }
    if(w.t==='links'){
      d.className+=' w-links';
      d.innerHTML=`<p class="label">LINKS</p>`+(w.items||[]).map(l=>
        `<a href="${esc(l.url)}" target="_blank" rel="noopener"><span>${esc(l.label)}</span><span>↗</span></a>`).join('');
      box.appendChild(d); return;
    }
    if(w.t==='banner'){
      d.className+=' w-banner';
      d.innerHTML=`<p class="label">BANNER</p><div class="bn-list">`+(w.items||[]).map(b=>
        `<a ${b.url?`href="${esc(b.url)}" target="_blank" rel="noopener"`:''}><img src="${b.img}" alt="" draggable="false"></a>`).join('')+`</div>`;
      box.appendChild(d); return;
    }
  });
  if(home && isM && st.mine){
    const bump=async(wi,dir)=>{
      const arr=JSON.parse(JSON.stringify(sideCfg()));
      const sq=arr.map((w,i)=>({w,i})).sort((A,B)=>mOrd(A.w,A.i)-mOrd(B.w,B.i));
      sq.forEach((s2,ps)=>s2.w.mo=ps*10);
      const ps=sq.findIndex(s2=>s2.i===wi), tg=ps+dir;
      if(tg<0||tg>=sq.length) return;
      const t=sq[ps].w.mo; sq[ps].w.mo=sq[tg].w.mo; sq[tg].w.mo=t;
      st.page.side=arr; renderSide();
      try{ await updateDoc(doc(db,'pages',st.handle),{side:arr}); }catch(e){}
    };
    hC.querySelectorAll(':scope > [data-wi]').forEach(el=>{
      const m=document.createElement('div'); m.className='mmv';
      m.innerHTML='<button data-mv="-1">↑</button><button data-mv="1">↓</button>';
      m.querySelectorAll('button').forEach(b=>b.onclick=e=>{
        e.stopPropagation(); bump(+el.dataset.wi, +b.dataset.mv); });
      el.appendChild(m);
    });
  }
  const gh=$('#home-grid');
  const pos = p.sidePos==='left'?'l' : p.sidePos==='both'?'b' : 'r';
  gh.classList.remove('slim-l','slim-r');
  gh.classList.toggle('pos-r', pos==='r');
  gh.classList.toggle('pos-l', pos==='l');
  gh.classList.toggle('pos-b', pos==='b');
  gh.classList.toggle('no-l', pos==='b' && !hL.children.length && !st.mine);
  gh.classList.toggle('no-r', pos==='b' && !hR.children.length && !st.mine);
}
function renderCats(){ renderSide(); }
async function addCat(){
  const c=prompt('새 카테고리 이름'); if(!c) return;
  const name=c.trim(); if(!name||cats().includes(name)) return;
  const next=[...cats(),name];
  await updateDoc(doc(db,'pages',st.handle),{cats:next});
  st.page.cats=next; renderSide(); refreshWriteCats();
}
function renderGuest(){
  $('#list-view').classList.add('hidden');
  $('#gb-form').classList.toggle('hidden', !st.me);
  $('#gb-login').classList.toggle('hidden', !!st.me);
  $('#gb-list').innerHTML = st.guest.length? st.guest.map(g=>`
    <li class="gb-item">
      <p class="who"><span>@${esc(g.name||'guest')}${(st.mine||g.uid===st.me?.uid)?`<i class="del" data-gbd="${g.id}">삭제</i>`:''}</span>
      <span class="dt">${fmtTs(g.ts)}</span></p>
      <p>${esc(g.text)}</p></li>`).join('')
    :'<p class="pl-empty">아직 방명록이 비어 있어요 — 첫 흔적을 남겨주세요.</p>';
  $('#gb-list').querySelectorAll('[data-gbd]').forEach(b=>b.onclick=async()=>{
    if(!confirm('이 방명록 글을 삭제할까요?')) return;
    await deleteDoc(doc(db,'pages',st.handle,'guest',b.dataset.gbd));
    st.guest=st.guest.filter(x=>x.id!==b.dataset.gbd); renderGuest();
  });
}
function switchTab(name){
  document.querySelectorAll('.tabs button').forEach(b=>b.classList.toggle('on',b.dataset.tab===name));
  document.querySelectorAll('.pane').forEach(p=>p.classList.toggle('hidden',p.dataset.pane!==name));
}
function updateBoardWrite(){
  const b=$('#board-write'); if(!b) return;
  const c=st.cat;
  const ok = st.mine && c!=='home' && c!=='__gb';
  b.classList.toggle('hidden', !ok);
  if(!ok) return;
  b.onclick=()=>{
    refreshWriteCats(); refreshGalCats(); openPanel('write');
    if(c==='__gal' || isG(c)){ switchTab('galup'); if(isG(c)) $('#g-cat').value=c; }
    else if(c!=='recent'){ $('#w-cat').value=c; }
  };
}
const postThumb=p=>{ if(p.secret||!p.body) return ''; const m=p.body.match(/<img[^>]+src="([^"]+)"/); return m?m[1]:''; };
function renderList(){
  updateBoardWrite();
  if(st.cat==='__gb'){ $('#guest-view').classList.remove('hidden');
    $('#list-view').classList.add('hidden'); renderGuest(); return; }
  $('#guest-view').classList.add('hidden');
  $('#list-view').classList.remove('hidden');
  if(st.cat==='__gal' || (st.cat!=='recent' && st.cat!=='home' && isG(st.cat))){
    $('#v-label').textContent = st.cat==='__gal' ? 'GALLERY' : st.cat.toUpperCase();
    $('#pin-slot').innerHTML='';
    const items = st.cat==='__gal' ? st.gallery : st.gallery.filter(g=>g.cat===st.cat);
    $('#rows').innerHTML = items.length
      ? `<div class="gal-grid">`+items.map(g=>
          `<a data-gg="${g.id}"><img src="${g.img}" alt="" draggable="false">${st.mine?`<i class="gdel" data-gx="${g.id}">✕</i>`:''}</a>`).join('')+`</div>`
      : '<p class="pl-empty">아직 이미지가 없습니다.</p>';
    $('#more-btn').style.display='none';
    document.querySelectorAll('[data-gg]').forEach(el=>el.onclick=e=>{
      if(e.target.dataset.gx){ e.stopPropagation(); delGal(e.target.dataset.gx); return; }
      const g=st.gallery.find(x=>x.id===el.dataset.gg);
      if(g){ $('#lb-img').src=g.img; $('#lb').classList.add('show'); }
    });
    return;
  }
  let items=st.posts;
  if(st.cat!=='recent') items=items.filter(p=>p.cat===st.cat);
  if(st.q) items=items.filter(p=>p.title.toLowerCase().includes(st.q));
  const pin=(st.cat==='recent'&&!st.q)?items.find(p=>p.pinned):null;
  const rest=items.filter(p=>p!==pin);
  $('#v-label').textContent = st.cat==='recent'?'RECENT':st.cat.toUpperCase();
  $('#pin-slot').innerHTML = pin?`
    <a class="pin" data-id="${pin.id}">
      <span class="tag">◈ PINNED</span>
      <p class="t">${esc(pin.title)}${pin.secret?' 🔒':''}</p>
      ${pin.excerpt?`<p class="ex">${esc(pin.excerpt)}</p>`:''}
      <p class="meta">${esc(pin.cat)} · ${esc(pin.date)}</p></a>`:'';
  const shown=(st.cat==='recent'&&!st.q)?rest.slice(0,7):rest;
  const rowHTML=p=>{ const t=postThumb(p); return `
    <li class="row ${t?'has-th':''}" data-id="${p.id}">
      <span class="d">${esc((p.date||'').slice(5))}</span>
      <span class="t">${esc(p.title)} ${p.secret?'<span class="k">🔒</span>':''}</span>
      <span class="c">${esc(p.cat)}</span>
      <span class="k"></span>${t?`<img class="th" src="${t}" alt="" draggable="false">`:''}</li>`; };
  $('#rows').innerHTML = shown.length?shown.map(rowHTML).join('')
    :'<p class="pl-empty">아직 글이 없습니다.</p>';
  $('#more-btn').style.display=(st.cat==='recent'&&!st.q&&rest.length>7)?'':'none';
  document.querySelectorAll('[data-id]').forEach(el=>el.onclick=()=>openPost(el.dataset.id));
}
function renderGal(all){
  const arr=all?st.gallery:st.gallery.slice(0,4);
  $('#gal').innerHTML = arr.length?arr.map(g=>
    `<a data-g="${g.id}"><img src="${g.img}" alt="" draggable="false">${st.mine?`<i class="gdel" data-gx="${g.id}">✕</i>`:''}</a>`).join('')
    :'<p class="pl-empty">아직 이미지가 없습니다.</p>';
  document.querySelectorAll('#gal a').forEach(a=>a.onclick=e=>{
    if(e.target.dataset.gx){ e.stopPropagation(); delGal(e.target.dataset.gx); return; }
    const g=st.gallery.find(x=>x.id===a.dataset.g);
    if(g){ $('#lb-img').src=g.img; $('#lb').classList.add('show'); }
  });
}
$('#gb-home').onclick=goHome;
$('#gb-go').onclick=async()=>{
  const t=$('#gb-text').value.trim(); if(!t||!st.me) return;
  await addDoc(collection(db,'pages',st.handle,'guest'),
    {uid:st.me.uid, name:st.myHandle||st.me.displayName||'guest', text:t, ts:serverTimestamp()});
  $('#gb-text').value='';
  const gb=await getDocs(query(collection(db,'pages',st.handle,'guest'),orderBy('ts','desc')));
  st.guest=gb.docs.map(d=>({id:d.id,...d.data()})); renderGuest();
};
$('#gb-login-btn').onclick=()=>signInWithPopup(auth,new GoogleAuthProvider()).catch(()=>{});
async function delGal(id){
  const g=st.gallery.find(x=>x.id===id); if(!g) return;
  if(!confirm('이 이미지를 삭제할까요?'+(g.title?`\n(${g.title})`:''))) return;
  await deleteDoc(doc(db,'pages',st.handle,'gallery',id));
  st.gallery=st.gallery.filter(x=>x.id!==id);
  renderGal(); if(st.cat==='__gal'||isG(st.cat)) renderList(); renderSide();
}
$('#gal-more').onclick=()=>goBoard('__gal');
$('#lb').onclick=()=>$('#lb').classList.remove('show');
document.addEventListener('contextmenu',e=>{
  if(e.target.closest&&(e.target.closest('#gal')||e.target.closest('#lb'))) e.preventDefault();
});

/* ---------- 글 읽기 ---------- */
function backToList(){ document.body.classList.remove('reading');
  $('#post-view').classList.add('hidden');
  $('#guest-view').classList.add('hidden');
  if(st.cat==='__gb'){ renderGuest(); $('#guest-view').classList.remove('hidden'); }
  else $('#list-view').classList.remove('hidden');
  st.cur=null;
  history.replaceState(null,'',urlFor(st.handle)); }
$('#pv-back').onclick=backToList;
$('#go-home').onclick=goHome;
async function openPost(id){
  const p=st.posts.find(x=>x.id===id); if(!p) return;
  let body;
  if(p.secret){
    const pw=prompt('비밀번호를 입력하세요'); if(pw===null) return;
    try{ body=await decTxt(pw,p.enc); }catch(e){ alert('비밀번호가 맞지 않습니다.'); return; }
  } else body=p.body;
  st.cur=p; st.curBody=body;
  $('#pv-meta').textContent=p.cat+' · '+p.date+(p.secret?' · SECRET':'');
  $('#pv-title').textContent=p.title;
  $('#pv-body').innerHTML=body;
  $('#pv-del').classList.toggle('hidden',!st.mine);
  $('#list-view').classList.add('hidden');
  $('#post-view').classList.remove('hidden');
  document.body.classList.toggle('reading', !!st.page.postPage);
  history.replaceState(null,'',urlFor(st.handle,id));
  const li=st.posts.findIndex(x=>x.id===id),
        older=st.posts[li+1], newer=st.posts[li-1];
  $('#pv-nav').innerHTML =
    (older?`<span class="back" data-nav="${older.id}">‹ 이전 — ${esc(older.title)}</span>`:'<span></span>')+
    (newer?`<span class="back" data-nav="${newer.id}" style="text-align:right">다음 — ${esc(newer.title)} ›</span>`:'<span></span>');
  document.querySelectorAll('#pv-nav [data-nav]').forEach(el=>el.onclick=()=>openPost(el.dataset.nav));
  window.scrollTo({top:0});
  loadComments(id);
}
async function loadComments(pid){
  const post=st.posts.find(x=>x.id===pid);
  const lbl=document.querySelector('#cmt .label');
  if(post?.cmtOff){
    $('#cmt-list').innerHTML=`<p class="cmt-closed">이 글의 댓글이 닫혀 있어요.</p>`;
    $('#cmt-form').classList.add('hidden');
    $('#cmt-login').classList.add('hidden');
    lbl.innerHTML='◈ COMMENTS'+(st.mine?` <i class="cmt-toggle" id="cmt-open">댓글 열기</i>`:'');
    const co=$('#cmt-open'); if(co) co.onclick=async()=>{
      await updateDoc(doc(db,'pages',st.handle,'posts',pid),{cmtOff:false});
      post.cmtOff=false; loadComments(pid);
    };
    return;
  }
  lbl.innerHTML='◈ COMMENTS'+(st.mine?` <i class="cmt-toggle" id="cmt-close">댓글 닫기</i>`:'');
  const cc=$('#cmt-close'); if(cc) cc.onclick=async()=>{
    await updateDoc(doc(db,'pages',st.handle,'posts',pid),{cmtOff:true});
    const p2=st.posts.find(x=>x.id===pid); if(p2) p2.cmtOff=true; loadComments(pid);
  };
  $('#cmt-list').innerHTML='<p class="pl-empty">불러오는 중...</p>';
  $('#cmt-form').classList.toggle('hidden', !st.me);
  $('#cmt-login').classList.toggle('hidden', !!st.me);
  try{
    const cs=await getDocs(query(collection(db,'pages',st.handle,'posts',pid,'comments'),orderBy('ts','asc')));
    const arr=cs.docs.map(d=>({id:d.id,...d.data()}));
    $('#cmt-list').innerHTML = arr.length? arr.map(c=>`
      <li class="cmt-item">
        <p class="who"><span>@${esc(c.name||'guest')}</span><span class="dt">${fmtTs(c.ts)}</span>
        ${(st.mine||c.uid===st.me?.uid)?`<i class="del" data-cd="${c.id}" style="cursor:pointer;color:var(--muted);font-size:10px">삭제</i>`:''}</p>
        <p>${esc(c.text)}</p></li>`).join('')
      :'<p class="pl-empty">첫 댓글을 남겨보세요.</p>';
    $('#cmt-list').querySelectorAll('[data-cd]').forEach(b=>b.onclick=async()=>{
      if(!confirm('댓글을 삭제할까요?')) return;
      await deleteDoc(doc(db,'pages',st.handle,'posts',pid,'comments',b.dataset.cd));
      loadComments(pid);
    });
  }catch(e){ $('#cmt-list').innerHTML='<p class="pl-empty">댓글을 불러올 수 없어요.</p>'; }
}
$('#cmt-go').onclick=async()=>{
  const t=$('#cmt-text').value.trim(); if(!t||!st.me||!st.cur) return;
  await addDoc(collection(db,'pages',st.handle,'posts',st.cur.id,'comments'),
    {uid:st.me.uid, name:st.myHandle||st.me.displayName||'guest', text:t, ts:serverTimestamp()});
  $('#cmt-text').value=''; loadComments(st.cur.id);
};
$('#cmt-login-btn').onclick=()=>signInWithPopup(auth,new GoogleAuthProvider()).catch(()=>{});
$('#pv-copy').onclick=()=>{
  const url=location.origin+urlFor(st.handle, st.cur?.id||'');
  (navigator.clipboard?navigator.clipboard.writeText(url).then(()=>alert('링크를 복사했어요!\n'+url))
    :Promise.reject()).catch(()=>prompt('이 링크를 복사하세요',url));
};
$('#pv-del').onclick=async()=>{
  const p=st.cur; if(!p||!st.mine) return;
  if(!confirm('「'+p.title+'」 글을 삭제할까요?')) return;
  await deleteDoc(doc(db,'pages',st.handle,'posts',p.id));
  st.posts=st.posts.filter(x=>x.id!==p.id);
  backToList(); renderWidgets(); renderList();
};

/* ---------- 검색: search 위젯 내부에서 바인딩 ---------- */
$('#more-btn').onclick=()=>{ st.cat='recent'; st.q='__all__'; st.q=''; 
  $('#rows').innerHTML=''; const rest=st.posts.filter(p=>!p.pinned);
  $('#v-label').textContent='ALL';
  $('#rows').innerHTML=rest.map(p=>{ const t=postThumb(p); return `
    <li class="row ${t?'has-th':''}" data-id="${p.id}">
      <span class="d">${esc((p.date||'').slice(5))}</span>
      <span class="t">${esc(p.title)} ${p.secret?'<span class="k">🔒</span>':''}</span>
      <span class="c">${esc(p.cat)}</span>
      <span class="k"></span>${t?`<img class="th" src="${t}" alt="" draggable="false">`:''}</li>`; }).join('');
  $('#more-btn').style.display='none';
  document.querySelectorAll('#rows [data-id]').forEach(el=>el.onclick=()=>openPost(el.dataset.id));
};

/* ---------- 카테고리 추가/삭제 ---------- */
async function removeCat(c){
  if(!confirm(`'${c}' 카테고리를 삭제할까요? (글은 남고 '전체'에서 보여요)`)) return;
  const next=cats().filter(x=>x!==c);
  await updateDoc(doc(db,'pages',st.handle),{cats:next});
  st.page.cats=next; if(st.cat===c) st.cat='recent';
  renderCats(); renderList(); refreshWriteCats();
}

/* ---------- 관리 패널 ---------- */
function refreshWriteCats(){
  $('#w-cat').innerHTML=cats().filter(c=>!isG(c)).map(c=>`<option>${esc(c)}</option>`).join('');
}
function refreshGalCats(){
  const g=gcats(), sel=$('#g-cat');
  sel.innerHTML = `<option value="">일반 갤러리 (하단 스트립)</option>`+
    g.map(c=>`<option>${esc(c)}</option>`).join('');
}
function openPanel(mode){
  const groups={write:['write','galup'], deco:['wid','cats','set','theme','bg','stk']};
  document.querySelectorAll('.tabs button').forEach(b=>{
    b.style.display=groups[mode].includes(b.dataset.tab)?'':'none';
  });
  const first = mode==='write'?'write':'wid';
  document.querySelectorAll('.tabs button').forEach(b=>b.classList.toggle('on',b.dataset.tab===first));
  document.querySelectorAll('.pane').forEach(p=>p.classList.toggle('hidden',p.dataset.pane!==first));
  $('#panel').classList.toggle('big', mode==='deco');
  msg(''); $('#panel').classList.add('show');
}
$('#s-dim').addEventListener('input',e=>{
  document.documentElement.style.setProperty('--dim', e.target.value/100);
});
$('#s-color').addEventListener('input',e=>{
  const [hh,s,l]=hexToHsl(e.target.value); applyColor(hh,s,l);
});
$('#btn-write').onclick=()=>{ refreshWriteCats(); refreshGalCats(); openPanel('write'); };
$('#btn-deco').onclick=()=>{ fillSettings(); fillWidgets(); renderCatMgr(); openPanel('deco'); };

/* ---------- 카테고리 관리 (추가·삭제·이름 변경) ---------- */
function renderCatMgr(){
  const box=$('#cat-mgr'); if(!box) return;
  box.innerHTML = cats().map((c,i)=>`
    <div class="p-row">
      <input data-ci="${i}" value="${esc(c)}">
      <select data-ct="${i}" style="width:auto;margin-bottom:0">
        <option value="post" ${!isG(c)?'selected':''}>글</option>
        <option value="gallery" ${isG(c)?'selected':''}>사진</option>
      </select>
      <button class="btn" data-cs="${i}" style="font-size:12px">저장</button>
      <label class="filelab" title="버튼 이미지">🖼<input type="file" data-cimg="${esc(c)}" accept="image/*" style="display:none"></label>
      ${(st.page.catImgs||{})[c]?`<button class="rmv" data-cimgx="${esc(c)}" style="font-size:10px">이미지✕</button>`:''}
      <button class="rmv" data-cd="${i}">✕</button>
    </div>`).join('') || '<p class="pl-empty">카테고리가 없어요.</p>';
  renderCatFix();
  box.querySelectorAll('[data-ct]').forEach(s=>s.onchange=async()=>{
    const name=cats()[+s.dataset.ct];
    let g=[...gcats()];
    if(s.value==='gallery'){ if(!g.includes(name)) g.push(name); }
    else g=g.filter(x=>x!==name);
    await updateDoc(doc(db,'pages',st.handle),{gcats:g});
    st.page.gcats=g; refreshWriteCats(); refreshGalCats(); renderSide(); renderCatbar();
    msg(`'${name}' → ${s.value==='gallery'?'사진':'글'} 카테고리로 변경!`);
  });
  box.querySelectorAll('[data-cs]').forEach(b=>b.onclick=async()=>{
    const i=+b.dataset.cs, oldName=cats()[i],
          nv=box.querySelector(`[data-ci="${i}"]`).value.trim();
    if(!nv||nv===oldName) return;
    if(cats().includes(nv)){ msg('이미 있는 이름이에요.'); return; }
    msg('이름 바꾸는 중... (글도 함께 이사)');
    try{
      const next=[...cats()]; next[i]=nv;
      await updateDoc(doc(db,'pages',st.handle),{cats:next});
      st.page.cats=next;
      if(isG(oldName)){
        const g=gcats().map(x=>x===oldName?nv:x);
        await updateDoc(doc(db,'pages',st.handle),{gcats:g}); st.page.gcats=g;
      }
      const moves=st.posts.filter(p=>p.cat===oldName);
      await Promise.all(moves.map(p=>
        updateDoc(doc(db,'pages',st.handle,'posts',p.id),{cat:nv})));
      moves.forEach(p=>p.cat=nv);
      const gmoves=st.gallery.filter(g2=>g2.cat===oldName);
      await Promise.all(gmoves.map(g2=>
        updateDoc(doc(db,'pages',st.handle,'gallery',g2.id),{cat:nv})));
      gmoves.forEach(g2=>g2.cat=nv);
      if(st.cat===oldName) st.cat=nv;
      renderCatMgr(); refreshWriteCats(); renderCatbar(); renderSide(); renderList();
      msg(`'${oldName}' → '${nv}' 완료! (글 ${moves.length}개 이사)`);
    }catch(e){ msg('오류: '+e.message); }
  });
  box.querySelectorAll('[data-cd]').forEach(b=>b.onclick=async()=>{
    await removeCat(cats()[+b.dataset.cd]); renderCatMgr();
  });
  bindCatImg(box);
}
async function setCatImg(key,val){
  const ci={...(st.page.catImgs||{})};
  if(val) ci[key]=val; else delete ci[key];
  await updateDoc(doc(db,'pages',st.handle),{catImgs:ci});
  st.page.catImgs=ci; renderCatbar(); renderCatMgr();
}
function bindCatImg(box){
  box.querySelectorAll('[data-cimg]').forEach(inp=>inp.addEventListener('change',async e=>{
    const f=e.target.files[0]; if(!f) return; msg('버튼 이미지 압축 중...');
    await setCatImg(inp.dataset.cimg, await compress(f,360,.85));
    msg('버튼 이미지 적용!');
  }));
  box.querySelectorAll('[data-cimgx]').forEach(b=>b.onclick=()=>setCatImg(b.dataset.cimgx,null));
}
function renderCatFix(){
  const box=$('#catfix-mgr'); if(!box) return;
  const ci=st.page.catImgs||{};
  const row=(key,label,extra='')=>`
    <div class="p-row">
      <span style="font-size:12.5px;color:var(--body);min-width:96px">${label}</span>
      <label class="filelab">🖼<input type="file" data-cimg="${key}" accept="image/*" style="display:none"></label>
      ${ci[key]?`<button class="rmv" data-cimgx="${key}" style="font-size:10px">이미지✕</button>`:''}
      ${extra}
    </div>`;
  box.innerHTML =
    row('home','HOME')+
    row('__gal','GALLERY',
      `<button class="btn" id="gal-toggle" style="font-size:11px">${galOn()?'숨기기 (알약·하단 갤러리 제거)':'표시하기'}</button>`+
      (galOn()?`<button class="btn" id="strip-toggle" style="font-size:11px">${stripOn()?'하단 스트립 끄기':'하단 스트립 켜기'}</button>`:''))+
    row('__gb','GUESTBOOK')+
    (homeStyle()==='blog'?'':row('recent','ALL'));
  bindCatImg(box);
  const gt=$('#gal-toggle'); if(gt) gt.onclick=async()=>{
    const next=!galOn();
    await updateDoc(doc(db,'pages',st.handle),{galOn:next});
    st.page.galOn=next;
    document.querySelector('.strip-sec').classList.toggle('hidden', !(next&&stripOn()));
    if(!next && (st.cat==='__gal')) goHome();
    renderCatbar(); renderSide(); renderCatFix();
  };
  const sp=$('#strip-toggle'); if(sp) sp.onclick=async()=>{
    const next=!stripOn();
    await updateDoc(doc(db,'pages',st.handle),{stripOn:next});
    st.page.stripOn=next;
    document.querySelector('.strip-sec').classList.toggle('hidden', !(galOn()&&next));
    renderCatFix();
  };
}
$('#cat-add2').onclick=async()=>{
  const name=$('#cat-new').value.trim(); if(!name) return;
  if(cats().includes(name)){ msg('이미 있는 카테고리예요.'); return; }
  const next=[...cats(),name];
  await updateDoc(doc(db,'pages',st.handle),{cats:next});
  st.page.cats=next; $('#cat-new').value='';
  renderCatMgr(); refreshWriteCats(); renderCatbar(); renderSide();
  msg(`'${name}' 추가 완료!`);
};
$('#w-catadd').onclick=async()=>{
  const c=prompt('새 카테고리 이름'); if(!c) return;
  const name=c.trim(); if(!name||cats().includes(name)) return;
  const next=[...cats(),name];
  await updateDoc(doc(db,'pages',st.handle),{cats:next});
  st.page.cats=next; refreshWriteCats(); $('#w-cat').value=name;
  renderCatbar(); renderSide();
};

/* ---------- 위젯 편집 탭 ---------- */
let draft=[]; let editIdx=-1; let pdraft={ddays:[],bgm:{}};
function fillWidgets(){
  draft=JSON.parse(JSON.stringify(sideCfg()));
  pdraft={ ddays:JSON.parse(JSON.stringify(st.page.ddays||[])),
           bgm:{url:st.page.bgm?.url||'', title:st.page.bgm?.title||''} };
  editIdx=-1; renderWidList(); $('#wid-edit').innerHTML='';
}
function renderWidList(){
  $('#wid-list').innerHTML = draft.map((w,i)=>`
    <div class="wl">
      <span class="nm">${WNAME[w.t]||w.t}${w.t==='links'?` (${(w.items||[]).length})`:''}${w.t==='banner'?` (${(w.items||[]).length})`:''}</span>
      ${['profile','quote','links','banner','dday','bgm','notice','chat','img'].includes(w.t)?`<button data-e="${i}">✎</button>`:''}
      <button data-u="${i}">↑</button><button data-d="${i}">↓</button><button data-x="${i}">✕</button>
    </div>`).join('') || '<p class="pl-empty">위젯이 없어요 — 아래에서 추가하세요.</p>';
  $('#wid-list').querySelectorAll('button').forEach(b=>b.onclick=()=>{
    const {e,u,d,x}=b.dataset;
    if(e!==undefined){ editIdx=+e; renderWidEdit(); return; }
    if(u!==undefined && +u>0){ const i=+u; [draft[i-1],draft[i]]=[draft[i],draft[i-1]]; }
    if(d!==undefined && +d<draft.length-1){ const i=+d; [draft[i+1],draft[i]]=[draft[i],draft[i+1]]; }
    if(x!==undefined){ draft.splice(+x,1); editIdx=-1; $('#wid-edit').innerHTML=''; }
    renderWidList();
  });
}
function renderWidEdit(){
  const w=draft[editIdx]; if(!w){ $('#wid-edit').innerHTML=''; return; }
  let html=`<p class="p-h">${WNAME[w.t]} 편집</p>`;
  if(w.t==='profile') html+=`
    <div class="p-row"><label class="filelab">사진 <input type="file" id="we-img" accept="image/*"></label></div>
    <div class="p-row" style="align-items:center">
      <span style="font-size:12px;color:var(--muted)">사진 높이</span>
      <input type="range" id="we-h" min="120" max="480" value="${+(w.h)||210}" style="flex:1;min-width:100px">
    </div>
    <textarea id="we-text" placeholder="아래 캡션 (선택 — 비우면 사진만 꽉 차게)" style="min-height:60px">${w.text||''}</textarea>`;
  if(w.t==='quote') html+=`
    <textarea id="we-text" placeholder="걸어둘 문장" style="min-height:90px">${w.text||''}</textarea>`;
  if(w.t==='img') html+=`
    <div class="p-row"><label class="filelab">사진 ${w.img?'(있음)':''} <input type="file" id="we-iimg" accept="image/*"></label>
      ${w.img?`<button class="rmv" id="we-iimgx" style="font-size:11px">사진 제거</button>`:''}</div>
    <input id="we-ilab" placeholder="제목 (예: LOVE · 비우면 제목 없이)" value="${esc(w.label ?? 'IMAGE')}">
    <textarea id="we-text" placeholder="사진 아래 설명 (선택)" style="min-height:52px">${w.text||''}</textarea>
    <input id="we-iurl" placeholder="눌렀을 때 이동할 주소 (선택)" value="${esc(w.url||'')}">`;
  if(w.t==='notice') html+=`
    <input id="we-ntt" placeholder="공지 제목 (선택)" value="${esc(w.title||'')}">
    <textarea id="we-text" placeholder="공지 내용 — 줄바꿈 그대로 표시돼요" style="min-height:100px">${w.text||''}</textarea>`;
  if(w.t==='dday') html+=pdraft.ddays.map((d,i)=>`
    <div class="p-row"><input data-dt="${i}" placeholder="제목" value="${esc(d.title)}">
    <input type="date" data-dd="${i}" value="${esc(d.date)}" style="flex:.8">
    <button class="rmv" data-dr="${i}">✕</button></div>
    <div class="p-row" style="margin-top:-4px">
      <label class="filelab" style="font-size:11px">📷 사진 ${d.img?'(있음)':''} <input type="file" data-dimg="${i}" accept="image/*"></label>
      ${d.img?`<button class="rmv" data-dximg="${i}" style="font-size:10px">사진 제거</button>`:''}
    </div>`).join('')+
    `<button class="btn" id="we-ddadd" style="font-size:12px">+ 디데이 추가</button>
    <p class="note">첫 번째 디데이는 대문에도 표시돼요. 사진을 넣으면 이미지 카드가 됩니다.</p>`;
  if(w.t==='bgm') html+=`
    <input id="we-burl" placeholder="유튜브 링크 https://youtu.be/..." value="${esc(pdraft.bgm.url)}">
    <input id="we-btitle" placeholder="곡 제목 (선택)" value="${esc(pdraft.bgm.title)}">`;
  if(w.t==='links') html+=(w.items||[]).map((l,i)=>`
    <div class="p-row"><input data-ll="${i}" placeholder="이름" value="${l.label||''}">
    <input data-lu="${i}" placeholder="https://..." value="${l.url||''}"></div>`).join('')+
    `<button class="btn" id="we-add" style="font-size:12px">+ 링크 줄 추가</button>`;
  if(w.t==='banner') html+=((w.items||[]).length?'' :
    `<p class="note" style="margin:0 0 8px">이미지를 추가하면 배너마다 이동할 링크 주소 · ↑↓ 순서 · ✕ 삭제가 생겨요.</p>`)
    +(w.items||[]).map((b,i)=>`
    <div class="p-row"><span style="font-size:11px;color:var(--muted)">배너 ${i+1}</span>
    <input data-bu="${i}" placeholder="눌렀을 때 이동할 주소 (선택)" value="${b.url||''}">
    <button class="rmv" data-bup="${i}" title="위로">↑</button>
    <button class="rmv" data-bdn="${i}" title="아래로">↓</button>
    <button class="rmv" data-br="${i}">✕</button></div>`).join('')+
    `<div class="p-row"><label class="filelab">배너 이미지 추가 <input type="file" id="we-bimg" accept="image/*"></label></div>`;
  if(w.t==='chat') html+=`
    <div class="p-row" style="align-items:center">
      <select id="we-chst" style="flex:1">
        <option value="msg" ${(w.style||'msg')==='msg'?'selected':''}>메신저 말풍선</option>
        <option value="retro" ${w.style==='retro'?'selected':''}>레트로 창 (Win98풍)</option>
        <option value="script" ${w.style==='script'?'selected':''}>대본형 (미니멀)</option>
      </select>
      <label class="chk"><input type="checkbox" id="we-chimg" ${w.imgs!==false?'checked':''}> 프사 표시</label>
    </div>
    <div class="p-row" style="align-items:center;font-size:11px;color:var(--muted);gap:7px">
      왼쪽 <input type="color" id="we-chcl" value="${w.cL||'#2a2f3a'}" style="width:34px;padding:0">
      오른쪽 <input type="color" id="we-chcr" value="${w.cR||'#7c9cff'}" style="width:34px;padding:0">
      <button class="rmv" id="we-chcx" style="font-size:10px">테마색으로</button>
    </div>
    <div class="p-row" style="align-items:center;font-size:11px;color:var(--muted);gap:7px">
      <select id="we-chff" style="flex:1">
        <option value="" ${!w.font?'selected':''}>글꼴 — 홈 기본</option>
        <option value="serif" ${w.font==='serif'?'selected':''}>명조</option>
        <option value="mono" ${w.font==='mono'?'selected':''}>모노(타자기)</option>
      </select>
      크기 <input type="range" id="we-chfs" min="11" max="16" value="${w.fs||12.5}" step=".5" style="flex:1;margin-bottom:0">
    </div>`
    +(w.lines||[]).map((l,i)=>`
    <div class="chl">
      <div class="chl-h">
        <span class="chl-sd">
          <button data-chsl="${i}" class="${l.side!=='r'?'on':''}">◀ 왼쪽</button>
          <button data-chsr="${i}" class="${l.side==='r'?'on':''}">오른쪽 ▶</button>
        </span>
        <input data-chn="${i}" placeholder="이름" value="${esc(l.name||'')}" class="chl-nm">
        ${l.img?`<img class="chl-pv" src="${l.img}" alt="">`:''}
        <label class="filelab chl-f">${l.img?'교체':'＋프사'}<input type="file" data-chp="${i}" accept="image/*"></label>
        ${l.img?`<button class="rmv" data-chpx="${i}">프사✕</button>`:''}
        <span class="chl-r">
          <button class="rmv" data-chup="${i}">↑</button>
          <button class="rmv" data-chdn="${i}">↓</button>
          <button class="rmv" data-chx="${i}">✕</button>
        </span>
      </div>
      <textarea data-cht="${i}" placeholder="대사를 입력하세요" class="chl-tx">${esc(l.text||'')}</textarea>
    </div>`).join('')
    +`<button class="btn" id="we-chadd" style="font-size:12px">+ 대사 추가</button>`;
  html+=`<p class="note">입력은 즉시 반영돼요 — 마지막에 [위젯 구성 저장]만 누르면 저장 완료.</p>`;
  $('#wid-edit').innerHTML=html;
  // 라이브 바인딩: 쓰는 즉시 draft에 반영
  const t=$('#we-text'); if(t) t.addEventListener('input',()=>{ w.text=t.value; });
  const ntt=$('#we-ntt'); if(ntt) ntt.addEventListener('input',()=>{ w.title=ntt.value; });
  const ilab=$('#we-ilab'); if(ilab) ilab.addEventListener('input',()=>{ w.label=ilab.value; });
  const iurl=$('#we-iurl'); if(iurl) iurl.addEventListener('input',()=>{ w.url=iurl.value.trim(); });
  const iimg=$('#we-iimg'); if(iimg) iimg.addEventListener('change',async e=>{
    const f=e.target.files[0]; if(!f) return;
    w.img=await compressTo(f,620,130); renderWidEdit();
    msg('사진 반영됨 — [위젯 구성 저장]까지!'); });
  const iimgx=$('#we-iimgx'); if(iimgx) iimgx.onclick=()=>{ delete w.img; renderWidEdit(); };
  const chst=$('#we-chst'); if(chst) chst.addEventListener('change',()=>{ w.style=chst.value; });
  const chcl=$('#we-chcl'); if(chcl) chcl.addEventListener('input',()=>{ w.cL=chcl.value; });
  const chcr=$('#we-chcr'); if(chcr) chcr.addEventListener('input',()=>{ w.cR=chcr.value; });
  const chcx=$('#we-chcx'); if(chcx) chcx.onclick=()=>{ delete w.cL; delete w.cR; renderWidEdit(); };
  const chff=$('#we-chff'); if(chff) chff.addEventListener('change',()=>{ w.font=chff.value; });
  const chfs=$('#we-chfs'); if(chfs) chfs.addEventListener('input',()=>{ w.fs=+chfs.value; });
  const chimg=$('#we-chimg'); if(chimg) chimg.addEventListener('change',()=>{ w.imgs=chimg.checked; });
  const chadd=$('#we-chadd'); if(chadd) chadd.onclick=()=>{
    w.lines=w.lines||[]; w.lines.push({side:w.lines.length%2?'r':'l',text:''}); renderWidEdit(); };
  $('#wid-edit').querySelectorAll('[data-chsl]').forEach(b=>b.onclick=()=>{ w.lines[b.dataset.chsl].side='l'; renderWidEdit(); });
  $('#wid-edit').querySelectorAll('[data-chsr]').forEach(b=>b.onclick=()=>{ w.lines[b.dataset.chsr].side='r'; renderWidEdit(); });
  const chmv=(i,d)=>{ const L=w.lines, j=i+d; if(j<0||j>=L.length) return;
    [L[i],L[j]]=[L[j],L[i]]; renderWidEdit(); };
  $('#wid-edit').querySelectorAll('[data-chup]').forEach(b=>b.onclick=()=>chmv(+b.dataset.chup,-1));
  $('#wid-edit').querySelectorAll('[data-chdn]').forEach(b=>b.onclick=()=>chmv(+b.dataset.chdn,1));
  $('#wid-edit').querySelectorAll('[data-chn]').forEach(i2=>i2.addEventListener('input',()=>{ w.lines[i2.dataset.chn].name=i2.value; }));
  $('#wid-edit').querySelectorAll('[data-cht]').forEach(i2=>i2.addEventListener('input',()=>{ w.lines[i2.dataset.cht].text=i2.value; }));
  $('#wid-edit').querySelectorAll('[data-chp]').forEach(inp=>inp.addEventListener('change',async e=>{
    const f=e.target.files[0]; if(!f) return;
    w.lines[inp.dataset.chp].img=await compressTo(f,128,25);
    renderWidEdit(); msg('프사 반영됨 — [위젯 구성 저장]까지!'); }));
  $('#wid-edit').querySelectorAll('[data-chpx]').forEach(b=>b.onclick=()=>{
    delete w.lines[b.dataset.chpx].img; renderWidEdit(); });
  $('#wid-edit').querySelectorAll('[data-chx]').forEach(b=>b.onclick=()=>{
    w.lines.splice(+b.dataset.chx,1); renderWidEdit(); });
  const hg=$('#we-h'); if(hg) hg.addEventListener('input',()=>{ w.h=+hg.value; });
  const img=$('#we-img'); if(img) img.addEventListener('change',async e=>{
    const f=e.target.files[0]; if(!f) return; msg('사진 압축 중...');
    w.img=await compressTo(f,500,120); msg('사진 반영됨 — [위젯 구성 저장]을 눌러주세요.');
  });
  const badd=$('#we-bimg'); if(badd) badd.addEventListener('change',async e=>{
    const f=e.target.files[0]; if(!f) return; msg('배너 압축 중...');
    w.items=w.items||[]; w.items.push({img:await compressTo(f,700,110),url:''});
    renderWidEdit(); renderWidList(); msg('배너 추가됨 — [위젯 구성 저장]을 눌러주세요.');
  });
  const ladd=$('#we-add'); if(ladd) ladd.onclick=()=>{ w.items=w.items||[]; w.items.push({label:'',url:''}); renderWidEdit(); };
  const dadd=$('#we-ddadd'); if(dadd) dadd.onclick=()=>{ pdraft.ddays.push({title:'',date:''}); renderWidEdit(); };
  $('#wid-edit').querySelectorAll('[data-dt]').forEach(i=>i.addEventListener('input',()=>{ pdraft.ddays[i.dataset.dt].title=i.value; }));
  $('#wid-edit').querySelectorAll('[data-dd]').forEach(i=>i.addEventListener('change',()=>{ pdraft.ddays[i.dataset.dd].date=i.value; }));
  $('#wid-edit').querySelectorAll('[data-dr]').forEach(b=>b.onclick=()=>{ pdraft.ddays.splice(+b.dataset.dr,1); renderWidEdit(); });
  $('#wid-edit').querySelectorAll('[data-dimg]').forEach(inp=>inp.addEventListener('change',async e=>{
    const f=e.target.files[0]; if(!f) return; msg('사진 압축 중...');
    pdraft.ddays[inp.dataset.dimg].img=await compressTo(f,600,100);
    renderWidEdit(); msg('사진 반영됨 — [위젯 구성 저장]까지!');
  }));
  $('#wid-edit').querySelectorAll('[data-dximg]').forEach(b=>b.onclick=()=>{
    delete pdraft.ddays[+b.dataset.dximg].img; renderWidEdit(); });
  const bu=$('#we-burl'); if(bu) bu.addEventListener('input',()=>{ pdraft.bgm.url=bu.value.trim(); });
  const bt=$('#we-btitle'); if(bt) bt.addEventListener('input',()=>{ pdraft.bgm.title=bt.value.trim(); });
  $('#wid-edit').querySelectorAll('[data-ll]').forEach(i=>i.addEventListener('input',()=>{ w.items[i.dataset.ll].label=i.value; }));
  $('#wid-edit').querySelectorAll('[data-lu]').forEach(i=>i.addEventListener('input',()=>{ w.items[i.dataset.lu].url=i.value.trim(); }));
  $('#wid-edit').querySelectorAll('[data-bu]').forEach(i=>i.addEventListener('input',()=>{ w.items[i.dataset.bu].url=i.value.trim(); }));
  $('#wid-edit').querySelectorAll('[data-br]').forEach(b=>b.onclick=()=>{ w.items.splice(+b.dataset.br,1); renderWidEdit(); renderWidList(); });
  $('#wid-edit').querySelectorAll('[data-bup]').forEach(b=>b.onclick=()=>{
    const i=+b.dataset.bup; if(i>0){ [w.items[i-1],w.items[i]]=[w.items[i],w.items[i-1]]; renderWidEdit(); }});
  $('#wid-edit').querySelectorAll('[data-bdn]').forEach(b=>b.onclick=()=>{
    const i=+b.dataset.bdn; if(i<w.items.length-1){ [w.items[i+1],w.items[i]]=[w.items[i],w.items[i+1]]; renderWidEdit(); }});
}
function syncWid(w){
  if(w && w.t==='links') w.items=(w.items||[]).filter(l=>l.label||l.url);
}
$('#wid-add').onclick=()=>{
  const t=$('#wid-type').value;
  if(t==='latest' && draft.some(w=>w.t==='latest')){ msg('최신글 블록은 하나만 둘 수 있어요.'); return; }
  if(['search','category','dday','bgm','profile'].includes(t) && draft.some(w=>w.t===t)){
    msg('이미 있는 위젯이에요.'); return; }
  draft.push(t==='links'?{t,items:[]}:t==='banner'?{t,items:[]}:{t});
  editIdx=draft.length-1; renderWidList();
  if(['profile','quote','links','banner','dday','bgm','notice','chat','img'].includes(t)) renderWidEdit();
};
$('#wid-save').onclick=async()=>{
  if(editIdx>=0 && draft[editIdx]) syncWid(draft[editIdx]);
  msg('저장 중...');
  try{
    const projected={...st.page, side:draft, ddays:pdraft.ddays, bgm:pdraft.bgm};
    const tot=JSON.stringify(projected).length;
    if(tot>980000){
      const wKB=Math.round((JSON.stringify(draft).length+JSON.stringify(pdraft.ddays).length)/1370);
      msg('용량 초과 — 안내창을 확인하세요.');
      alert('홈 전체 용량 초과!\n\n서버는 홈 하나당 약 1MB까지 받아요.\n지금 합산: 약 '+Math.round(tot/1370)+'KB\n· 위젯 사진(프로필·배너·디데이): 약 '+wKB+'KB\n· 꾸미기 사진(헤더·대문·배경): 약 '+Math.round((tot-JSON.stringify(draft).length-JSON.stringify(pdraft.ddays).length)/1370)+'KB\n\n배너·헤더 등 큰 사진을 지우거나 다시 올리면(자동 압축 강화) 들어가요.'); return; }
    const dd=pdraft.ddays.filter(x=>x.title&&x.date);
    await updateDoc(doc(db,'pages',st.handle),{side:draft, ddays:dd, bgm:pdraft.bgm});
    st.page.side=JSON.parse(JSON.stringify(draft));
    st.page.ddays=dd; st.page.bgm={...pdraft.bgm};
    const d0=dd[0];
    $('#pg-dday-main').innerHTML = d0?`<p class="n">${esc(dday(d0.date))}</p><p class="t">${esc(d0.title)}</p>`:'';
    renderSide(); msg('위젯 구성 저장 완료!');
  }catch(e){ msg('오류: '+e.message); alert('저장 실패: '+e.message); }
};
$('#p-close').onclick=()=>$('#panel').classList.remove('show');
$('#panel').addEventListener('click',e=>{ if(e.target.id==='panel') $('#panel').classList.remove('show'); });
document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('.tabs button').forEach(x=>x.classList.toggle('on',x===b));
  document.querySelectorAll('.pane').forEach(p=>p.classList.toggle('hidden',p.dataset.pane!==b.dataset.tab));
});
$('#w-secret').addEventListener('change',e=>$('#w-pw').style.display=e.target.checked?'':'none');
let wImgs=[];
$('#w-img').addEventListener('change',async e=>{
  const f=e.target.files[0]; if(!f) return;
  msg('이미지 압축 중...');
  wImgs.push(await compress(f,850,.72));
  const ta=$('#w-body'), tk=`\n[사진${wImgs.length}]\n`,
        s=ta.selectionStart??ta.value.length;
  ta.value = ta.value.slice(0,s)+tk+ta.value.slice(ta.selectionEnd??s);
  e.target.value='';
  msg(`사진 ${wImgs.length} 삽입됨 — 위치는 본문에서 [사진${wImgs.length}] 글자를 옮기면 돼요.`);
});
const msg=t=>$('#p-msg').textContent=t;

$('#w-go').onclick=async()=>{
  const title=$('#w-title').value.trim(), cat=$('#w-cat').value,
        secret=$('#w-secret').checked, pw=$('#w-pw').value, pin=$('#w-pin').checked,
        cmtOff=!$('#w-cmt').checked, asHtml=$('#w-html').checked,
        raw=$('#w-body').value;
  if(!title){ msg('제목을 입력하세요.'); return; }
  if(secret&&!pw){ msg('비밀글 비밀번호를 입력하세요.'); return; }
  msg('발행 중...');
  try{
    let html=asHtml?cleanHTML(raw):bodyHTML(raw);
    wImgs.forEach((im,i)=>{
      html=html.split(`[사진${i+1}]`).join(`<img src="${im}" alt="">`);
    });
    const data={ title, cat, date:today(), ts:serverTimestamp(),
      secret, pinned:pin, cmtOff,
      excerpt: secret?'':(asHtml?raw.replace(/<[^>]+>/g,' '):raw).replace(/\s+/g,' ').trim().slice(0,70) };
    if(secret) data.enc=await encTxt(pw,html); else data.body=html;
    if(JSON.stringify({...st.page, ...data}).length>980000){ msg('본문 이미지가 너무 많아요 — 사진 수를 줄여주세요.'); return; }
    if(pin) await Promise.all(st.posts.filter(p=>p.pinned).map(p=>
      updateDoc(doc(db,'pages',st.handle,'posts',p.id),{pinned:false})));
    const d0=new Date(), pad=n=>String(n).padStart(2,'0');
    const base=String(d0.getFullYear()).slice(2)+pad(d0.getMonth()+1)+pad(d0.getDate());
    const used=new Set(st.posts.map(p=>p.id));
    let nid='', n=1;
    do{ nid=base+'-'+n.toString(36); n++; }while(used.has(nid)&&n<400);
    await setDoc(doc(db,'pages',st.handle,'posts',nid),data);
    await loadContent(); renderWidgets(); renderList();
    ['w-title','w-pw','w-body'].forEach(i=>$('#'+i).value='');
    $('#w-secret').checked=false; $('#w-pin').checked=false; $('#w-pw').style.display='none';
    $('#w-cmt').checked=true; $('#w-html').checked=false;
    wImgs=[];
    msg('발행 완료!');
  }catch(e){ msg('오류: '+e.message); }
};

$('#g-go').onclick=async()=>{
  const f=$('#g-file').files[0]; if(!f){ msg('이미지를 선택하세요.'); return; }
  msg('압축·업로드 중...');
  try{
    const img=await compress(f,1100,.8);
    if(img.length>900000){ msg('이미지가 너무 커요 — 더 작은 사진으로 시도해 주세요.'); return; }
    await addDoc(collection(db,'pages',st.handle,'gallery'),
      {img,title:$('#g-title').value.trim(),cat:$('#g-cat').value||'',ts:serverTimestamp()});
    await loadContent(); renderGal(); $('#g-title').value=''; $('#g-file').value='';
    msg('업로드 완료!');
  }catch(e){ msg('오류: '+e.message); }
};

let heroNew=null; let bgNew=null;
let heroDraft=[]; let egateNew=null; let titleVal=null;
$('#s-title').addEventListener('input',e=>{ titleVal=e.target.value;
  $('#pg-name').style.color=titleVal; });
$('#s-title-reset').onclick=()=>{ titleVal='';
  $('#pg-name').style.color=''; msg('기본색으로 — [설정 저장]으로 확정.'); };
function renderEgate(){
  const im = egateNew!==null ? egateNew : (st.page.enterImg||'');
  $('#s-egate-list').innerHTML = im
    ? `<img class="thumb" src="${im}">`
    : '<span class="note">전용 이미지 없음 — 첫 헤더 사진이 대신 쓰여요.</span>';
}
function renderHeroList(){
  const box=$('#s-hero-list');
  box.innerHTML = heroDraft.map((o,i)=>`
    <div style="width:100%;border:1px solid var(--line);border-radius:11px;padding:10px;margin-bottom:10px">
      <div class="p-row" style="align-items:center">
        <img class="thumb" src="${o.img}">
        <div data-hp="${i}" style="flex:1;height:74px;border-radius:9px;border:1px solid var(--line);
          background-image:url(${o.img});background-position:${o.x}% ${o.y}%;
          background-size:${o.z>100?o.z+'% auto':'cover'};background-repeat:no-repeat"></div>
        <button class="rm2" data-hx="${i}">✕</button>
      </div>
      <div class="p-row" style="align-items:center;font-size:11px;color:var(--muted);gap:6px">
        확대 <input type="range" data-hz="${i}" min="100" max="250" value="${o.z}" style="flex:1;min-width:70px;margin-bottom:0">
        가로 <input type="range" data-hxp="${i}" min="0" max="100" value="${o.x}" style="flex:1;min-width:70px;margin-bottom:0">
        세로 <input type="range" data-hyp="${i}" min="0" max="100" value="${o.y}" style="flex:1;min-width:70px;margin-bottom:0">
      </div>
    </div>`).join('')
    || '<span class="note">아직 사진이 없어요 — 위에서 추가하세요.</span>';
  box.querySelectorAll('[data-hx]').forEach(b=>b.onclick=()=>{
    heroDraft.splice(+b.dataset.hx,1); renderHeroList(); });
  const upd=i=>{ const o=heroDraft[i], pv=box.querySelector(`[data-hp="${i}"]`);
    pv.style.backgroundPosition=`${o.x}% ${o.y}%`;
    pv.style.backgroundSize = o.z>100 ? o.z+'% auto' : 'cover'; };
  box.querySelectorAll('[data-hz]').forEach(s=>s.addEventListener('input',()=>{ heroDraft[s.dataset.hz].z=+s.value; upd(+s.dataset.hz); }));
  box.querySelectorAll('[data-hxp]').forEach(s=>s.addEventListener('input',()=>{ heroDraft[s.dataset.hxp].x=+s.value; upd(+s.dataset.hxp); }));
  box.querySelectorAll('[data-hyp]').forEach(s=>s.addEventListener('input',()=>{ heroDraft[s.dataset.hyp].y=+s.value; upd(+s.dataset.hyp); }));
}
$('#s-hero').addEventListener('change',async e=>{
  const f=e.target.files[0]; if(!f) return;
  msg('헤더 사진 압축 중...');
  heroDraft.push({img:await compressTo(f,1500,230),x:50,y:50,z:100});
  renderHeroList(); msg('추가됨 — [설정 저장]을 눌러야 확정돼요.');
  e.target.value='';
});
$('#s-egate').addEventListener('change',async e=>{
  const f=e.target.files[0]; if(!f) return;
  msg('입장 이미지 압축 중...');
  egateNew=await compressTo(f,1500,240); renderEgate();
  msg('추가됨 — [설정 저장]을 눌러야 확정돼요.'); e.target.value='';
});
$('#s-egate-clear').onclick=()=>{ egateNew=''; renderEgate();
  msg('입장 이미지 제거 — [설정 저장]으로 확정.'); };
$('#stk-file').addEventListener('change',async e=>{
  const f=e.target.files[0]; if(!f) return;
  msg('스티커 압축 중...');
  const img=await compress(f,320,.85);
  st.page.stickers=st.page.stickers||[];
  st.page.stickers.push({img,x:8,y:20,size:120,rot:0});
  try{ await updateDoc(doc(db,'pages',st.handle),{stickers:st.page.stickers}); }catch(e2){}
  renderStkList(); renderStickers();
  msg('스티커 추가! 홈에서 드래그로 옮겨보세요.'); e.target.value='';
});
let favNew=null, curNew=null;
$('#s-fav').addEventListener('change',async e=>{
  const f=e.target.files[0]; if(!f) return;
  favNew=await compress(f,64,.9); e.target.value='';
  msg('파비콘 준비 완료 — [설정 저장]을 누르면 적용돼요.');
});
$('#s-fav-clear').onclick=()=>{ favNew=''; msg('파비콘 제거 — [설정 저장]으로 확정돼요.'); };
$('#s-cur').addEventListener('change',e=>{
  const f=e.target.files[0]; if(!f) return;
  if(f.size>60000){ msg('커서 이미지는 60KB 이하로 올려주세요 (32px 내외 권장).'); e.target.value=''; return; }
  const r=new FileReader();
  r.onload=()=>{ curNew=r.result; msg('커서 준비 완료 — [설정 저장]을 누르면 적용돼요.'); };
  r.readAsDataURL(f); e.target.value='';
});
$('#s-cur-clear').onclick=()=>{ curNew=''; msg('기본 커서로 — [설정 저장]으로 확정돼요.'); };
$('#s-css-clear').onclick=()=>{ $('#s-css').value=''; msg('CSS 비움 — [설정 저장]으로 확정돼요.'); };
$('#s-bg').addEventListener('change',async e=>{
  const f=e.target.files[0]; if(!f) return;
  msg('배경 이미지 압축 중...'); bgNew=await compressTo(f,1600,260);
  document.documentElement && ($('#bgphoto').style.backgroundImage=`url(${bgNew})`);
  document.body.classList.add('has-bg');
  msg('배경 미리보기 적용 — [설정 저장]을 눌러야 저장돼요.');
});
$('#s-bg-clear').onclick=()=>{
  bgNew=''; $('#bgphoto').style.backgroundImage='';
  document.body.classList.remove('has-bg');
  msg('배경 제거 — [설정 저장]을 눌러야 확정돼요.');
};
function fillSettings(){
  const p=st.page;
  $('#s-name').value=p.name||''; $('#s-sub').value=p.sub||'';
  $('#s-gate').value=''; $('#s-color').value=hslToHex(p.hue??222, p.sat??60, p.lum??62);
  $('#s-headmode').value=p.headMode||'wide';
  $('#s-sidepos').value=p.sidePos||'right';
  $('#s-light').checked=!!p.light;
  $('#s-glass').checked=!!p.glass;
  $('#s-catstyle').value=catStyle();
  $('#s-homestyle').value=homeStyle();
  $('#s-theme').value=p.theme||'default';
  renderStkList();
  $('#s-dim').value=p.bgDim??78; $('#s-dots').checked=p.dots!==false; $('#s-protect').checked=p.protectImg!==false; $('#s-stkm').checked=!!p.stkHideM; $('#s-sparkle').checked=!!p.sparkle; $('#s-postpage').checked=!!p.postPage;
  heroDraft=JSON.parse(JSON.stringify(heroObjs())); renderHeroList();
  $('#s-enter').value=p.enterText||'';
  egateNew=null; renderEgate();
  titleVal=null; $('#s-title').value=p.titleColor||'#eeeeee';
  $('#s-font').value=p.font||'sans'; $('#s-css').value=p.customCss||'';
  favNew=null; curNew=null;
  bgNew=null;
}
async function saveSettings(){
  msg('저장 중...');
  try{
    const gateIn=$('#s-gate').value;
    // 대형 이미지(헤더·대문·배경)는 pages/{h}/imgs 별도 문서로 저장 — 본 문서 1MB 예산에서 제외
    const oldRefs=new Set([
      ...(st.page.heroImgs||[]).map(o=>o&&o.ref).filter(Boolean),
      st.page.enterRef, st.page.bgRef].filter(Boolean));
    const putImg=async d=>(await addDoc(collection(db,'pages',st.handle,'imgs'),{d})).id;
    const heroOut=[];
    for(const o of heroDraft){
      heroOut.push({ref: o.ref || await putImg(o.img),
        x:o.x??50, y:o.y??50, z:o.z??100});
    }
    let enterRef = st.page.enterRef||'';
    if(egateNew!==null) enterRef = egateNew ? await putImg(egateNew) : '';
    else if(!enterRef && st.page.enterImg) enterRef=await putImg(st.page.enterImg);
    let bgRef = st.page.bgRef||'';
    if(bgNew!==null) bgRef = bgNew ? await putImg(bgNew) : '';
    else if(!bgRef && st.page.bgImg) bgRef=await putImg(st.page.bgImg);
    const data={
      name:$('#s-name').value.trim()||st.handle,
      sub:$('#s-sub').value.trim(),
      heroImgs: heroOut,
      heroImg: '',
      enterText: $('#s-enter').value.trim(),
      enterImg: '', enterRef,
      titleColor: titleVal ?? st.page.titleColor ?? '',
      bgImg: '', bgRef,
      hue: hexToHsl($('#s-color').value)[0],
      sat: hexToHsl($('#s-color').value)[1],
      lum: hexToHsl($('#s-color').value)[2],
      headMode: $('#s-headmode').value,
      sidePos: $('#s-sidepos').value,
      light: $('#s-light').checked,
      glass: $('#s-glass').checked,
      catStyle: $('#s-catstyle').value,
      homeStyle: $('#s-homestyle').value,
      theme: $('#s-theme').value,
      bgDim: parseInt($('#s-dim').value)||78,
      dots: $('#s-dots').checked,
      protectImg: $('#s-protect').checked,
      stkHideM: $('#s-stkm').checked,
      sparkle: $('#s-sparkle').checked,
      postPage: $('#s-postpage').checked,
      font: $('#s-font').value,
      customCss: $('#s-css').value,
      fav: favNew ?? st.page.fav ?? '',
      curImg: curNew ?? st.page.curImg ?? '',
      updatedAt:serverTimestamp()
    };
    if(gateIn) data.gate=await sha256(gateIn);
    else if(gateIn==='' && $('#s-gate').dataset.clear==='1') data.gate='';
    if(JSON.stringify({...st.page, ...data}).length>980000){
      const heroKB=(data.heroImgs||[]).reduce((t,o)=>t+kb(o.img||o),0);
      msg('이미지 용량 초과 — 자세한 내용은 안내창을 확인하세요.');
      alert('저장 용량 초과!\n\n홈 전체 꾸미기 합산 한도: 약 900KB\n(서버 문서 1MB 제한 때문이에요)\n\n현재 이 설정의 용량:\n· 헤더 사진 '+(data.heroImgs||[]).length+'장 — 약 '+heroKB+'KB\n· 입장 화면 이미지 — 약 '+kb(data.enterImg)+'KB\n· 배경 이미지 — 약 '+kb(data.bgImg)+'KB\n\n가장 큰 항목을 지우고 다시 올려보세요 — 새로 올리면 자동 압축이 더 강하게 걸려요.');
      return; }
    await updateDoc(doc(db,'pages',st.handle),data);
    const keep=new Set([...heroOut.map(o=>o.ref), enterRef, bgRef].filter(Boolean));
    for(const r of oldRefs) if(!keep.has(r))
      deleteDoc(doc(db,'pages',st.handle,'imgs',r)).catch(()=>{});
    st.page={...st.page,...data};
    await resolveImgs(st.page);
    msg('저장 완료!');
    enterPage(); renderCatbar();
  }catch(e){ msg('오류: '+e.message); }
}
document.querySelectorAll('.s-go').forEach(b=>b.onclick=saveSettings);
// 게이트 해제: 비번칸 비운 채 저장하면 유지, '없애기'는 명령어
$('#s-gate').addEventListener('input',e=>{
  e.target.dataset.clear = e.target.value==='' ? '1':'0';
});

/* ---------- 가입 ---------- */
async function signup(){
  const code=$('#in-invite').value.trim(), handle=$('#in-handle').value.trim().toLowerCase(),
        name=$('#in-name').value.trim(), err=$('#signup-err');
  err.textContent='';
  if(!code){ err.textContent='초대코드를 입력해 주세요.'; return; }
  if(!/^[a-z0-9-]{2,20}$/.test(handle)){ err.textContent='주소 형식을 확인해 주세요.'; return; }
  if(!name){ err.textContent='홈 이름을 입력해 주세요.'; return; }
  try{
    await runTransaction(db,async tx=>{
      const iv=doc(db,'invites',code), pg=doc(db,'pages',handle), us=doc(db,'users',st.me.uid);
      const [a,b,c]=await Promise.all([tx.get(iv),tx.get(pg),tx.get(us)]);
      if(!a.exists()) throw new Error('초대코드가 올바르지 않아요.');
      if(a.data().used) throw new Error('이미 사용된 초대코드예요.');
      if(b.exists()) throw new Error('이미 쓰는 주소예요.');
      if(c.exists()) throw new Error('이 계정의 페이지가 이미 있어요.');
      tx.set(pg,{owner:st.me.uid,name,sub:'',cats:['archive','ooc'],hue:222,createdAt:serverTimestamp()});
      tx.set(us,{handle,createdAt:serverTimestamp()});
      tx.update(iv,{used:true,usedBy:st.me.uid,usedAt:serverTimestamp()});
    });
    st.myHandle=handle; renderSeal();
    history.replaceState(null,'',urlFor(handle)); loadPage(handle);
  }catch(e){ err.textContent=e.message; }
}
$('#btn-login').onclick=()=>signInWithPopup(auth,new GoogleAuthProvider()).catch(()=>{});
$('#btn-signup').onclick=signup;

/* ---------- 시작 ---------- */
onAuthStateChanged(auth,async user=>{
  st.me=user;
  const viewing=new URLSearchParams(location.search).get('u');
  if(user){ const u=await getDoc(doc(db,'users',user.uid));
    st.myHandle=u.exists()?u.data().handle:null; }
  else st.myHandle=null;
  renderSeal();
  if(viewing) loadPage(viewing);
  else if(!st.me) show('view-login');
  else if(!st.myHandle) show('view-signup');
  else { history.replaceState(null,'',urlFor(st.myHandle)); loadPage(st.myHandle); }
});
