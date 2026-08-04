/* ============================================================
   LOVELOG v3 — Frost Bird 레이아웃 차용 템플릿 (실동작)
   대문 이미지 · 디데이 · BGM · 대문 비밀번호 · 카테고리 추가
   글쓰기(비밀글 암호화) · 갤러리 · 글 삭제 · 공유 링크
   ============================================================ */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, updateDoc, runTransaction, serverTimestamp,
  collection, query, orderBy, where, limit, getDocs, addDoc, deleteDoc }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { getStorage, ref as sref, uploadBytes, getDownloadURL }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';
import { firebaseConfig } from './firebase-config.js';

const $ = s => document.querySelector(s);
const esc = s => String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const VIEWS=['view-setup','view-loading','view-login','view-signup','view-gate','view-page'];
const CLEAN = !location.hostname.endsWith('github.io');   // 커스텀 도메인이면 깔끔 주소
const urlFor=(h,p)=> CLEAN ? '/'+h+(p?'/'+p:'') : './?u='+h+(p?'&p='+p:'');
const show = id => VIEWS.forEach(v=>$('#'+v).classList.toggle('hidden',v!==id));
const enc=new TextEncoder(), dec=new TextDecoder();

if(!firebaseConfig.apiKey || firebaseConfig.apiKey.includes('여기에')){ show('view-setup'); throw new Error('cfg'); }
const app=initializeApp(firebaseConfig), auth=getAuth(app), db=getFirestore(app), stg=getStorage(app);

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
    (p.heroImgs||[]).forEach(o=>{ if(o&&o.ref&&!o.img) o.img=m[o.ref]||''; });
    if(p.enterRef) p.enterImg=m[p.enterRef]||p.enterImg||'';
    if(p.bgRef) p.bgImg=m[p.bgRef]||p.bgImg||'';
  }catch(e){}
}
function autoHeadHeight(o){
  const head=document.querySelector('.head'); if(!head||!o||!o.img) return;
  st.autoHero=o;                                            // resize·슬라이드 재계산용
  if(st.page?.headFit!=='auto'){ head.style.removeProperty('min-height'); return; }
  const im=new Image();
  im.onload=()=>{ st.autoRatio=im.naturalHeight/im.naturalWidth; applyAutoHead(); };
  im.src=o.img;
}
function applyAutoHead(tries){
  const head=document.querySelector('.head');
  if(!head||st.page?.headFit!=='auto'||!st.autoRatio) return;
  const w=head.clientWidth;
  if(!w){ if((tries||0)<120) requestAnimationFrame(()=>applyAutoHead((tries||0)+1)); return; }  // 숨김 상태 — 절대 폭을 가정하지 말고 보일 때까지 대기
  const px=Math.max(160,Math.min(2400,Math.round(w*st.autoRatio)));
  if(head.classList.contains('v')){
    head.style.removeProperty('min-height');            // 가로 모드가 남긴 인라인 높이 제거(사진 아래 여백 방지)
    document.documentElement.style.setProperty('--headH', px+'px');
  }
  else head.style.minHeight=px+'px';
}
let hhRszT=null;
window.addEventListener('resize',()=>{ clearTimeout(hhRszT);        // 창 크기 변경 시 auto 높이 재계산
  hhRszT=setTimeout(()=>{ if(st.page?.headFit!=='auto') return;
    if(st.autoRatio) applyAutoHead();
    else if(st.autoHero) autoHeadHeight(st.autoHero); },180); });
const setHeroBg=(el,o)=>{ el.style.backgroundImage=`url(${o.img})`;
  el.style.backgroundPosition=`${o.x}% ${o.y}%`;
  const fit = st.page?.headFit==='contain' ? 'contain' : 'cover';   // auto도 cover로 채움(높이를 사진에 맞추므로 잘림 없음)
  el.style.backgroundSize = o.z>100 ? o.z+'% auto' : fit;
  el.style.backgroundRepeat='no-repeat'; };

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
function shrinkBlob(file,maxW,q){ return new Promise((res,rej)=>{
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
    c.toBlob(b=>b?res({blob:b,ext:alpha?'png':'jpg'}):rej(new Error('blob')),
      alpha?'image/png':'image/jpeg', q);
  }; img.onerror=rej; img.src=URL.createObjectURL(file); });}
const GIF_MAX = 8*1024*1024;                     // 움짤 원본 통과 상한 8MB
async function upFile(file,maxW=1800,q=.88,fallbackKB=200){
  try{
    if(!st.me) throw new Error('no-auth');
    // 움직이는 이미지(GIF)는 캔버스를 태우면 첫 장면만 남으므로 원본 그대로 올림
    if(file.type==='image/gif' && file.size<=GIF_MAX){
      const gname=Date.now().toString(36)+Math.random().toString(36).slice(2,7)+'.gif';
      const gr=sref(stg,'u/'+st.me.uid+'/'+gname);
      await uploadBytes(gr,file,{contentType:'image/gif',
        cacheControl:'public,max-age=31536000'});
      return await getDownloadURL(gr);
    }
    if(file.type==='image/gif') msg('움짤이 8MB를 넘어서 첫 장면만 저장했어요 — 용량을 줄이면 움직여요.');
    const {blob,ext}=await shrinkBlob(file,maxW,q);
    const name=Date.now().toString(36)+Math.random().toString(36).slice(2,7)+'.'+ext;
    const r=sref(stg,'u/'+st.me.uid+'/'+name);
    await uploadBytes(r,blob,{contentType: ext==='png'?'image/png':'image/jpeg',
      cacheControl:'public,max-age=31536000'});
    return await getDownloadURL(r);
  }catch(e){
    console.warn('storage upload failed, fallback to inline', e);
    return await compressTo(file,Math.min(maxW,1200),fallbackKB);
  }
}
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
function applyPri(c){
  if(c) document.body.style.setProperty('--pri', c);
  else document.body.style.removeProperty('--pri');
}
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
const htmlToText=h=>String(h||'')
  .replace(/<br\s*\/?>/gi,'\n')
  .replace(/<\/p>\s*<p[^>]*>/gi,'\n\n')
  .replace(/<\/?p[^>]*>/gi,'')
  .replace(/<img[^>]*>/gi,'')
  .replace(/<[^>]+>/g,'')
  .replace(/&nbsp;/g,' ').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
  .replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&')
  .trim();
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
  if(st.page?.stkOff===true) return;
  arr.forEach((s,i)=>{
    if(s.off) return;
    const d=document.createElement('div'); d.className='stk';
    const isM=window.innerWidth<=720;
    const sx=(isM&&s.mx!=null)?s.mx:s.x, sy=(isM&&s.my!=null)?s.my:s.y;
    const dsz=(isM&&s.msz!=null)?s.msz:(s.size||120);      // 모바일 전용 크기(없으면 PC 크기)
    d.style.left=sx+'%'; d.style.top=sy+'px';
    d.style.width=dsz+'px'; d.style.height=dsz+'px';
    d.style.transform=`rotate(${s.rot||0}deg)`;
    d.innerHTML=`<img src="${s.img}" alt="">`;
    layer.appendChild(d);
    if(!st.mine) return;
    d.addEventListener('pointerdown',ev=>{
      ev.preventDefault(); d.setPointerCapture(ev.pointerId);
      const mM=window.innerWidth<=720;
      const rect=layer.getBoundingClientRect(),
            sz=(mM&&s.msz!=null)?s.msz:(s.size||120);
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
        d.removeEventListener('pointercancel',up);
        try{ await updateDoc(doc(db,'pages',st.handle),{stickers:arr}); }
        catch(e){ msg('스티커 위치 저장 실패 — '+e.message); }
      };
      d.addEventListener('pointermove',move);
      d.addEventListener('pointerup',up);
      d.addEventListener('pointercancel',up);
    });
  });
}
function renderStkList(){
  const box=$('#stk-list'); if(!box) return;
  const arr=st.page.stickers||[];
  const warn =
    st.page.stkOff===true
      ? '<p class="note" style="color:hsl(42 70% 65%)">⚠ 지금 <b>스티커 표시</b>가 꺼져 있어 홈에 하나도 안 보여요 — 테마·레이아웃 탭에서 켜세요.</p>'
    : st.page.stkHideM
      ? '<p class="note" style="color:hsl(42 70% 65%)">⚠ <b>모바일에서 스티커 숨기기</b>가 켜져 있어요 — 폰에서는 안 보여요.</p>'
    : '';
  box.innerHTML = warn + (arr.length? arr.map((s,i)=>`
    <div class="stk-row"${s.off?' style="opacity:.45"':''}>
      <img src="${s.img}">
      <span style="font-size:10px;color:var(--muted)">크기</span>
      <input type="range" data-ss="${i}" min="50" max="260" value="${s.size||120}">
      <span style="font-size:10px;color:var(--muted)">📱</span>
      <input type="range" data-sms="${i}" min="40" max="260" value="${s.msz??s.size??120}" title="모바일에서의 크기 — 안 만지면 PC 크기를 따라가요">
      <span style="font-size:10px;color:var(--muted)">회전</span>
      <input type="range" data-sr="${i}" min="-45" max="45" value="${s.rot||0}">
      <button class="rmv" data-so="${i}" title="누르면 홈에서 ${s.off?'다시 보여요':'숨겨져요'}">${s.off?'▷ 보이기':'숨기기'}</button>
      <button class="rmv" data-sx="${i}">✕</button>
    </div>`).join('')
    :'<p class="pl-empty">아직 스티커가 없어요.</p>');
  const save=async()=>{ try{ await updateDoc(doc(db,'pages',st.handle),{stickers:st.page.stickers}); }
    catch(e){ msg('⚠ 스티커 저장 실패 — 새로고침하면 되돌아가요. ('+e.message+')'); } };
  box.querySelectorAll('[data-ss]').forEach(r=>r.addEventListener('input',()=>{
    st.page.stickers[+r.dataset.ss].size=+r.value; renderStickers(); }));
  box.querySelectorAll('[data-ss]').forEach(r=>r.addEventListener('change',save));
  box.querySelectorAll('[data-sms]').forEach(r=>r.addEventListener('input',()=>{
    st.page.stickers[+r.dataset.sms].msz=+r.value; renderStickers(); }));
  box.querySelectorAll('[data-sms]').forEach(r=>r.addEventListener('change',save));
  box.querySelectorAll('[data-sr]').forEach(r=>r.addEventListener('input',()=>{
    st.page.stickers[+r.dataset.sr].rot=+r.value; renderStickers(); }));
  box.querySelectorAll('[data-sr]').forEach(r=>r.addEventListener('change',save));
  box.querySelectorAll('[data-so]').forEach(b=>b.onclick=async()=>{
    const s=st.page.stickers[+b.dataset.so]; s.off=!s.off;
    await save(); renderStkList(); renderStickers();
  });
  box.querySelectorAll('[data-sx]').forEach(b=>b.onclick=async()=>{
    st.page.stickers.splice(+b.dataset.sx,1);
    await save(); renderStkList(); renderStickers();
  });
}

/* ---------- 인장/상단 ---------- */
async function openHomes(){
  const m=$('#homes'); m.classList.add('show');
  $('#homes-list').innerHTML='<p class="pl-empty">불러오는 중...</p>';
  try{
    const qs=await getDocs(query(collection(db,'pages'), where('listed','==',true), limit(200)));
    const arr=qs.docs.map(d=>({h:d.id,...d.data()}))
      .sort((a,b)=>(a.name||a.h).localeCompare(b.name||b.h,'ko'));
    $('#homes-list').innerHTML = arr.length? arr.map(p=>`
      <a class="hm" href="${urlFor(p.h)}">
        <span class="hm-th" style="background-image:url(${(p.cardImg||(p.heroImgs||[])[0]?.img||p.heroImg||'').replace(/"/g,'')})"></span>
        <span class="hm-t"><b>${esc(p.name||p.h)}</b><i>@${esc(p.h)}</i>
          ${p.sub?`<em>${esc(p.sub)}</em>`:''}</span></a>`).join('')
      : '<p class="pl-empty">아직 공개된 홈이 없어요 — 꾸미기 → 기본 정보에서 공개할 수 있어요.</p>';
  }catch(e){ $('#homes-list').innerHTML='<p class="pl-empty">목록을 불러오지 못했어요.</p>'; }
}
$('#homes-x').onclick=()=>$('#homes').classList.remove('show');
$('#homes').onclick=e=>{ if(e.target.id==='homes') $('#homes').classList.remove('show'); };
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
  renderSeal();                       // 주소 확정 후 다시 — 로그아웃 방문자에게 IN 표시
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
    setGateCover(cover);
    $('#enter-over').textContent = '@'+handle.toUpperCase();
    $('#gate-name').textContent = st.page.name || handle;
    $('#enter-text').textContent = st.page.enterText || '';
    $('#gate-go').textContent = st.page.gateBtn || '입 장';
    document.documentElement.style.setProperty('--gtC', st.page.gateColor || '');
    applyGateBtnC(st.page.gateBtnC||'');
    $('#view-gate').classList.toggle('nograd', st.page.gateGrad===false);
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
  applyPri(p.priColor||'');
  document.title=(p.name||h)+' — LOVELOG';
  $('#pg-name').textContent=p.name||h;
  $('#pg-name').style.color = p.titleColor||'';
  $('#pg-sub').textContent=p.sub||'';
  $('#pg-over').textContent='@'+h.toUpperCase();
  $('#gb-title').textContent=gbNm(); $('#strip-title').textContent=galNm();
  if(st.mine) admInqBadge();
  const hs=heroObjs();
  st.autoRatio=0;                                    // 홈 전환 — 이전 홈 사진 비율 리셋
  clearInterval(st.heroTimer);
  const hA=$('#pg-hero'), hB=$('#pg-hero2');
  if(hs[0]){ setHeroBg(hA,hs[0]); autoHeadHeight(hs[0]); } else hA.style.backgroundImage='';
  hA.style.opacity=1; hB.style.opacity=0;
  if(hs.length>1){
    let i=0, front=true;
    st.heroTimer=setInterval(()=>{
      i=(i+1)%hs.length;
      const showEl=front?hB:hA, hideEl=front?hA:hB;
      setHeroBg(showEl,hs[i]);
      autoHeadHeight(hs[i]);                               // auto면 이 사진 비율로 높이도 전환
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
  document.documentElement.style.setProperty('--lbIcon',
    p.labelIcon===undefined ? '"◈ "' : (p.labelIcon ? JSON.stringify(p.labelIcon+' ') : '""'));
  document.body.classList.toggle('font-serif', p.font==='serif');
  document.title = p.name ? p.name : 'LOVELOG';
  let fl=document.getElementById('favlink');
  if(p.fav){ if(!fl){ fl=document.createElement('link'); fl.rel='icon'; fl.id='favlink'; document.head.appendChild(fl); } fl.href=p.fav; }
  else if(fl) fl.remove();
  let ucss=document.getElementById('user-css');
  if(!ucss){ ucss=document.createElement('style'); ucss.id='user-css'; document.head.appendChild(ucss); }
  const noCss = /[?&]nocss=1/.test(location.search);      // 안전 모드 — 커스텀 CSS 끄고 열기
  ucss.textContent = noCss ? '' : (p.customCss||'');
  let nb=document.getElementById('nocss-bar');
  if(noCss && !nb){
    nb=document.createElement('div'); nb.id='nocss-bar';
    nb.style.cssText='position:fixed;left:0;right:0;top:0;z-index:2147483647;'
      +'background:#2b2b33;color:#ffe9a8;font-size:12px;line-height:1.5;'
      +'padding:8px 12px;text-align:center;font-family:sans-serif';
    nb.textContent='안전 모드 — 커스텀 CSS를 끄고 열었어요. 꾸미기 ✦ → 테마·레이아웃에서 CSS를 고치거나 [비우기] 후 저장하세요.';
    document.body.appendChild(nb);
  } else if(!noCss && nb) nb.remove();
  let ccss=document.getElementById('cursor-css');
  if(!ccss){ ccss=document.createElement('style'); ccss.id='cursor-css'; document.head.appendChild(ccss); }
  ccss.textContent = p.curImg ? `body,body *{cursor:url(${p.curImg}) 4 4, auto !important}` : '';
  spkSync();
  $('#bgphoto').style.backgroundImage = p.bgImg?`url(${p.bgImg})`:'';
  document.body.classList.toggle('has-bg', !!p.bgImg);
  const headEl=document.querySelector('.head');
  if(p.headFit!=='auto')
    document.documentElement.style.setProperty('--headH', (p.headH||0) ? p.headH+'px' : '');
  else if(!hs[0])
    document.documentElement.style.removeProperty('--headH');   // auto+사진 없음 — 잔존값 제거
  document.body.classList.toggle('head-contain', p.headFit==='contain');
  document.body.classList.toggle('head-notext', p.headText===false);
  document.body.classList.toggle('head-nograd', p.headGrad==='none');
  document.body.classList.toggle('head-lightgrad', p.headGrad==='light');
  if(p.headMode==='side'){ headEl.classList.add('v'); headEl.style.removeProperty('min-height'); $('#aside').prepend(headEl); }
  else { headEl.classList.remove('v');
    const anchor=$('#catbar'); anchor.parentNode.insertBefore(headEl, anchor); }
  $('#btn-write').classList.toggle('hidden',!st.mine);
  $('#btn-deco').classList.toggle('hidden',!st.mine);
  show('view-page');
  await loadContent();
  bumpCounter();
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
    pd.onclick=()=>{ goBoard('recent'); openPost(pin.id,true); };
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
    goBoard('recent'); openPost(el.dataset.lid,true); });
  d.querySelector('#latest-more').onclick=()=>goBoard('recent');
  return d;
}
const isVid=u=>/\.(mp4|webm|mov)(\?|$)/i.test(u||'')||/video%2F|video\//i.test(u||'');
function setGateCover(url){                          // 대문 배경 — 사진이면 background, 영상이면 <video>
  const box=$('#enter-cover'); if(!box) return;
  let v=document.getElementById('gate-vid');
  if(url && isVid(url)){
    box.style.backgroundImage='';
    if(!v){
      v=document.createElement('video'); v.id='gate-vid';
      v.autoplay=true; v.loop=true; v.muted=true; v.playsInline=true;
      v.setAttribute('muted',''); v.setAttribute('playsinline','');  // iOS 자동재생 조건
      box.prepend(v);
    }
    if(v.src!==url){ v.src=url; v.play?.().catch(()=>{}); }
  }else{
    if(v) v.remove();
    box.style.backgroundImage = url?`url(${url})`:'';
  }
}
const galNm=()=>st.page?.galName||'GALLERY';
const gbNm=()=>st.page?.gbName||'GUESTBOOK';
const WNAME={latest:'최신글',notice:'공지',chat:'채팅로그',img:'이미지',nb:'이웃 홈',profile:'프로필',search:'검색',category:'카테고리',
  dday:'디데이',bgm:'BGM',quote:'인용구',links:'링크',banner:'배너칸',text:'글',cnt:'방문자수'};
async function bumpCounter(){
  if(!((st.page.widgets||[]).some(w=>w.t==='cnt'))) return;
  const ref=doc(db,'pages',st.handle,'stats','counter');
  const t=today(), key='lvcnt-'+st.handle+'-'+t;
  let c={};
  if(!sessionStorage.getItem(key)){
    try{
      // 트랜잭션 — 동시 방문에도 한 명도 안 빠지게 원자적으로 +1
      c=await runTransaction(db,async tx=>{
        const cur=(await tx.get(ref)).data()||{};
        const upd={ total:(cur.total||0)+1, day:t, today: cur.day===t ? (cur.today||0)+1 : 1 };
        tx.set(ref,upd); return upd;
      });
      sessionStorage.setItem(key,'1');
    }catch(e){ try{ c=(await getDoc(ref)).data()||{}; }catch(e2){} }  // 실패 시 읽기만
  }else{
    try{ c=(await getDoc(ref)).data()||{}; }catch(e){}
  }
  st.cnt=c; fillCounter();
}
function fillCounter(){
  const a=$('#cnt-today'), b=$('#cnt-total'); if(!a||!b) return;
  const c=st.cnt||{}, t=today();
  a.textContent = c.day===t ? (c.today||0) : 0;
  b.textContent = c.total||0;
}
const DEFCOL={search:'l',category:'l',profile:'l',latest:'c',quote:'c',notice:'c',chat:'c',img:'l',nb:'r',
  dday:'r',bgm:'r',links:'r',banner:'r',text:'c',cnt:'l'};
const homeStyle=()=>st.page?.homeStyle||'grid';
const galOn=()=>st.page?.galOn!==false;
const stripOn=()=>st.page?.stripOn!==false;
function goHome(){
  if(homeStyle()==='blog'){ goBoard('recent'); return; }
  st.backHome=false;
  document.body.classList.remove('reading','in-post');   // 글 읽기 상태 해제 — 위젯·스티커 원위치
  $('#post-view').classList.add('hidden');
  $('#list-view').classList.remove('hidden');
  st.cur=null;
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
    (galOn()?pill('__gal',galNm(),st.cat==='__gal'):'')+
    pill('__gb',gbNm(),st.cat==='__gb')+
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
  applyAutoHead();                                   // 표시 상태가 정해진 뒤 실제 폭으로 재계산
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
  const half=e=>{ const r=d.getBoundingClientRect(); return e.clientY > r.top+r.height/2 ? 'after':'before'; };
  d.addEventListener('dragover',e=>{ e.preventDefault();
    const p=half(e);
    d.classList.add('dropzone');
    d.classList.toggle('dz-a', p==='after');
    d.classList.toggle('dz-b', p==='before'); });
  d.addEventListener('dragleave',()=>d.classList.remove('dropzone','dz-a','dz-b'));
  d.addEventListener('drop',e=>{
    e.preventDefault(); e.stopPropagation();
    const p=half(e);
    d.classList.remove('dropzone','dz-a','dz-b');
    dropWidget(+e.dataTransfer.getData('text/plain'), +d.dataset.wi, d.parentElement.id, p);
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
    const from=+e.dataTransfer.getData('text/plain');
    const cards=[...c.querySelectorAll(':scope > .side[data-wi]')]
      .filter(el=>+el.dataset.wi!==from);
    if(!cards.length){ dropWidget(from, -1, id); return; }
    let tgt=null, pos='before';
    for(const el of cards){
      const r=el.getBoundingClientRect();
      if(e.clientY < r.top+r.height/2){ tgt=el; pos='before'; break; }
    }
    if(!tgt){ tgt=cards[cards.length-1]; pos='after'; }
    dropWidget(from, +tgt.dataset.wi, id, pos);
  });
});
async function dropWidget(from, to, contId, pos){
  if(isNaN(from)) return;
  const arr=JSON.parse(JSON.stringify(sideCfg()));
  if(from<0||from>=arr.length) return;
  if(to===from) return;
  const [w]=arr.splice(from,1);
  w.col = contId==='hcol-l' ? 'l'
        : contId==='hcol-c' ? 'c'
        : contId==='hcol-r' ? 'r'
        : contId==='aside-l' ? 'l' : 'r';
  if(to<0){ arr.push(w); }
  else{
    let ins=to; if(from<to) ins=to-1;
    if(pos==='after') ins+=1;
    if(ins<0) ins=0; if(ins>arr.length) ins=arr.length;
    arr.splice(ins,0,w);
  }
  st.page.side=arr;
  renderSide();
  try{ await updateDoc(doc(db,'pages',st.handle),{side:arr}); }
  catch(e){ alert('순서 저장 실패: '+e.message); }
}
let spkFx='', spkPri='#9db4ff', spkLast=0;
function spkSync(){
  spkFx=st.page?.fx ?? (st.page?.sparkle?'sparkle':'');   // 옛 sparkle:true 하위호환
  spkPri=st.page?.fxC
    || getComputedStyle(document.body).getPropertyValue('--pri').trim()
    || '#9db4ff';                                          // 효과 색: 직접 고른 색 > 테마색
}
const spkA=(c,p)=>`color-mix(in srgb, ${c} ${p}%, transparent)`; // 어떤 색 형식이든 안전한 투명도
document.addEventListener('mousemove',e=>{
  if(!spkFx) return;
  const now=performance.now();
  const gap = spkFx==='sparkle'?22:48;                    // 하트·거품은 듬성하게
  if(now-spkLast<gap) return; spkLast=now;
  if(spkFx==='sparkle'){
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
    return;
  }
  if(spkFx==='heart'){
    const s=document.createElement('div');
    const size=9+Math.random()*7, sway=Math.random()*26-13;
    s.textContent='♥';
    s.style.cssText='position:fixed;pointer-events:none;z-index:9999;'
      +'left:'+(e.clientX+(Math.random()*14-7))+'px;top:'+(e.clientY-4)+'px;'
      +'font-size:'+size+'px;color:'+spkPri+';opacity:.95;'
      +'text-shadow:0 0 6px '+spkA(spkPri,33)+';'
      +'transition:transform .9s ease-out, opacity .9s ease-out';
    document.body.appendChild(s);
    requestAnimationFrame(()=>{ 
      s.style.transform='translate('+sway+'px,-'+(34+Math.random()*26)+'px) rotate('+(sway*1.6)+'deg) scale(1.25)';
      s.style.opacity='0'; });
    setTimeout(()=>s.remove(),940);
    return;
  }
  if(spkFx==='bubble'){
    const s=document.createElement('div');
    const size=6+Math.random()*10, sway=Math.random()*20-10;
    s.style.cssText='position:fixed;pointer-events:none;z-index:9999;border-radius:50%;'
      +'left:'+(e.clientX+(Math.random()*14-7))+'px;top:'+(e.clientY-2)+'px;'
      +'width:'+size+'px;height:'+size+'px;'
      +'border:1px solid '+spkA(spkPri,65)+';'
      +'background:radial-gradient(circle at 32% 30%, rgba(255,255,255,.55), '+spkA(spkPri,14)+');'
      +'transition:transform 1.1s ease-out, opacity 1.1s ease-out';
    document.body.appendChild(s);
    requestAnimationFrame(()=>{ 
      s.style.transform='translate('+sway+'px,-'+(44+Math.random()*34)+'px) scale('+(1.15+Math.random()*.5)+')';
      s.style.opacity='0'; });
    setTimeout(()=>s.remove(),1140);
    return;
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
let gatePreview=false;
const nbCache={};
const nbH=x=>{
  const h=(typeof x==='string'?x:(x&&x.h)||'').trim().toLowerCase();
  if(h) return h;
  const u=nbUrlRaw(x); return u ? ownHandle(u) : '';
};
const nbImg=x=> (typeof x==='object'&&x&&x.img)||'';
const nbUrlRaw=x=> (typeof x==='object'&&x&&x.url)||'';
const nbUrl=x=>{ const u=nbUrlRaw(x); return (u && ownHandle(u)) ? '' : u; };
const nbName=x=> (typeof x==='object'&&x&&x.name)||'';
const nbHost=u=>{ try{ return new URL(u).hostname.replace(/^www\./,''); }catch(e){ return u; } };
// luvlog.me/핸들 · github.io/...?u=핸들 처럼 우리 주소면 핸들만 뽑아냄
function ownHandle(raw){
  try{
    const u=new URL(raw);
    const host=u.hostname.replace(/^www\./,'');
    if(host===location.hostname.replace(/^www\./,'') || host==='luvlog.me'){
      const q=u.searchParams.get('u'); if(q) return q.toLowerCase();
      const seg=u.pathname.split('/').filter(Boolean).filter(s=>s!=='lovelog');
      if(seg[0] && !/\.html?$/i.test(seg[0])) return seg[0].toLowerCase();
    }
  }catch(e){}
  return '';
}
async function nbInfo(h){
  if(nbCache[h]!==undefined) return nbCache[h];
  try{ const s=await getDoc(doc(db,'pages',h));
    const dd=s.exists()?s.data():null;
    nbCache[h] = dd ? {name:dd.name||h, sub:dd.sub||'',
      img: dd.cardImg || (dd.heroImgs||[])[0]?.img || dd.heroImg || '',
      banner: dd.bannerImg || '',
      nbs:(dd.side||[]).filter(w=>w.t==='nb')
            .flatMap(w=>(w.items||[]).map(x=>String(x||'').toLowerCase()))} : null;
  }catch(e){ nbCache[h]=null; }
  return nbCache[h];
}
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
        (galOn()?`<li><a data-c="__gal" class="${st.cat==='__gal'?'on':''}"><span>${esc(galNm())}</span><span class="n">${st.gallery.length}</span></a></li>`:'')+
        `<li><a data-c="__gb" class="${st.cat==='__gb'?'on':''}"><span>${esc(gbNm())}</span><span class="n">${st.guest.length}</span></a></li>`+
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
    if(w.t==='nb'){
      let hs=(w.items||[]).filter(x=>nbH(x)||nbUrl(x));
      const lim=+w.max||0; const total=hs.length;
      const cut = w.cut===true;                    // true=잘라내기, 기본=스크롤
      if(lim>0 && cut) hs=hs.slice(0,lim);
      if(lim>0 && !cut) d.style.setProperty('--nbH', (lim*55-7)+'px');
      if(!hs.length){ if(st.mine){ d.innerHTML=`<p class="label">${esc(w.label||'NEIGHBORS')}</p><p class="pl-empty">✎ 편집에서 이웃 주소를 추가하세요.</p>`; box.appendChild(d); } return; }
      d.innerHTML=`<p class="label">${esc(w.label||'NEIGHBORS')}</p><div class="nb-list">`+
        hs.map(x=>{ const hh=nbH(x), ur=nbUrl(x), im=nbImg(x);
          if(ur) return `<a class="nb ext" href="${esc(ur)}" target="_blank" rel="noopener">
            <span class="nb-th"${im?` style="background-image:url(${im})"`:''}></span>
            <span class="nb-t"><b>${esc(nbName(x)||nbHost(ur))}</b><i>${esc(nbHost(ur))}</i></span></a>`;
          return `<a class="nb" href="${urlFor(hh)}" data-nb="${esc(hh)}">
          <span class="nb-th"${im?` style="background-image:url(${im})"`:''}></span>
          <span class="nb-t"><b>@${esc(hh)}</b><i></i></span></a>`; }).join('')
        +(cut&&lim>0&&total>lim?`<p class="nb-more">외 ${total-lim}곳</p>`:'')+`</div>`;
      box.appendChild(d);
      hs.forEach(async x=>{
        if(nbUrl(x)) return;
        const hh=nbH(x), own=nbImg(x);
        const inf=await nbInfo(hh); const el=d.querySelector(`[data-nb="${hh}"]`); if(!el) return;
        if(!inf){ el.querySelector('i').textContent='(없는 주소)'; return; }
        el.querySelector('b').textContent=inf.name;
        el.querySelector('i').textContent='@'+hh;
        if(!own && inf.img) el.querySelector('.nb-th').style.backgroundImage=`url(${inf.img})`;
        if((inf.nbs||[]).includes(st.handle)) el.classList.add('mutual');
      });
      return;
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
      if(w.cL) sv.push(`--chL:${w.cL}`);
      if(w.cR) sv.push(`--chR:${w.cR}`);
      const tL=w.tL || (w.cL?(lum(w.cL)>.62?'#1a1a1a':'#fff'):'');
      const tR=w.tR || (w.cR?(lum(w.cR)>.62?'#1a1a1a':'#fff'):'');
      if(tL) sv.push(`--chLt:${tL}`);
      if(tR) sv.push(`--chRt:${tR}`);
      if(w.tL||w.tR) sv.push(`--chNm:${w.tL||w.tR}`);
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
    if(w.t==='text'){
      if(!w.title && !w.text && !st.mine) return;
      d.className+=' w-text';
      d.innerHTML=`<p class="label">${esc(w.title||'TEXT')}</p>`+
        (w.text?`<p class="tx-x">${esc(w.text).replace(/\n/g,'<br>')}</p>`
          :(st.mine?'<p class="pl-empty">✎ 편집에서 내용을 채워주세요.</p>':''));
      box.appendChild(d); return;
    }
    if(w.t==='cnt'){
      d.className+=' w-cnt';
      d.innerHTML=`<p class="label">COUNT</p>
        <div class="cnt-row"><span>TODAY <b id="cnt-today">–</b></span><span>TOTAL <b id="cnt-total">–</b></span></div>`;
      box.appendChild(d); fillCounter(); return;
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
      if(w.maxh) d.style.setProperty('--bnH', w.maxh==='all' ? 'none' : w.maxh+'px');
      d.innerHTML=`<p class="label">${esc(w.label||'BANNER')}</p><div class="bn-list">`+(w.items||[]).map((b,bi)=>{
        const hh=(b.h||'').trim().toLowerCase();
        if(hh) return `<a class="bn-h" href="${urlFor(hh)}" data-bnh="${bi}" title="@${esc(hh)}">
          <span class="bn-slot" data-bnslot="${bi}"></span></a>`;
        return `<a ${b.url?`href="${esc(b.url)}" target="_blank" rel="noopener"`:''}><img src="${b.img}" alt="" draggable="false"></a>`;
      }).join('')+`</div>`;
      box.appendChild(d);
      (w.items||[]).forEach(async (b,bi)=>{
        const hh=(b.h||'').trim().toLowerCase(); if(!hh) return;
        const slot=d.querySelector(`[data-bnslot="${bi}"]`); if(!slot) return;
        const inf=await nbInfo(hh);
        const wide = b.img || (inf&&inf.banner) || '';   // 가로형 배너
        const sq   = (inf&&inf.img) || '';               // 정사각 대표/헤더
        const nm   = inf ? inf.name : '@'+hh;
        const mode = b.disp || 'auto';
        if(wide && mode!=='card'){
          slot.outerHTML=`<img src="${wide}" alt="${esc(nm)}" draggable="false">`; return;
        }
        if(mode==='fill' && sq){
          slot.outerHTML=`<img src="${sq}" alt="${esc(nm)}" draggable="false">`; return;
        }
        slot.outerHTML=`<span class="bn-card">
          <span class="bn-cth"${sq?` style="background-image:url(${sq})"`:''}></span>
          <span class="bn-cnm"><b>${esc(nm)}</b><i>@${esc(hh)}</i></span></span>`;
      });
      return;
    }
  });
  if(home && st.mine){
    const pcMove=async(wi,dir)=>{
      const arr=JSON.parse(JSON.stringify(sideCfg()));
      const w0=arr[wi]; if(!w0) return;
      const colOf=x=>x.col||DEFCOL[x.t]||'r';
      const same=arr.map((x,i)=>({x,i})).filter(o=>colOf(o.x)===colOf(w0));
      const p=same.findIndex(o=>o.i===wi), t=p+dir;
      if(t<0||t>=same.length) return;
      const a1=same[p].i, b1=same[t].i;
      [arr[a1],arr[b1]]=[arr[b1],arr[a1]];
      st.page.side=arr; renderSide();
      try{ await updateDoc(doc(db,'pages',st.handle),{side:arr}); }
      catch(e){ msg('순서 저장 실패: '+e.message); }
    };
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
    const cols = isM ? [hC] : [hL,hC,hR];
    cols.forEach(colEl=> colEl && colEl.querySelectorAll(':scope > [data-wi]').forEach(el=>{
      const m=document.createElement('div'); m.className='mmv';
      m.innerHTML='<button data-mv="-1">↑</button><button data-mv="1">↓</button>';
      m.querySelectorAll('button').forEach(b=>b.onclick=e=>{
        e.stopPropagation();
        if(isM) bump(+el.dataset.wi, +b.dataset.mv);
        else pcMove(+el.dataset.wi, +b.dataset.mv);
      });
      el.appendChild(m);
    }));
  }
  const gh=$('#home-grid');
  const pos = p.sidePos==='left'?'l' : p.sidePos==='both'?'b' : 'r';
  gh.classList.remove('slim-l','slim-r');
  gh.classList.toggle('pos-r', pos==='r');
  gh.classList.toggle('pos-l', pos==='l');
  gh.classList.toggle('pos-b', pos==='b');
  gh.classList.toggle('no-l', pos==='b' && !hL.children.length && !st.mine);
  gh.classList.toggle('no-r', pos==='b' && !hR.children.length && !st.mine);
  applyAutoHead();                                   // 헤더 재배치 후 실제 폭으로 재계산
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
      <p class="who"><span>${g.home?`<a class="who-h" href="${urlFor(g.home)}">@${esc(g.home)}</a>`:`@${esc(g.name||'guest')}`}${(st.mine||g.uid===st.me?.uid)?`<i class="del" data-gbd="${g.id}">삭제</i>`:''}</span>
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
    clearWriteForm();
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
    $('#v-label').textContent = st.cat==='__gal' ? galNm() : st.cat.toUpperCase();
    $('#pin-slot').innerHTML='';
    const items = st.cat==='__gal' ? st.gallery : st.gallery.filter(g=>g.cat===st.cat);
    $('#rows').innerHTML = items.length
      ? `<div class="gal-grid">`+items.map(g=>
          `<a data-gg="${g.id}"><img src="${g.img}" alt="" draggable="false">${st.mine?
            `<i class="gdel" data-gx="${g.id}">✕</i><i class="gedit" data-ge="${g.id}" title="제목·카테고리·사진 수정">✎</i><i class="gpin${galPins().includes(g.id)?' on':''}" data-gp="${g.id}" title="대문 갤러리에 고정">★</i>`:''}</a>`).join('')+`</div>`
        +(st.mine?`<p class="note" style="margin-top:10px">★를 누르면 대문(홈) 갤러리에 걸려요 — 카테고리 탭에서 '대문: ★로 고른 사진'을 선택해야 적용돼요.</p>`:'')
      : '<p class="pl-empty">아직 이미지가 없습니다.</p>';
    $('#more-btn').style.display='none';
    document.querySelectorAll('[data-gg]').forEach(el=>el.onclick=e=>{
      if(e.target.dataset.gx){ e.stopPropagation(); delGal(e.target.dataset.gx); return; }
      if(e.target.dataset.gp){ e.stopPropagation(); togglePin(e.target.dataset.gp); return; }
      if(e.target.dataset.ge){ e.stopPropagation(); startEditGal(e.target.dataset.ge); return; }
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
const galPins=()=> st.page?.stripPin||[];
function stripList(){
  const src=st.page?.stripSrc||'recent';
  if(src==='pick'){
    const ids=galPins();
    return ids.map(id=>st.gallery.find(g=>g.id===id)).filter(Boolean);
  }
  if(src && src!=='recent') return st.gallery.filter(g=>g.cat===src);
  return st.gallery;
}
async function togglePin(id){
  const cur=[...galPins()];
  const i=cur.indexOf(id);
  if(i>=0) cur.splice(i,1); else cur.push(id);
  st.page.stripPin=cur;
  try{ await updateDoc(doc(db,'pages',st.handle),{stripPin:cur});
    msg(i>=0?'대문 갤러리에서 뺐어요.':'대문 갤러리에 고정했어요.');
  }catch(e){ msg('저장 실패: '+e.message); }
  renderGal(); if(st.cat==='__gal'||isG(st.cat)) renderList();
}
function renderGal(all){
  const base = all ? st.gallery : stripList();
  const arr = all ? base : base.slice(0,4);
  const pins=galPins();
  $('#gal').innerHTML = arr.length?arr.map(g=>
    `<a data-g="${g.id}"><img src="${g.img}" alt="" draggable="false">${st.mine?`<i class="gdel" data-gx="${g.id}">✕</i>`:''}</a>`).join('')
    :'<p class="pl-empty">아직 이미지가 없습니다.</p>';
  document.querySelectorAll('#gal a').forEach(a=>a.onclick=e=>{
    if(e.target.dataset.gx){ e.stopPropagation(); delGal(e.target.dataset.gx); return; }
    if(e.target.dataset.gp){ e.stopPropagation(); togglePin(e.target.dataset.gp); return; }
    const g=st.gallery.find(x=>x.id===a.dataset.g);
    if(g){ $('#lb-img').src=g.img; $('#lb').classList.add('show'); }
  });
}
$('#gb-home').onclick=goHome;
$('#gb-go').onclick=async()=>{
  const t=$('#gb-text').value.trim(); if(!t||!st.me) return;
  await addDoc(collection(db,'pages',st.handle,'guest'),
    {uid:st.me.uid, name:st.myHandle||st.me.displayName||'guest',
     home:st.myHandle||'', text:t, ts:serverTimestamp()});
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
function backToList(){
  if(st.backHome){ st.backHome=false; goHome(); return; }   // 홈에서 연 글 → 홈으로 복귀
  document.body.classList.remove('reading','in-post');
  $('#post-view').classList.add('hidden');
  $('#guest-view').classList.add('hidden');
  if(st.cat==='__gb'){ renderGuest(); $('#guest-view').classList.remove('hidden'); }
  else $('#list-view').classList.remove('hidden');
  st.cur=null;
  history.replaceState(null,'',urlFor(st.handle)); }
$('#pv-back').onclick=backToList;
$('#go-home').onclick=goHome;
async function openPost(id, fromHome=false){
  const p=st.posts.find(x=>x.id===id); if(!p) return;
  st.backHome=fromHome;                     // 홈에서 연 글은 BACK이 홈으로
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
  $('#pv-edit').classList.toggle('hidden',!st.mine);
  $('#list-view').classList.add('hidden');
  $('#post-view').classList.remove('hidden');
  document.body.classList.toggle('reading', !!st.page.postPage);
  document.body.classList.add('in-post');           // 글 읽는 동안 스티커를 걷어요
  history.replaceState(null,'',urlFor(st.handle,id));
  const li=st.posts.findIndex(x=>x.id===id),
        older=st.posts[li+1], newer=st.posts[li-1];
  $('#pv-nav').innerHTML =
    (older?`<span class="back" data-nav="${older.id}">‹ 이전 — ${esc(older.title)}</span>`:'<span></span>')+
    (newer?`<span class="back" data-nav="${newer.id}" style="text-align:right">다음 — ${esc(newer.title)} ›</span>`:'<span></span>');
  document.querySelectorAll('#pv-nav [data-nav]').forEach(el=>el.onclick=()=>openPost(el.dataset.nav, st.backHome));
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
        <p class="who"><span>${c.home?`<a class="who-h" href="${urlFor(c.home)}">@${esc(c.home)}</a>`:`@${esc(c.name||'guest')}`}</span><span class="dt">${fmtTs(c.ts)}</span>
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
    {uid:st.me.uid, name:st.myHandle||st.me.displayName||'guest',
     home:st.myHandle||'', text:t, ts:serverTimestamp()});
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
  const groups={write:['write','galup'], deco:['wid','cats','set','theme','bg','stk','adm']};
  document.querySelectorAll('.tabs button').forEach(b=>{
    b.style.display=groups[mode].includes(b.dataset.tab)?'':'none';
  });
  if(st.myHandle!=='jeste') $('#tab-adm').style.display='none';   // 운영 탭은 운영자만
  const first = mode==='write'?'write':'wid';
  document.querySelectorAll('.tabs button').forEach(b=>b.classList.toggle('on',b.dataset.tab===first));
  document.querySelectorAll('.pane').forEach(p=>p.classList.toggle('hidden',p.dataset.pane!==first));
  $('#panel').classList.toggle('big', mode==='deco');
  msg(''); $('#panel').classList.remove('hidden'); $('#panel').classList.add('show');
}
function hhSliderSync(){                                     // auto면 수동 높이 슬라이더 잠금
  const a=$('#s-headfit').value==='auto', sl=$('#s-headh');
  sl.disabled=a; sl.style.opacity=a?'.35':'';
  $('#s-headh-v').textContent=a?'자동':(sl.value+'px'); }
$('#s-headh').addEventListener('input',e=>{
  if($('#s-headfit').value==='auto') return;
  $('#s-headh-v').textContent=e.target.value+'px';
  document.documentElement.style.setProperty('--headH', e.target.value+'px'); });
$('#s-headgrad').addEventListener('change',e=>{
  document.body.classList.toggle('head-nograd', e.target.value==='none');
  document.body.classList.toggle('head-lightgrad', e.target.value==='light'); });
$('#s-headtext').addEventListener('change',e=>{
  document.body.classList.toggle('head-notext', !e.target.checked); });
$('#s-headfit').addEventListener('change',e=>{
  hhSliderSync();
  document.body.classList.toggle('head-contain', e.target.value==='contain');
  const head=document.querySelector('.head');
  if(e.target.value!=='auto' && head) head.style.removeProperty('min-height');
  if(e.target.value==='auto'){
    const o=(heroDraft[0]||heroObjs()[0]);
    if(o){ const prev=st.page.headFit; st.page.headFit='auto'; autoHeadHeight(o); st.page.headFit=prev; }
  }
  const el=$('#pg-hero'), el2=$('#pg-hero2');
  [el,el2].forEach(x=>{ if(x&&x.style.backgroundImage && !/%/.test(x.style.backgroundSize))
    x.style.backgroundSize = e.target.value==='contain'?'contain':'cover'; }); });
$('#s-dim').addEventListener('input',e=>{
  document.documentElement.style.setProperty('--dim', e.target.value/100);
});
let priVal=null;
$('#s-pri').addEventListener('input',e=>{ priVal=e.target.value; applyPri(priVal); spkSync(); });
$('#s-pri-auto').onclick=()=>{ priVal=''; applyPri(''); spkSync();
  msg('포인트 색 자동 — [설정 저장]으로 확정돼요.'); };
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
      <button class="rmv" data-cup="${i}" title="위로" ${i===0?'disabled':''}>↑</button>
      <button class="rmv" data-cdn="${i}" title="아래로" ${i===cats().length-1?'disabled':''}>↓</button>
      <label class="filelab" style="font-size:11px">🖼 이미지 추가<input type="file" data-cimg="${esc(c)}" accept="image/*" style="display:none"></label>
      ${(st.page.catImgs||{})[c]?`<button class="rmv" data-cimgx="${esc(c)}" style="font-size:10px">이미지 제거</button>`:''}
      <button class="rmv" data-cd="${i}">✕</button>
    </div>`).join('') || '<p class="pl-empty">카테고리가 없어요.</p>';
  renderCatFix();
  const moveCat=async(i,d)=>{                     // 카테고리 순서 바꾸기
    const next=[...cats()], j=i+d;
    if(j<0||j>=next.length) return;
    [next[i],next[j]]=[next[j],next[i]];
    try{ await updateDoc(doc(db,'pages',st.handle),{cats:next}); }
    catch(e){ msg('순서 저장 실패 — '+e.message); return; }
    st.page.cats=next;
    renderCatMgr(); renderCatbar(); renderSide(); refreshWriteCats(); refreshGalCats();
    msg('순서 변경!');
  };
  box.querySelectorAll('[data-cup]').forEach(b=>b.onclick=()=>moveCat(+b.dataset.cup,-1));
  box.querySelectorAll('[data-cdn]').forEach(b=>b.onclick=()=>moveCat(+b.dataset.cdn, 1));
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
    await setCatImg(inp.dataset.cimg, await upFile(f,600,.9,40));
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
      <label class="filelab" style="font-size:11px">🖼 이미지 추가<input type="file" data-cimg="${key}" accept="image/*" style="display:none"></label>
      ${ci[key]?`<button class="rmv" data-cimgx="${key}" style="font-size:10px">이미지 제거</button>`:''}
      ${extra}
    </div>`;
  box.innerHTML =
    row('home','HOME')+
    row('__gal',esc(galNm()),
      `<input data-cn="__gal" value="${esc(st.page.galName||'')}" placeholder="GALLERY" title="게시판 이름 바꾸기 — 비우면 GALLERY" style="width:104px;margin-bottom:0;font-size:11.5px">`+
      `<button class="btn" id="gal-toggle" style="font-size:11px">${galOn()?'숨기기 (알약·하단 갤러리 제거)':'표시하기'}</button>`+
      (galOn()?`<button class="btn" id="strip-toggle" style="font-size:11px">${stripOn()?'하단 스트립 끄기':'하단 스트립 켜기'}</button>
        <select id="strip-src" style="font-size:11px;width:auto;margin:0 0 0 6px">
          <option value="recent" ${(st.page.stripSrc||'recent')==='recent'?'selected':''}>대문: 최신 사진</option>
          <option value="pick" ${st.page.stripSrc==='pick'?'selected':''}>대문: ★로 고른 사진</option>
          ${gcats().map(c=>`<option value="${esc(c)}" ${st.page.stripSrc===c?'selected':''}>대문: ${esc(c)} 카테고리</option>`).join('')}
        </select>`:''))+
    row('__gb',esc(gbNm()),
      `<input data-cn="__gb" value="${esc(st.page.gbName||'')}" placeholder="GUESTBOOK" title="게시판 이름 바꾸기 — 비우면 GUESTBOOK" style="width:104px;margin-bottom:0;font-size:11.5px">`)+
    (homeStyle()==='blog'?'':row('recent','ALL'));
  bindCatImg(box);
  box.querySelectorAll('[data-cn]').forEach(inp=>inp.addEventListener('change',async()=>{
    const v=inp.value.trim().slice(0,20);
    const field = inp.dataset.cn==='__gal' ? 'galName' : 'gbName';
    try{ await updateDoc(doc(db,'pages',st.handle),{[field]:v}); }catch(e){ msg('저장 실패 — '+e.message); return; }
    st.page[field]=v;
    renderCatbar(); renderSide(); renderCatFix();
    $('#gb-title').textContent=gbNm(); $('#strip-title').textContent=galNm();
    if(st.cat==='__gal') $('#v-label').textContent=galNm();
    msg('게시판 이름 저장!');
  }));
  const gt=$('#gal-toggle'); if(gt) gt.onclick=async()=>{
    const next=!galOn();
    await updateDoc(doc(db,'pages',st.handle),{galOn:next});
    st.page.galOn=next;
    document.querySelector('.strip-sec').classList.toggle('hidden', !(next&&stripOn()));
    if(!next && (st.cat==='__gal')) goHome();
    renderCatbar(); renderSide(); renderCatFix();
  };
  const ss=$('#strip-src'); if(ss) ss.onchange=async()=>{
    st.page.stripSrc=ss.value;
    try{ await updateDoc(doc(db,'pages',st.handle),{stripSrc:ss.value});
      msg(ss.value==='pick'?'★ 표시한 사진이 대문에 떠요 — 갤러리에서 ★를 눌러 골라주세요.':'대문 갤러리 기준을 바꿨어요.');
    }catch(e){ msg('저장 실패: '+e.message); }
    renderGal();
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
      ${['profile','quote','links','banner','dday','bgm','notice','chat','img','nb','text'].includes(w.t)?`<button data-e="${i}">✎</button>`:''}
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
  if(w.t==='nb') html+=`
    <input id="we-nblab" placeholder="제목 (기본: NEIGHBORS)" value="${esc(w.label??'')}">
    <div class="p-row" style="align-items:center">
      <span style="font-size:11.5px;color:var(--muted)">보여줄 개수</span>
      <select id="we-nbmax" style="flex:.9">
        ${[['0','전체 보여주기'],['1','1곳만'],['2','2곳'],['3','3곳'],['5','5곳'],['8','8곳'],['10','10곳'],['15','15곳']]
          .map(([v,t])=>`<option value="${v}" ${String(w.max||0)===v?'selected':''}>${t}</option>`).join('')}
      </select>
      <select id="we-nbcut" style="flex:1">
        <option value="scroll" ${w.cut!==true?'selected':''}>넘치면 스크롤로 보기</option>
        <option value="cut" ${w.cut===true?'selected':''}>넘치면 '외 N곳'으로 감추기</option>
      </select>
    </div>
    `+(w.items||[]).map((x,i)=>`
    <div class="chl">
      <div class="chl-h" style="margin-bottom:6px">
        <span style="font-size:11px;color:var(--muted);flex:none">${i+1}</span>
        ${nbImg(x)?`<img class="chl-pv" src="${nbImg(x)}" alt="">`:''}
        <span class="chl-r">
          <button class="rmv" data-nbup="${i}">↑</button>
          <button class="rmv" data-nbdn="${i}">↓</button>
          <button class="rmv" data-nbx="${i}">✕</button>
        </span>
      </div>
      <input data-nbh="${i}" placeholder="핸들 (예: jeste) 또는 https:// 외부 주소"
        value="${esc(nbUrl(x)||nbH(x))}" style="width:100%">
      ${nbUrl(x)?`<input data-nbnm="${i}" placeholder="표시할 이름" value="${esc(nbName(x))}" style="width:100%;margin-top:7px">`:''}
      <div class="p-row" style="margin:7px 0 0">
        <label class="filelab">${nbImg(x)?'사진 교체':'＋ 사진 직접 넣기(선택)'}<input type="file" data-nbimg="${i}" accept="image/*"></label>
        ${nbImg(x)?`<button class="rmv" data-nbimx="${i}" style="font-size:11px">자동으로</button>`:''}
      </div>
    </div>`).join('')
    +`<button class="btn" id="we-nbadd" style="font-size:12px">+ 이웃 추가</button>
      <p class="note">러브로그 홈은 <b>핸들</b>만 적으면 이름·사진이 자동으로 떠요. 러브로그 밖의 갠홈·블로그·트위터는 <b>https:// 주소</b>를 그대로 붙여넣고 이름을 적어주세요. [사진]으로 이미지를 지정할 수 있어요.</p>`;
  if(w.t==='img') html+=`
    <div class="p-row"><label class="filelab">사진 ${w.img?'(있음)':''} <input type="file" id="we-iimg" accept="image/*"></label>
      ${w.img?`<button class="rmv" id="we-iimgx" style="font-size:11px">사진 제거</button>`:''}</div>
    <input id="we-ilab" placeholder="제목 (예: LOVE · 비우면 제목 없이)" value="${esc(w.label ?? 'IMAGE')}">
    <textarea id="we-text" placeholder="사진 아래 설명 (선택)" style="min-height:52px">${w.text||''}</textarea>
    <input id="we-iurl" placeholder="눌렀을 때 이동할 주소 (선택)" value="${esc(w.url||'')}">`;
  if(w.t==='notice') html+=`
    <input id="we-ntt" placeholder="공지 제목 (선택)" value="${esc(w.title||'')}">
    <textarea id="we-text" placeholder="공지 내용 — 줄바꿈 그대로 표시돼요" style="min-height:100px">${w.text||''}</textarea>`;
  if(w.t==='text') html+=`
    <input id="we-ntt" placeholder="위젯 제목 (선택 — 비우면 TEXT)" value="${esc(w.title||'')}">
    <textarea id="we-text" placeholder="자유롭게 쓰는 글 — 줄바꿈 그대로 표시돼요" style="min-height:130px">${w.text||''}</textarea>`;
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
    <div class="chl">
      <div class="chl-h" style="margin-bottom:6px">
        <span style="font-size:11px;color:var(--muted);flex:none">배너 ${i+1}</span>
        ${b.img?`<img class="chl-pv" src="${b.img}" alt="">`:''}
        <span class="chl-r">
          <button class="rmv" data-bup="${i}" title="위로">↑</button>
          <button class="rmv" data-bdn="${i}" title="아래로">↓</button>
          <button class="rmv" data-br="${i}">✕</button>
        </span>
      </div>
      ${b.h!==undefined
        ? `<div class="fld"><span class="fld-pre">luvlog.me/</span>
             <input data-bh="${i}" placeholder="핸들 (예: jeste)" value="${esc(b.h||'')}"></div>
           <div class="p-row" style="margin:7px 0 0">
             <label class="filelab">${b.img?'이미지 교체':'＋ 이미지 직접 넣기(선택)'}<input type="file" data-bimg="${i}" accept="image/*"></label>
             ${b.img?`<button class="rmv" data-bimx="${i}" style="font-size:11px">자동으로</button>`:''}
             <select data-bdisp="${i}" style="flex:1;min-width:120px">
               <option value="auto" ${(b.disp||'auto')==='auto'?'selected':''}>자동 (가로 배너 있으면 배너, 없으면 카드형)</option>
               <option value="card" ${b.disp==='card'?'selected':''}>카드형 (사진+이름)</option>
               <option value="fill" ${b.disp==='fill'?'selected':''}>가로로 꽉 채우기 (잘릴 수 있음)</option>
             </select></div>`
        : `<input data-bu="${i}" placeholder="눌렀을 때 이동할 주소 (선택)" value="${b.url||''}" style="width:100%">`}
    </div>`).join('')+
    `<div class="p-row">
      <label class="filelab">배너 이미지 추가 <input type="file" id="we-bimg" accept="image/*"></label>
      <button class="btn" id="we-bnhome" style="font-size:12px">＋ 러브로그 홈 걸기</button>
    </div>
    <input id="we-blab" placeholder="제목 (기본: BANNER)" value="${esc(w.label??'')}">
    <div class="p-row" style="align-items:center">
      <span style="font-size:11.5px;color:var(--muted)">보이는 높이</span>
      <select id="we-bmaxh" style="flex:1">
        ${[['','기본 (약 2~3개, 스크롤)'],['64','아주 짧게 (1개만)'],['110','짧게 (1~2개)'],['300','길게 (4~5개)'],['all','전체 펼치기']]
          .map(([v,t])=>`<option value="${v}" ${String(w.maxh||'')===v?'selected':''}>${t}</option>`).join('')}
      </select>
    </div>
    <p class="note">'러브로그 홈 걸기'는 핸들만 적으면 그 홈의 대표 이미지가 배너로 걸려요 — 이미지를 직접 올리면 그게 우선이에요.</p>`;
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
      글씨색 왼쪽 <input type="color" id="we-chtl" value="${w.tL||'#ffffff'}" style="width:34px;padding:0">
      오른쪽 <input type="color" id="we-chtr" value="${w.tR||'#ffffff'}" style="width:34px;padding:0">
      <button class="rmv" id="we-chtx" style="font-size:10px">자동</button>
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
  const nblab=$('#we-nblab'); if(nblab) nblab.addEventListener('input',()=>{ w.label=nblab.value; });
  const nbcut=$('#we-nbcut'); if(nbcut) nbcut.addEventListener('change',()=>{
    if(nbcut.value==='cut') w.cut=true; else delete w.cut; });
  const nbmax=$('#we-nbmax'); if(nbmax) nbmax.addEventListener('change',()=>{ w.max=+nbmax.value; });
  const nbadd=$('#we-nbadd'); if(nbadd) nbadd.onclick=()=>{ w.items=w.items||[]; w.items.push(''); renderWidEdit(); };
  $('#wid-edit').querySelectorAll('[data-nbh]').forEach(i2=>i2.addEventListener('change',()=>{
    const k=i2.dataset.nbh, raw=i2.value.trim(), cur=w.items[k];
    const im=nbImg(cur), nm=nbName(cur);
    const own=ownHandle(raw);
    if(own){ w.items[k]= im ? {h:own, img:im} : own; }
    else if(/^https?:\/\//i.test(raw)){
      w.items[k]={url:raw, name:nm||'', ...(im?{img:im}:{})};
    }else{
      const v=raw.toLowerCase().replace(/^.*\//,'');
      w.items[k]= im ? {h:v, img:im} : v;
    }
    renderWidEdit(); }));
  $('#wid-edit').querySelectorAll('[data-nbnm]').forEach(i2=>i2.addEventListener('input',()=>{
    const k=i2.dataset.nbnm; w.items[k]={...w.items[k], name:i2.value}; }));
  $('#wid-edit').querySelectorAll('[data-nbimg]').forEach(inp=>inp.addEventListener('change',async e=>{
    const f=e.target.files[0]; if(!f) return; const k=inp.dataset.nbimg;
    const im=await upFile(f,600,.9,60);
    const cur=w.items[k];
    w.items[k]= nbUrl(cur) ? {...cur, img:im} : {h:nbH(cur), img:im};
    renderWidEdit();
    msg('사진 반영됨 — [위젯 구성 저장]까지!'); }));
  $('#wid-edit').querySelectorAll('[data-nbimx]').forEach(b=>b.onclick=()=>{
    const k=b.dataset.nbimx, cur=w.items[k];
    if(nbUrl(cur)){ const c2={...cur}; delete c2.img; w.items[k]=c2; }
    else w.items[k]=nbH(cur);
    renderWidEdit(); });
  const nbmv=(i,dd)=>{ const L=w.items, j=i+dd; if(j<0||j>=L.length) return; [L[i],L[j]]=[L[j],L[i]]; renderWidEdit(); };
  $('#wid-edit').querySelectorAll('[data-nbup]').forEach(b=>b.onclick=()=>nbmv(+b.dataset.nbup,-1));
  $('#wid-edit').querySelectorAll('[data-nbdn]').forEach(b=>b.onclick=()=>nbmv(+b.dataset.nbdn,1));
  $('#wid-edit').querySelectorAll('[data-nbx]').forEach(b=>b.onclick=()=>{ w.items.splice(+b.dataset.nbx,1); renderWidEdit(); });
  const ilab=$('#we-ilab'); if(ilab) ilab.addEventListener('input',()=>{ w.label=ilab.value; });
  const iurl=$('#we-iurl'); if(iurl) iurl.addEventListener('input',()=>{ w.url=iurl.value.trim(); });
  const iimg=$('#we-iimg'); if(iimg) iimg.addEventListener('change',async e=>{
    const f=e.target.files[0]; if(!f) return;
    w.img=await upFile(f,1400,.9,130); renderWidEdit();
    msg('사진 반영됨 — [위젯 구성 저장]까지!'); });
  const iimgx=$('#we-iimgx'); if(iimgx) iimgx.onclick=()=>{ delete w.img; renderWidEdit(); };
  const chst=$('#we-chst'); if(chst) chst.addEventListener('change',()=>{ w.style=chst.value; });
  const chcl=$('#we-chcl'); if(chcl) chcl.addEventListener('input',()=>{ w.cL=chcl.value; });
  const chcr=$('#we-chcr'); if(chcr) chcr.addEventListener('input',()=>{ w.cR=chcr.value; });
  const chtl=$('#we-chtl'); if(chtl) chtl.addEventListener('input',()=>{ w.tL=chtl.value; });
  const chtr=$('#we-chtr'); if(chtr) chtr.addEventListener('input',()=>{ w.tR=chtr.value; });
  const chtx=$('#we-chtx'); if(chtx) chtx.onclick=()=>{ delete w.tL; delete w.tR; renderWidEdit(); };
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
    w.lines[inp.dataset.chp].img=await upFile(f,256,.9,25);
    renderWidEdit(); msg('프사 반영됨 — [위젯 구성 저장]까지!'); }));
  $('#wid-edit').querySelectorAll('[data-chpx]').forEach(b=>b.onclick=()=>{
    delete w.lines[b.dataset.chpx].img; renderWidEdit(); });
  $('#wid-edit').querySelectorAll('[data-chx]').forEach(b=>b.onclick=()=>{
    w.lines.splice(+b.dataset.chx,1); renderWidEdit(); });
  const hg=$('#we-h'); if(hg) hg.addEventListener('input',()=>{ w.h=+hg.value; });
  const img=$('#we-img'); if(img) img.addEventListener('change',async e=>{
    const f=e.target.files[0]; if(!f) return; msg('사진 압축 중...');
    w.img=await upFile(f,1100,.9,120); msg('사진 반영됨 — [위젯 구성 저장]을 눌러주세요.');
  });
  const blab=$('#we-blab'); if(blab) blab.addEventListener('input',()=>{ w.label=blab.value; });
  const bmh=$('#we-bmaxh'); if(bmh) bmh.addEventListener('change',()=>{
    if(bmh.value) w.maxh=bmh.value; else delete w.maxh; });
  const bnh=$('#we-bnhome'); if(bnh) bnh.onclick=()=>{ w.items=w.items||[]; w.items.push({h:'',url:''}); renderWidEdit(); };
  $('#wid-edit').querySelectorAll('[data-bh]').forEach(i2=>i2.addEventListener('input',()=>{
    const raw=i2.value.trim();
    w.items[i2.dataset.bh].h = ownHandle(raw) || raw.toLowerCase().replace(/^.*\//,''); }));
  $('#wid-edit').querySelectorAll('[data-bimg]').forEach(inp=>inp.addEventListener('change',async e=>{
    const f=e.target.files[0]; if(!f) return;
    w.items[inp.dataset.bimg].img=await upFile(f,1200,.9,110); renderWidEdit();
    msg('이미지 반영됨 — [위젯 구성 저장]까지!'); }));
  $('#wid-edit').querySelectorAll('[data-bdisp]').forEach(s=>s.addEventListener('change',()=>{
    w.items[s.dataset.bdisp].disp=s.value; }));
  $('#wid-edit').querySelectorAll('[data-bimx]').forEach(b2=>b2.onclick=()=>{
    delete w.items[b2.dataset.bimx].img; renderWidEdit(); });
  const badd=$('#we-bimg'); if(badd) badd.addEventListener('change',async e=>{
    const f=e.target.files[0]; if(!f) return; msg('배너 압축 중...');
    w.items=w.items||[]; w.items.push({img:await upFile(f,1200,.9,110),url:''});
    renderWidEdit(); renderWidList(); msg('배너 추가됨 — [위젯 구성 저장]을 눌러주세요.');
  });
  const ladd=$('#we-add'); if(ladd) ladd.onclick=()=>{ w.items=w.items||[]; w.items.push({label:'',url:''}); renderWidEdit(); };
  const dadd=$('#we-ddadd'); if(dadd) dadd.onclick=()=>{ pdraft.ddays.push({title:'',date:''}); renderWidEdit(); };
  $('#wid-edit').querySelectorAll('[data-dt]').forEach(i=>i.addEventListener('input',()=>{ pdraft.ddays[i.dataset.dt].title=i.value; }));
  $('#wid-edit').querySelectorAll('[data-dd]').forEach(i=>i.addEventListener('change',()=>{ pdraft.ddays[i.dataset.dd].date=i.value; }));
  $('#wid-edit').querySelectorAll('[data-dr]').forEach(b=>b.onclick=()=>{ pdraft.ddays.splice(+b.dataset.dr,1); renderWidEdit(); });
  $('#wid-edit').querySelectorAll('[data-dimg]').forEach(inp=>inp.addEventListener('change',async e=>{
    const f=e.target.files[0]; if(!f) return; msg('사진 압축 중...');
    pdraft.ddays[inp.dataset.dimg].img=await upFile(f,1000,.9,100);
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
  if(['search','category','dday','bgm','profile','cnt'].includes(t) && draft.some(w=>w.t===t)){
    msg('이미 있는 위젯이에요.'); return; }
  draft.push(['links','banner','nb'].includes(t)?{t,items:[]}:{t});
  editIdx=draft.length-1; renderWidList();
  if(['profile','quote','links','banner','dday','bgm','notice','chat','img','nb','text'].includes(t)) renderWidEdit();
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
      alert('홈 설정 용량 초과!\n\n사진은 별도 저장소에 올라가지만, 옛날에 올린 사진이 남아 있으면 커질 수 있어요.\n해당 위젯 사진을 지우고 다시 올리면 해결돼요.\n지금 합산: 약 '+Math.round(tot/1370)+'KB\n· 위젯 사진(프로필·배너·디데이): 약 '+wKB+'KB\n· 꾸미기 사진(헤더·대문·배경): 약 '+Math.round((tot-JSON.stringify(draft).length-JSON.stringify(pdraft.ddays).length)/1370)+'KB\n\n배너·헤더 등 큰 사진을 지우거나 다시 올리면(자동 압축 강화) 들어가요.'); return; }
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
  wImgs.push(await upFile(f,1600,.88,180));
  const ta=$('#w-body'), tk=`\n[사진${wImgs.length}]\n`,
        s=ta.selectionStart??ta.value.length;
  ta.value = ta.value.slice(0,s)+tk+ta.value.slice(ta.selectionEnd??s);
  e.target.value='';
  msg(`사진 ${wImgs.length} 삽입됨 — 위치는 본문에서 [사진${wImgs.length}] 글자를 옮기면 돼요.`);
});
const msg=t=>$('#p-msg').textContent=t;

let editPost=null, editGal=null;
function clearWriteForm(){
  editPost=null;
  ['w-title','w-pw','w-body'].forEach(i=>$('#'+i).value='');
  $('#w-secret').checked=false; $('#w-pin').checked=false; $('#w-pw').style.display='none';
  $('#w-cmt').checked=true; $('#w-html').checked=false; wImgs=[];
  $('#w-go').textContent='발행'; $('#w-edit-note').classList.add('hidden');
}
function startEditPost(){
  const p=st.cur; if(!p) return;
  refreshWriteCats(); refreshGalCats();
  editPost=p.id;
  $('#w-title').value=p.title||'';
  $('#w-cat').value=p.cat||'';
  if(!p.secret && typeof p.raw==='string' && p.raw!==''){
    $('#w-body').value=p.raw; $('#w-html').checked=!!p.html;
  }else{
    const src = p.secret ? (st.curBody||'') : (p.body||'');
    $('#w-body').value = htmlToText(src); $('#w-html').checked=false;
  }
  wImgs = Array.isArray(p.imgs) ? p.imgs.slice() : [];
  $('#w-pin').checked=!!p.pinned;
  $('#w-cmt').checked=!p.cmtOff;
  $('#w-secret').checked=!!p.secret;
  $('#w-pw').style.display=p.secret?'':'none';
  $('#w-pw').value='';
  $('#w-go').textContent='수정 완료';
  $('#w-edit-note').classList.remove('hidden');
  $('#w-edit-note').textContent='✎ 「'+(p.title||'')+'」 수정 중'
    + (wImgs.length?` · 본문 사진 ${wImgs.length}장 유지([사진N] 자리)`:'')
    + (p.secret?' · 비밀글은 비밀번호를 다시 입력해야 저장돼요.':'');
  openPanel('write'); switchTab('write');
}
$('#pv-edit').onclick=startEditPost;
$('#w-cancel').onclick=()=>{ clearWriteForm(); msg('수정을 취소했어요.'); };
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
      excerpt: secret?'':(asHtml?raw.replace(/<[^>]+>/g,' '):raw).replace(/\s+/g,' ').trim().slice(0,70),
      html: asHtml, imgs: wImgs.slice() };
    if(!secret) data.raw = raw;          // 원문 보관(수정 시 그대로 열기)
    else data.raw = '';                  // 비밀글은 원문을 남기지 않음
    if(secret) data.enc=await encTxt(pw,html); else data.body=html;
    if(JSON.stringify(data).length>980000){ msg('이 글의 본문 이미지가 너무 많아요 — 사진 수를 줄여주세요. (꾸미기 용량과는 별개예요)'); return; }
    if(pin) await Promise.all(st.posts.filter(p=>p.pinned).map(p=>
      updateDoc(doc(db,'pages',st.handle,'posts',p.id),{pinned:false})));
    if(editPost){
      const old=st.posts.find(p=>p.id===editPost)||{};
      const upd={...data, date: old.date||data.date, ts: old.ts||data.ts,
        editedAt: serverTimestamp()};
      if(!secret) upd.enc='';
      await setDoc(doc(db,'pages',st.handle,'posts',editPost), upd);
      const pid=editPost;
      clearWriteForm();
      await loadContent(); renderWidgets(); renderList();
      $('#panel').classList.remove('show');
      openPost(pid);
      msg('수정 완료!');
      return;
    }
    const d0=new Date(), pad=n=>String(n).padStart(2,'0');
    const base=String(d0.getFullYear()).slice(2)+pad(d0.getMonth()+1)+pad(d0.getDate());
    const used=new Set(st.posts.map(p=>p.id));
    let nid='', n=1;
    do{ nid=base+'-'+n.toString(36); n++; }while(used.has(nid)&&n<400);
    await setDoc(doc(db,'pages',st.handle,'posts',nid),data);
    await loadContent(); renderWidgets(); renderList();
    clearWriteForm();
    msg('발행 완료!');
  }catch(e){ msg('오류: '+e.message); }
};

function startEditGal(id){
  const g=st.gallery.find(x=>x.id===id); if(!g) return;
  editGal=id; refreshGalCats();
  $('#g-title').value=g.title||''; $('#g-cat').value=g.cat||'';
  $('#g-file').value='';
  $('#g-go').textContent='수정 완료';
  $('#g-edit-note').classList.remove('hidden');
  $('#g-edit-note').textContent='✎ 사진 정보 수정 중 — 이미지를 새로 고르면 사진도 교체돼요.';
  openPanel('write'); switchTab('galup');
}
function clearGalForm(){
  editGal=null; $('#g-title').value=''; $('#g-file').value='';
  $('#g-go').textContent='업로드'; $('#g-edit-note').classList.add('hidden');
}
$('#g-cancel').onclick=()=>{ clearGalForm(); msg('수정을 취소했어요.'); };
$('#g-go').onclick=async()=>{
  if(editGal){
    try{
      const f=$('#g-file').files[0];
      const upd={title:$('#g-title').value.trim(), cat:$('#g-cat').value||''};
      if(f){ msg('이미지 교체 중...'); upd.img=await upFile(f,1900,.9,220); }
      await updateDoc(doc(db,'pages',st.handle,'gallery',editGal),upd);
      clearGalForm(); await loadContent(); renderGal();
      if(st.cat==='__gal'||isG(st.cat)) renderList();
      msg('수정 완료!');
    }catch(e){ msg('오류: '+e.message); }
    return;
  }
  const f=$('#g-file').files[0]; if(!f){ msg('이미지를 선택하세요.'); return; }
  msg('압축·업로드 중...');
  try{
    const img=await upFile(f,1900,.9,220);
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
    ? (isVid(im)
        ? `<video class="thumb" src="${im}" muted loop autoplay playsinline></video>`
        : `<img class="thumb" src="${im}">`)
    : '<span class="note">전용 이미지 없음 — 첫 헤더 사진이 대신 쓰여요.</span>';
}
function renderHeroList(){
  const box=$('#s-hero-list');
  box.innerHTML = heroDraft.map((o,i)=>`
    <div style="width:100%;border:1px solid var(--line);border-radius:11px;padding:10px;margin-bottom:10px">
      <div class="p-row" style="align-items:center;justify-content:space-between">
        <span style="font-size:11px;color:var(--muted)">사진 ${i+1} — 실제로 보이는 범위</span>
        <button class="rm2" data-hx="${i}">✕</button>
      </div>
      <div class="hpv-wrap">
        <div class="hpv">
          <span class="hpv-t">PC</span>
          <div class="hpv-pc" data-hp="${i}" style="background-image:url(${o.img});
            background-position:${o.x}% ${o.y}%;
            background-size:${o.z>100?o.z+'% auto':'cover'}"></div>
        </div>
        <div class="hpv">
          <span class="hpv-t">모바일</span>
          <div class="hpv-mo" data-hpm="${i}" style="background-image:url(${o.img});
            background-position:${o.x}% ${o.y}%;
            background-size:${o.z>100?o.z+'% auto':'cover'}"></div>
        </div>
      </div>
      <div class="hsl"><span>확대</span>
        <input type="range" data-hz="${i}" min="100" max="250" value="${o.z}"></div>
      <div class="hsl"><span>가로</span>
        <input type="range" data-hxp="${i}" min="0" max="100" value="${o.x}"></div>
      <div class="hsl"><span>세로</span>
        <input type="range" data-hyp="${i}" min="0" max="100" value="${o.y}"></div>
    </div>`).join('')
    || '<span class="note">아직 사진이 없어요 — 위에서 추가하세요.</span>';
  box.querySelectorAll('[data-hx]').forEach(b=>b.onclick=()=>{
    heroDraft.splice(+b.dataset.hx,1); renderHeroList(); });
  const upd=i=>{ const o=heroDraft[i];
    [`[data-hp="${i}"]`,`[data-hpm="${i}"]`].forEach(sel=>{
      const pv=box.querySelector(sel); if(!pv) return;
      pv.style.backgroundPosition=`${o.x}% ${o.y}%`;
      pv.style.backgroundSize = o.z>100 ? o.z+'% auto' : 'cover'; }); };
  box.querySelectorAll('[data-hz]').forEach(s=>s.addEventListener('input',()=>{ heroDraft[s.dataset.hz].z=+s.value; upd(+s.dataset.hz); }));
  box.querySelectorAll('[data-hxp]').forEach(s=>s.addEventListener('input',()=>{ heroDraft[s.dataset.hxp].x=+s.value; upd(+s.dataset.hxp); }));
  box.querySelectorAll('[data-hyp]').forEach(s=>s.addEventListener('input',()=>{ heroDraft[s.dataset.hyp].y=+s.value; upd(+s.dataset.hyp); }));
}
$('#s-hero').addEventListener('change',async e=>{
  const f=e.target.files[0]; if(!f) return;
  msg('헤더 사진 압축 중...');
  heroDraft.push({img:await upFile(f,2200,.9,230),x:50,y:50,z:100});
  renderHeroList(); msg('추가됨 — [설정 저장]을 눌러야 확정돼요.');
  e.target.value='';
});
const GATE_VID_MAX = 15*1024*1024;                   // 대문 영상 상한 15MB
$('#s-egate').addEventListener('change',async e=>{
  const f=e.target.files[0]; if(!f) return;
  if(f.type.startsWith('video/')){
    if(f.size>GATE_VID_MAX){
      msg('영상이 15MB를 넘어요 — 길이를 줄이거나 화질을 낮춰서 올려주세요.'); e.target.value=''; return; }
    if(!st.me){ msg('로그인이 필요해요.'); e.target.value=''; return; }
    msg('영상 올리는 중...');
    try{
      const ext=(f.name.split('.').pop()||'mp4').toLowerCase();
      const nm=Date.now().toString(36)+Math.random().toString(36).slice(2,7)+'.'+ext;
      const r=sref(stg,'u/'+st.me.uid+'/'+nm);
      await uploadBytes(r,f,{contentType:f.type,cacheControl:'public,max-age=31536000'});
      egateNew=await getDownloadURL(r); renderEgate();
      msg('영상 추가됨 — [설정 저장]을 눌러야 확정돼요.');
    }catch(err){ msg('영상 업로드 실패 — '+err.message); }
    e.target.value=''; return;
  }
  msg('입장 이미지 압축 중...');
  egateNew=await upFile(f,2200,.9,240); renderEgate();
  msg('추가됨 — [설정 저장]을 눌러야 확정돼요.'); e.target.value='';
});
$('#s-egate-clear').onclick=()=>{ egateNew=''; renderEgate();
  msg('입장 이미지 제거 — [설정 저장]으로 확정.'); };
$('#stk-file').addEventListener('change',async e=>{
  const f=e.target.files[0]; if(!f) return;
  msg('스티커 압축 중...');
  const img=await upFile(f,700,.92,60);
  st.page.stickers=st.page.stickers||[];
  st.page.stickers.push({img,x:8,y:20,size:120,rot:0});
  try{ await updateDoc(doc(db,'pages',st.handle),{stickers:st.page.stickers});
    msg('스티커 추가! 홈에서 드래그로 옮겨보세요.');
  }catch(e2){
    st.page.stickers.pop();
    msg('스티커 저장 실패 — 안내창을 확인하세요.');
    alert('스티커를 저장하지 못했어요.\n\n'+e2.message+'\n\n옛날에 올린 사진(헤더·배경·위젯)이 홈 설정에 남아 용량을 차지하고 있을 수 있어요.\n그 사진들을 지우고 다시 올린 뒤 [설정 저장]을 하면 해결돼요.');
  }
  renderStkList(); renderStickers(); e.target.value='';
});
let favNew=null, curNew=null, gateColVal=null, gateBtnCVal=null, fxCVal=null, cardNew=null;
const lumHex=hx=>{ try{ const n=parseInt(hx.slice(1),16);
  return (((n>>16)&255)*.299+((n>>8)&255)*.587+(n&255)*.114)/255; }catch(e){ return .5; } };
function applyGateBtnC(c){
  document.documentElement.style.setProperty('--gtBc', c||'');
  document.documentElement.style.setProperty('--gtBt', c ? (lumHex(c)>.62?'#1a1a1a':'#fff') : '');
}
function renderCard(){
  const im = cardNew!==null ? cardNew : (st.page.cardImg||'');
  $('#s-card-list').innerHTML = im
    ? `<img class="thumb" src="${im}">`
    : '<span class="note">지정하지 않으면 헤더 사진이 쓰여요.</span>';
}
$('#s-card').addEventListener('change',async e=>{
  const f=e.target.files[0]; if(!f) return;
  msg('대표 이미지 준비 중...'); cardNew=await upFile(f,800,.9,120);
  renderCard(); msg('반영됨 — [설정 저장]을 누르면 확정돼요.'); e.target.value='';
});
$('#s-card-clear').onclick=()=>{ cardNew=''; renderCard();
  msg('헤더 사진을 쓰도록 되돌림 — [설정 저장]으로 확정돼요.'); };
let bnrNew=null;
function renderBnr(){
  const im = bnrNew!==null ? bnrNew : (st.page.bannerImg||'');
  $('#s-bnr-list').innerHTML = im
    ? `<img src="${im}" style="width:100%;max-width:420px;border-radius:8px;border:1px solid var(--line);display:block">`
    : '<span class="note">가로로 긴 배너(예: 400×80). 없으면 다른 사람 배너칸에 카드형으로 표시돼요.</span>';
}
$('#s-bnr').addEventListener('change',async e=>{
  const f=e.target.files[0]; if(!f) return;
  msg('배너 이미지 준비 중...'); bnrNew=await upFile(f,1200,.9,110);
  renderBnr(); msg('반영됨 — [설정 저장]을 누르면 확정돼요.'); e.target.value='';
});
$('#s-bnr-clear').onclick=()=>{ bnrNew=''; renderBnr();
  msg('배너 이미지 제거 — [설정 저장]으로 확정돼요.'); };
$('#s-gatecolor').addEventListener('input',e=>{ gateColVal=e.target.value;
  document.documentElement.style.setProperty('--gtC', gateColVal); });
$('#s-gatebtnc').addEventListener('input',e=>{ gateBtnCVal=e.target.value; applyGateBtnC(gateBtnCVal); });
$('#s-gatebtnc-x').onclick=()=>{ gateBtnCVal=''; applyGateBtnC(''); };
$('#s-fxc').addEventListener('input',e=>{ fxCVal=e.target.value; spkPri=fxCVal; });   // 즉시 미리보기
$('#s-fxc-x').onclick=()=>{ fxCVal=''; spkPri=getComputedStyle(document.body).getPropertyValue('--pri').trim()||'#9db4ff'; msg('커서 효과 색 — 테마색을 따라가요.'); };
$('#s-gatecolor-x').onclick=()=>{ gateColVal='';
  document.documentElement.style.setProperty('--gtC','');
  msg('기본 글씨색 — [설정 저장]으로 확정돼요.'); };
function endGatePreview(){
  if(!gatePreview) return;
  gatePreview=false;
  document.getElementById('gate-vid')?.pause?.();
  document.body.classList.remove('gate-pv');
  show('view-page');
  $('#panel').classList.remove('hidden');
  msg('미리보기 종료 — 바꾼 내용은 [설정 저장]을 눌러야 확정돼요.');
}
$('#gate-go').addEventListener('click',e=>{
  if(!gatePreview) return;
  e.stopImmediatePropagation(); endGatePreview();
}, true);
$('#gate-pv-x').onclick=endGatePreview;                      // 상단 바 — 무엇에도 안 가림
$('#view-gate').addEventListener('click',()=>{               // 아무 데나 눌러도 종료
  if(gatePreview) endGatePreview(); });
document.addEventListener('keydown',e=>{                     // ESC
  if(e.key==='Escape' && gatePreview) endGatePreview(); });
$('#s-gate-pv').onclick=()=>{
  const cover = (egateNew ?? st.page.enterImg) || heroObjs()[0]?.img || '';
  setGateCover(cover);
  $('#enter-over').textContent='@'+st.handle.toUpperCase();
  $('#gate-name').textContent=$('#s-name').value.trim()||st.page.name||st.handle;
  $('#enter-text').textContent=$('#s-enter').value.trim();
  $('#gate-go').textContent=$('#s-gatebtn').value.trim()||'입 장';
  document.documentElement.style.setProperty('--gtC', gateColVal ?? st.page.gateColor ?? '');
  applyGateBtnC(gateBtnCVal ?? st.page.gateBtnC ?? '');
  $('#view-gate').classList.toggle('nograd', !$('#s-gategrad').checked);
  $('#gate-pw-wrap').classList.add('hidden'); $('#gate-err').textContent='';
  $('#gate-login').classList.add('hidden');
  $('#panel').classList.add('hidden');
  gatePreview=true; document.body.classList.add('gate-pv'); show('view-gate');
};
$('#s-fav').addEventListener('change',async e=>{
  const f=e.target.files[0]; if(!f) return;
  favNew=await upFile(f,128,.95,10); e.target.value='';
  msg('파비콘 준비 완료 — [설정 저장]을 누르면 적용돼요.');
});
$('#s-fav-clear').onclick=()=>{ favNew=''; msg('파비콘 제거 — [설정 저장]으로 확정돼요.'); };
$('#s-cur').addEventListener('change',async e=>{
  const f=e.target.files[0]; if(!f) return;
  msg('커서 이미지 준비 중...');
  curNew=await upFile(f,96,.95,8); e.target.value='';
  msg('커서 준비 완료 — [설정 저장]을 누르면 적용돼요.');
});
$('#s-cur-clear').onclick=()=>{ curNew=''; msg('기본 커서로 — [설정 저장]으로 확정돼요.'); };
$('#s-css-clear').onclick=()=>{ $('#s-css').value=''; msg('CSS 비움 — [설정 저장]으로 확정돼요.'); };

/* ── 컨셉 CSS 프리셋 모음 ── */
const CSS_PRESETS={
  rain:{ nm:'비 오는 창가', css:
`/* ═ 프리셋: 비 오는 창가 ═ */
body::after{content:'';position:fixed;inset:0;pointer-events:none;z-index:4;opacity:.28;
background-image:linear-gradient(78deg,transparent 46%,var(--pri) 49%,transparent 52%);
background-size:64px 150px;
animation:pzRain .75s linear infinite}
@keyframes pzRain{from{background-position:0 0}to{background-position:0 150px}}
body::before{content:'';position:fixed;inset:0;pointer-events:none;z-index:4;
background:radial-gradient(ellipse at 50% -10%,hsl(var(--h) 30% 20% / .25),transparent 55%)}`},
  film:{ nm:'필름 카메라', css:
`/* ═ 프리셋: 필름 카메라 ═ */
body::after{content:'';position:fixed;inset:0;pointer-events:none;z-index:5;
background:radial-gradient(ellipse at center,transparent 52%,rgba(0,0,0,.32) 100%)}
body::before{content:'';position:fixed;inset:0;pointer-events:none;z-index:5;opacity:.05;
background:
repeating-linear-gradient(0deg,rgba(255,255,255,.6) 0 1px,transparent 1px 3px),
repeating-linear-gradient(90deg,rgba(0,0,0,.6) 0 1px,transparent 1px 4px)}
.head .bgimg,#bgphoto{filter:saturate(.85) contrast(1.05) sepia(.08)}`},
  crt:{ nm:'CRT 스캔라인', css:
`/* ═ 프리셋: CRT 스캔라인 ═ */
body::after{content:'';position:fixed;inset:0;pointer-events:none;z-index:6;
background:repeating-linear-gradient(0deg,rgba(0,0,0,.12) 0 1px,transparent 1px 3px)}
.head h1{text-shadow:1px 0 hsl(calc(var(--h) + 120) 80% 65% / .45),
-1px 0 hsl(calc(var(--h) - 120) 80% 65% / .45)}`},
  scrap:{ nm:'점선 스크랩북', css:
`/* ═ 프리셋: 점선 스크랩북 ═ */
.side,.head,#post-view article{border-style:dashed;border-width:1.5px}
.label{border-bottom:1px dotted var(--line);padding-bottom:4px}`}
};
$('#s-csspre-add').onclick=()=>{
  const k=$('#s-csspre').value, pr=CSS_PRESETS[k]; if(!pr) return;
  const box=$('#s-css');
  if(box.value.includes(`프리셋: ${pr.nm}`)){ msg('이미 들어있는 프리셋이에요.'); return; }
  box.value=(box.value.trim()?box.value.trim()+'\n\n':'')+pr.css;
  let ucss=document.getElementById('user-css');
  if(ucss) ucss.textContent=box.value;                       // 즉시 미리보기
  msg(`'${pr.nm}' 넣었어요 — 마음에 들면 [설정 저장]! (겹치면 아래 프리셋이 우선돼요)`);
};
$('#s-bg').addEventListener('change',async e=>{
  const f=e.target.files[0]; if(!f) return;
  msg('배경 이미지 업로드 중...'); bgNew=await upFile(f,2400,.9,260);
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
  $('#s-gate').value=''; gateClear=false; renderGateState(); priVal=null; $('#s-pri').value=p.priColor||'#9db4ff'; $('#s-color').value=hslToHex(p.hue??222, p.sat??60, p.lum??62);
  $('#s-headmode').value=p.headMode||'wide'; $('#s-headh').value=p.headH||380; $('#s-headfit').value=p.headFit||'cover';
  $('#s-headgrad').value=p.headGrad||'dark'; $('#s-headtext').checked=p.headText!==false; $('#s-headh-v').textContent=(p.headH||380)+'px';
  $('#s-sidepos').value=p.sidePos||'right';
  hhSliderSync();
  $('#s-light').checked=!!p.light;
  $('#s-glass').checked=!!p.glass;
  $('#s-catstyle').value=catStyle();
  $('#s-homestyle').value=homeStyle();
  $('#s-theme').value=p.theme||'default';
  renderStkList();
  $('#s-dim').value=p.bgDim??78; $('#s-dots').checked=p.dots!==false; $('#s-protect').checked=p.protectImg!==false; $('#s-stkm').checked=!!p.stkHideM; $('#s-stkoff').checked=p.stkOff!==true; $('#s-fx').value=p.fx ?? (p.sparkle?'sparkle':''); $('#s-fxc').value=p.fxC||'#ffb3c8'; fxCVal=null; $('#s-postpage').checked=!!p.postPage;
  $('#s-gatebtn').value=p.gateBtn||''; $('#s-listed').checked=!!p.listed; cardNew=null; bnrNew=null; renderCard(); renderBnr(); $('#s-lbicon').value=p.labelIcon??'◈'; gateColVal=null;
  $('#s-gatecolor').value=p.gateColor||'#ffffff';
  $('#del-h').textContent=st.handle||'—'; $('#s-del-confirm').value=''; delMsg('');
  renderMyInq(); renderAdmInq();
  $('#s-gatebtnc').value=p.gateBtnC||'#e691a9'; gateBtnCVal=null;
  $('#s-gategrad').checked=p.gateGrad!==false;
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
    const isUrl=s=>typeof s==='string' && s.startsWith('http');
    const heroOut=[];
    for(const o of heroDraft){
      heroOut.push(isUrl(o.img)
        ? {img:o.img, x:o.x??50, y:o.y??50, z:o.z??100}
        : {ref: o.ref || await putImg(o.img), x:o.x??50, y:o.y??50, z:o.z??100});
    }
    let enterRef = st.page.enterRef||'', enterUrl='';
    if(egateNew!==null){
      if(!egateNew){ enterRef=''; }
      else if(isUrl(egateNew)){ enterUrl=egateNew; enterRef=''; }
      else enterRef=await putImg(egateNew);
    } else if(!enterRef && st.page.enterImg){
      if(isUrl(st.page.enterImg)) enterUrl=st.page.enterImg;
      else enterRef=await putImg(st.page.enterImg);
    }
    let bgRef = st.page.bgRef||'', bgUrl='';
    if(bgNew!==null){
      if(!bgNew){ bgRef=''; }
      else if(isUrl(bgNew)){ bgUrl=bgNew; bgRef=''; }
      else bgRef=await putImg(bgNew);
    } else if(!bgRef && st.page.bgImg){
      if(isUrl(st.page.bgImg)) bgUrl=st.page.bgImg;
      else bgRef=await putImg(st.page.bgImg);
    }
    const data={
      name:$('#s-name').value.trim()||st.handle,
      sub:$('#s-sub').value.trim(),
      heroImgs: heroOut,
      heroImg: '',
      enterText: $('#s-enter').value.trim(),
      enterImg: enterUrl, enterRef,
      titleColor: titleVal ?? st.page.titleColor ?? '',
      bgImg: bgUrl, bgRef,
      priColor: priVal ?? st.page.priColor ?? '',
      hue: hexToHsl($('#s-color').value)[0],
      sat: hexToHsl($('#s-color').value)[1],
      lum: hexToHsl($('#s-color').value)[2],
      headMode: $('#s-headmode').value,
      headH: parseInt($('#s-headh').value)||380,
      headFit: $('#s-headfit').value,
      headGrad: $('#s-headgrad').value,
      headText: $('#s-headtext').checked,
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
      stkOff: !$('#s-stkoff').checked,
      fx: $('#s-fx').value,
      fxC: fxCVal ?? st.page.fxC ?? '',
      sparkle: $('#s-fx').value==='sparkle',
      postPage: $('#s-postpage').checked,
      gateBtn: $('#s-gatebtn').value.trim(),
      listed: $('#s-listed').checked,
      cardImg: cardNew ?? st.page.cardImg ?? '',
      bannerImg: bnrNew ?? st.page.bannerImg ?? '',
      labelIcon: $('#s-lbicon').value.trim(),
      gateColor: gateColVal ?? st.page.gateColor ?? '',
      gateBtnC: gateBtnCVal ?? st.page.gateBtnC ?? '',
      gateGrad: $('#s-gategrad').checked,
      font: $('#s-font').value,
      customCss: $('#s-css').value,
      fav: favNew ?? st.page.fav ?? '',
      curImg: curNew ?? st.page.curImg ?? '',
      updatedAt:serverTimestamp()
    };
    if(gateIn) data.gate=await sha256(gateIn);
    else if(gateClear) data.gate='';
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
    gateClear=false; renderGateState();
    if(data.gate==='') sessionStorage.removeItem('gate_'+st.handle);
    msg('저장 완료!');
    enterPage(); renderCatbar();
  }catch(e){ msg('오류: '+e.message); }
}
document.querySelectorAll('.s-go').forEach(b=>b.onclick=saveSettings);
// ── 꾸미기 초기화 ──
const RESET={
  theme:{hue:222,sat:60,lum:62,light:false,glass:false,theme:'default',dots:true,
    bgImg:'',bgRef:'',bgDim:78,titleColor:'',font:'sans',customCss:'',curImg:'',
    sparkle:false,fx:'',fxC:'',labelIcon:'◈',postPage:false,priColor:''},
  widget:{side:[],ddays:[],bgm:{url:'',title:''}},
  sticker:{stickers:[],stkOff:false,stkHideM:false},
  layout:{homeStyle:'grid',headMode:'wide',headH:380,headFit:'cover',headGrad:'dark',headText:true,sidePos:'right',catStyle:'bar',
    galOn:true,stripOn:true},
  media:{heroImgs:[],heroImg:'',enterImg:'',enterRef:'',enterText:'',
    cardImg:'',bannerImg:'',catImgs:{},gate:'',gateBtn:'',gateColor:'',gateBtnC:'',galName:'',gbName:''}
};
$('#s-reset').onclick=async()=>{
  const kind=$('#s-reset-kind').value;
  const names={all:'꾸미기 전체',theme:'테마·색',widget:'위젯 구성',sticker:'스티커',media:'사진(헤더·대문·대표·배너)'};
  if(!confirm(`${names[kind]}를 초기화할까요?\n\n글·갤러리·방명록은 그대로 남고, 꾸민 설정만 처음 상태로 돌아가요.`)) return;
  if(kind==='all' && !confirm('정말 전부 되돌릴까요? 되돌린 설정은 복구할 수 없어요.')) return;
  const data = kind==='all'
    ? {...RESET.theme,...RESET.widget,...RESET.sticker,...RESET.layout,...RESET.media}
    : {...RESET[kind]};
  msg('초기화 중...');
  try{
    await updateDoc(doc(db,'pages',st.handle),data);
    st.page={...st.page,...data};
    sessionStorage.removeItem('gate_'+st.handle);
    fillSettings(); renderWidList?.();
    enterPage(); renderCatbar();
    msg('초기화 완료!');
  }catch(e){ msg('초기화 실패: '+e.message); }
};
let gateClear=false;
function renderGateState(){
  const on = !!st.page?.gate && !gateClear;
  $('#s-gate-state').innerHTML = on
    ? `<b style="color:var(--pri)">🔒 지금 비밀번호가 걸려 있어요</b>`
    : `<b>🔓 지금은 누구나 들어올 수 있어요</b>`;
  $('#s-gate-off').classList.toggle('hidden', !on);
}
$('#s-gate-off').onclick=()=>{
  gateClear=true; $('#s-gate').value=''; renderGateState();
  msg('잠금 해제 예약 — [설정 저장]을 눌러야 확정돼요.');
};
$('#s-gate').addEventListener('input',()=>{ if($('#s-gate').value) gateClear=false; renderGateState(); });

/* ---------- 가입 ---------- */
// 시스템 경로·혼동 주소 예약 (콘솔 config/reserved 문서의 list 배열로 추가 가능)
const RESERVED = new Set(['guide','index','404','app','api','admin','root','system',
  'static','assets','css','js','img','imgs','image','images','file','files','upload',
  'login','logout','signup','signin','join','auth','user','users','account','me','my',
  'home','main','www','mail','blog','help','about','support','contact','terms','privacy',
  'lovelog','luvlog','test','demo','null','undefined','new','edit','delete','search',
  'gallery','guestbook','archive','all','post','posts','tag','tags']);
async function signup(){
  const code=$('#in-invite').value.trim(), ref=$('#in-ref').value.trim().slice(0,30),
        handle=$('#in-handle').value.trim().toLowerCase(),
        name=$('#in-name').value.trim(), err=$('#signup-err');
  err.textContent='';
  if(!/^[a-z0-9-]{2,20}$/.test(handle)){ err.textContent='주소 형식을 확인해 주세요.'; return; }
  if(RESERVED.has(handle)){ err.textContent='이 주소는 사용할 수 없어요. 다른 주소를 골라주세요.'; return; }
  // 가입 개방 상태 확인 (콘솔 config/signup 문서로 제어)
  let mode='open', notice='';
  try{
    const sc=await getDoc(doc(db,'config','signup'));
    if(sc.exists()){ mode=sc.data().mode||'open'; notice=sc.data().notice||''; }
  }catch(e){}
  if(mode==='closed'){
    err.textContent = notice || '지금은 새 홈 만들기가 닫혀 있어요.'; return; }
  if(mode==='code' && !code){
    $('#invite-wrap').classList.remove('hidden'); $('#ref-wrap').classList.remove('hidden');
    err.textContent = notice || '지금은 초대코드가 있어야 가입할 수 있어요.'; return; }
  try{
    const rs=await getDoc(doc(db,'config','reserved'));
    if(rs.exists() && (rs.data().list||[]).includes(handle)){
      err.textContent='이 주소는 사용할 수 없어요. 다른 주소를 골라주세요.'; return; }
  }catch(e){}
  if(!name){ err.textContent='홈 이름을 입력해 주세요.'; return; }
  try{
    await runTransaction(db,async tx=>{
      const iv=code?doc(db,'invites',code):null, pg=doc(db,'pages',handle), us=doc(db,'users',st.me.uid);
      const [a,b,c]=await Promise.all([iv?tx.get(iv):Promise.resolve(null),tx.get(pg),tx.get(us)]);
      let id=null, multi=false;
      if(code){
        if(!a.exists()) throw new Error('초대코드가 올바르지 않아요.');
        id=a.data();
        multi = id.multi===true || typeof id.max==='number';
        if(!multi && id.used) throw new Error('이미 사용된 초대코드예요.');
        if(id.closed===true) throw new Error('지금은 가입이 닫혀 있어요.');
        if(typeof id.max==='number' && (id.count||0)>=id.max)
          throw new Error('초대 인원이 가득 찼어요.');
      }
      if(b.exists()) throw new Error('이미 쓰는 주소예요.');
      if(c.exists()) throw new Error('이 계정의 페이지가 이미 있어요.');
      tx.set(pg,{owner:st.me.uid,name,sub:'',cats:['archive','ooc'],hue:222,createdAt:serverTimestamp(),ref:ref||''});
      tx.set(us,{handle,createdAt:serverTimestamp()});
      if(iv) tx.update(iv, multi
        ? {count:(id.count||0)+1, lastBy:st.me.uid, lastAt:serverTimestamp()}
        : {used:true, usedBy:st.me.uid, usedAt:serverTimestamp()});
    });
    st.myHandle=handle; renderSeal();
    history.replaceState(null,'',urlFor(handle)); loadPage(handle);
  }catch(e){ err.textContent=e.message; }
}
$('#btn-login').onclick=()=>signInWithPopup(auth,new GoogleAuthProvider()).catch(()=>{});
$('#btn-signup').onclick=signup;

/* ---------- 시작 ---------- */
/* ---------- 문의 · 제보 ---------- */
const inqMsg=t=>{ const e=$('#inq-msg'); if(e) e.textContent=t; };
const inqDate=ts=>{ try{ return ts?.toDate?.().toLocaleDateString('ko-KR',{month:'numeric',day:'numeric'})||''; }catch(e){ return ''; } };
$('#inq-send').onclick=async()=>{
  if(!st.me||!st.myHandle){ inqMsg('로그인 후 이용할 수 있어요.'); return; }
  const body=$('#inq-body').value.trim();
  if(!body){ inqMsg('내용을 적어주세요.'); return; }
  if(body.length>1000){ inqMsg('1000자 안으로 줄여주세요.'); return; }
  inqMsg('보내는 중...');
  try{
    await addDoc(collection(db,'inquiries'),{
      by:st.me.uid, byHandle:st.myHandle, body,
      at:serverTimestamp(), status:'open', reply:'' });
    $('#inq-body').value='';
    inqMsg('보냈어요! 답변이 달리면 이 자리에 떠요.');
    renderMyInq();
  }catch(e){ inqMsg('전송 실패 — '+e.message); }
};
async function renderMyInq(){
  const box=$('#inq-list'); if(!box||!st.me) return;
  try{
    const qs=await getDocs(query(collection(db,'inquiries'),where('by','==',st.me.uid)));
    const rows=qs.docs.map(d=>({id:d.id,...d.data()}))
      .sort((a,b)=>(b.at?.seconds||0)-(a.at?.seconds||0)).slice(0,10);
    box.innerHTML = rows.map(r=>`
      <div class="inq-card">
        <div class="im">${inqDate(r.at)} · ${r.status==='done'?'✓ 답변 완료':'접수됨'}</div>
        <div class="ib">${esc(r.body)}</div>
        ${r.reply?`<div class="ir">${esc(r.reply)}</div>`:''}
      </div>`).join('');
  }catch(e){ box.innerHTML=''; }
}
/* ── 운영자 문의함 ── */
async function renderAdmInq(){
  const box=$('#adm-inq'); if(!box||st.myHandle!=='jeste') return;
  try{
    const qs=await getDocs(collection(db,'inquiries'));
    const rows=qs.docs.map(d=>({id:d.id,...d.data()}))
      .sort((a,b)=>{ const o=(a.status==='open'?0:1)-(b.status==='open'?0:1);
        return o!==0?o:(b.at?.seconds||0)-(a.at?.seconds||0); }).slice(0,30);
    const open=rows.filter(r=>r.status==='open').length;
    $('#adm-inq-n').textContent = open?('미답변 '+open):'';
    box.innerHTML = rows.length? rows.map(r=>`
      <div class="inq-card">
        <div class="im">${inqDate(r.at)} · @${esc(r.byHandle||'?')} · ${r.status==='done'?'✓ 완료':'⏳ 미답변'}</div>
        <div class="ib">${esc(r.body)}</div>
        ${r.reply?`<div class="ir">${esc(r.reply)}</div>`:''}
        <textarea data-ir="${r.id}" placeholder="답변 쓰기...">${esc(r.reply||'')}</textarea>
        <div class="p-row">
          <button class="btn" data-irs="${r.id}" style="font-size:11px">답변 저장</button>
          <button class="rmv" data-ird="${r.id}" style="font-size:11px;color:hsl(6 55% 68%)">삭제</button>
        </div>
      </div>`).join('') : '<p class="pl-empty">문의가 없어요.</p>';
    box.querySelectorAll('[data-ird]').forEach(b=>b.onclick=async()=>{
      if(!confirm('이 문의를 삭제할까요?\n삭제하면 보낸 사람 화면에서도 사라져요.')) return;
      try{ await deleteDoc(doc(db,'inquiries',b.dataset.ird)); renderAdmInq(); admInqBadge(); }
      catch(e){ alert('삭제 실패 — '+e.message); }
    });
    box.querySelectorAll('[data-irs]').forEach(b=>b.onclick=async()=>{
      const id=b.dataset.irs, t=box.querySelector(`[data-ir="${id}"]`).value.trim();
      try{
        await updateDoc(doc(db,'inquiries',id),{reply:t,status:t?'done':'open',repliedAt:serverTimestamp()});
        renderAdmInq(); admInqBadge();
      }catch(e){ alert('저장 실패 — '+e.message); }
    });
  }catch(e){ box.innerHTML='<p class="pl-empty">불러오기 실패 — 규칙을 확인해주세요.</p>'; }
}
/* ── 접속 시 미답변 배지 ── */
async function admInqBadge(){
  if(st.myHandle!=='jeste') return;
  try{
    const qs=await getDocs(query(collection(db,'inquiries'),where('status','==','open')));
    $('#btn-deco').classList.toggle('noti', qs.size>0);
    if(qs.size>0) msg('📮 미답변 문의 '+qs.size+'건 — 꾸미기 → 기본 정보 문의함에서 확인하세요.');
  }catch(e){}
}

/* ---------- 초대코드 생성 (운영자) ---------- */
const admMsg=t=>{ const e=$('#adm-msg'); if(e) e.textContent=t; };
const rnd4=()=>Math.random().toString(36).slice(2,6);
$('#adm-make').onclick=async()=>{
  if(st.myHandle!=='jeste') return;
  const pre=($('#adm-pre').value.trim().toLowerCase()||'code').replace(/[^a-z0-9-]/g,'');
  const n=Math.min(30,Math.max(1,+$('#adm-n').value||10));
  const kind=$('#adm-kind').value;
  admMsg('만드는 중...');
  try{
    const made=[];
    if(kind==='multi'){
      const c=pre+'-'+rnd4();
      await setDoc(doc(db,'invites',c),{max:n,created:serverTimestamp()});
      made.push(c+'   (최대 '+n+'명)');
    }else{
      for(let i=0;i<n;i++){
        const c=pre+'-'+rnd4();
        await setDoc(doc(db,'invites',c),{created:serverTimestamp()});
        made.push(c);
      }
    }
    $('#adm-out').value=made.join('\n');
    admMsg(made.length+'개 완료!');
  }catch(e){ admMsg('실패 — '+e.message+' (invites 규칙에 create 권한이 필요해요)'); }
};
$('#adm-copy').onclick=()=>{
  const t=$('#adm-out').value; if(!t) return;
  navigator.clipboard?.writeText(t).then(()=>admMsg('복사됨!')).catch(()=>{});
};

/* ---------- 백업 (내보내기) ---------- */
function dlFile(name, text, type){
  const b=new Blob([text],{type});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(b); a.download=name;
  document.body.appendChild(a); a.click();
  setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); },800);
}
const expStamp=()=>{ const d=new Date();
  return d.getFullYear()+String(d.getMonth()+1).padStart(2,'0')+String(d.getDate()).padStart(2,'0'); };
$('#s-exp-json').onclick=()=>{
  if(!st.mine) return;
  const data={
    exported:new Date().toISOString(), service:'lovelog', handle:st.handle,
    home:{ name:st.page.name||'', sub:st.page.sub||'' },
    posts:st.posts, gallery:st.gallery, guest:st.guest
  };
  dlFile(`lovelog-${st.handle}-backup-${expStamp()}.json`,
    JSON.stringify(data,null,2), 'application/json');
  msg('JSON 백업 저장! 글 '+st.posts.length+'편이 담겼어요.');
};
$('#s-exp-html').onclick=()=>{
  if(!st.mine) return;
  const nm=esc(st.page.name||st.handle);
  const posts=[...st.posts].sort((a,b)=>(a.ts||0)-(b.ts||0));
  const body=posts.map(p=>{
    const inner = p.secret
      ? '<p class="secret">🔒 비밀글 — 내용은 암호화되어 있어요. 원문은 JSON 백업에 담겨 있고, 홈에서 비밀번호로 열 수 있어요.</p>'
      : (p.body||'');
    return `<article>
<h2>${esc(p.title||'(제목 없음)')}</h2>
<p class="meta">${esc(p.cat||'')} · ${esc(p.date||'')}${p.secret?' · SECRET':''}</p>
<div class="body">${inner}</div>
</article>`;
  }).join('\n');
  const html=`<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${nm} — 백업 (${expStamp()})</title>
<style>
body{max-width:760px;margin:0 auto;padding:50px 20px 80px;font-family:'Noto Sans KR','Apple SD Gothic Neo',sans-serif;
  line-height:1.9;color:#2b2c33;background:#fafaf8}
header{border-bottom:2px solid #2b2c33;padding-bottom:14px;margin-bottom:40px}
h1{font-size:24px;margin:0}
header p{color:#8a8a85;font-size:13px;margin:6px 0 0}
article{border-bottom:1px solid #ddd;padding:34px 0}
h2{font-size:19px;margin:0 0 4px}
.meta{color:#8a8a85;font-size:12.5px;margin:0 0 18px}
.body img{max-width:100%;height:auto;border-radius:8px}
.secret{color:#a06030;background:#fdf6ee;padding:12px 16px;border-radius:8px;font-size:13.5px}
footer{margin-top:50px;color:#b0afaa;font-size:11px;text-align:center;letter-spacing:.2em}
</style></head><body>
<header><h1>${nm}</h1><p>luvlog.me/${esc(st.handle)} · ${posts.length}편 · ${new Date().toLocaleDateString('ko-KR')} 백업</p></header>
${body}
<footer>LOVELOG BACKUP</footer>
</body></html>`;
  dlFile(`lovelog-${st.handle}-backup-${expStamp()}.html`, html, 'text/html');
  msg('HTML 백업 저장! 글 '+posts.length+'편이 담겼어요.');
};

/* ---------- 홈 삭제 (탈퇴) ---------- */
const delMsg=t=>{ const e=$('#del-msg'); if(e) e.textContent=t; };
async function wipeCol(path){                       // 하위 컬렉션 문서 일괄 삭제
  try{
    const qs=await getDocs(collection(db,...path));
    for(const d of qs.docs) await deleteDoc(d.ref);
    return qs.size;
  }catch(e){ return 0; }
}
$('#s-del').onclick=async()=>{
  if(!st.mine||!st.handle) return;
  const typed=$('#s-del-confirm').value.trim().toLowerCase();
  if(typed!==st.handle){ delMsg('주소가 일치하지 않아요 — 내 주소를 정확히 입력해 주세요.'); return; }
  if(!confirm(`정말 「${st.handle}」 홈을 삭제할까요?\n\n글·사진·방명록이 전부 지워지고 되돌릴 수 없어요.`)) return;
  if(!confirm('마지막 확인이에요. 삭제하면 복구할 방법이 없어요. 진행할까요?')) return;
  delMsg('삭제 중... 창을 닫지 마세요.');
  try{
    const h=st.handle;
    for(const p of (st.posts||[]))                  // 글의 댓글 먼저
      await wipeCol(['pages',h,'posts',p.id,'comments']);
    await wipeCol(['pages',h,'posts']);
    await wipeCol(['pages',h,'gallery']);
    await wipeCol(['pages',h,'guest']);
    await wipeCol(['pages',h,'imgs']);
    await wipeCol(['pages',h,'stats']);
    await deleteDoc(doc(db,'pages',h));             // 홈 문서 — 주소 해제
    await deleteDoc(doc(db,'users',st.me.uid));     // 계정↔핸들 연결 해제
    alert('홈이 삭제됐어요. 그동안 함께해 주셔서 고마웠어요.');
    st.myHandle=null;
    await signOut(auth);
    location.href=location.origin+'/';
  }catch(e){ delMsg('삭제 실패 — '+e.message+' (운영자에게 알려주세요)'); }
};
onAuthStateChanged(auth,async user=>{
  st.me=user;
  const viewing=new URLSearchParams(location.search).get('u');
  if(user){ const u=await getDoc(doc(db,'users',user.uid));
    st.myHandle=u.exists()?u.data().handle:null; }
  else st.myHandle=null;
  renderSeal();
  if(viewing) loadPage(viewing);
  else if(!st.me) show('view-login');
  else if(!st.myHandle){ show('view-signup');
    getDoc(doc(db,'config','signup')).then(sc=>{
      if(!sc.exists()) return; const m=sc.data().mode||'open';
      if(m==='code'){ $('#invite-wrap').classList.remove('hidden'); $('#ref-wrap').classList.remove('hidden');
        $('#signup-err').textContent=sc.data().notice||'초대코드가 있어야 가입할 수 있어요.'; }
      if(m==='closed'){ $('#signup-err').textContent=sc.data().notice||'지금은 새 홈 만들기가 닫혀 있어요.'; }
    }).catch(()=>{});
  }
  else { history.replaceState(null,'',urlFor(st.myHandle)); loadPage(st.myHandle); }
});
