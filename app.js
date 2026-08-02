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
             cat:'recent', q:'', cur:null, curBody:null, mine:false };

const heroList=()=> (st.page?.heroImgs&&st.page.heroImgs.length)
  ? st.page.heroImgs : (st.page?.heroImg?[st.page.heroImg]:[]);

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
    c.getContext('2d').drawImage(img,0,0,c.width,c.height);
    res(c.toDataURL('image/jpeg',q)); }; img.onerror=rej; img.src=URL.createObjectURL(file); });}
function hueFromHex(hex){
  const r=parseInt(hex.slice(1,3),16)/255,g=parseInt(hex.slice(3,5),16)/255,b=parseInt(hex.slice(5,7),16)/255;
  const mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn;
  if(!d) return 222;
  let x; if(mx===r) x=((g-b)/d)%6; else if(mx===g) x=(b-r)/d+2; else x=(r-g)/d+4;
  return Math.round((x*60+360)%360);
}
function hexFromHue(hh){
  const s=.6,l=.62,aa=s*Math.min(l,1-l),
  f=n=>{const k=(n+hh/30)%12;const c=l-aa*Math.max(-1,Math.min(k-3,9-k,1));
    return Math.round(c*255).toString(16).padStart(2,'0')};
  return '#'+f(0)+f(8)+f(4);
}
const ytId=u=>{ const m=String(u||'').match(/(?:youtu\.be\/|v=|shorts\/|embed\/)([A-Za-z0-9_-]{11})/); return m?m[1]:null; };
const ytList=u=>{ const m=String(u||'').match(/[?&]list=([A-Za-z0-9_-]+)/); return m?m[1]:null; };
function dday(dstr){ const d=new Date(dstr+'T00:00:00'), n=new Date(); n.setHours(0,0,0,0);
  const f=Math.round((n-d)/86400000); return f>=0?'D+'+(f+1):'D'+f; }
const today=()=>{ const d=new Date();
  return d.getFullYear()+'.'+String(d.getMonth()+1).padStart(2,'0')+'.'+String(d.getDate()).padStart(2,'0'); };
const bodyHTML=t=>t.split(/\n{2,}/).map(p=>'<p>'+esc(p).replace(/\n/g,'<br>')+'</p>').join('');
const htmlText=h=>{ const d2=document.createElement('div');
  d2.innerHTML=String(h).replace(/<br\s*\/?>/gi,'\n').replace(/<\/p>/gi,'\n\n');
  return d2.textContent.replace(/\n{3,}/g,'\n\n').trim(); };

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
  // 첫 진입 시 주소를 깔끔 경로로 정리 (luvlog.me/?u=jeste → luvlog.me/jeste)
  if(CLEAN){
    const pm=new URLSearchParams(location.search).get('p');
    history.replaceState(null,'', urlFor(handle, pm||undefined));
  }
  const snap=await getDoc(doc(db,'pages',handle));
  if(!snap.exists()){ show('view-page');
    $('#pg-name').textContent='없는 페이지예요'; $('#pg-sub').textContent='@'+handle; return; }
  st.page=snap.data();
  st.mine = st.me && st.page.owner===st.me.uid;
  document.documentElement.style.setProperty('--h', st.page.hue ?? 222);
  // 입장 대문: 방문 시 1회(세션) + 비번 홈은 비번 입력
  const needPw = st.page.gate && !st.mine
    && sessionStorage.getItem('gate_'+handle)!==st.page.gate;
  const seen = sessionStorage.getItem('ent_'+handle);
  if(!st.mine && (needPw || !seen)){
    document.documentElement.style.setProperty('--h', st.page.hue ?? 222);
    const cover = st.page.enterImg || heroList()[0] || '';
    $('#enter-cover').style.backgroundImage = cover?`url(${cover})`:'';
    $('#enter-over').textContent = '@'+handle.toUpperCase();
    $('#gate-name').textContent = st.page.name || handle;
    $('#enter-text').textContent = st.page.enterText || '';
    $('#gate-pw-wrap').classList.toggle('hidden', !needPw);
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
  document.documentElement.style.setProperty('--h', p.hue ?? 222);
  document.title=(p.name||h)+' — LOVELOG';
  $('#pg-name').textContent=p.name||h;
  $('#pg-name').style.color = p.titleColor||'';
  $('#pg-sub').textContent=p.sub||'';
  $('#pg-over').textContent='@'+h.toUpperCase();
  const hs=heroList();
  clearInterval(st.heroTimer);
  const hA=$('#pg-hero'), hB=$('#pg-hero2');
  hA.style.backgroundImage = hs[0]?`url(${hs[0]})`:''; hA.style.opacity=1; hB.style.opacity=0;
  if(hs.length>1){
    let i=0, front=true;
    st.heroTimer=setInterval(()=>{
      i=(i+1)%hs.length;
      const showEl=front?hB:hA, hideEl=front?hA:hB;
      showEl.style.backgroundImage=`url(${hs[i]})`;
      showEl.style.opacity=1; hideEl.style.opacity=0; front=!front;
    }, 5000);
  }
  const dd0=(p.ddays||[])[0];
  $('#pg-dday-main').innerHTML = dd0?`<p class="n">${esc(dday(dd0.date))}</p><p class="t">${esc(dd0.title)}</p>`:'';
  // 레이아웃 · 테마
  document.body.classList.toggle('light', !!p.light);
  document.body.classList.remove('theme-win98','theme-vhs');
  if(p.theme && p.theme!=='default') document.body.classList.add('theme-'+p.theme);
  document.body.classList.toggle('side-left', p.sidePos==='left');
  document.body.classList.toggle('side-both', p.sidePos==='both');
  document.documentElement.style.setProperty('--dim', (p.bgDim??78)/100);
  document.body.classList.toggle('glass', !!p.glass);
  $('#bgphoto').style.backgroundImage = p.bgImg?`url(${p.bgImg})`:'';
  const headEl=document.querySelector('.head');
  if(p.headMode==='side'){ headEl.classList.add('v'); $('#aside').prepend(headEl); }
  else { headEl.classList.remove('v');
    const anchor=$('#catbar'); anchor.parentNode.insertBefore(headEl, anchor); }
  $('#btn-write').classList.toggle('hidden',!st.mine);
  $('#btn-deco').classList.toggle('hidden',!st.mine);
  show('view-page');
  await loadContent();
  st.cat='home'; applyView();
  renderWidgets(); renderCatbar(); renderList(); renderGal();
  // 딥링크 ?p=
  const pm=new URLSearchParams(location.search).get('p');
  if(pm){ st.cat='recent'; applyView(); renderList(); openPost(pm); }
}
async function loadContent(){
  const [ps,gs]=await Promise.all([
    getDocs(query(collection(db,'pages',st.handle,'posts'),orderBy('ts','desc'))),
    getDocs(query(collection(db,'pages',st.handle,'gallery'),orderBy('ts','desc')))
  ]);
  st.posts=ps.docs.map(d=>({id:d.id,...d.data()}));
  st.gallery=gs.docs.map(d=>({id:d.id,...d.data()}));
}

/* ---------- 사이드 위젯 렌더 ---------- */
function cats(){ return st.page.cats||['archive','ooc']; }
function gcats(){ return st.page.gcats||[]; }
const isG=c=>gcats().includes(c);
function sideCfg(){
  let s;
  if(st.page.side && st.page.side.length) s=st.page.side.filter(w=>w.t!=='notice'&&w.t!=='latest');
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
  const d=document.createElement('div'); d.className='side';
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
}
const WNAME={latest:'최신글',profile:'프로필',search:'검색',category:'카테고리',
  dday:'디데이',bgm:'BGM',quote:'인용구',links:'링크',banner:'배너칸'};
const DEFCOL={search:'l',category:'l',profile:'l',latest:'c',quote:'c',
  dday:'r',bgm:'r',links:'r',banner:'r'};
function goHome(){ st.cat='home'; applyView(); renderWidgets(); renderCatbar(); }
function goBoard(cat){ st.cat=cat||'recent'; applyView(); renderWidgets(); renderList(); backToList(); renderCatbar(); }
function catStyle(){
  return st.page.catStyle || (st.page.catBar===false ? 'widget' : 'bar');
}
function renderCatbar(){
  const bar=$('#catbar');
  if(catStyle()!=='bar'){ bar.classList.add('hidden'); return; }
  bar.classList.remove('hidden');
  bar.innerHTML = `<a data-c="home" class="${st.cat==='home'?'on':''}">HOME</a>`+
    cats().map(c=>`<a data-c="${esc(c)}" class="${st.cat===c?'on':''}">${esc(c.toUpperCase())}</a>`).join('')+
    `<a data-c="__gal" class="${st.cat==='__gal'?'on':''}">GALLERY</a>`+
    `<a data-c="recent" class="${st.cat==='recent'?'on':''}">ALL</a>`;
  bar.querySelectorAll('a').forEach(el=>el.onclick=()=>{
    el.dataset.c==='home' ? goHome() : goBoard(el.dataset.c);
  });
}
function applyView(){
  const home = st.cat==='home';
  $('#home-grid').classList.toggle('hidden', !home);
  $('#board').classList.toggle('hidden', home);
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
    if(e.target===c) c.classList.add('dropzone-end'); });
  c.addEventListener('dragleave',e=>{ if(e.target===c) c.classList.remove('dropzone-end'); });
  c.addEventListener('drop',e=>{
    c.classList.remove('dropzone-end');
    if(e.target!==c) return;
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
  if(home) latestBlock(hC);
  sideCfg().forEach((w,wi)=>{
    const box = home
      ? (w.col==='l'?hL : w.col==='c'?hC : hR)
      : ((both && w.col==='l') ? boxL : boxR);
    const d=document.createElement('div'); d.className='side';
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
      if(catStyle()==='bar') return;   // 알약 바 모드에선 사이드 카테고리 숨김
      const cnt=c=> isG(c) ? st.gallery.filter(x=>x.cat===c).length
                           : st.posts.filter(x=>x.cat===c).length;
      d.innerHTML=`<p class="label">CATEGORY</p><ul id="cats">`+
        cats().map(c=>`<li><a data-c="${esc(c)}" class="${st.cat===c?'on':''}">
          <span>${esc(c)}${st.mine?` <span class="x" data-x="${esc(c)}">✕</span>`:''}</span>
          <span class="n">${cnt(c)}</span></a></li>`).join('')+
        `<li><a data-c="__gal" class="${st.cat==='__gal'?'on':''}"><span>GALLERY</span><span class="n">${st.gallery.length}</span></a></li>`+
        `<li><a data-c="recent" class="${st.cat==='recent'?'on':''}"><span>전체</span><span class="n">${st.posts.length}</span></a></li></ul>`+
        (st.mine?'<p class="cat-add" id="cat-add">＋ 카테고리 추가</p>':'');
      box.appendChild(d);
      d.querySelectorAll('#cats a').forEach(el=>el.onclick=e=>{
        if(e.target.dataset.x){ removeCat(e.target.dataset.x); return; }
        goBoard(el.dataset.c); });
      const ca=d.querySelector('#cat-add'); if(ca) ca.onclick=addCat;
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
      let on=false; const btn=d.querySelector('.bgm-btn2'), fr=d.querySelector('.bgm-fr');
      btn.onclick=()=>{ on=!on;
        fr.innerHTML=on?`<iframe style="width:100%;height:112px;border:0;border-radius:9px;margin-top:10px" src="${src}" allow="autoplay; encrypted-media"></iframe>`:'';
        btn.textContent=on?'❚❚':'▶';
        d.classList.toggle('playing',on); };
      return;
    }
    if(w.t==='profile'){
      d.className+=' w-profile';
      d.innerHTML=(w.img?`<img src="${w.img}" alt="" draggable="false" style="max-height:${+(w.h)||210}px">`:'')+
        (w.text?`<p class="cap">${esc(w.text)}</p>`:'');
      box.appendChild(d); return;
    }
    if(w.t==='quote'){
      d.className+=' w-quote';
      d.innerHTML=`<span class="qm">❝</span><p>${esc(w.text||'')}</p>`;
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
}
function renderCats(){ renderSide(); }
async function addCat(){
  const c=prompt('새 카테고리 이름'); if(!c) return;
  const name=c.trim(); if(!name||cats().includes(name)) return;
  const next=[...cats(),name];
  await updateDoc(doc(db,'pages',st.handle),{cats:next});
  st.page.cats=next; renderSide(); refreshWriteCats();
}
function renderList(){
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
  $('#rows').innerHTML = shown.length?shown.map(p=>`
    <li class="row" data-id="${p.id}">
      <span class="d">${esc((p.date||'').slice(5))}</span>
      <span class="t">${esc(p.title)} ${p.secret?'<span class="k">🔒</span>':''}</span>
      <span class="c">${esc(p.cat)}</span>
      <span class="k"></span></li>`).join('')
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
function backToList(){ $('#post-view').classList.add('hidden');
  $('#list-view').classList.remove('hidden'); st.cur=null;
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
  history.replaceState(null,'',urlFor(st.handle,id));
  window.scrollTo({top:0});
}
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
  $('#rows').innerHTML=rest.map(p=>`
    <li class="row" data-id="${p.id}">
      <span class="d">${esc((p.date||'').slice(5))}</span>
      <span class="t">${esc(p.title)} ${p.secret?'<span class="k">🔒</span>':''}</span>
      <span class="c">${esc(p.cat)}</span>
      <span class="k"></span></li>`).join('');
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
  const groups={write:['write','galup'], deco:['wid','cats','set','theme','bg']};
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
  document.documentElement.style.setProperty('--h', hueFromHex(e.target.value));
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
      <button class="rmv" data-cd="${i}">✕</button>
    </div>`).join('') || '<p class="pl-empty">카테고리가 없어요.</p>';
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
  draft=JSON.parse(JSON.stringify(sideCfg())).filter(w=>w.t!=='notice'&&w.t!=='latest');
  pdraft={ ddays:JSON.parse(JSON.stringify(st.page.ddays||[])),
           bgm:{url:st.page.bgm?.url||'', title:st.page.bgm?.title||''} };
  editIdx=-1; renderWidList(); $('#wid-edit').innerHTML='';
}
function renderWidList(){
  $('#wid-list').innerHTML = draft.map((w,i)=>`
    <div class="wl">
      <span class="nm">${WNAME[w.t]||w.t}${w.t==='links'?` (${(w.items||[]).length})`:''}${w.t==='banner'?` (${(w.items||[]).length})`:''}</span>
      ${['profile','quote','links','banner','dday','bgm'].includes(w.t)?`<button data-e="${i}">✎</button>`:''}
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
      <input type="range" id="we-h" min="120" max="320" value="${+(w.h)||210}" style="flex:1;min-width:100px">
    </div>
    <textarea id="we-text" placeholder="아래 캡션 (선택 — 비우면 사진만 꽉 차게)" style="min-height:60px">${w.text||''}</textarea>`;
  if(w.t==='quote') html+=`
    <textarea id="we-text" placeholder="걸어둘 문장" style="min-height:90px">${w.text||''}</textarea>`;
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
  html+=`<p class="note">입력은 즉시 반영돼요 — 마지막에 [위젯 구성 저장]만 누르면 저장 완료.</p>`;
  $('#wid-edit').innerHTML=html;
  // 라이브 바인딩: 쓰는 즉시 draft에 반영
  const t=$('#we-text'); if(t) t.addEventListener('input',()=>{ w.text=t.value; });
  const hg=$('#we-h'); if(hg) hg.addEventListener('input',()=>{ w.h=+hg.value; });
  const img=$('#we-img'); if(img) img.addEventListener('change',async e=>{
    const f=e.target.files[0]; if(!f) return; msg('사진 압축 중...');
    w.img=await compress(f,500,.8); msg('사진 반영됨 — [위젯 구성 저장]을 눌러주세요.');
  });
  const badd=$('#we-bimg'); if(badd) badd.addEventListener('change',async e=>{
    const f=e.target.files[0]; if(!f) return; msg('배너 압축 중...');
    w.items=w.items||[]; w.items.push({img:await compress(f,700,.75),url:''});
    renderWidEdit(); renderWidList(); msg('배너 추가됨 — [위젯 구성 저장]을 눌러주세요.');
  });
  const ladd=$('#we-add'); if(ladd) ladd.onclick=()=>{ w.items=w.items||[]; w.items.push({label:'',url:''}); renderWidEdit(); };
  const dadd=$('#we-ddadd'); if(dadd) dadd.onclick=()=>{ pdraft.ddays.push({title:'',date:''}); renderWidEdit(); };
  $('#wid-edit').querySelectorAll('[data-dt]').forEach(i=>i.addEventListener('input',()=>{ pdraft.ddays[i.dataset.dt].title=i.value; }));
  $('#wid-edit').querySelectorAll('[data-dd]').forEach(i=>i.addEventListener('change',()=>{ pdraft.ddays[i.dataset.dd].date=i.value; }));
  $('#wid-edit').querySelectorAll('[data-dr]').forEach(b=>b.onclick=()=>{ pdraft.ddays.splice(+b.dataset.dr,1); renderWidEdit(); });
  $('#wid-edit').querySelectorAll('[data-dimg]').forEach(inp=>inp.addEventListener('change',async e=>{
    const f=e.target.files[0]; if(!f) return; msg('사진 압축 중...');
    pdraft.ddays[inp.dataset.dimg].img=await compress(f,600,.75);
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
  if(['search','category','dday','bgm','profile'].includes(t) && draft.some(w=>w.t===t)){
    msg('이미 있는 위젯이에요.'); return; }
  draft.push(t==='links'?{t,items:[]}:t==='banner'?{t,items:[]}:{t});
  editIdx=draft.length-1; renderWidList();
  if(['profile','quote','links','banner','dday','bgm'].includes(t)) renderWidEdit();
};
$('#wid-save').onclick=async()=>{
  if(editIdx>=0 && draft[editIdx]) syncWid(draft[editIdx]);
  msg('저장 중...');
  try{
    if(JSON.stringify(draft).length+JSON.stringify(pdraft.ddays).length>750000){
      msg('위젯 이미지 용량이 너무 커요 — 배너/사진 수를 줄여주세요.');
      alert('이미지 용량이 커서 저장하지 못했어요. 배너나 사진 수를 줄여주세요.'); return; }
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
        raw=$('#w-body').value;
  if(!title){ msg('제목을 입력하세요.'); return; }
  if(secret&&!pw){ msg('비밀글 비밀번호를 입력하세요.'); return; }
  msg('발행 중...');
  try{
    let html=bodyHTML(raw);
    wImgs.forEach((im,i)=>{
      html=html.split(`[사진${i+1}]`).join(`<img src="${im}" alt="">`);
    });
    const data={ title, cat, date:today(), ts:serverTimestamp(),
      secret, pinned:pin,
      excerpt: secret?'':raw.replace(/\s+/g,' ').trim().slice(0,70) };
    if(secret) data.enc=await encTxt(pw,html); else data.body=html;
    if(JSON.stringify(data).length>900000){ msg('본문 이미지가 너무 많아요 — 사진 수를 줄여주세요.'); return; }
    if(pin) await Promise.all(st.posts.filter(p=>p.pinned).map(p=>
      updateDoc(doc(db,'pages',st.handle,'posts',p.id),{pinned:false})));
    await addDoc(collection(db,'pages',st.handle,'posts'),data);
    await loadContent(); renderWidgets(); renderList();
    ['w-title','w-pw','w-body'].forEach(i=>$('#'+i).value='');
    $('#w-secret').checked=false; $('#w-pin').checked=false; $('#w-pw').style.display='none';
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
  $('#s-hero-list').innerHTML = heroDraft.map((im,i)=>
    `<span class="thumb-x"><img class="thumb" src="${im}">
     <button class="rm2" data-hx="${i}">✕</button></span>`).join('')
    || '<span class="note">아직 사진이 없어요 — 위에서 추가하세요.</span>';
  $('#s-hero-list').querySelectorAll('[data-hx]').forEach(b=>b.onclick=()=>{
    heroDraft.splice(+b.dataset.hx,1); renderHeroList(); });
}
$('#s-hero').addEventListener('change',async e=>{
  const f=e.target.files[0]; if(!f) return;
  msg('헤더 사진 압축 중...');
  heroDraft.push(await compress(f,1500,.75));
  renderHeroList(); msg('추가됨 — [설정 저장]을 눌러야 확정돼요.');
  e.target.value='';
});
$('#s-egate').addEventListener('change',async e=>{
  const f=e.target.files[0]; if(!f) return;
  msg('입장 이미지 압축 중...');
  egateNew=await compress(f,1500,.75); renderEgate();
  msg('추가됨 — [설정 저장]을 눌러야 확정돼요.'); e.target.value='';
});
$('#s-egate-clear').onclick=()=>{ egateNew=''; renderEgate();
  msg('입장 이미지 제거 — [설정 저장]으로 확정.'); };
$('#s-bg').addEventListener('change',async e=>{
  const f=e.target.files[0]; if(!f) return;
  msg('배경 이미지 압축 중...'); bgNew=await compress(f,1600,.7);
  document.documentElement && ($('#bgphoto').style.backgroundImage=`url(${bgNew})`);
  msg('배경 미리보기 적용 — [설정 저장]을 눌러야 저장돼요.');
});
$('#s-bg-clear').onclick=()=>{
  bgNew=''; $('#bgphoto').style.backgroundImage='';
  msg('배경 제거 — [설정 저장]을 눌러야 확정돼요.');
};
function fillSettings(){
  const p=st.page;
  $('#s-name').value=p.name||''; $('#s-sub').value=p.sub||'';
  $('#s-gate').value=''; $('#s-color').value=hexFromHue(p.hue??222);
  $('#s-headmode').value=p.headMode||'wide';
  $('#s-sidepos').value=p.sidePos||'right';
  $('#s-light').checked=!!p.light;
  $('#s-glass').checked=!!p.glass;
  $('#s-catstyle').value=catStyle();
  $('#s-theme').value=p.theme||'default';
  $('#s-dim').value=p.bgDim??78;
  heroDraft=[...heroList()]; renderHeroList();
  $('#s-enter').value=p.enterText||'';
  egateNew=null; renderEgate();
  titleVal=null; $('#s-title').value=p.titleColor||'#eeeeee';
  bgNew=null;
}
async function saveSettings(){
  msg('저장 중...');
  try{
    const gateIn=$('#s-gate').value;
    const data={
      name:$('#s-name').value.trim()||st.handle,
      sub:$('#s-sub').value.trim(),
      heroImgs: heroDraft,
      heroImg: heroDraft[0]||'',
      enterText: $('#s-enter').value.trim(),
      enterImg: egateNew ?? st.page.enterImg ?? '',
      titleColor: titleVal ?? st.page.titleColor ?? '',
      bgImg: bgNew ?? st.page.bgImg ?? '',
      hue: hueFromHex($('#s-color').value),
      headMode: $('#s-headmode').value,
      sidePos: $('#s-sidepos').value,
      light: $('#s-light').checked,
      glass: $('#s-glass').checked,
      catStyle: $('#s-catstyle').value,
      theme: $('#s-theme').value,
      bgDim: parseInt($('#s-dim').value)||78,
      updatedAt:serverTimestamp()
    };
    if(gateIn) data.gate=await sha256(gateIn);
    else if(gateIn==='' && $('#s-gate').dataset.clear==='1') data.gate='';
    if(JSON.stringify(data).length>900000){ msg('이미지 용량이 커서 저장할 수 없어요.'); return; }
    await updateDoc(doc(db,'pages',st.handle),data);
    st.page={...st.page,...data};
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
