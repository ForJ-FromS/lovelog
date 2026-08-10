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
/* 다이어리 서식 — **굵게** *기울임* __밑줄__ ~~취소선~~ ==형광== */
const inlineFmt=s=>s
  .replace(/\*\*([^*]+)\*\*/g,'<b>$1</b>')          /* 줄바꿈에 걸친 굵게 허용(phase211) */
  .replace(/\*([^\n*]+)\*/g,'<i>$1</i>')             /* 기울임만 한 줄 한정 — 별표 단독 오탐 방지 */
  .replace(/__([^_]+)__/g,'<u>$1</u>')
  .replace(/~~([^~]+)~~/g,'<s>$1</s>')
  .replace(/==([^=]+)==/g,'<mark>$1</mark>');
const bodyHTML=t=>t.split(/\n{2,}/).map(p=>'<p>'+inlineFmt(esc(p)).replace(/\n/g,'<br>')+'</p>').join('');
const htmlToText=h=>String(h||'')
  .replace(/<br\s*\/?>/gi,'\n')
  .replace(/<\/p>\s*<p[^>]*>/gi,'\n\n')
  .replace(/<\/?p[^>]*>/gi,'')
  .replace(/<img[^>]*>/gi,'')
  .replace(/<[^>]+>/g,'')
  .replace(/&nbsp;/g,' ').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
  .replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&')
  .trim();
/* 글 속 <style>이 홈 전체를 물들이지 않게 — 셀렉터를 #pv-body 스코프로 */
function scopePostCSS(html){
  if(!/<style/i.test(html)) return html;
  const SC='#pv-body';
  const scopeSel=sel=>sel.split(',').map(s=>{
    s=s.trim(); if(!s) return '';
    if(/^(body|html|:root)$/i.test(s)) return SC;
    if(s==='*') return SC+' *';
    return SC+' '+s.replace(/^(body|html|:root)\s+/i,'');
  }).filter(Boolean).join(', ');
  const scopeRules=block=>block.replace(/([^{}@]+)(\{[^{}]*\})/g,
    (m,sel,body)=> scopeSel(sel)+body );
  return html.replace(/(<style[^>]*>)([\s\S]*?)(<\/style\s*>)/gi,(m,o,css,c)=>{
    let out='', pos=0, re=/@media[^{]+\{((?:[^{}]*\{[^{}]*\})*)\s*\}/g, am;
    while((am=re.exec(css))){
      out+=scopeRules(css.slice(pos,am.index));
      out+=css.slice(am.index, css.indexOf('{',am.index)+1)+scopeRules(am[1])+'}';
      pos=am.index+am[0].length;
    }
    out+=scopeRules(css.slice(pos));
    return o+out+c;
  });
}
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
  box.innerHTML = warn + (arr.length?
    `<p class="note" style="margin:0 0 4px">겹칠 때는 <b>목록 위쪽 스티커가 위에</b> 보여요 — ▲▼로 순서를 바꿔요.</p>`
    + arr.map((s,i)=>`
    <div class="stk-row"${s.off?' style="opacity:.45"':''}>
      <img src="${s.img}">
      <span style="font-size:10px;color:var(--muted)">크기</span>
      <input type="range" data-ss="${i}" min="50" max="260" value="${s.size||120}">
      <span style="font-size:10px;color:var(--muted)">📱</span>
      <input type="range" data-sms="${i}" min="40" max="260" value="${s.msz??s.size??120}" title="모바일에서의 크기 — 안 만지면 PC 크기를 따라가요">
      <span style="font-size:10px;color:var(--muted)">회전</span>
      <input type="range" data-sr="${i}" min="-45" max="45" value="${s.rot||0}">
      <button class="rmv" data-sup="${i}" title="겹칠 때 위로 올리기">▲</button>
      <button class="rmv" data-sdn="${i}" title="겹칠 때 아래로 내리기">▼</button>
      <button class="rmv" data-so="${i}" title="누르면 홈에서 ${s.off?'다시 보여요':'숨겨져요'}">${s.off?'▷ 보이기':'숨기기'}</button>
      <button class="rmv" data-sx="${i}">✕</button>
    </div>`).reverse().join('')
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
  box.querySelectorAll('[data-sup]').forEach(b=>b.onclick=async()=>{
    const i=+b.dataset.sup; const a=st.page.stickers;
    if(i>=a.length-1) return;                       // 이미 맨 위
    [a[i],a[i+1]]=[a[i+1],a[i]];                    // 배열 뒤쪽 = 화면에서 위
    await save(); renderStkList(); renderStickers();
  });
  box.querySelectorAll('[data-sdn]').forEach(b=>b.onclick=async()=>{
    const i=+b.dataset.sdn; const a=st.page.stickers;
    if(i<=0) return;                                // 이미 맨 아래
    [a[i],a[i-1]]=[a[i-1],a[i]];
    await save(); renderStkList(); renderStickers();
  });
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
  const myBtn=$('#seal-my');
  if(myBtn){
    myBtn.classList.toggle('hidden', !st.myHandle || st.handle===st.myHandle);   // 남의 홈에서만
    myBtn.onclick=()=>location.href='/'+st.myHandle;
  }
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
  st.page=snap.data(); st._mutual=undefined;
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
  checkUpdNotice(); checkMutualMemo();
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
  $('#pg-dday-main').innerHTML = (dd0 && p.ddHead!==false)
    ? `<p class="n">${esc(dday(dd0.date))}</p><p class="t">${esc(dd0.title)}</p>` : '';
  // 레이아웃 · 테마
  document.body.classList.toggle('light', !!p.light);
  document.body.classList.toggle('style-blog', homeStyle()==='blog');
  document.body.classList.remove('theme-win98','theme-vhs');
  if(p.theme && p.theme!=='default') document.body.classList.add('theme-'+p.theme);
  document.documentElement.style.setProperty('--galc', galCols());
  document.documentElement.style.setProperty('--memoc', memoCols());
  if(st.page.listTc) document.documentElement.style.setProperty('--listTc', st.page.listTc);
  else document.documentElement.style.removeProperty('--listTc');
  const MH={s:['4','116px'], m:['7','150px'], l:['11','196px']};
  const mh=MH[st.page.memoH]||MH.m;
  document.documentElement.style.setProperty('--memoLc', mh[0]);
  document.documentElement.style.setProperty('--memoMh', mh[1]);
  document.body.classList.remove('catsh-list','catsh-pill','catsh-text','catsh-box');
  document.body.classList.add('catsh-'+catShape());
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
  /* 움짤(GIF) 커서 — CSS cursor는 GIF를 첫 프레임으로 얼려버려서,
     GIF면 진짜 커서를 숨기고 마우스를 따라다니는 이미지로 전환 (PC 전용, phase201) */
  {
    const isGif = p.curImg && (/\.gif($|[?#])/i.test(p.curImg) || /^data:image\/gif/i.test(p.curImg));
    const fine = matchMedia('(pointer:fine)').matches;
    let cf = document.getElementById('cur-follow');
    if(isGif && fine){
      ccss.textContent = 'body, body *{cursor:none !important}';
      if(!cf){
        cf = document.createElement('img');
        cf.id='cur-follow'; cf.alt='';
        cf.style.cssText='position:fixed;left:0;top:0;pointer-events:none;z-index:99999;'
          +'max-width:48px;max-height:48px;opacity:0;will-change:transform';
        document.body.appendChild(cf);
        addEventListener('pointermove', e=>{
          const f=document.getElementById('cur-follow');
          if(f){ f.style.transform=`translate(${e.clientX-4}px, ${e.clientY-4}px)`; f.style.opacity='1'; }
        }, {passive:true});
        document.documentElement.addEventListener('mouseleave', ()=>{
          const f=document.getElementById('cur-follow'); if(f) f.style.opacity='0'; });
      }
      if(cf.getAttribute('src')!==p.curImg) cf.src=p.curImg;
    }else{
      if(cf) cf.remove();
      ccss.textContent = p.curImg ? `body,body *{cursor:url(${p.curImg}) 4 4, auto !important}` : '';
    }
  }
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
  $('#btn-edit').classList.toggle('hidden',!st.mine);
  if(!st.mine && st.editMode){ st.editMode=false; $('#btn-edit').classList.remove('on'); document.body.classList.remove('editmode'); }
  $('#btn-deco').classList.toggle('hidden',!st.mine);
  show('view-page');
  await loadContent();
  bumpCounter(); loadStamps();
  if(homeStyle()==='blog'){ st.cat='recent'; applyView(); }
  else { st.cat='home'; applyView(); }
  document.querySelector('.strip-sec').classList.toggle('hidden', !(galOn()&&stripOn()));
  renderWidgets(); renderCatbar(); renderList(); renderGal(); renderStickers();
  // 딥링크 — loadPage에서 보관해둔 글ID를 1회 소비
  const pm=st.deepPost; st.deepPost=null;
  if(pm){ st.cat='recent'; applyView(); renderWidgets(); renderList(); openPost(pm, true); }   // 링크 진입 글도 BACK=홈
}
async function loadContent(){
  /* 컬렉션별 격리: 예전엔 Promise.all이라 셋 중 하나만 규칙 오류가 나도
     글·갤러리·방명록이 통째로 빈 홈이 됐음(비로그인만 막히는 규칙 실수 때 특히) */
  const [ps,gs,gb]=await Promise.allSettled([
    getDocs(query(collection(db,'pages',st.handle,'posts'),orderBy('ts','desc'))),
    getDocs(query(collection(db,'pages',st.handle,'gallery'),orderBy('ts','desc'))),
    getDocs(query(collection(db,'pages',st.handle,'guest'),orderBy('ts','desc')))
  ]);
  const take=(r,name)=>{
    if(r.status==='fulfilled') return r.value.docs.map(d=>({id:d.id,...d.data()}));
    console.log('[lovelog] '+name+' 불러오기 실패 —', r.reason?.message||r.reason);
    return [];
  };
  st.posts=take(ps,'posts');
  /* 진단: 고정글의 저장된 플래그를 필터 '이전' 원본으로 출력 — 로그인/로그아웃 비교용 */
  const pins=st.posts.filter(p=>p.pinned);
  if(pins.length) console.log('[lovelog] pinned('+(st.mine?'주인':'방문자')+'):',
    pins.map(p=>({title:p.title, priv:p.priv??'(없음)', secret:p.secret??'(없음)', pinned:p.pinned, id:p.id})));
  else console.log('[lovelog] pinned: 없음 (필터 이전 기준)');
  if(!st.mine) st.posts=st.posts.filter(p=>!p.priv);   // 비공개 글은 주인에게만 존재
  st.gallery=take(gs,'gallery');
  if(!st.mine) st.gallery=st.gallery.filter(g=>!g.priv);   // 비공개 사진은 주인에게만
  st.guest=take(gb,'guest');
}

/* ---------- 사이드 위젯 렌더 ---------- */
/* 📱 단말기 세션 닫힘 — 카테고리 이동해도 유지, 새로고침하면 복귀 */
let phClosed=new Set();
function phDock(wi){
  let dk=document.getElementById('ph-dock');
  if(!dk){ dk=document.createElement('div'); dk.id='ph-dock'; document.body.appendChild(dk); }
  if(dk.querySelector(`[data-pwi="${wi}"]`)) return;
  const c=document.createElement('button'); c.className='ph-chip'; c.dataset.pwi=wi;
  c.textContent='📱'; c.title='단말기 다시 열기';
  c.onclick=()=>{ phClosed.delete(wi); renderSide(); };
  dk.appendChild(c);
}
/* 📌 플로팅 위젯 드래그 — 스티커와 같은 방식: ⠿ 편집 모드의 주인만, 위치는 위젯 데이터(fx %, fy px)에 저장 */
function bindFloatDrag(el, wi){
  if(!st.mine) return;
  el.addEventListener('pointerdown', ev=>{
    if(!st.editMode) return;                       // 평소엔 위젯 안 내용을 그대로 쓸 수 있게
    ev.preventDefault(); el.setPointerCapture(ev.pointerId);
    const layer=$('#wfl-layer'); if(!layer) return;
    const rect=layer.getBoundingClientRect(),
          ww=el.offsetWidth, wh=el.offsetHeight;
    const curX=parseFloat(el.style.left)||0, curY=parseFloat(el.style.top)||0;
    const dx=ev.clientX-(rect.left+(curX/100)*rect.width),
          dy=ev.clientY-(rect.top+curY);
    let nx=curX, ny=curY;
    const move=e2=>{
      let xp=e2.clientX-rect.left-dx,
          yp=e2.clientY-rect.top-dy;
      xp=Math.max(0, Math.min(rect.width-ww, xp));
      yp=Math.max(0, Math.min(Math.max(0,rect.height-wh), yp));
      nx=(xp/rect.width)*100; ny=yp;
      el.style.left=nx+'%'; el.style.top=ny+'px';
    };
    const up=async()=>{
      el.removeEventListener('pointermove',move);
      el.removeEventListener('pointerup',up);
      el.removeEventListener('pointercancel',up);
      const src=st.page.side && st.page.side[wi];
      if(!src) return;
      src.fx=Math.round(nx*100)/100; src.fy=Math.round(ny);
      try{ await updateDoc(doc(db,'pages',st.handle),{side:st.page.side}); }
      catch(e){ msg('위젯 위치 저장 실패 — '+e.message); }
    };
    el.addEventListener('pointermove',move);
    el.addEventListener('pointerup',up);
    el.addEventListener('pointercancel',up);
  });
}
function cats(){ return st.page.cats||['archive','ooc']; }
function gcats(){ return st.page.gcats||[]; }
const isG=c=>gcats().includes(c);
function mcats(){ return st.page.mcats||[]; }
const isMemo=c=>mcats().includes(c);
function navSeq(){                                   // 상단 탭 순서(카테고리+갤러리+방명록, phase217)
  const base=[...cats(),'__gal','__gb'];
  let s=Array.isArray(st.page.navSeq)?st.page.navSeq.filter(x=>base.includes(x)):[];
  base.forEach(x=>{ if(!s.includes(x)) s.push(x); });
  return s;
}
function sideCfg(){
  let s;
  if(st.page.side && st.page.side.length){
    s=st.page.side;
    if(!Array.isArray(st.page.side) && !st.page.noLatest) // 위젯을 한 번도 저장한 적 없는 홈에만 최신글 자동 편입(phase234)
      s=[{t:'latest'}, ...s];                              // 저장 이력이 있는 홈은 위젯 목록이 진실 — 지운 최신글 부활 금지
  }else{
    s=[{t:'latest'},{t:'search'},{t:'category'}];
    if(st.page.ddays&&st.page.ddays.length) s.push({t:'dday'});
    if(ytId(st.page.bgm?.url)) s.push({t:'bgm'});
  }
  return s.map(w=>({col:DEFCOL[w.t]||'r', ...w}));
}
/* 홈 중앙 붙박이: 고정글 + 최신글 */
const openFromHome=id=>{                          // ALL이 꺼진 홈은 그 글의 카테고리 게시판으로(phase237)
  const p=st.posts.find(x=>x.id===id);
  goBoard(st.page.allOff && p ? p.cat : 'recent');
  openPost(id,true);
};
function pinCard(){                              // 고정글 카드 — 단독 위젯·최신글 동거 겸용(phase236)
  const pin=st.posts.find(p=>p.pinned); if(!pin) return null;
  const pd=document.createElement('a'); pd.className='pin';
  pd.innerHTML=`<span class="tag">◈ PINNED</span>
    <p class="t">${esc(pin.title)}${pin.secret?' 🔒':''}${pin.priv?' 🔏':''}</p>
    ${pin.excerpt?`<p class="ex">${esc(pin.excerpt)}</p>`:''}
    <p class="meta">${esc(pin.cat)} · ${esc(pin.date)}</p>`;
  pd.onclick=()=>openFromHome(pin.id);
  return pd;
}
function latestBlock(box, n, withPin=true){
  if(withPin){ const pc=pinCard(); if(pc) box.appendChild(pc); }
  const d=document.createElement('div'); d.className='side sw-latest';
  const arr=st.posts.filter(p=>!p.pinned).slice(0, +n>0?Math.min(+n,20):5);
  d.innerHTML=`<p class="label">LATEST</p><div class="mini-rows">`+
    (arr.length?arr.map(p2=>`<a data-lid="${p2.id}">
      <span class="dot">◈</span><span class="t">${esc(p2.title)}${p2.secret?' 🔒':''}${p2.priv?' 🔏':''}</span>
      <span class="dt">${esc((p2.date||'').slice(5))}</span></a>`).join('')
    :'<p class="pl-empty">아직 글이 없습니다.</p>')+
    `</div>${st.page.allOff?'':'<p class="cat-add" style="display:block" id="latest-more">전체 보기 →</p>'}`;
  box.appendChild(d);
  d.querySelectorAll('[data-lid]').forEach(el=>el.onclick=()=>{
    openFromHome(el.dataset.lid); });
  const lm=d.querySelector('#latest-more');                       // allOff면 링크가 없음(phase200 널 가드)
  if(lm) lm.onclick=()=>goBoard('recent');
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
const homeNm=()=>st.page?.homeName||'HOME';
const WNAME={latest:'최신글',pin:'📌 고정글',notice:'공지',chat:'채팅로그',phone:'단말기',tl:'타임라인',feat:'★ 대표글',img:'이미지',nb:'이웃 홈',profile:'프로필',search:'검색',category:'카테고리',
  dday:'디데이',bgm:'BGM',quote:'인용구',links:'링크',banner:'배너칸',text:'글',cnt:'방문자수',stamp:'발도장'};
const STAMP_LEGACY=['heart','paw','star','drop'];   // 옛 슬롯 이름 — 카운트 승계용
function parseEmo(s){
  const raw=(s||'').replace(/\s+/g,'');
  if(!raw) return ['🐾'];
  let arr;
  try{ arr=[...new Intl.Segmenter('ko',{granularity:'grapheme'}).segment(raw)].map(x=>x.segment); }
  catch(e){ arr=[...raw]; }
  return arr.slice(0,4);
}
function fillStamps(){
  const s=st.stamps||{};
  for(let i=0;i<4;i++){
    const v=s['s'+i] ?? s[STAMP_LEGACY[i]] ?? 0;
    document.querySelectorAll(`[data-sc="s${i}"]`).forEach(el=>el.textContent=v);
  }
}
async function loadStamps(){
  if(!sideCfg().some(w=>w.t==='stamp')){ console.log('[lovelog] stamps: 위젯 없음, 로드 생략'); return; }
  try{
    const sn=await getDoc(doc(db,'pages',st.handle,'stats','stamps'));
    console.log('[lovelog] stamps 로드:', 'handle='+st.handle, 'exists='+sn.exists(), sn.data());
    st.stamps=sn.data()||{};
  }
  catch(e){ st.stamps={};
    console.warn('[lovelog] stamps 로드 실패:', e.code||e.message, e);
    if(st.mine) msg('⚠ 발도장 불러오기 실패 — '+(e.code||e.message)); }
  fillStamps();
}
async function hitStamp(k,btn){
  const key='lvstamp-'+st.handle+'-'+today();
  if(localStorage.getItem(key)){ msg('오늘은 이미 발도장을 찍었어요 — 내일 또 찍어주세요! 🐾'); return; }
  try{
    const ref=doc(db,'pages',st.handle,'stats','stamps');
    st.stamps=await runTransaction(db,async tx=>{
      const cur=(await tx.get(ref)).data()||{};
      const li=STAMP_LEGACY[+k.slice(1)];               // s0→heart … 옛 카운트 승계
      const base=(cur[k] ?? cur[li] ?? 0);
      const upd={...cur,[k]:base+1};
      if(li in upd && k!==li) delete upd[li];
      tx.set(ref,upd); return upd;
    });
    localStorage.setItem(key,k);
    fillStamps();
    if(btn){ btn.classList.add('pop'); setTimeout(()=>btn.classList.remove('pop'),500); }
    msg('발도장 찍었어요! 고마워요 💗 (서버 저장: '+(st.stamps[k]||0)+')');
  }catch(e){ console.warn('[lovelog] 발도장 실패:', e.code||e.message, e); msg('발도장 실패 — '+(e.code||e.message)); }
}
async function bumpCounter(){
  if(!sideCfg().some(w=>w.t==='cnt')) return;
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
      console.log('[lovelog] counter 커밋:', 'handle='+st.handle, c);
      sessionStorage.setItem(key,'1');
    }catch(e){
      console.warn('[lovelog] 방문자수 기록 실패:', e.code||e.message, e);
      try{ c=(await getDoc(ref)).data()||{}; }catch(e2){}
      if(st.mine) msg('⚠ 방문자수 기록 실패 — '+(e.code||e.message)+' (규칙의 stats 부분을 확인해주세요)');
    }
  }else{
    try{ const sn=await getDoc(ref);
      console.log('[lovelog] counter 로드:', 'exists='+sn.exists(), sn.data());
      c=sn.data()||{}; }
    catch(e){ console.warn('[lovelog] counter 로드 실패:', e.code||e.message, e);
      if(st.mine) msg('⚠ 방문자수 불러오기 실패 — '+(e.code||e.message)); }
  }
  st.cnt=c; fillCounter();
}
function fillCounter(){
  const a=$('#cnt-today'), b=$('#cnt-total'); if(!a||!b) return;
  const c=st.cnt||{}, t=today();
  a.textContent = c.day===t ? (c.today||0) : 0;
  b.textContent = c.total||0;
}
const DEFCOL={search:'l',category:'l',profile:'l',latest:'c',tl:'r',feat:'r',quote:'c',notice:'c',chat:'c',phone:'c',img:'l',nb:'r',
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
function goBoard(cat){
  if(cat==='__gb' && st.page.gbOff){ msg('방명록이 잠시 닫혀 있어요.'); return; }
  if(cat==='recent' && st.page.allOff){ msg('전체 글 보기가 꺼져 있어요.'); return; }
  st.cat=cat||'recent'; st.pg=1; applyView(); renderWidgets(); renderList(); backToList(); renderCatbar(); }
function catStyle(){
  return st.page.catStyle || (st.page.catBar===false ? 'widget' : 'bar');
}
function catShape(){ return st.page.catShape || 'list'; }
function galCols(){ const n=+st.page.galCols; return (n>=1&&n<=4)?n:3; }
function memoCols(){ const n=+st.page.memoCols; return (n>=2&&n<=4)?n:3; }
function mpinMax(){ const n=+st.page.mpinMax; return (n>=1&&n<=6)?n:3; }
function renderCatbar(){
  const bar=$('#catbar');
  if(catStyle()!=='bar'){ bar.classList.add('hidden'); return; }   // 블로그형에서도 '상단 알약 바' 선택 존중
  bar.classList.remove('hidden');
  const homeOn = homeStyle()==='blog' ? st.cat==='recent' : st.cat==='home';
  const ci=st.page.catImgs||{};
  const pill=(key,label,on)=> ci[key]
    ? `<a data-c="${esc(key)}" class="pillimg ${on?'on':''}"><img src="${ci[key]}" alt="${esc(label)}" draggable="false"></a>`
    : `<a data-c="${esc(key)}" class="${on?'on':''}">${esc(label)}</a>`;
  bar.innerHTML = pill('home',homeNm(),homeOn)+
    navSeq().map(t=> t==='__gal' ? (galOn()?pill('__gal',galNm(),st.cat==='__gal'):'')
      : t==='__gb' ? (st.page.gbOff?'' : pill('__gb',gbNm(),st.cat==='__gb'))
      : pill(t,t.toUpperCase(),st.cat===t)).join('')+
    (homeStyle()==='blog'||st.page.allOff?'':pill('recent','ALL',st.cat==='recent'));
  bar.querySelectorAll('a').forEach(el=>el.onclick=()=>{
    el.dataset.c==='home' ? goHome() : goBoard(el.dataset.c);
  });
  const gh=$('#go-home'), gh2=$('#gb-home');                      // 게시판 '‹ HOME' 백링크도 이름 추종
  if(gh) gh.textContent='‹ '+homeNm();
  if(gh2) gh2.textContent='‹ '+homeNm();
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
  if(!st.mine || !st.editMode) return;
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
function linkedSetOf(page){
  const out=new Set();
  ((page&&page.side)||[]).forEach(w=>{
    if(w.t==='banner') (w.items||[]).forEach(b=>{ const h=((b&&b.h)||'').trim().toLowerCase(); if(h) out.add(h); });
    if(w.t==='nb') (w.items||[]).forEach(x=>{ const h=nbH(x); if(h) out.add(h); });
  });
  return out;
}
async function ensureMutual(){
  if(st.mine) return true;
  if(!st.me || !st.myHandle) return false;
  if(st._mutual!==undefined) return st._mutual;
  try{
    if(!linkedSetOf(st.page).has(st.myHandle)) return st._mutual=false;   // 이 홈이 나를 걸었나
    const my=(await getDoc(doc(db,'pages',st.myHandle))).data()||{};
    st._mutual=linkedSetOf(my).has(st.handle);                            // 나도 이 홈을 걸었나
  }catch(e){ st._mutual=false; }
  return st._mutual;
}
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
      nbs:[...linkedSetOf(dd)]} : null;   // 이웃+배너 어디에 걸었든 '서로' 판정(♥)
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
  const headEl=document.querySelector('#aside .head, #aside-l .head, .hcol .head');   // 홈 기둥으로 옮겨간 헤더도 추적
  boxR.innerHTML=''; boxL.innerHTML='';
  hL.innerHTML=''; hC.innerHTML=''; hR.innerHTML='';
  if(headEl){
    const headBox = home
      ? (p.sidePos==='right' ? hR : hL)     // 홈에서는 홈 그리드 기둥에 (실종 버그 수정)
      : (both?boxL:boxR);
    headBox.appendChild(headEl);
  }
  // 최신글은 이제 항상 위젯으로 존재(sideCfg 자동 편입) — 붙박이 폴백 제거(phase198)
  const isM = window.innerWidth<=640;
  const wide = window.innerWidth>960;                       // 플로팅 위젯은 넓은 화면에서만
  const pdk=document.getElementById('ph-dock'); if(pdk) pdk.innerHTML='';
  const wfl = $('#wfl-layer');
  if(wfl){ wfl.innerHTML='';
    /* 레이어를 .wrap 폭이 아니라 화면 전체 폭으로 — 위젯을 양옆 여백까지 끌 수 있게
       (스크롤바 제외 폭 기준이라 가로 스크롤 안 생김) */
    const off=Math.max(0,(document.documentElement.clientWidth - wfl.parentElement.clientWidth)/2);
    wfl.style.left=(-off)+'px'; wfl.style.right=(-off)+'px'; }
  const mOrd=(w,i)=>w.mo ?? (({c:0,l:1,r:2}[w.col||'r']||2)*100+i);
  let seq = sideCfg().map((w,wi)=>({w,wi}));
  if(home && isM) seq=seq.sort((A,B)=>mOrd(A.w,A.wi)-mOrd(B.w,B.wi));
  seq.forEach(({w,wi})=>{
    const pos = p.sidePos==='left'?'l' : p.sidePos==='both'?'b' : 'r';
    let box = (home && isM) ? hC
      : home
      ? (pos==='b' ? (w.col==='l'?hL : w.col==='c'?hC : hR)
        : pos==='l' ? (w.col==='c'?hC : hL)
        : (w.col==='c'?hC : hR))
      : ((both && w.col==='l') ? boxL : boxR);
    /* 📌 띄운 위젯: 컬럼 대신 플로팅 레이어에 (PC 전용, 좁으면 원래 자리로 자동 복귀) */
    let flw=null;
    if(w.float && wide && wfl && w.t!=='latest'){
      flw=document.createElement('div'); flw.className='wfl';
      flw.style.left=(w.fx??62)+'%'; flw.style.top=(w.fy??160)+'px';
      if(+w.wd>0) flw.style.width=(+w.wd)+'px';        // 위젯별 가로 폭 (단말기 등)
      wfl.appendChild(flw); box=flw;
      bindFloatDrag(flw, wi);
    }
    if(w.t==='pin'){
      if(!home) return;
      const el=pinCard(); if(!el) return;          // 고정글이 없으면 자리도 없음
      el.dataset.wi=wi; bindDrag(el);
      box.appendChild(el);
      return;
    }
    if(w.t==='latest'){
      if(!home) return;
      const el=latestBlock(box, w.n, w.noPin!==true);
      el.dataset.wi=wi; bindDrag(el);
      return;
    }
    const d=document.createElement('div'); d.className='side sw-'+w.t;
    d.dataset.wi=wi; if(!flw) bindDrag(d);   // 띄운 위젯은 컬럼 순서 드래그 대상이 아님
    if(w.t==='search'){
      d.innerHTML=`<p class="label">SEARCH</p>
        <div class="s-search">⌕ <input id="q" placeholder="search"></div>`;
      box.appendChild(d);
      d.querySelector('#q').addEventListener('input',e=>{
        st.q=e.target.value.trim().toLowerCase(); st.pg=1; renderList(); });
      return;
    }
    if(w.t==='category'){
      if(catStyle()==='bar') return;   // 알약 바 모드에선 사이드 카테고리 숨김
      const cnt=c=> isG(c) ? st.gallery.filter(x=>x.cat===c).length
                           : st.posts.filter(x=>x.cat===c).length;
      d.innerHTML=`<p class="label">CATEGORY</p><ul id="cats">`+
        cats().map(c=>`<li><a data-c="${esc(c)}" class="${st.cat===c?'on':''}">
          <span>${esc(c)}</span>
          <span class="n">${cnt(c)}</span></a></li>`).join('')+
        (galOn()?`<li><a data-c="__gal" class="${st.cat==='__gal'?'on':''}"><span>${esc(galNm())}</span><span class="n">${st.gallery.length}</span></a></li>`:'')+
        (st.page.gbOff?'':`<li><a data-c="__gb" class="${st.cat==='__gb'?'on':''}"><span>${esc(gbNm())}</span><span class="n">${st.guest.length}</span></a></li>`)+
        (st.page.allOff?'</ul>':`<li><a data-c="recent" class="${st.cat==='recent'?'on':''}"><span>전체</span><span class="n">${st.posts.length}</span></a></li></ul>`);
      box.appendChild(d);
      d.querySelectorAll('#cats a').forEach(el=>el.onclick=()=>goBoard(el.dataset.c));
      return;
    }
    if(w.t==='dday'){
      if(w.off) return;                             // 카드 숨김(헤더만 모드)
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
      const bst=w.style||'';                        // ''기본 | cst 카세트 | lp LP | tun 튜너
      const btit=esc(p.bgm.title|| (list?'플레이리스트':'배경음악'));
      {const lum=hx=>{ try{ const n=parseInt(hx.slice(1),16);
        return (((n>>16)&255)*.299+((n>>8)&255)*.587+(n&255)*.114)/255; }catch(e){ return .2; } };
      const sv=[];
      if(w.bg) sv.push(`--bgmBg:${w.bg}`);
      const tc=w.tc || (w.bg ? (lum(w.bg)>.62?'#2a2c33':'#eef0f6') : '');
      if(tc) sv.push(`--bgmTx:${tc}`);
      if(w.ac) sv.push(`--bgmAc:${w.ac}`);
      if(sv.length) d.setAttribute('style', sv.join(';')); }
      if(bst==='cst'){
        d.className+=' bgm-cst';
        d.innerHTML=`<p class="label">NOW PLAYING</p>
          <div class="cst-body">
            <span class="cst-scr s1"></span><span class="cst-scr s2"></span><span class="cst-scr s3"></span><span class="cst-scr s4"></span>
            <div class="cst-lbl"><span>${esc(w.sub||'SIDE A')}</span><b>${btit}</b></div>
            <div class="cst-win"><span class="cst-reel"></span><span class="cst-reel rr"></span></div>
            <div class="cst-foot"><span>STEREO · TAPE</span><span class="bgm-btn2">▶</span></div>
          </div><div class="bgm-fr"></div>`;
      }else if(bst==='lp'){
        d.className+=' bgm-lp';
        d.innerHTML=`<p class="label">NOW PLAYING</p>
          <div class="lp-row">
            <span class="lp-wrap"><span class="lp-disc">${cover}</span><span class="lp-arm"></span></span>
            <span class="lp-meta"><b>${btit}</b><span>${esc(w.sub||'33⅓ RPM · SIDE A')}</span></span>
            <span class="bgm-btn2">▶</span>
          </div><div class="bgm-fr"></div>`;
      }else if(bst==='tun'){
        d.className+=' bgm-tun';
        d.innerHTML=`<p class="label">NOW PLAYING</p>
          <div class="tun-body">
            <div class="tun-band"><i></i></div>
            <div class="tun-nums"><span>88</span><span>90</span><span>92</span><span>96</span><span>102</span><span>108</span></div>
            <div class="tun-row">
              <span class="tun-meta"><b>${btit}</b><span>${esc(w.sub||'FM 88.1 · STEREO')}</span></span>
              <span class="bgm-btn2">▶</span>
            </div>
          </div><div class="bgm-fr"></div>`;
      }else{
        d.innerHTML=`<p class="label">NOW PLAYING</p>
          <div class="bgm-w">
            <span class="bgm-cov">${cover}</span>
            <span class="bgm-meta"><b>${btit}</b>
              <span class="bgm-eq"><i></i><i></i><i></i><i></i><i></i></span></span>
            <span class="bgm-btn2">▶</span>
          </div><div class="bgm-fr"></div>`;
      }
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
      if(!hs.length){ if(st.mine){ d.innerHTML=`<p class="label">${esc(w.label||'NEIGHBORS')}</p><p class="pl-empty">✎ 편집에서 이웃 주소를 추가하세요.</p><p class="pl-ghost">👻 지금은 방문자에게 안 보이는 카드예요</p>`; box.appendChild(d); } return; }
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
      if(!w.img){ if(st.mine){ d.innerHTML=`<p class="label">${esc(w.label||'IMAGE')}</p><p class="pl-empty">✎ 편집에서 사진을 올려주세요.</p><p class="pl-ghost">👻 지금은 방문자에게 안 보이는 카드예요</p>`; box.appendChild(d); } return; }
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
      if(w.anim){
        const akey='c'+wi, done=(window.__animDone??=new Set()).has(akey);
        if(done && !w.loop){ /* 이번 세션에 이미 재생 — 완성 상태로 정적 표시(복귀 시 재재생·크기 출렁임 방지) */ }
        else{ d.className+=' ch-anim'; d.dataset.akey=akey;
          if(done) d.dataset.warm='1';
          if(w.loop) d.dataset.loop='1'; if(w.loop&&w.fold) d.dataset.fold='1'; chatObserve(d); } }   // 과거 값(true/'up'/'pop') 전부 제자리 효과로
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
      if(sv.length) d.setAttribute('style', sv.join(';'));   // ⚠ 색 변수는 여기서 통째로 씌우므로, --chMax는 반드시 이 다음에
      if(+w.maxH>0){ d.className+=' ch-scroll'; d.style.setProperty('--chMax', (+w.maxH)+'px'); }
      d.innerHTML=`<p class="label">CHAT</p>`+(ls.length?`<div class="ch-box">`+ls.map((l,li)=>`
        <div class="ch-line ${l.side==='r'?'r':'l'}">
          ${imgs&&l.img?`<img class="ch-p" src="${l.img}" alt="" draggable="false">`:''}
          <div class="ch-b">${l.name?`<span class="ch-n">${esc(l.name)}</span>`:''}<p>${esc(l.text)}</p></div>
        </div>`).join('')+`</div>`
        :'<p class="pl-empty">✎ 편집에서 대사를 추가해주세요.</p><p class="pl-ghost">👻 지금은 방문자에게 안 보이는 카드예요</p>');
      box.appendChild(d);
      /* 움짤 자리 예약: 재생 전에 '다 떴을 때 실제 높이'만큼 min-height 확보 —
         ① 높이제한 있으면 min(내용, maxH)만 (빈 공간이 아래 위젯 자리를 먹던 버그)
         ② 높이제한 없어도 예약 (카드가 작게 시작해 메시지 뜰 때마다 자라던 버그)
         클래스 떼고 측정 후 같은 프레임에 복원하므로 깜빡임 없음 */
      if(w.anim && d.classList.contains('ch-anim')){ const cb=d.querySelector('.ch-box');
        if(cb){ d.classList.remove('ch-anim');
          const need=+w.maxH>0 ? Math.min(cb.scrollHeight, +w.maxH) : cb.scrollHeight;
          d.classList.add('ch-anim'); if(need>0) cb.style.minHeight=need+'px'; } }
      return;
    }
    if(w.t==='tl'){
      const its=(w.items||[]).filter(i=>i.t||i.d||i.tt);
      if(!its.length && !st.mine) return;
      const stl=w.style||'line';                     // line(라인·점) | card(마디 카드) | bare(담백)
      d.className+=' w-tl tl-'+stl;
      if(w.anim){
        const akey='tl'+wi, done=(window.__animDone??=new Set()).has(akey);
        if(done && !w.loop){ /* 세션 1회 재생 — 복귀 시 완성 상태 즉시 */ }
        else{ d.className+=' ch-anim'; d.dataset.akey=akey;
          if(done) d.dataset.warm='1';
          if(w.loop) d.dataset.loop='1'; if(w.loop&&w.fold) d.dataset.fold='1'; chatObserve(d); } }
      if(+w.maxH>0){ d.className+=' ch-scroll'; d.style.setProperty('--chMax',(+w.maxH)+'px'); }
      d.innerHTML=`<p class="label">${esc(w.title||'TIMELINE')}</p>
        <div class="ch-box tl-box">`+
        (its.length?its.map(i=>`<div class="ch-line tl-i">
          <span class="tl-dot${w.dot?' cdot':''}">${esc(w.dot||'')}</span>
          <span class="tl-bd">${i.d?`<i class="tl-d">${esc(i.d)}</i>`:''}${i.tt?`<b class="tl-tt">${esc(i.tt)}</b>`:''}${i.t?`<p class="tl-t">${esc(i.t).replace(/\n/g,'<br>')}</p>`:''}</span>
        </div>`).join('')
        :(st.mine?('<p class="pl-empty">✎ 편집에서 항목을 채워주세요.</p>'+(!w.title?'<p class="pl-ghost">👻 지금은 방문자에게 안 보이는 카드예요</p>':'')):''))+
        `</div>`;
      box.appendChild(d);
      if(w.anim && d.classList.contains('ch-anim')){ const cb=d.querySelector('.ch-box');   // 자리 예약 — 부착 후 측정(분리 상태=0 버그 수정, phase205)
        if(cb){ d.classList.remove('ch-anim');
          const need=+w.maxH>0 ? Math.min(cb.scrollHeight, +w.maxH) : cb.scrollHeight;
          d.classList.add('ch-anim'); if(need>0) cb.style.minHeight=need+'px'; } }
      return;
    }
    if(w.t==='feat'){
      const arr=st.posts.filter(p2=>p2.feat).slice(0, +w.n>0?Math.min(+w.n,20):5);
      if(!arr.length && !st.mine) return;
      d.innerHTML=`<p class="label">${esc(w.title||'FEATURED')}</p><div class="mini-rows">`+
        (arr.length?arr.map(p2=>`<a data-fid="${p2.id}">
          <span class="dot">${esc(w.icon||'★')}</span><span class="t">${esc(p2.title)}${p2.secret?' 🔒':''}${p2.priv?' 🔏':''}</span>
          <span class="dt">${esc((p2.date||'').slice(5))}</span></a>`).join('')
        :(st.mine?('<p class="pl-empty">글쓰기 화면에서 ★ 대표글을 체크하면 여기에 모여요.</p>'+(!w.title?'<p class="pl-ghost">👻 지금은 방문자에게 안 보이는 카드예요</p>':'')):''))+`</div>`;
      box.appendChild(d);
      d.querySelectorAll('[data-fid]').forEach(el=>el.onclick=()=>{
        const pp=st.posts.find(x=>x.id===el.dataset.fid);
        goBoard(pp&&pp.cat?pp.cat:(cats()[0]||'archive')); openPost(el.dataset.fid,true); });
      return;
    }
    if(w.t==='phone'){
      if(phClosed.has(wi)){ phDock(wi); return; }   // 세션 동안 닫힘 유지 → 우하단 칩
      const ls=(w.lines||[]).filter(l=>l.text||l.app);
      if(!ls.length && !st.mine) return;
      const stl=w.style||'oled';                      // oled(미니멀) | glass(글래스) | term(관제 단말)
      d.className+=' w-phone ph-'+stl;
      if(w.anim){
        const akey='p'+wi, done=(window.__animDone??=new Set()).has(akey);
        if(done && !w.loop){ /* 세션 1회 재생 — 복귀 시 완성 상태 즉시 */ }
        else{ d.className+=' ch-anim'; d.dataset.akey=akey;
          if(done) d.dataset.warm='1';
          if(w.loop) d.dataset.loop='1'; if(w.loop&&w.fold) d.dataset.fold='1'; chatObserve(d); } }
      const lum=hx=>{ try{ const n=parseInt(hx.slice(1),16);
        return (((n>>16)&255)*.299+((n>>8)&255)*.587+(n&255)*.114)/255; }catch(e){ return .2; } };
      const sv=[];
      if(w.bg) sv.push(`--phBg:${w.bg}`);
      const tc=w.tc || (w.bg ? (lum(w.bg)>.62?'#23252d':'#eef0f6') : '');
      if(tc) sv.push(`--phTx:${tc}`);
      if(w.ac) sv.push(`--phAc:${w.ac}`);
      if(w.csc) sv.push(`--phCs:${w.csc}`);
      if(w.cs==='solid') d.className+=' ph-solidcase';
      if(sv.length) d.setAttribute('style', sv.join(';'));   // ⚠ --chMax는 반드시 이 다음(phase167 교훈)
      if(+w.maxH>0){ d.className+=' ch-scroll'; d.style.setProperty('--chMax',(+w.maxH)+'px'); }
      const now=new Date(),
            hh=String(now.getHours()).padStart(2,'0'), mi=String(now.getMinutes()).padStart(2,'0'),
            ss=String(now.getSeconds()).padStart(2,'0'),
            days=['일','월','화','수','목','금','토'],
            dt=(now.getMonth()+1)+'월 '+now.getDate()+'일 '+days[now.getDay()]+'요일';
      const head = stl==='win'
        ? `<div class="ph-wtop"><span class="l">${esc(w.hd||'NOTICE.EXE')}</span><span class="r"><i>─</i><i>□</i><i class="phw-x" title="단말기 닫기">✕</i></span></div>
           <div class="ph-meta"><span>${esc(w.sub||'INCOMING MESSAGE')}</span>${w.clk===false?'':`<b>${hh}:${mi}:${ss}</b>`}</div>`
        : stl==='term'
        ? `<div class="ph-top"><span class="l">${esc(w.hd||'SECURE LINE')}</span><span class="r">${esc(w.hd2||'CH-07')}</span></div>
           <div class="ph-meta"><span>${esc(w.sub||'INCOMING TRANSMISSION')}</span>${w.clk===false?'':`<b>${hh}:${mi}:${ss}</b>`}</div>`
        : (stl==='oled' ? `<div class="ph-isl"></div>` : `<div class="ph-bar"><span>${hh}:${mi}</span><span>ıllı&nbsp; ᯤ&nbsp; ▮▮▯</span></div>`)
          +(w.clk===false?'':`<div class="ph-clock"><b>${hh}:${mi}</b><span>${dt}</span></div>`);
      const noti = l=>`
        <div class="ch-line ph-n">
          ${stl!=='term'&&l.icon?`<span class="ph-ic2">${esc(l.icon)}</span>`:''}
          <div class="ph-bd">
            <span class="ph-app"><span>${stl==='term'?'[ ':''}${stl==='term'&&l.icon?esc(l.icon)+' ':''}${esc(l.app||'알림')}${stl==='term'?' ]':''}</span>${l.time?`<i>${esc(l.time)}</i>`:''}</span>
            ${l.text?`<p class="ph-t">${esc(l.text)}</p>`:''}
          </div>
        </div>`;
      d.innerHTML=(w.label?`<p class="label">${esc(w.label)}</p>`:'')+
        `<div class="ph-frame"><button class="ph-x" title="단말기 닫기 — 새로고침하면 다시 떠요">✕</button>`+head+
        (ls.length?`<div class="ch-box ph-list">`+ls.map(noti).join('')+`</div>`
          :'<p class="pl-empty">✎ 편집에서 알림을 추가해주세요.</p><p class="pl-ghost">👻 지금은 방문자에게 안 보이는 카드예요</p>')+
        (stl==='term'?`<div class="ph-foot">END OF FEED ─────────</div>`:'')+
        `</div>`;
      box.appendChild(d);
      const phx=d.querySelector('.ph-x');
      if(phx) phx.onclick=()=>{                                   // 세션 한정 닫기 — 새로고침하면 복귀
        phClosed.add(wi);
        const t=d.parentElement&&d.parentElement.classList.contains('wfl')?d.parentElement:d;
        t.remove(); phDock(wi); };
      const pwx=d.querySelector('.phw-x');
      if(pwx&&phx) pwx.onclick=()=>phx.onclick();                 // 98 타이틀바 ✕ = 같은 닫기(phase228)
      if(w.anim && d.classList.contains('ch-anim')){ const cb=d.querySelector('.ch-box');   // 자리 예약(phase168)
        if(cb){ d.classList.remove('ch-anim');
          const need=+w.maxH>0 ? Math.min(cb.scrollHeight, +w.maxH) : cb.scrollHeight;
          d.classList.add('ch-anim'); if(need>0) cb.style.minHeight=need+'px'; } }
      return;
    }
    if(w.t==='text'){
      if(!w.title && !w.text && !st.mine) return;
      d.className+=' w-text';
      d.innerHTML=`<p class="label">${esc(w.title||'TEXT')}</p>`+
        (w.text?`<p class="tx-x">${esc(w.text).replace(/\n/g,'<br>')}</p>`
          :(st.mine?('<p class="pl-empty">✎ 편집에서 내용을 채워주세요.</p>'+(!w.title?'<p class="pl-ghost">👻 지금은 방문자에게 안 보이는 카드예요</p>':'')):''));
      if(w.anim && (w.text||'').trim()){ const tx=d.querySelector('.tx-x'); if(tx) typeObserve(tx, w.text); }   // ✨ 타이핑 (인용구와 동일 엔진)
      box.appendChild(d); return;
    }
    if(w.t==='cnt'){
      d.className+=' w-cnt';
      d.innerHTML=`<p class="label">COUNT</p>
        <div class="cnt-row"><span>TODAY <b id="cnt-today">–</b></span><span>TOTAL <b id="cnt-total">–</b></span></div>`;
      box.appendChild(d); fillCounter(); return;
    }
    if(w.t==='stamp'){
      d.className+=' w-stamp';
      const emos=parseEmo(w.icons);
      const sbg = w.sbg==='none' ? 'background:transparent'
        : w.sbg==='custom' ? `background:color-mix(in srgb, ${/^#[0-9a-fA-F]{3,8}$/.test(w.sbgc||'')?w.sbgc:'#9db8ff'} ${Math.min(100,Math.max(4,+w.sbga||12))}%, transparent)`
        : '';
      d.innerHTML=`<p class="label">${esc(w.title||'STAMP')}</p>
        ${w.hint===false?'':'<p class="stamp-hint">발도장 꾹 — 하루에 하나!</p>'}
        <div class="stamp-row${emos.length===1?' one':''}">
          ${emos.map((e2,i)=>`
            <button class="stamp-b" data-stamp="s${i}" style="${sbg}">
              <span class="si">${e2}</span>
              <b data-sc="s${i}">–</b>
            </button>`).join('')}
        </div>`;
      box.appendChild(d);
      d.querySelectorAll('[data-stamp]').forEach(b=>b.onclick=()=>hitStamp(b.dataset.stamp,b));
      fillStamps(); return;
    }
    if(w.t==='notice'){
      if(!w.title && !w.text && !st.mine) return;
      d.className+=' w-notice';
      d.innerHTML=`<p class="label">NOTICE</p>
        ${w.title?`<p class="nt-t">${esc(w.title)}</p>`:''}
        ${w.text?`<p class="nt-x">${esc(w.text).replace(/\n/g,'<br>')}</p>`
          :(!w.title&&st.mine?'<p class="pl-empty">✎ 편집에서 내용을 채워주세요.</p><p class="pl-ghost">👻 지금은 방문자에게 안 보이는 카드예요</p>':'')}`;
      box.appendChild(d); return;
    }
    if(w.t==='quote'){
      d.className+=' w-quote';
      d.innerHTML=`${w.noQm?'':'<span class="qm">❝</span>'}<p>${esc(w.text||'').replace(/\n/g,'<br>')}</p>`;
      if(w.anim && (w.text||'').trim()) typeObserve(d.querySelector('p'), w.text);
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
  const blogEdit = st.mine && st.editMode && homeStyle()==='blog';
  if((home || blogEdit) && st.mine && st.editMode){
    const pcMove=async(wi,dir)=>{
      const arr=JSON.parse(JSON.stringify(sideCfg()));
      const w0=arr[wi]; if(!w0) return;
      const colOf = blogEdit
        ? (x=> (both && (x.col||DEFCOL[x.t]||'r')==='l') ? 'l' : 'r')   // 사이드 화면 컬럼 기준
        : (x=> x.col||DEFCOL[x.t]||'r');
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
    const cols = blogEdit ? [boxL,boxR] : (isM ? [hC] : [hL,hC,hR]);
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
      ${g.secret
        ? ((st.mine||g.uid===st.me?.uid)
            ? `<p>${esc(g.text)}${st.mine?'<span class="gb-badge">🔒 비공개</span>':'<span class="gb-badge">🔒 내 글</span>'}</p>`
            : `<p class="gb-lock">🔒 주인에게만 남긴 비공개 방명록이에요.</p>`)
        : `<p>${esc(g.text)}</p>`}
      ${g.reply && (!g.secret || st.mine || g.uid===st.me?.uid)
        ? `<p class="gb-re">↳ <b>${esc(st.page.name||st.handle)}</b> ${esc(g.reply)}</p>`:''}
      ${st.mine?`<i class="gb-rebtn" data-gbr="${g.id}">${g.reply?'답글 수정':'답글'}</i>`:''}
      <span class="gb-reform hidden" data-gbf="${g.id}"></span></li>`).join('')
    :'<p class="pl-empty">아직 방명록이 비어 있어요 — 첫 흔적을 남겨주세요.</p>';
  $('#gb-list').querySelectorAll('[data-gbr]').forEach(b=>b.onclick=()=>{
    const id=b.dataset.gbr, g=st.guest.find(x=>x.id===id); if(!g) return;
    const box=$('#gb-list').querySelector(`[data-gbf="${id}"]`);
    if(!box.classList.contains('hidden')){ box.classList.add('hidden'); box.innerHTML=''; return; }
    box.classList.remove('hidden');
    box.innerHTML=`<textarea class="gb-reta" rows="2" placeholder="답글 — 비우고 저장하면 지워져요">${g.reply?esc(g.reply):''}</textarea>
      <button class="btn pri gb-rego" style="font-size:11.5px">저장</button>`;
    box.querySelector('.gb-rego').onclick=async()=>{
      const t=box.querySelector('.gb-reta').value.trim();
      try{
        await updateDoc(doc(db,'pages',st.handle,'guest',id),{reply:t});
        g.reply=t; renderGuest(); msg(t?'답글을 남겼어요.':'답글을 지웠어요.');
      }catch(e){ msg('답글 저장 실패 — 규칙 게시가 필요할 수 있어요: '+e.message); }
    };
  });
  $('#gb-list').querySelectorAll('[data-gbd]').forEach(b=>b.onclick=async()=>{
    if(!confirm('이 방명록 글을 삭제할까요?')) return;
    await deleteDoc(doc(db,'pages',st.handle,'guest',b.dataset.gbd));
    st.guest=st.guest.filter(x=>x.id!==b.dataset.gbd); renderGuest();
  });
}
function switchTab(name){
  document.querySelectorAll('.tabs button').forEach(b=>b.classList.toggle('on',b.dataset.tab===name));
  document.querySelectorAll('.pane').forEach(p=>p.classList.toggle('hidden',p.dataset.pane!==name));
  $('#panel').classList.toggle('wfull', name==='write');   // 새 글 탭 = 전체 화면 집필 모드
}
function updateBoardWrite(){
  const b=$('#board-write'); if(!b) return;
  const c=st.cat;
  const ok = st.mine && c!=='home' && c!=='__gb';
  b.classList.toggle('hidden', !ok);
  if(!ok) return;
  b.onclick=()=>{
    if(isMemo(st.cat)){ openMemoModal(st.cat); return; }   // 🗒 메모형은 팝업 작성(phase216)
    clearWriteForm();
    refreshWriteCats(); refreshGalCats(); openPanel('write');
    if(c==='__gal' || isG(c)){ switchTab('galup'); if(isG(c)) $('#g-cat').value=c; }
    else if(c!=='recent'){ $('#w-cat').value=c; }
  };
}
const postThumb=p=>{ if(p.secret||!p.body) return ''; const m=p.body.match(/<img[^>]+src="([^"]+)"/); return m?m[1]:''; };
function renderPager(total, per){
  const box=$('#pager'); if(!box) return [];
  const pages=Math.ceil(total/per);
  if(pages<=1){ box.innerHTML=''; return null; }
  st.pg=Math.min(Math.max(1,st.pg||1), pages);
  const p=st.pg;
  let nums=[];
  if(pages<=7) nums=Array.from({length:pages},(_,i)=>i+1);
  else{
    nums=[1];
    if(p>3) nums.push('…');
    for(let i=Math.max(2,p-1); i<=Math.min(pages-1,p+1); i++) nums.push(i);
    if(p<pages-2) nums.push('…');
    nums.push(pages);
  }
  box.innerHTML =
    `<a class="pg-arr${p<=1?' off':''}" data-pg="${p-1}">‹</a>`+
    nums.map(n=> n==='…' ? `<span class="pg-gap">…</span>`
      : `<a class="${n===p?'on':''}" data-pg="${n}">${n}</a>`).join('')+
    `<a class="pg-arr${p>=pages?' off':''}" data-pg="${p+1}">›</a>`;
  box.querySelectorAll('a[data-pg]').forEach(a=>a.onclick=()=>{
    const n=+a.dataset.pg;
    if(n<1||n>pages||n===st.pg) return;
    st.pg=n; renderList();
    $('#list-view').scrollIntoView({behavior:'smooth',block:'start'});
  });
  return null;
}
/* 🗒 메모 팝업(phase216) — 저장은 글쓰기 발행 파이프라인에 위임(서식·암호화·사진 체계 재사용) */
let memoImgs=[];
function renderMemoImgs(){
  const bx=$('#mm-imgs'); if(!bx) return;
  bx.innerHTML=memoImgs.map((im,i)=>`<span class="mm-th"><img src="${im}"><i data-mmx="${i}">✕</i></span>`).join('');
  bx.querySelectorAll('[data-mmx]').forEach(el=>el.onclick=()=>{ memoImgs.splice(+el.dataset.mmx,1); renderMemoImgs(); });
}
let memoEdit=null;                               // 팝업 수정 대상(phase220)
function openMemoModal(cat){
  memoEdit=null; $('#mm-go').textContent='추가';
  memoImgs=[]; renderMemoImgs();
  $('#mm-cat').textContent=cat;
  $('#mm-title').value=''; $('#mm-body').value='';
  $('#mm-secret').checked=false; $('#mm-pw').value=''; $('#mm-pw').style.display='none';
  $('#mm-priv').checked=false; $('#mm-cmt').checked=false;   // 💬 기본 꺼짐(phase232)
  $('#mm-title').style.display = st.page.memoNoTt ? 'none' : '';
  $('#memo-modal').classList.remove('hidden');
  setTimeout(()=>$('#mm-body').focus(),60);
}
function openMemoModalEdit(p){
  openMemoModal(p.cat);
  memoEdit=p; $('#mm-go').textContent='수정';
  $('#mm-title').value=p.title||'';
  $('#mm-body').value=(p.raw||'').replace(/\n*\[사진\d+\]/g,'').trim();   // 사진 자리표는 저장 시 끝에 재부착
  memoImgs=Array.isArray(p.imgs)?p.imgs.slice():[]; renderMemoImgs();
  $('#mm-priv').checked=!!p.priv;
  $('#mm-cmt').checked=!p.cmtOff;
}
function closeMemoModal(){ $('#memo-modal').classList.add('hidden'); }
$('#mm-x').onclick=closeMemoModal;
$('#memo-modal').addEventListener('click',e=>{ if(e.target.id==='memo-modal') closeMemoModal(); });
$('#mm-secret').addEventListener('change',()=>{ $('#mm-pw').style.display=$('#mm-secret').checked?'':'none'; });
$('#mm-img').onclick=()=>$('#mm-file').click();
$('#mm-file').addEventListener('change',async e=>{
  for(const f of [...e.target.files]){
    if(memoImgs.length>=4){ msg('메모 사진은 4장까지예요.'); break; }
    msg('사진 올리는 중...');
    try{ memoImgs.push(await upFile(f,1600,.88,180)); }
    catch(err){ msg('업로드 실패 — '+err.message); }
  }
  e.target.value=''; renderMemoImgs();
});
$('#mm-go').onclick=async()=>{
  const body=$('#mm-body').value.trim();
  if(!body && !memoImgs.length){ msg('내용을 입력해 주세요.'); return; }
  if($('#mm-secret').checked && !$('#mm-pw').value){ msg('비밀 메모의 비밀번호를 입력하세요.'); return; }
  clearWriteForm(); refreshWriteCats();                     // wImgs도 여기서 초기화됨
  $('#w-cat').value=$('#mm-cat').textContent;
  const t=$('#mm-title').value.trim();
  $('#w-title').value = t || (body.replace(/\s+/g,' ').slice(0,16) || '사진 메모');
  let raw=body;
  memoImgs.forEach(im=>{ wImgs.push(im); raw+=`\n\n[사진${wImgs.length}]`; });
  $('#w-body').value=raw;
  $('#w-secret').checked=$('#mm-secret').checked;
  $('#w-pw').value=$('#mm-pw').value;
  $('#w-priv').checked=$('#mm-priv').checked;
  $('#w-cmt').checked=$('#mm-cmt').checked;       // 💬 댓글 받기 — 팝업 값 사용(phase222)
  if(memoEdit){                                   // 수정: 팝업에 없는 항목은 원본 유지
    editPost=memoEdit.id;
    $('#w-pin').checked=!!memoEdit.pinned;
    $('#w-feat').checked=!!memoEdit.feat;
    $('#w-html').checked=!!memoEdit.html;
    const wdm=$('#w-date'); if(wdm&&memoEdit.date) wdm.value=memoEdit.date.replaceAll('.','-');
  }
  await $('#w-go').onclick();
  if(!$('#w-title').value) closeMemoModal();               // 발행 성공 시 폼이 비워짐 — 실패면 팝업 유지
};
function renderList(){
  updateBoardWrite();
  if(st.cat==='__gb'){ $('#guest-view').classList.remove('hidden');
    $('#list-view').classList.add('hidden'); renderGuest(); return; }
  $('#guest-view').classList.add('hidden');
  $('#list-view').classList.remove('hidden');
  if(st.cat==='__gal' || (st.cat!=='recent' && st.cat!=='home' && isG(st.cat))){
    $('#v-label').textContent = st.cat==='__gal' ? galNm() : st.cat.toUpperCase();
    $('#pin-slot').innerHTML='';
    const all = st.cat==='__gal' ? st.gallery : st.gallery.filter(g=>g.cat===st.cat);
    const gper = galCols()*5;
    renderPager(all.length, gper);
    const items = all.slice(((st.pg||1)-1)*gper, (st.pg||1)*gper);
    $('#rows').innerHTML = items.length
      ? `<div class="gal-grid">`+items.map(g=>
          `<a data-gg="${g.id}"><img src="${g.img}" alt="" draggable="false">${g.priv?'<i class="gpriv">🔏</i>':''}${st.mine?
            `<i class="gdel" data-gx="${g.id}">✕</i><i class="gedit" data-ge="${g.id}" title="제목·카테고리·사진 수정">✎</i><i class="gpin${galPins().includes(g.id)?' on':''}" data-gp="${g.id}" title="대문 갤러리에 고정">★</i>`:''}</a>`).join('')+`</div>`
        +(st.mine?`<p class="note" style="margin-top:10px">★를 누르면 대문(홈) 갤러리에 걸려요 — 카테고리 탭에서 '대문: ★로 고른 사진'을 선택해야 적용돼요.</p>`:'')
      : '<p class="pl-empty">아직 이미지가 없습니다.</p>';
    $('#more-btn').style.display='none';
    document.querySelectorAll('[data-gg]').forEach(el=>el.onclick=e=>{
      if(e.target.dataset.gx){ e.stopPropagation(); delGal(e.target.dataset.gx); return; }
      if(e.target.dataset.gp){ e.stopPropagation(); togglePin(e.target.dataset.gp); return; }
      if(e.target.dataset.ge){ e.stopPropagation(); startEditGal(e.target.dataset.ge); return; }
      const g=items.find(x=>x.id===el.dataset.gg);
      if(g){ lbOpen(items, g.id); }
    });
    return;
  }
  if(st.cat!=='recent' && st.cat!=='home' && isMemo(st.cat)){
    $('#v-label').textContent = st.cat.toUpperCase();
    $('#pin-slot').innerHTML='';
    let all=st.posts.filter(p=>p.cat===st.cat);
    if(st.q) all=all.filter(p=>p.title.toLowerCase().includes(st.q));
    all=[...all.filter(p=>p.mpin), ...all.filter(p=>!p.mpin)];   // 📌 고정 메모는 맨 앞(phase231)
    const mper=memoCols()*4;
    renderPager(all.length, mper);
    const items=all.slice(((st.pg||1)-1)*mper, (st.pg||1)*mper);
    const strip=s=>String(s||'').replace(/\[사진\d+\]/g,'').replace(/\*\*|__|~~|==|\*/g,'');
    $('#rows').innerHTML = items.length
      ? `<div class="memo-grid">`+items.map(p=>{ const th=p.secret?'':postThumb(p); return `
          <a class="memo-card${th?' has-mth':''}" data-id="${p.id}">
            ${th?`<img class="mth" src="${th}" alt="" draggable="false">`:''}
            ${!st.page.memoNoTt&&p.title?`<b class="mt">${esc(p.title)}</b>`:''}
            <span class="mk">${st.mine?`<i class="mp${p.mpin?' on':''}" data-mp="${p.id}" title="첫 화면에 고정 (${mpinMax()}개까지)">📌</i>`:''}${p.secret?'🔒':''}${p.priv?'🔏':''}</span>
            <p class="mx">${p.secret?'비밀 메모예요.':esc(strip(p.raw||p.excerpt||''))}</p>
            <span class="mf"><i>${esc((p.date||'').slice(2))}</i><span>전체 보기 →</span></span>
          </a>`; }).join('')+`</div>`
      : '<p class="pl-empty">아직 메모가 없습니다.</p>';
    $('#more-btn').style.display='none';
    document.querySelectorAll('.memo-card').forEach(el=>el.onclick=e=>{
      if(e.target.dataset.mp){ e.stopPropagation(); toggleMpin(e.target.dataset.mp); return; }
      openPost(el.dataset.id); });
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
      <p class="t">${esc(pin.title)}${pin.secret?' 🔒':''}${pin.priv?' 🔏':''}</p>
      ${pin.excerpt?`<p class="ex">${esc(pin.excerpt)}</p>`:''}
      <p class="meta">${esc(pin.cat)} · ${esc(pin.date)}</p></a>`:'';
  const PER=12;
  renderPager(rest.length, PER);
  const shown=rest.slice(((st.pg||1)-1)*PER, (st.pg||1)*PER);
  const canFt = st.mine && sideCfg().some(w2=>w2.t==='feat');   // ★ 대표글 위젯을 둔 주인에게만 토글 노출
  const rowHTML=p=>{ const t=postThumb(p); return `
    <li class="row ${t?'has-th':''}" data-id="${p.id}">
      <span class="d">${esc((p.date||'').slice(5))}</span>
      <span class="t">${esc(p.title)} ${p.secret?'<span class="k">🔒</span>':''}${p.priv?'<span class="k" title="비공개 — 나만 보여요">🔏</span>':''}${canFt?`<button class="ft-star${p.feat?' on':''}" data-ft="${p.id}" title="★ 대표글 위젯에 전시 (다시 누르면 해제)">${p.feat?'★':'☆'}</button>`:''}</span>
      <span class="c">${esc(p.cat)}</span>
      <span class="k"></span>${t?`<img class="th" src="${t}" alt="" draggable="false">`:''}</li>`; };
  $('#rows').innerHTML = shown.length?shown.map(rowHTML).join('')
    :'<p class="pl-empty">아직 글이 없습니다.</p>';
  $('#more-btn').style.display='none';
  document.querySelectorAll('[data-id]').forEach(el=>el.onclick=e=>{
    if(e.target.dataset.ft){ e.stopPropagation(); toggleFeat(e.target.dataset.ft); return; }
    openPost(el.dataset.id); });
}
async function toggleMpin(id){
  const p=st.posts.find(x=>x.id===id); if(!p) return;
  if(!p.mpin && st.posts.filter(x=>x.cat===p.cat&&x.mpin).length>=mpinMax()){
    msg(`📌 고정은 ${mpinMax()}개까지예요 — 테마 탭에서 개수를 늘릴 수 있어요.`); return; }
  try{ await updateDoc(doc(db,'pages',st.handle,'posts',id),{mpin:!p.mpin}); }
  catch(err){ msg('저장 실패 — '+err.message); return; }
  p.mpin=!p.mpin; renderList();
  msg(p.mpin?'📌 첫 화면에 고정했어요.':'고정을 해제했어요.');
}
async function toggleFeat(id){
  const p=st.posts.find(x=>x.id===id); if(!p) return;
  try{ await updateDoc(doc(db,'pages',st.handle,'posts',id),{feat:!p.feat}); }
  catch(err){ msg('저장 실패 — '+err.message); return; }
  p.feat=!p.feat;
  renderList(); renderSide();
  msg(p.feat?'★ 대표글로 전시했어요.':'대표글에서 내렸어요.');
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
let galShown=null;
function renderGal(all){
  const base = all ? st.gallery : stripList();
  const arr = all ? base : base.slice(0,4);
  galShown=arr;
  const pins=galPins();
  $('#gal').innerHTML = arr.length?arr.map(g=>
    `<a data-g="${g.id}"><img src="${g.img}" alt="" draggable="false">${g.priv?'<i class="gpriv">🔏</i>':''}${st.mine?`<i class="gdel" data-gx="${g.id}">✕</i>`:''}</a>`).join('')
    :'<p class="pl-empty">아직 이미지가 없습니다.</p>';
  document.querySelectorAll('#gal a').forEach(a=>a.onclick=e=>{
    if(e.target.dataset.gx){ e.stopPropagation(); delGal(e.target.dataset.gx); return; }
    if(e.target.dataset.gp){ e.stopPropagation(); togglePin(e.target.dataset.gp); return; }
    const g=st.gallery.find(x=>x.id===a.dataset.g);
    if(g){ lbOpen(galShown||st.gallery, g.id); }
  });
}
$('#gb-home').onclick=goHome;
$('#gb-go').onclick=async()=>{
  const t=$('#gb-text').value.trim(); if(!t||!st.me) return;
  await addDoc(collection(db,'pages',st.handle,'guest'),
    {uid:st.me.uid, name:st.myHandle||st.me.displayName||'guest',
     home:st.myHandle||'', text:t, ts:serverTimestamp(),
     secret: $('#gb-secret').checked||false});
  $('#gb-text').value=''; $('#gb-secret').checked=false;
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
let lbList=[], lbIdx=0;
function lbOpen(list, id){
  lbList=list; lbIdx=Math.max(0, list.findIndex(x=>x.id===id));
  lbShow();
}
function lbShow(){
  const g=lbList[lbIdx]; if(!g) return;
  $('#lb-img').src=g.img;
  $('#lb-prev').classList.toggle('hidden', lbIdx<=0);
  $('#lb-next').classList.toggle('hidden', lbIdx>=lbList.length-1);
  $('#lb-n').textContent=lbList.length>1 ? (lbIdx+1)+' / '+lbList.length : '';
  $('#lb').classList.add('show');
}
const lbMove=d=>{ const i=lbIdx+d;
  if(i<0||i>=lbList.length) return; lbIdx=i; lbShow(); };
$('#lb-prev').onclick=e=>{ e.stopPropagation(); lbMove(-1); };
$('#lb-next').onclick=e=>{ e.stopPropagation(); lbMove(1); };
document.addEventListener('keydown',e=>{
  if(!$('#lb').classList.contains('show')) return;
  if(e.key==='ArrowLeft') lbMove(-1);
  if(e.key==='ArrowRight') lbMove(1);
  if(e.key==='Escape') $('#lb').classList.remove('show');
});
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
/* 인앱 브라우저(트위터 등)는 prompt()를 차단해 비번 창이 안 뜸 — 자체 입력 모달로 대체(phase224) */
function askPw(title){
  return new Promise(res=>{
    let m=document.getElementById('pw-modal');
    if(!m){
      m=document.createElement('div'); m.id='pw-modal'; m.className='memo-modal hidden';
      m.innerHTML=`<div class="mm-card" style="width:min(380px,92vw)">
        <div class="mm-top"><b id="pwm-t">비밀번호</b><button class="btn" id="pwm-go" style="margin-left:auto;font-size:12px;padding:8px 18px;border-radius:10px">확인</button></div>
        <input id="pwm-in" type="password" placeholder="비밀번호를 입력하세요" autocomplete="off">
      </div>`;
      document.body.appendChild(m);
    }
    m.querySelector('#pwm-t').textContent=title||'비밀번호';
    const inp=m.querySelector('#pwm-in'); inp.value='';
    m.classList.remove('hidden');
    const done=v=>{ m.classList.add('hidden'); m.onclick=null; res(v); };
    m.querySelector('#pwm-go').onclick=()=>done(inp.value);
    inp.onkeydown=e=>{ if(e.key==='Enter') done(inp.value); if(e.key==='Escape') done(null); };
    m.onclick=e=>{ if(e.target===m) done(null); };
    setTimeout(()=>inp.focus(),60);
  });
}
async function openPost(id, fromHome=false){
  const p=st.posts.find(x=>x.id===id); if(!p) return;
  if(p.priv && !st.mine){ msg('🔏 비공개 글이에요.'); return; }
  st.backHome=fromHome;                     // 홈에서 연 글은 BACK이 홈으로
  let body;
  if(p.secret){
    const pw=await askPw('🔒 비밀글'); if(pw===null||pw==='') return;
    try{ body=await decTxt(pw,p.enc); }catch(e){ msg('비밀번호가 맞지 않아요.'); return; }
  } else body=p.body;
  st.cur=p; st.curBody=body;
  $('#pv-meta').textContent=p.cat+' · '+p.date+(p.secret?' · SECRET':'')+(p.priv?' · 🔏 비공개':'');
  /* ── 공감 ♥ ── */
  (async()=>{
    const el=$('#pv-like'); if(!el) return;
    el.classList.add('hidden');
    let u=[];
    try{ const s=await getDoc(doc(db,'pages',st.handle,'likes',p.id));
         if(s.exists()) u=s.data().u||[]; }catch(e){}
    const draw=()=>{ el.innerHTML=(st.me&&u.includes(st.me.uid)?'♥':'♡')+(u.length?` ${u.length}`:'');
                     el.classList.toggle('on', !!(st.me&&u.includes(st.me.uid))); };
    draw(); el.classList.remove('hidden');
    el.onclick=async()=>{
      if(!st.me){ msg('공감은 로그인하고 눌러주세요.'); return; }
      const has=u.includes(st.me.uid);
      u = has ? u.filter(x=>x!==st.me.uid) : [...u,st.me.uid];
      draw();
      try{ await setDoc(doc(db,'pages',st.handle,'likes',p.id),{u},{merge:false}); }
      catch(e){ u = has ? [...u,st.me.uid] : u.filter(x=>x!==st.me.uid); draw();
                msg('공감 저장 실패 — 규칙 게시가 필요할 수 있어요: '+e.message); }
    };
  })();
  const pubBtn=$('#pv-pub');
  if(pubBtn){
    pubBtn.classList.toggle('hidden', !(p.priv&&st.mine));
    pubBtn.onclick=async()=>{
      if(!confirm('이 글을 공개로 전환할까요?\n모두가 볼 수 있게 됩니다.')) return;
      try{
        await updateDoc(doc(db,'pages',st.handle,'posts',p.id),{priv:false});
        p.priv=false; pubBtn.classList.add('hidden');
        $('#pv-meta').textContent=p.cat+' · '+p.date+(p.secret?' · SECRET':'');
        renderList(); msg('공개로 전환했어요!');
      }catch(e){ msg('전환 실패 — '+e.message); }
    };
  }
  $('#pv-title').textContent=p.title;
  $('#pv-body').innerHTML=scopePostCSS(body);
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
$('#more-btn').onclick=()=>{ if(st.page.allOff){ msg('전체 글 보기가 꺼져 있어요.'); return; }
  st.cat='recent'; st.q='__all__'; st.q=''; 
  $('#rows').innerHTML=''; const rest=st.posts.filter(p=>!p.pinned);
  $('#v-label').textContent='ALL';
  $('#rows').innerHTML=rest.map(p=>{ const t=postThumb(p); return `
    <li class="row ${t?'has-th':''}" data-id="${p.id}">
      <span class="d">${esc((p.date||'').slice(5))}</span>
      <span class="t">${esc(p.title)} ${p.secret?'<span class="k">🔒</span>':''}${p.priv?'<span class="k" title="비공개 — 나만 보여요">🔏</span>':''}</span>
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
  const groups={write:['write','galup'], deco:['set','wid','cats','theme','bg','stk','mng','adm']};
  document.querySelectorAll('.tabs button').forEach(b=>{
    b.style.display=groups[mode].includes(b.dataset.tab)?'':'none';
  });
  if(st.myHandle!=='jeste') $('#tab-adm').style.display='none';   // 운영 탭은 운영자만
  const first = mode==='write'?'write':'set';   // 꾸미기는 기본 정보부터
  document.querySelectorAll('.tabs button').forEach(b=>b.classList.toggle('on',b.dataset.tab===first));
  document.querySelectorAll('.pane').forEach(p=>p.classList.toggle('hidden',p.dataset.pane!==first));
  $('#panel').classList.toggle('wfull', first==='write');
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
  const NS=navSeq(); let ci=-1;
  box.innerHTML = NS.map((t,ni)=>{
    const ud=`<button class="rmv" data-nup="${ni}" title="위로" ${ni===0?'disabled':''}>↑</button>
      <button class="rmv" data-ndn="${ni}" title="아래로" ${ni===NS.length-1?'disabled':''}>↓</button>`;
    if(t==='__gal'||t==='__gb') return `
    <div class="p-row" style="align-items:center">
      <span style="flex:1;font-size:12px;color:var(--muted)">▤ ${t==='__gal'?'GALLERY':'GUESTBOOK'} 탭
        <i style="font-style:normal;font-size:10px;opacity:.8">— 이름·숨김 설정은 아래 고정 버튼에서</i></span>
      ${ud}
    </div>`;
    ci++; const c=t, i=ci;
    return `
    <div class="p-row">
      <input data-ci="${i}" value="${esc(c)}">
      <select data-ct="${i}" style="width:auto;margin-bottom:0">
        <option value="post" ${!isG(c)&&!isMemo(c)?'selected':''}>글</option>
        <option value="gallery" ${isG(c)?'selected':''}>사진</option>
        <option value="memo" ${isMemo(c)?'selected':''}>메모 (카드 모아보기)</option>
      </select>
      <button class="btn" data-cs="${i}" style="font-size:12px">저장</button>
      ${ud}
      <label class="filelab" style="font-size:11px">🖼 이미지 추가<input type="file" data-cimg="${esc(c)}" accept="image/*" style="display:none"></label>
      ${(st.page.catImgs||{})[c]?`<button class="rmv" data-cimgx="${esc(c)}" style="font-size:10px">이미지 제거</button>`:''}
      <button class="rmv" data-cd="${i}">✕</button>
    </div>`; }).join('') || '<p class="pl-empty">카테고리가 없어요.</p>';
  renderCatFix();
  const moveNav=async(ni,d)=>{                    // 탭 순서 바꾸기 — 카테고리·갤러리·방명록 공용(phase217)
    const s=[...navSeq()], j=ni+d;
    if(j<0||j>=s.length) return;
    [s[ni],s[j]]=[s[j],s[ni]];
    const nc=s.filter(x=>x!=='__gal'&&x!=='__gb');
    try{ await updateDoc(doc(db,'pages',st.handle),{navSeq:s, cats:nc}); }
    catch(e){ msg('순서 저장 실패 — '+e.message); return; }
    st.page.navSeq=s; st.page.cats=nc;
    renderCatMgr(); renderCatbar(); renderSide(); refreshWriteCats(); refreshGalCats();
    msg('순서 변경!');
  };
  box.querySelectorAll('[data-nup]').forEach(b=>b.onclick=()=>moveNav(+b.dataset.nup,-1));
  box.querySelectorAll('[data-ndn]').forEach(b=>b.onclick=()=>moveNav(+b.dataset.ndn, 1));
  box.querySelectorAll('[data-ct]').forEach(s=>s.onchange=async()=>{
    const name=cats()[+s.dataset.ct];
    let g=[...gcats()], m=[...mcats()];
    if(s.value==='gallery'){ if(!g.includes(name)) g.push(name); m=m.filter(x=>x!==name); }
    else if(s.value==='memo'){ if(!m.includes(name)) m.push(name); g=g.filter(x=>x!==name); }
    else{ g=g.filter(x=>x!==name); m=m.filter(x=>x!==name); }
    try{ await updateDoc(doc(db,'pages',st.handle),{gcats:g, mcats:m}); }
    catch(e){ msg('저장 실패 — '+e.message); renderCatMgr(); return; }
    st.page.gcats=g; st.page.mcats=m; refreshWriteCats(); refreshGalCats(); renderSide(); renderCatbar();
    msg(`'${name}' → ${s.value==='gallery'?'사진':s.value==='memo'?'메모':'글'} 카테고리로 변경!`);
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
        const m2=mcats().map(x=>x===oldName?nv:x);
        const ns=navSeq().map(x=>x===oldName?nv:x);
        await updateDoc(doc(db,'pages',st.handle),{gcats:g, mcats:m2, navSeq:ns});
        st.page.gcats=g; st.page.mcats=m2; st.page.navSeq=ns;
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
    row('home',esc(homeNm()),
      `<input data-cn="home" value="${esc(st.page.homeName||'')}" placeholder="HOME" title="홈 탭 이름 바꾸기 — 비우면 HOME" style="width:104px;margin-bottom:0;font-size:11.5px">`)+
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
      `<input data-cn="__gb" value="${esc(st.page.gbName||'')}" placeholder="GUESTBOOK" title="게시판 이름 바꾸기 — 비우면 GUESTBOOK" style="width:104px;margin-bottom:0;font-size:11.5px">
       <label class="chk" style="margin:0 0 0 6px;font-size:11px" title="켜면 방명록 탭이 숨겨지고 아무도 남길 수 없어요 — 기존 글은 지워지지 않아요"><input type="checkbox" data-gboff ${st.page.gbOff?'checked':''}> 끄기</label>`)+
    (homeStyle()==='blog'?'':row('recent','ALL',
      `<label class="chk" style="margin:0;font-size:11px" title="켜면 상단의 ALL(전체 글) 탭이 숨겨져요 — 카테고리별 탭은 그대로예요"><input type="checkbox" data-alloff ${st.page.allOff?'checked':''}> 끄기</label>`));
  bindCatImg(box);
  box.querySelectorAll('[data-cn]').forEach(inp=>inp.addEventListener('change',async()=>{
    const v=inp.value.trim().slice(0,20);
    const field = inp.dataset.cn==='__gal' ? 'galName' : inp.dataset.cn==='home' ? 'homeName' : 'gbName';
    try{ await updateDoc(doc(db,'pages',st.handle),{[field]:v}); }catch(e){ msg('저장 실패 — '+e.message); return; }
    st.page[field]=v;
    renderCatbar(); renderSide(); renderCatFix();
    $('#gb-title').textContent=gbNm(); $('#strip-title').textContent=galNm();
    if(st.cat==='__gal') $('#v-label').textContent=galNm();
    msg('게시판 이름 저장!');
  }));
  const alo=box.querySelector('[data-alloff]');
  if(alo) alo.addEventListener('change',async()=>{
    try{ await updateDoc(doc(db,'pages',st.handle),{allOff:alo.checked}); }
    catch(err){ msg('저장 실패 — '+err.message); alo.checked=!alo.checked; return; }
    st.page.allOff=alo.checked;
    if(alo.checked && st.cat==='recent') st.cat=cats()[0]||'archive';
    renderCatbar(); renderSide();
    msg(alo.checked?'ALL 탭을 껐어요.':'ALL 탭을 다시 켰어요!');
  });
  const gbo=box.querySelector('[data-gboff]');
  if(gbo) gbo.addEventListener('change',async()=>{
    try{ await updateDoc(doc(db,'pages',st.handle),{gbOff:gbo.checked}); }
    catch(e){ msg('저장 실패 — '+e.message); gbo.checked=!gbo.checked; return; }
    st.page.gbOff=gbo.checked;
    renderCatbar(); renderSide();
    msg(gbo.checked?'방명록을 껐어요 — 탭이 숨겨졌어요.':'방명록을 다시 켰어요!');
  });
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
let draft=[]; let editIdx=-1; let pdraft={ddays:[],bgm:{}}; let widSnap='';
function fillWidgets(){
  draft=JSON.parse(JSON.stringify(sideCfg()));
  pdraft={ ddays:JSON.parse(JSON.stringify(st.page.ddays||[])),
           ddHead: st.page.ddHead!==false,
           bgm:{url:st.page.bgm?.url||'', title:st.page.bgm?.title||''} };
  widSnap=JSON.stringify({d:draft,p:pdraft});   // 닫을 때 저장 안 한 변경 감지용
  editIdx=-1; renderWidList(); $('#wid-edit').innerHTML='';
}
function renderWidList(){
  $('#wid-list').innerHTML = draft.map((w,i)=>`
    <div class="wl">
      <span class="nm">${WNAME[w.t]||w.t}${w.t==='links'?` (${(w.items||[]).length})`:''}${w.t==='banner'?` (${(w.items||[]).length})`:''}${w.float?' <span style="color:var(--pri);font-size:10px">📌 띄움</span>':''}</span>
      ${w.t!=='latest'?`<button data-f="${i}" title="컬럼에서 떼어 화면에 자유 배치 (PC 전용)"${w.float?' style="color:var(--pri)"':''}>📌</button>`:''}
      ${['profile','quote','links','banner','dday','bgm','notice','chat','phone','img','nb','text','stamp','latest','tl','feat'].includes(w.t)?`<button data-e="${i}">✎</button>`:''}
      <button data-u="${i}">↑</button><button data-d="${i}">↓</button><button data-x="${i}">✕</button>
    </div>`).join('') || '<p class="pl-empty">위젯이 없어요 — 아래에서 추가하세요.</p>';
  if(draft.some(w=>w.float))
    $('#wid-list').insertAdjacentHTML('beforeend',
      '<p class="note">📌 띄운 위젯은 넓은 PC 화면에서만 떠 있어요 — 저장 후 홈의 ⠿ 편집 모드에서 드래그로 옮길 수 있고, 폰·좁은 창에서는 원래 자리로 돌아갑니다.</p>');
  $('#wid-list').querySelectorAll('button').forEach(b=>b.onclick=()=>{
    const {e,u,d,x,f}=b.dataset;
    if(f!==undefined){ const w=draft[+f]; w.float=!w.float;
      if(w.float){ if(w.fx==null) w.fx=62; if(w.fy==null) w.fy=160; }
      renderWidList(); return; }
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
  if(w.t==='latest') html+=`
    <div class="p-row" style="align-items:center;gap:8px;font-size:11.5px;color:var(--muted)">
      보여줄 최신글 개수
      <input type="number" id="we-ltn" value="${+w.n>0?+w.n:5}" min="1" max="20" style="width:80px">
      <span style="font-size:10.5px">(기본 5)</span>
    </div>
    <label class="chk" style="font-size:11.5px"><input type="checkbox" id="we-ltpin" ${w.noPin?'':'checked'}> 📌 고정글 함께 표시 — 끄면 최신글만 나와요 (고정글은 '📌 고정글' 위젯으로 따로 둘 수 있어요)</label>`;
  if(w.t==='tl') html+=`
    <input id="we-tltt" placeholder="위젯 제목 (기본: TIMELINE)" value="${esc(w.title||'')}">
    <select id="we-tlst">
      <option value="" ${!w.style||w.style==='line'?'selected':''}>기본 — 세로 라인과 점</option>
      <option value="card" ${w.style==='card'?'selected':''}>마디 카드 — 항목마다 작은 카드</option>
      <option value="bare" ${w.style==='bare'?'selected':''}>담백 — 선·점 없이 글줄만</option>
    </select>
    <input id="we-tldot" placeholder="점 모양 (비우면 ● — 이모지·문자 가능, 예: ✦ ♥ ✈ 📍)" value="${esc(w.dot||'')}" maxlength="4">
    ${(w.items||[]).map((it,ii)=>`<div class="tl-ed">
      <div class="p-row">
        <input data-tld="${ii}" placeholder="날짜 (자유 형식)" value="${esc(it.d||'')}" style="flex:1">
        <input data-tltt="${ii}" placeholder="제목 (선택)" value="${esc(it.tt||'')}" style="flex:1.4">
        <button class="rmv" data-tlx="${ii}">✕</button></div>
      <textarea data-tlt="${ii}" placeholder="로그 — 줄바꿈 그대로 표시돼요 (선택)" style="min-height:64px">${it.t||''}</textarea>
    </div>`).join('')}
    <button class="btn" id="we-tladd" style="font-size:12px">+ 항목 추가</button>
    <div class="p-row" style="align-items:center">
      <label class="chk" title="화면에 보일 때 항목이 순서대로 떠올라요"><input type="checkbox" id="we-tlanim" ${w.anim?'checked':''}> ✨ 움짤 효과</label>
      <label class="chk" title="다 뜨면 잠시 쉬었다가 처음부터 다시 재생돼요"><input type="checkbox" id="we-tlloop" ${w.loop?'checked':''}> ↻ 반복 재생</label>
      <label class="chk" title="반복 한 바퀴가 끝나면 접혔다가 다시 쌓여요 — 끄면 크기 유지 (기본)"><input type="checkbox" id="we-tlfold" ${w.fold?'checked':''}> ⇅ 접었다 펴기</label>
    </div>
    <input type="number" id="we-tlmax" placeholder="최대 높이 px (비우면 전체 표시)" value="${+w.maxH>0?+w.maxH:''}" min="120" max="900" style="width:190px" title="정하면 그 높이를 넘는 항목은 스크롤로 봐요">`;
  if(w.t==='feat') html+=`
    <input id="we-fttt" placeholder="위젯 제목 (기본: FEATURED)" value="${esc(w.title||'')}">
    <div class="p-row" style="align-items:center;gap:8px;font-size:11.5px;color:var(--muted)">
      보여줄 개수
      <input type="number" id="we-ftn" value="${+w.n>0?+w.n:5}" min="1" max="20" style="width:80px">
      <span style="font-size:10.5px">— 글 목록의 ☆ 또는 글쓰기 화면 체크로 고릅니다</span>
    </div>
    <input id="we-ftic" placeholder="앞머리 모양 (비우면 ★ — 이모지·문자 가능, 예: ✦ ♥ 🌊)" value="${esc(w.icon||'')}" maxlength="4">`;
  if(w.t==='quote') html+=`
    <textarea id="we-text" placeholder="걸어둘 문장" style="min-height:90px">${w.text||''}</textarea>
    <div class="p-row" style="align-items:center">
      <label class="chk" title="화면에 보일 때 한 글자씩 타이핑되듯 나타나요"><input type="checkbox" id="we-qanim" ${w.anim?'checked':''}> ✨ 움짤 효과 (타이핑)</label>
      <label class="chk" title="문장 위의 장식 따옴표를 켜고 꺼요"><input type="checkbox" id="we-qmark" ${w.noQm?'':'checked'}> ❝ 따옴표 표시</label>
    </div>`;
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
    <textarea id="we-text" placeholder="자유롭게 쓰는 글 — 줄바꿈 그대로 표시돼요" style="min-height:130px">${w.text||''}</textarea>
    <label class="chk" title="화면에 보일 때 글이 한 글자씩 적혀요 (인용구와 같은 효과)"><input type="checkbox" id="we-txanim" ${w.anim?'checked':''}> ✨ 타이핑 효과</label>`;
  if(w.t==='stamp') html+=`
    <input id="we-ntt" placeholder="위젯 제목 (선택 — 비우면 STAMP)" value="${esc(w.title||'')}">
    <input id="we-semo" placeholder="도장 이모지 — 붙여서 1~4개 (예: 🐾 또는 ❤️🐾⭐💧)" value="${esc(w.icons||'')}">
    <label class="chk" style="margin-top:6px"><input type="checkbox" id="we-shint" ${w.hint===false?'':'checked'}> '발도장 꾹 — 하루에 하나!' 문구 표시</label>
    <div class="p-row" style="align-items:center;margin-top:8px">
      <select id="we-sbg" style="flex:1.3;margin-bottom:0">
        <option value=""${!w.sbg?' selected':''}>도장 배경 — 은은한 테마색 (기본)</option>
        <option value="none"${w.sbg==='none'?' selected':''}>도장 배경 — 완전 투명</option>
        <option value="custom"${w.sbg==='custom'?' selected':''}>도장 배경 — 직접 고르기 →</option>
      </select>
      <input type="color" id="we-sbgc" value="${/^#[0-9a-fA-F]{6}$/.test(w.sbgc||'')?w.sbgc:'#9db8ff'}" title="배경색" style="width:38px;height:30px;padding:2px;margin-bottom:0">
      <input type="range" id="we-sbga" min="4" max="100" value="${Math.min(100,Math.max(4,+w.sbga||12))}" style="flex:1;min-width:70px" title="진하기">
    </div>
    <p class="note">방문자가 하루에 하나씩 도장을 찍고 갑니다. 이모지를 바꿔도 찍힌 개수는 이어져요.</p>`;
  if(w.t==='dday') html+=pdraft.ddays.map((d,i)=>`
    <div class="p-row"><input data-dt="${i}" placeholder="제목" value="${esc(d.title)}">
    <input type="date" data-dd="${i}" value="${esc(d.date)}" style="flex:.8">
    <button class="rmv" data-dr="${i}">✕</button></div>
    <div class="p-row" style="margin-top:-4px">
      <label class="filelab" style="font-size:11px">📷 사진 ${d.img?'(있음)':''} <input type="file" data-dimg="${i}" accept="image/*"></label>
      ${d.img?`<button class="rmv" data-dximg="${i}" style="font-size:10px">사진 제거</button>`:''}
    </div>`).join('')+
    `<div class="p-row" style="align-items:center;margin-bottom:2px">
      <label class="chk" title="끄면 사이드의 D-DAY 카드가 숨겨져요 (날짜·헤더 표시는 유지)"><input type="checkbox" id="we-ddcard" ${w.off?'':'checked'}> 사이드 카드 표시</label>
      <label class="chk" title="끄면 헤더 오른쪽의 D+ 표시가 숨겨져요 (첫 번째 디데이 기준)"><input type="checkbox" id="we-ddhead" ${pdraft.ddHead===false?'':'checked'}> 헤더에 표시</label>
    </div>
    <button class="btn" id="we-ddadd" style="font-size:12px">+ 디데이 추가</button>
    <p class="note">첫 번째 디데이는 대문에도 표시돼요. 사진을 넣으면 이미지 카드가 됩니다.</p>`;
  if(w.t==='bgm') html+=`
    <input id="we-burl" placeholder="유튜브 링크 https://youtu.be/..." value="${esc(pdraft.bgm.url)}">
    <input id="we-btitle" placeholder="곡 제목 (선택)" value="${esc(pdraft.bgm.title)}">
    <div class="p-row" style="align-items:center">
      <select id="we-bgst" style="flex:1">
        <option value="" ${!w.style?'selected':''}>기본 (앨범아트 + 이퀄라이저)</option>
        <option value="cst" ${w.style==='cst'?'selected':''}>카세트 테이프 (릴이 감겨요)</option>
        <option value="lp" ${w.style==='lp'?'selected':''}>LP 턴테이블 (판이 돌아요)</option>
        <option value="tun" ${w.style==='tun'?'selected':''}>주파수 튜너 (바늘이 떨려요)</option>
      </select>
      <input id="we-bgsub" placeholder="보조 문구" value="${esc(w.sub||'')}" style="width:130px" title="카세트: 라벨 위 작은 글씨 (기본 SIDE A) / LP: 제목 아래 (기본 33⅓ RPM · SIDE A) / 튜너: 제목 아래 (기본 FM 88.1 · STEREO)">
    </div>
    <div class="p-row" style="align-items:center;font-size:11px;color:var(--muted);gap:8px">
      바탕 <input type="color" id="we-bgbg" value="${w.bg||'#14161e'}" style="width:38px;padding:0;flex:none" title="플레이어 몸체 색 — 밝은 홈에서 탁해 보이면 여기서 조절 (글자색 자동 대비)">
      글자 <input type="color" id="we-bgtc" value="${w.tc||'#eef0f6'}" style="width:38px;padding:0;flex:none" title="비우면 바탕에 맞춰 자동">
      포인트 <input type="color" id="we-bgac" value="${w.ac||'#d9a614'}" style="width:38px;padding:0;flex:none" title="튜너 바늘·카세트 릴·LP 톤암 색">
      <button class="rmv" id="we-bgrst" style="font-size:10px;margin-left:auto" title="색을 디자인 기본(홈 테마 추종)으로 되돌려요">기본으로</button>
    </div>`;
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
      <label class="chk" title="화면에 보일 때 말풍선이 순서대로 그 자리에서 떠올라요"><input type="checkbox" id="we-chanim" ${w.anim?'checked':''}> ✨ 움짤 효과 (제자리)</label>
      <label class="chk" title="다 뜨면 잠시 쉬었다가 처음부터 다시 재생돼요"><input type="checkbox" id="we-chloop" ${w.loop?'checked':''}> ↻ 반복 재생</label>
      <label class="chk" title="반복 한 바퀴가 끝나면 카드가 접혔다가 다시 쌓여요 — 끄면 크기를 유지한 채 다시 떠요 (기본)"><input type="checkbox" id="we-chfold" ${w.fold?'checked':''}> ⇅ 접었다 펴기</label>
      <input type="number" id="we-chmax" placeholder="최대 높이 px (비우면 전체 표시)" value="${+w.maxH>0?+w.maxH:''}" min="120" max="900" style="width:190px" title="정하면 그 높이를 넘는 채팅은 스크롤로 봐요">
      <p class="note" style="margin:4px 0 0">최대 높이는 사이드(옆 기둥) 위젯 기준 <b>360px</b>가 적당합니다.
        중앙·블로그형처럼 넓은 자리는 <b>440~480px</b>가 예쁩니다. 비우면 채팅 전체가 표시됩니다.</p>
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
  if(w.t==='phone') html+=`
    <div class="p-row" style="align-items:center">
      <select id="we-phst" style="flex:1">
        <option value="oled" ${(w.style||'oled')==='oled'?'selected':''}>OLED 미니멀 (검정 잠금화면)</option>
        <option value="glass" ${w.style==='glass'?'selected':''}>프로스트 글래스 (유리 알림)</option>
        <option value="term" ${w.style==='term'?'selected':''}>관제 단말 (세계관 터미널)</option>
        <option value="win" ${w.style==='win'?'selected':''}>레트로 창 (윈도우 98풍)</option>
      </select>
      <label class="chk" title="미니멀·글래스는 잠금화면 큰 시계, 관제 단말은 헤더의 초 단위 시계를 켜고 꺼요 (보는 사람의 현재 시각)"><input type="checkbox" id="we-phclk" ${w.clk!==false?'checked':''}> 🕐 시계</label>
      <label class="chk" title="화면에 보일 때 알림이 순서대로 떠올라요"><input type="checkbox" id="we-phanim" ${w.anim?'checked':''}> ✨ 움짤 효과</label>
      <label class="chk" title="다 뜨면 잠시 쉬었다가 처음부터 다시 재생돼요"><input type="checkbox" id="we-phloop" ${w.loop?'checked':''}> ↻ 반복 재생</label>
      <label class="chk" title="반복 한 바퀴가 끝나면 단말기가 접혔다가 다시 쌓여요 — 끄면 크기를 유지한 채 다시 떠요 (기본)"><input type="checkbox" id="we-phfold" ${w.fold?'checked':''}> ⇅ 접었다 펴기</label>
    </div>
    ${w.style==='term'||w.style==='win'?`
    <div class="p-row">
      <input data-phhd placeholder="헤더 라벨 (기본: SECURE LINE)" value="${esc(w.hd||'')}" style="flex:2" title="세계관 이름을 넣어보세요 — 예: FEARLESS · SECURE LINE">
      <input data-phhd2 placeholder="우측 코드 (기본: CH-07)" value="${esc(w.hd2||'')}" style="flex:1">
    </div>
    <input data-phsub placeholder="부제 (기본: INCOMING TRANSMISSION)" value="${esc(w.sub||'')}">`:''}
    <input id="we-phlab" placeholder="위젯 제목 (비우면 표시 안 함)" value="${esc(w.label??'')}">
    <div class="p-row" style="align-items:center;font-size:11px;color:var(--muted);gap:8px">
      바탕 <input type="color" id="we-phbg" value="${w.bg||'#0b0d12'}" style="width:38px;padding:0;flex:none" title="단말기 화면 배경색 — 밝은 색도 돼요 (글자색이 자동으로 맞춰져요)">
      글자 <input type="color" id="we-phtc" value="${w.tc||'#eef0f6'}" style="width:38px;padding:0;flex:none" title="비우면 바탕에 맞춰 자동">
      포인트 <input type="color" id="we-phac" value="${w.ac||'#d9a614'}" style="width:38px;padding:0;flex:none" title="관제 단말의 헤더·인디케이터 색">
      <button class="rmv" id="we-phrst" style="font-size:10px;margin-left:auto" title="색·케이싱을 디자인 기본(홈 테마 추종)으로 되돌려요">기본으로</button>
    </div>
    <div class="p-row" style="align-items:center;font-size:11px;color:var(--muted);gap:8px">
      케이싱 <select id="we-phcase" style="flex:1;max-width:220px" title="기기 테두리(케이싱) 스타일">
        <option value="" ${w.cs!=='solid'?'selected':''}>메탈 그라데이션</option>
        <option value="solid" ${w.cs==='solid'?'selected':''}>단색</option>
      </select>
      <input type="color" id="we-phcsc" value="${w.csc||'#262a35'}" style="width:38px;padding:0;flex:none" title="케이싱 색 — 그라데이션이면 이 색 기준으로 명암이 자동으로 잡혀요">
    </div>
    <div class="p-row" style="align-items:center;font-size:11px;color:var(--muted);gap:8px">
      크기 <input type="number" id="we-phwd" placeholder="가로 px" value="${+w.wd>0?+w.wd:''}" min="240" max="560" style="width:110px;flex:none" title="단말기 가로 폭 — 📌 플로팅이나 중앙 배치일 때 적용돼요. 비우면 자리 폭을 따라요. 340~400 추천">
      <input type="number" id="we-phmax" placeholder="높이 px" value="${+w.maxH>0?+w.maxH:''}" min="120" max="900" style="width:110px;flex:none" title="정하면 그 높이로 고정되고 넘치는 알림은 스크롤 — 비우면 알림 개수만큼만 좁아져요 (삐삐st)">
    </div>
    <p class="note">알림은 원하는 만큼 추가할 수 있어요. 높이를 비우면 알림 1~2개일 때 삐삐처럼 착 좁아지고, 정하면 그 크기로 고정돼요. 가로 폭은 📌 플로팅·중앙 배치에서 적용 — 340~400px가 단말기답습니다.</p>`
    +(w.lines||[]).map((l,i)=>`
    <div class="chl">
      <div class="chl-h">
        <input data-phic="${i}" placeholder="💬" value="${esc(l.icon||'')}" style="width:44px;text-align:center" title="알림 아이콘 (이모지)">
        <input data-phap="${i}" placeholder="앱·발신처 (예: FEARLESS 건강관리부)" value="${esc(l.app||'')}" class="chl-nm">
        <input data-phtm="${i}" placeholder="시간" value="${esc(l.time||'')}" style="width:64px" title="예: 지금, 9:41, 5분 전">
        <span class="chl-r">
          <button class="rmv" data-phup="${i}">↑</button>
          <button class="rmv" data-phdn="${i}">↓</button>
          <button class="rmv" data-phx="${i}">✕</button>
        </span>
      </div>
      <textarea data-phtx="${i}" placeholder="알림 내용" class="chl-tx">${esc(l.text||'')}</textarea>
    </div>`).join('')
    +`<button class="btn" id="we-phadd" style="font-size:12px">+ 알림 추가</button>`;
  html+=`<p class="note">입력은 즉시 반영돼요 — 마지막에 [위젯 구성 저장]만 누르면 저장 완료.</p>`;
  $('#wid-edit').innerHTML=html;
  // 라이브 바인딩: 쓰는 즉시 draft에 반영
  const t=$('#we-text'); if(t) t.addEventListener('input',()=>{ w.text=t.value; });
  const txan=$('#we-txanim'); if(txan) txan.addEventListener('change',()=>{
    if(txan.checked) w.anim=true; else delete w.anim; });
  const ntt=$('#we-ntt'); if(ntt) ntt.addEventListener('input',()=>{ w.title=ntt.value; });
  const semo=$('#we-semo'); if(semo) semo.addEventListener('input',()=>{ w.icons=semo.value; });
  const shint=$('#we-shint'); if(shint) shint.addEventListener('change',()=>{
    if(shint.checked) delete w.hint; else w.hint=false; });
  const sbg=$('#we-sbg'); if(sbg) sbg.addEventListener('change',()=>{
    if(sbg.value) w.sbg=sbg.value; else delete w.sbg; });
  const sbgc=$('#we-sbgc'); if(sbgc) sbgc.addEventListener('input',()=>{ w.sbgc=sbgc.value; });
  const sbga=$('#we-sbga'); if(sbga) sbga.addEventListener('input',()=>{ w.sbga=+sbga.value; });
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
  const chan=$('#we-chanim'); if(chan) chan.addEventListener('change',()=>{ if(chan.checked) w.anim='pop'; else delete w.anim; });
  const chlp=$('#we-chloop'); if(chlp) chlp.addEventListener('change',()=>{ if(chlp.checked) w.loop=true; else delete w.loop; });
  const chfd=$('#we-chfold'); if(chfd) chfd.addEventListener('change',()=>{ if(chfd.checked) w.fold=true; else delete w.fold; });
  const chmx=$('#we-chmax'); if(chmx) chmx.addEventListener('input',()=>{ const n=+chmx.value; if(n>0) w.maxH=n; else delete w.maxH; });
  const ltn=$('#we-ltn'); if(ltn) ltn.addEventListener('input',()=>{
    const n=+ltn.value; if(n>0) w.n=Math.min(n,20); else delete w.n; });
  const ltp=$('#we-ltpin'); if(ltp) ltp.addEventListener('change',()=>{
    if(ltp.checked) delete w.noPin; else w.noPin=true; });
  const qan=$('#we-qanim'); if(qan) qan.addEventListener('change',()=>{ w.anim=qan.checked; });
  const qmk=$('#we-qmark'); if(qmk) qmk.addEventListener('change',()=>{
    if(qmk.checked) delete w.noQm; else w.noQm=true; });
  const chcl=$('#we-chcl'); if(chcl) chcl.addEventListener('input',()=>{ w.cL=chcl.value; });
  const chcr=$('#we-chcr'); if(chcr) chcr.addEventListener('input',()=>{ w.cR=chcr.value; });
  const chtl=$('#we-chtl'); if(chtl) chtl.addEventListener('input',()=>{ w.tL=chtl.value; });
  const chtr=$('#we-chtr'); if(chtr) chtr.addEventListener('input',()=>{ w.tR=chtr.value; });
  const chtx=$('#we-chtx'); if(chtx) chtx.onclick=()=>{ delete w.tL; delete w.tR; renderWidEdit(); };
  const chcx=$('#we-chcx'); if(chcx) chcx.onclick=()=>{ delete w.cL; delete w.cR; renderWidEdit(); };
  const chff=$('#we-chff'); if(chff) chff.addEventListener('change',()=>{ w.font=chff.value; });
  const chfs=$('#we-chfs'); if(chfs) chfs.addEventListener('input',()=>{ w.fs=+chfs.value; });
  const chimg=$('#we-chimg'); if(chimg) chimg.addEventListener('change',()=>{ w.imgs=chimg.checked; });
  /* 단말기(phone) 위젯 바인딩 */
  const phlab=$('#we-phlab'); if(phlab) phlab.addEventListener('input',()=>{ w.label=phlab.value; });
  const phst=$('#we-phst'); if(phst) phst.addEventListener('change',()=>{
    if(phst.value==='oled') delete w.style; else w.style=phst.value; renderWidEdit(); });
  const phbg=$('#we-phbg'); if(phbg) phbg.addEventListener('input',()=>{ w.bg=phbg.value; });
  const phtc=$('#we-phtc'); if(phtc) phtc.addEventListener('input',()=>{ w.tc=phtc.value; });
  const phac=$('#we-phac'); if(phac) phac.addEventListener('input',()=>{ w.ac=phac.value; });
  const phrst=$('#we-phrst'); if(phrst) phrst.onclick=()=>{
    delete w.bg; delete w.tc; delete w.ac; delete w.cs; delete w.csc;
    renderWidEdit(); msg('색·케이싱을 디자인 기본으로 되돌렸어요.'); };
  const phmax=$('#we-phmax'); if(phmax) phmax.addEventListener('input',()=>{
    const n=+phmax.value; if(n>0) w.maxH=n; else delete w.maxH; });
  const phcase=$('#we-phcase'); if(phcase) phcase.addEventListener('change',()=>{
    if(phcase.value==='solid') w.cs='solid'; else delete w.cs; });
  const phcsc=$('#we-phcsc'); if(phcsc) phcsc.addEventListener('input',()=>{ w.csc=phcsc.value; });
  const phwd=$('#we-phwd'); if(phwd) phwd.addEventListener('input',()=>{
    const n=+phwd.value; if(n>0) w.wd=n; else delete w.wd; });
  const phhd=$('#wid-edit [data-phhd]'); if(phhd) phhd.addEventListener('input',()=>{ w.hd=phhd.value; });
  const phhd2=$('#wid-edit [data-phhd2]'); if(phhd2) phhd2.addEventListener('input',()=>{ w.hd2=phhd2.value; });
  const phsub=$('#wid-edit [data-phsub]'); if(phsub) phsub.addEventListener('input',()=>{ w.sub=phsub.value; });
  const phclk=$('#we-phclk'); if(phclk) phclk.addEventListener('change',()=>{
    if(phclk.checked) delete w.clk; else w.clk=false; });
  const phanim=$('#we-phanim'); if(phanim) phanim.addEventListener('change',()=>{
    if(phanim.checked) w.anim='pop'; else{ delete w.anim; delete w.loop; renderWidEdit(); } });
  const phloop=$('#we-phloop'); if(phloop) phloop.addEventListener('change',()=>{
    if(phloop.checked) w.loop=true; else delete w.loop; });
  const phfd=$('#we-phfold'); if(phfd) phfd.addEventListener('change',()=>{
    if(phfd.checked) w.fold=true; else delete w.fold; });
  const tltt=$('#we-tltt'); if(tltt) tltt.addEventListener('input',()=>{
    if(tltt.value.trim()) w.title=tltt.value; else delete w.title; });
  const tlst=$('#we-tlst'); if(tlst) tlst.addEventListener('change',()=>{
    if(tlst.value) w.style=tlst.value; else delete w.style; });
  document.querySelectorAll('[data-tld]').forEach(el=>el.addEventListener('input',()=>{
    (w.items??=[])[+el.dataset.tld].d=el.value; }));
  document.querySelectorAll('[data-tltt]').forEach(el=>el.addEventListener('input',()=>{
    (w.items??=[])[+el.dataset.tltt].tt=el.value; }));
  const tldot=$('#we-tldot'); if(tldot) tldot.addEventListener('input',()=>{
    if(tldot.value.trim()) w.dot=tldot.value.trim(); else delete w.dot; });
  document.querySelectorAll('[data-tlt]').forEach(el=>el.addEventListener('input',()=>{
    (w.items??=[])[+el.dataset.tlt].t=el.value; }));
  document.querySelectorAll('[data-tlx]').forEach(el=>el.onclick=()=>{
    w.items.splice(+el.dataset.tlx,1); renderWidEdit(); });
  const tlad=$('#we-tladd'); if(tlad) tlad.onclick=()=>{ (w.items??=[]).push({d:'',tt:'',t:''}); renderWidEdit(); };
  const tlan=$('#we-tlanim'); if(tlan) tlan.addEventListener('change',()=>{
    if(tlan.checked) w.anim=true; else delete w.anim; });
  const tllp=$('#we-tlloop'); if(tllp) tllp.addEventListener('change',()=>{
    if(tllp.checked) w.loop=true; else delete w.loop; });
  const tlfd=$('#we-tlfold'); if(tlfd) tlfd.addEventListener('change',()=>{
    if(tlfd.checked) w.fold=true; else delete w.fold; });
  const tlmx=$('#we-tlmax'); if(tlmx) tlmx.addEventListener('input',()=>{
    const v=+tlmx.value; if(v>=120) w.maxH=Math.min(v,900); else delete w.maxH; });
  const fttt=$('#we-fttt'); if(fttt) fttt.addEventListener('input',()=>{
    if(fttt.value.trim()) w.title=fttt.value; else delete w.title; });
  const ftn=$('#we-ftn'); if(ftn) ftn.addEventListener('input',()=>{
    const n=+ftn.value; if(n>0) w.n=Math.min(n,20); else delete w.n; });
  const ftic=$('#we-ftic'); if(ftic) ftic.addEventListener('input',()=>{
    if(ftic.value.trim()) w.icon=ftic.value.trim(); else delete w.icon; });
  const phadd=$('#we-phadd'); if(phadd) phadd.onclick=()=>{
    w.lines=w.lines||[]; w.lines.push({icon:'💬',app:'',time:'지금',text:''}); renderWidEdit(); };
  const phmv=(i,dir)=>{ const j=i+dir; if(j<0||j>=w.lines.length) return;
    [w.lines[i],w.lines[j]]=[w.lines[j],w.lines[i]]; renderWidEdit(); };
  $('#wid-edit').querySelectorAll('[data-phup]').forEach(b=>b.onclick=()=>phmv(+b.dataset.phup,-1));
  $('#wid-edit').querySelectorAll('[data-phdn]').forEach(b=>b.onclick=()=>phmv(+b.dataset.phdn,1));
  $('#wid-edit').querySelectorAll('[data-phic]').forEach(i2=>i2.addEventListener('input',()=>{ w.lines[i2.dataset.phic].icon=i2.value; }));
  $('#wid-edit').querySelectorAll('[data-phap]').forEach(i2=>i2.addEventListener('input',()=>{ w.lines[i2.dataset.phap].app=i2.value; }));
  $('#wid-edit').querySelectorAll('[data-phtm]').forEach(i2=>i2.addEventListener('input',()=>{ w.lines[i2.dataset.phtm].time=i2.value; }));
  $('#wid-edit').querySelectorAll('[data-phtx]').forEach(i2=>i2.addEventListener('input',()=>{ w.lines[i2.dataset.phtx].text=i2.value; }));
  $('#wid-edit').querySelectorAll('[data-phx]').forEach(b=>b.onclick=()=>{
    w.lines.splice(+b.dataset.phx,1); renderWidEdit(); });
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
  const ddc=$('#we-ddcard'); if(ddc) ddc.addEventListener('change',()=>{
    if(ddc.checked) delete w.off; else w.off=true; });
  const ddh=$('#we-ddhead'); if(ddh) ddh.addEventListener('change',()=>{
    pdraft.ddHead=ddh.checked; });
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
  const bgst=$('#we-bgst'); if(bgst) bgst.addEventListener('change',()=>{
    if(bgst.value) w.style=bgst.value; else delete w.style; });
  const bgsub=$('#we-bgsub'); if(bgsub) bgsub.addEventListener('input',()=>{
    if(bgsub.value.trim()) w.sub=bgsub.value; else delete w.sub; });
  const bgbg=$('#we-bgbg'); if(bgbg) bgbg.addEventListener('input',()=>{ w.bg=bgbg.value; });
  const bgtc=$('#we-bgtc'); if(bgtc) bgtc.addEventListener('input',()=>{ w.tc=bgtc.value; });
  const bgac=$('#we-bgac'); if(bgac) bgac.addEventListener('input',()=>{ w.ac=bgac.value; });
  const bgrst=$('#we-bgrst'); if(bgrst) bgrst.onclick=()=>{
    delete w.bg; delete w.tc; delete w.ac; renderWidEdit(); msg('색을 디자인 기본으로 되돌렸어요.'); };
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
  if(['search','category','dday','bgm','profile','cnt','pin'].includes(t) && draft.some(w=>w.t===t)){
    msg('이미 있는 위젯이에요.'); return; }
  draft.push(['links','banner','nb','tl'].includes(t)?{t,items:[]}:{t});
  editIdx=draft.length-1; renderWidList();
  if(['profile','quote','links','banner','dday','bgm','notice','chat','phone','img','nb','text','stamp','tl','feat','latest'].includes(t)) renderWidEdit();
};
$('#wid-save').onclick=async()=>{
  if(editIdx>=0 && draft[editIdx]) syncWid(draft[editIdx]);
  msg('저장 중...');
  try{
    const projected={...st.page, side:draft, ddays:pdraft.ddays, ddHead:pdraft.ddHead!==false, bgm:pdraft.bgm, noLatest:!draft.some(w=>w.t==='latest')};
    const tot=JSON.stringify(projected).length;
    if(tot>980000){
      const wKB=Math.round((JSON.stringify(draft).length+JSON.stringify(pdraft.ddays).length)/1370);
      msg('용량 초과 — 안내창을 확인하세요.');
      alert('홈 설정 용량 초과!\n\n사진은 별도 저장소에 올라가지만, 옛날에 올린 사진이 남아 있으면 커질 수 있어요.\n해당 위젯 사진을 지우고 다시 올리면 해결돼요.\n지금 합산: 약 '+Math.round(tot/1370)+'KB\n· 위젯 사진(프로필·배너·디데이): 약 '+wKB+'KB\n· 꾸미기 사진(헤더·대문·배경): 약 '+Math.round((tot-JSON.stringify(draft).length-JSON.stringify(pdraft.ddays).length)/1370)+'KB\n\n배너·헤더 등 큰 사진을 지우거나 다시 올리면(자동 압축 강화) 들어가요.'); return; }
    const dd=pdraft.ddays.filter(x=>x.title&&x.date);
    await updateDoc(doc(db,'pages',st.handle),{side:draft, ddays:dd, ddHead:pdraft.ddHead!==false, bgm:pdraft.bgm, noLatest:!draft.some(w=>w.t==='latest')});
    st.page.side=JSON.parse(JSON.stringify(draft));
    st.page.ddays=dd; st.page.bgm={...pdraft.bgm};
    const d0=dd[0];
    $('#pg-dday-main').innerHTML = d0?`<p class="n">${esc(dday(d0.date))}</p><p class="t">${esc(d0.title)}</p>`:'';
    widSnap=JSON.stringify({d:draft,p:pdraft});   // 저장됨 — dirty 해제
    renderSide(); msg('위젯 구성 저장 완료!');
  }catch(e){ msg('오류: '+e.message); alert('저장 실패: '+e.message); }
};
function closePanelGuard(){
  /* 위젯 구성에 저장 안 한 변경이 있으면 경고 — 공지 내용 증발 사건 재발 방지 */
  if(widSnap){
    if(editIdx>=0 && draft[editIdx]) syncWid(draft[editIdx]);
    if(JSON.stringify({d:draft,p:pdraft})!==widSnap
       && !confirm('위젯 구성에 저장 안 한 변경이 있어요!\n[위젯 구성 저장]을 누르지 않으면 사라져요.\n\n그래도 닫을까요?')) return;
  }
  widSnap=''; $('#panel').classList.remove('show','wfull');
}
$('#p-close').onclick=closePanelGuard;
/* ── 위젯 편집 모드 ── */
st.editMode=false;
$('#btn-edit').onclick=()=>{
  st.editMode=!st.editMode;
  $('#btn-edit').classList.toggle('on', st.editMode);
  document.body.classList.toggle('editmode', st.editMode);
  renderSide();
  msg(st.editMode ? '위젯 편집 모드 — 드래그·↑↓로 배치를 바꾸세요. 다 되면 ⠿를 다시 누르세요.'
                  : '편집 모드를 껐어요.');
};
$('#panel').addEventListener('click',e=>{ if(e.target.id==='panel') closePanelGuard(); });
document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('.tabs button').forEach(x=>x.classList.toggle('on',x===b));
  document.querySelectorAll('.pane').forEach(p=>p.classList.toggle('hidden',p.dataset.pane!==b.dataset.tab));
});
$('#w-secret').addEventListener('change',e=>$('#w-pw').style.display=e.target.checked?'':'none');
/* 채팅 움짤 — 화면에 보일 때 1회, 말풍선을 순서대로 재생 */
function chatPlay(el){
  const lines=[...el.querySelectorAll('.ch-line')];
  const box=el.querySelector('.ch-box');
  if(matchMedia('(prefers-reduced-motion: reduce)').matches){
    lines.forEach(l=>l.classList.add('ch-in'));
    if(box){ box.style.minHeight=''; box.scrollTop=0; }  // 예약 해제 + 처음부터
    return;
  }
  if(box) box.scrollTop=0;                         // 맨 위에서 시작
  let i=0;
  if(el.dataset.warm==='1'){                       // 홈 복귀 이어돌기(phase196): 완성 상태로 시작
    lines.forEach(l=>l.classList.add('ch-in'));    // → 반복 위젯은 다음 사이클부터 자연스럽게
    i=lines.length;
    if(box){ box.style.minHeight=''; box.style.minHeight=box.clientHeight+'px'; box.scrollTop=box.scrollHeight; }
  }
  const step=()=>{
    if(!el.isConnected) return;                    // 화면이 새로 그려졌으면 중단
    if(i>=lines.length){
      if(el.dataset.akey){ (window.__animDone??=new Set()).add(el.dataset.akey); }  // 세션 재생 완료 표식(phase196)
      if(box){                                     // 자리 예약 보정(phase189→190) — 폰트 로딩 전 과다 측정 잔존 제거
        box.style.minHeight='';                    // 해제 후 '표시 높이'로 갱신 — scrollHeight를 쓰면
        if(el.dataset.loop==='1')                  // 최대 높이로 잘린 채팅이 풀사이즈로 튀어나옴(min>max 우선)
          box.style.minHeight=box.clientHeight+'px';
      }
      if(el.dataset.loop==='1')                    // ↻ 반복 재생
        setTimeout(()=>{ if(!el.isConnected) return;
          if(box && el.dataset.fold==='1' && !el.classList.contains('ch-scroll')){
            box.style.transition='min-height .5s ease';   // ⇅ 접었다 펴기 옵션(phase193) — 켠 경우에만
            box.style.minHeight='0px';                    // 접혔다가 다시 쌓임. 기본은 크기 유지
          }                                               //   (최대 높이 고정 창은 항상 유지)
          lines.forEach(l=>l.classList.remove('ch-in'));
          if(box) box.scrollTop=0;
          i=0; setTimeout(step, 500);
        }, 2400);
      return;
    }
    lines[i].classList.add('ch-in');
    if(box && box.scrollHeight>box.clientHeight)   // 창이 차오른 뒤부터만 아래로
      box.scrollTo({top:box.scrollHeight, behavior:'smooth'});
    i++; setTimeout(step, 650);
  };
  setTimeout(step, 420);
}
const chatIO = ('IntersectionObserver' in window)
  ? new IntersectionObserver(es=>es.forEach(e=>{
      if(e.isIntersecting){ chatIO.unobserve(e.target); chatPlay(e.target); }
    }),{threshold:.25})
  : null;
function chatObserve(el){ if(chatIO) chatIO.observe(el); else chatPlay(el); }
/* 인용구 타이핑 — 보일 때 1회, 한 글자씩 */
function typeRun(p, text){
  if(matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const full=String(text); let i=0;
  p.classList.add('typing'); p.textContent='';
  const tick=()=>{
    i++;
    p.innerHTML=esc(full.slice(0,i)).replace(/\n/g,'<br>');
    if(i<full.length) setTimeout(tick, full[i-1]==='\n'?260:62);
    else setTimeout(()=>p.classList.remove('typing'), 2600);
  };
  setTimeout(tick, 350);
}
const typeIO = ('IntersectionObserver' in window)
  ? new IntersectionObserver(es=>es.forEach(e=>{
      if(e.isIntersecting){ typeIO.unobserve(e.target);
        typeRun(e.target, e.target.dataset.typetext); }
    }),{threshold:.35})
  : null;
function typeObserve(p, text){
  p.dataset.typetext=text;
  if(typeIO) typeIO.observe(p); else typeRun(p, text);
}

/* 서식 툴바 — 선택한 글자를 감싸요 */
function wrapSel(mk, tag, taId){
  const ta=$(taId||'#w-body');
  const sc=ta.scrollTop;                             // 본문 재조립 시 스크롤 유실 방지(phase225)
  const s=ta.selectionStart??ta.value.length, e=ta.selectionEnd??s;
  const sel=ta.value.slice(s,e)||'글자';
  const [o,c]=(!taId && $('#w-html').checked) ? [`<${tag}>`,`</${tag}>`] : [mk,mk];
  ta.value=ta.value.slice(0,s)+o+sel+c+ta.value.slice(e);
  ta.focus(); ta.setSelectionRange(s+o.length, s+o.length+sel.length);
  ta.scrollTop=sc;
}
document.querySelectorAll('#w-fmt [data-fmt]').forEach(b=>{
  const map={b:['**','b'], i:['*','i'], u:['__','u'], s:['~~','s'], h:['==','mark']};
  b.onclick=()=>{ const [mk,tag]=map[b.dataset.fmt]; wrapSel(mk,tag); };
});
document.querySelectorAll('#mm-fmt [data-fmt]').forEach(b=>{
  const map={b:['**','b'], i:['*','i'], u:['__','u'], s:['~~','s'], h:['==','mark']};
  b.onclick=()=>{ const [mk,tag]=map[b.dataset.fmt]; wrapSel(mk,tag,'#mm-body'); };
});
let wImgs=[];
function insertWTag(n){
  const ta=$('#w-body'), tk=`\n[사진${n}]\n`,
        s=ta.selectionStart??ta.value.length, sc=ta.scrollTop;
  ta.value = ta.value.slice(0,s)+tk+ta.value.slice(ta.selectionEnd??s);
  const c=s+tk.length; ta.focus(); ta.setSelectionRange(c,c); ta.scrollTop=sc;
}
function renderWImgs(){
  const box=$('#w-img-list'); if(!box) return;
  box.innerHTML = wImgs.map((im,i)=>
    `<span class="wim" data-wim="${i}" title="누르면 커서 자리에 [사진${i+1}] 삽입"><img src="${im}" alt=""><i>${i+1}</i></span>`).join('');
  box.querySelectorAll('[data-wim]').forEach(el=>el.onclick=()=>{
    insertWTag(+el.dataset.wim+1);
    msg(`[사진${+el.dataset.wim+1}] 넣었어요 — 발행하면 그 자리에 사진이 나와요.`);
  });
}
$('#w-img').addEventListener('change',async e=>{
  const f=e.target.files[0]; if(!f) return;
  msg('이미지 압축 중...');
  wImgs.push(await upFile(f,1600,.88,180));
  insertWTag(wImgs.length);
  renderWImgs();
  e.target.value='';
  msg(`사진 ${wImgs.length} 삽입됨 — 아래 썸네일을 누르면 다른 자리에도 넣을 수 있어요.`);
});
let msgTimer=null;
const msg=t=>{
  const p=$('#p-msg'); if(p) p.textContent=t;
  const panelOpen=$('#panel')?.classList.contains('show');
  const el=$('#toast');
  if(!panelOpen && t && el){
    el.textContent=t; el.classList.add('on');
    clearTimeout(msgTimer);
    msgTimer=setTimeout(()=>el.classList.remove('on'),3400);
  }
};

let editPost=null, editGal=null;
function clearWriteForm(){
  editPost=null;
  ['w-title','w-pw','w-body'].forEach(i=>$('#'+i).value='');
  $('#w-secret').checked=false; $('#w-pin').checked=false; $('#w-priv').checked=false; $('#w-feat').checked=false; $('#w-pw').style.display='none';
  $('#w-cmt').checked=true; $('#w-html').checked=false; wImgs=[]; renderWImgs();
  const dN=new Date(), wdi=$('#w-date');
  if(wdi) wdi.value=dN.getFullYear()+'-'+String(dN.getMonth()+1).padStart(2,'0')+'-'+String(dN.getDate()).padStart(2,'0');
  $('#w-go').textContent='발행'; $('#w-edit-note').classList.add('hidden');
}
function startEditPost(){
  const p=st.cur; if(!p) return;
  if(isMemo(p.cat) && !p.secret){ openMemoModalEdit(p); return; }   // 🗒 메모는 팝업으로 수정(비밀 메모는 기존 경로)
  refreshWriteCats(); refreshGalCats();
  editPost=p.id;
  $('#w-title').value=p.title||'';
  $('#w-cat').value=p.cat||'';
  const wde=$('#w-date'); if(wde&&p.date) wde.value=p.date.replaceAll('.','-');
  if(!p.secret && typeof p.raw==='string' && p.raw!==''){
    $('#w-body').value=p.raw; $('#w-html').checked=!!p.html;
  }else{
    const src = p.secret ? (st.curBody||'') : (p.body||'');
    $('#w-body').value = htmlToText(src); $('#w-html').checked=false;
  }
  wImgs = Array.isArray(p.imgs) ? p.imgs.slice() : []; renderWImgs();
  $('#w-pin').checked=!!p.pinned;
  $('#w-cmt').checked=!p.cmtOff;
  $('#w-secret').checked=!!p.secret; $('#w-priv').checked=!!p.priv; $('#w-feat').checked=!!p.feat;
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
$('#w-cancel').onclick=()=>{
  const pid=editPost;                              // 수정 중이던 글 기억
  clearWriteForm();
  $('#panel').classList.remove('show','wfull');    // 패널 닫고
  if(pid) openPost(pid,true);                      // 원래 글로 복귀 — "글이 사라졌다" 착시 방지(phase221)
  msg(pid?'수정을 취소했어요 — 글은 원래대로 그대로예요.':'작성을 취소했어요.');
};
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
    const wd=$('#w-date')?.value||'';                              // YYYY-MM-DD (phase233 작성일 지정)
    const wdDot=wd?wd.replaceAll('-','.'):today();
    const data={ title, cat, date:wdDot,
      ts: wdDot===today()?serverTimestamp():new Date(+wd.slice(0,4), +wd.slice(5,7)-1, +wd.slice(8,10), 12, 0, 0),
      secret, pinned:pin, cmtOff,
      priv: $('#w-priv').checked,
      feat: $('#w-feat').checked,
      mpin: editPost ? !!(st.posts.find(p2=>p2.id===editPost)?.mpin) : false,
      excerpt: secret?'':(asHtml?raw.replace(/<[^>]+>/g,' '):raw.replace(/\*\*|__|~~|==|\*/g,'')).replace(/\s+/g,' ').trim().slice(0,70),
      html: asHtml, imgs: wImgs.slice() };
    if(!secret) data.raw = raw;          // 원문 보관(수정 시 그대로 열기)
    else data.raw = '';                  // 비밀글은 원문을 남기지 않음
    if(secret) data.enc=await encTxt(pw,html); else data.body=html;
    if(JSON.stringify(data).length>980000){ msg('이 글의 본문 이미지가 너무 많아요 — 사진 수를 줄여주세요. (꾸미기 용량과는 별개예요)'); return; }
    if(pin) await Promise.all(st.posts.filter(p=>p.pinned).map(p=>
      updateDoc(doc(db,'pages',st.handle,'posts',p.id),{pinned:false})));
    if(editPost){
      const old=st.posts.find(p=>p.id===editPost)||{};
      const dateNoon=s=>{ const[y,m,d]=(s||'').split('.').map(Number);
        return (y&&m&&d)?new Date(y,m-1,d,12,0,0):new Date(); };
      const upd={...data,
        ts: data.date===(old.date||'')
          ? (old.ts || dateNoon(old.date||data.date))   // 승계 — ts 없던 옛 글도 '지금'이 아니라 제 날짜 자리로(phase235)
          : data.ts,
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
    const d0=wd?new Date(+wd.slice(0,4),+wd.slice(5,7)-1,+wd.slice(8,10)):new Date(), pad=n=>String(n).padStart(2,'0');
    const base=String(d0.getFullYear()).slice(2)+pad(d0.getMonth()+1)+pad(d0.getDate());
    const used=new Set(st.posts.map(p=>p.id));
    let nid='', n=1;
    do{ nid=base+'-'+n.toString(36); n++; }while(used.has(nid)&&n<400);
    await setDoc(doc(db,'pages',st.handle,'posts',nid),data);
    await loadContent(); renderWidgets(); renderList();
    clearWriteForm();
    $('#panel').classList.remove('show','wfull');   // 집필 창 닫기
    msg('발행 완료!');
  }catch(e){ msg('오류: '+e.message); }
};

function startEditGal(id){
  const g=st.gallery.find(x=>x.id===id); if(!g) return;
  editGal=id; refreshGalCats();
  $('#g-title').value=g.title||''; $('#g-cat').value=g.cat||''; $('#g-priv').checked=!!g.priv;
  $('#g-file').value='';
  $('#g-go').textContent='수정 완료';
  $('#g-edit-note').classList.remove('hidden');
  $('#g-edit-note').textContent='✎ 사진 정보 수정 중 — 이미지를 새로 고르면 사진도 교체돼요.';
  openPanel('write'); switchTab('galup');
}
function clearGalForm(){
  editGal=null; $('#g-title').value=''; $('#g-file').value=''; $('#g-priv').checked=false;
  $('#g-go').textContent='업로드'; $('#g-edit-note').classList.add('hidden');
}
$('#g-cancel').onclick=()=>{ clearGalForm(); msg('수정을 취소했어요.'); };
$('#g-go').onclick=async()=>{
  if(editGal){
    try{
      const f=$('#g-file').files[0];
      const upd={title:$('#g-title').value.trim(), cat:$('#g-cat').value||'', priv:$('#g-priv').checked};
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
      {img,title:$('#g-title').value.trim(),cat:$('#g-cat').value||'',priv:$('#g-priv').checked,ts:serverTimestamp()});
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
        <span style="font-size:11px;color:var(--muted)">사진 ${i+1}${i===0?' (첫 장 — 슬라이드 시작·입장 화면 기본)':''}</span>
        <span style="display:flex;gap:5px">
          <button class="rmv" data-hu="${i}" title="위로" ${i===0?'disabled':''}>↑</button>
          <button class="rmv" data-hd="${i}" title="아래로" ${i===heroDraft.length-1?'disabled':''}>↓</button>
          <button class="rm2" data-hx="${i}">✕</button>
        </span>
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
  const hmove=(i,d)=>{ const j=i+d;
    if(j<0||j>=heroDraft.length) return;
    [heroDraft[i],heroDraft[j]]=[heroDraft[j],heroDraft[i]];
    renderHeroList(); msg('순서 변경 — [설정 저장]을 눌러야 확정돼요.'); };
  box.querySelectorAll('[data-hu]').forEach(b=>b.onclick=()=>hmove(+b.dataset.hu,-1));
  box.querySelectorAll('[data-hd]').forEach(b=>b.onclick=()=>hmove(+b.dataset.hd, 1));
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
  snow:{ nm:'눈 내리는 밤', css:
`/* ═ 프리셋: 눈 내리는 밤 ═ */
body::before,
body::after{
  content:'';position:fixed;inset:0;pointer-events:none;z-index:4;
}
/* 잔눈 — 조금 빠르게, 살짝 비스듬히 */
body::before{
  background-image:
    radial-gradient(1.7px 1.7px at 64px 155px, rgba(255,255,255,0.67), transparent 100%),
    radial-gradient(1.8px 1.8px at 158px 125px, rgba(255,255,255,0.53), transparent 100%),
    radial-gradient(2.0px 2.0px at 7px 236px, rgba(255,255,255,0.62), transparent 100%),
    radial-gradient(2.2px 2.2px at 63px 53px, rgba(255,255,255,0.71), transparent 100%),
    radial-gradient(1.7px 1.7px at 218px 144px, rgba(255,255,255,0.79), transparent 100%),
    radial-gradient(1.8px 1.8px at 42px 63px, rgba(255,255,255,0.89), transparent 100%),
    radial-gradient(1.9px 1.9px at 137px 103px, rgba(255,255,255,0.8), transparent 100%),
    radial-gradient(2.0px 2.0px at 20px 44px, rgba(255,255,255,0.77), transparent 100%),
    radial-gradient(1.2px 1.2px at 81px 203px, rgba(255,255,255,0.89), transparent 100%),
    radial-gradient(1.9px 1.9px at 125px 156px, rgba(255,255,255,0.9), transparent 100%),
    radial-gradient(2.1px 2.1px at 186px 205px, rgba(255,255,255,0.68), transparent 100%),
    radial-gradient(1.6px 1.6px at 209px 151px, rgba(255,255,255,0.92), transparent 100%),
    radial-gradient(1.3px 1.3px at 228px 97px, rgba(255,255,255,0.56), transparent 100%),
    radial-gradient(2.2px 2.2px at 59px 70px, rgba(255,255,255,0.7), transparent 100%),
    radial-gradient(1.5px 1.5px at 164px 222px, rgba(255,255,255,0.73), transparent 100%),
    radial-gradient(1.6px 1.6px at 102px 150px, rgba(255,255,255,0.76), transparent 100%);
  background-size:260px 260px;
  animation:snowA 13s linear infinite;
}
/* 함박눈 — 크고 흐리게, 천천히 */
body::after{
  background-image:
    radial-gradient(4.4px 4.4px at 303px 122px, rgba(255,255,255,0.42) 60%, transparent 100%),
    radial-gradient(4.6px 4.6px at 18px 147px, rgba(255,255,255,0.42) 60%, transparent 100%),
    radial-gradient(4.3px 4.3px at 87px 361px, rgba(255,255,255,0.49) 60%, transparent 100%),
    radial-gradient(2.8px 2.8px at 296px 295px, rgba(255,255,255,0.41) 60%, transparent 100%),
    radial-gradient(3.1px 3.1px at 328px 297px, rgba(255,255,255,0.28) 60%, transparent 100%),
    radial-gradient(4.6px 4.6px at 250px 331px, rgba(255,255,255,0.27) 60%, transparent 100%),
    radial-gradient(4.4px 4.4px at 38px 214px, rgba(255,255,255,0.26) 60%, transparent 100%),
    radial-gradient(4.3px 4.3px at 222px 216px, rgba(255,255,255,0.26) 60%, transparent 100%),
    radial-gradient(3.4px 3.4px at 318px 27px, rgba(255,255,255,0.4) 60%, transparent 100%);
  background-size:380px 380px;
  animation:snowB 27s linear infinite;
}
@keyframes snowA{from{background-position:0 0}to{background-position:-46px 260px}}
@keyframes snowB{from{background-position:0 0}to{background-position:58px 380px}}
@media (max-width:640px){ body::after{opacity:.6} }`},
  sakura:{ nm:'벚꽃 흩날림', css:
`/* ═ 프리셋: 벚꽃 흩날림 ═ */

/* 색 — 기본 벚꽃 분홍. #fff0f5(연하게), #f6a8c0(진하게) 등으로 바꿔도 돼요. */
body{ --sakura:#ffd7e2; }

body::before,
body::after{
  content:'';position:fixed;inset:0;pointer-events:none;z-index:4;
  background-color:var(--sakura);
  -webkit-mask-repeat:repeat; mask-repeat:repeat;
}
/* 앞쪽 꽃잎 — 빙글 돌며 비스듬히 */
body::before{
  -webkit-mask-image:url("data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='280'%20height='280'%20viewBox='0%200%20280%20280'%3E%3Cpath%20d='M0,-1%20C0.55,-0.9%200.75,-0.3%200.45,0.35%20C0.25,0.75%20-0.25,0.75%20-0.45,0.35%20C-0.75,-0.3%20-0.55,-0.9%200,-1%20Z'%20fill='%23fff'%20fill-opacity='0.93'%20transform='translate(245,199)%20rotate(95)%20scale(5.4)'/%3E%3Cpath%20d='M0,-1%20C0.55,-0.9%200.75,-0.3%200.45,0.35%20C0.25,0.75%20-0.25,0.75%20-0.45,0.35%20C-0.75,-0.3%20-0.55,-0.9%200,-1%20Z'%20fill='%23fff'%20fill-opacity='0.54'%20transform='translate(11,181)%20rotate(309)%20scale(6.3)'/%3E%3Cpath%20d='M0,-1%20C0.55,-0.9%200.75,-0.3%200.45,0.35%20C0.25,0.75%20-0.25,0.75%20-0.45,0.35%20C-0.75,-0.3%20-0.55,-0.9%200,-1%20Z'%20fill='%23fff'%20fill-opacity='0.98'%20transform='translate(28,202)%20rotate(231)%20scale(5.1)'/%3E%3Cpath%20d='M0,-1%20C0.55,-0.9%200.75,-0.3%200.45,0.35%20C0.25,0.75%20-0.25,0.75%20-0.45,0.35%20C-0.75,-0.3%20-0.55,-0.9%200,-1%20Z'%20fill='%23fff'%20fill-opacity='0.56'%20transform='translate(224,88)%20rotate(26)%20scale(5.1)'/%3E%3Cpath%20d='M0,-1%20C0.55,-0.9%200.75,-0.3%200.45,0.35%20C0.25,0.75%20-0.25,0.75%20-0.45,0.35%20C-0.75,-0.3%20-0.55,-0.9%200,-1%20Z'%20fill='%23fff'%20fill-opacity='0.89'%20transform='translate(267,40)%20rotate(196)%20scale(7.2)'/%3E%3Cpath%20d='M0,-1%20C0.55,-0.9%200.75,-0.3%200.45,0.35%20C0.25,0.75%20-0.25,0.75%20-0.45,0.35%20C-0.75,-0.3%20-0.55,-0.9%200,-1%20Z'%20fill='%23fff'%20fill-opacity='0.86'%20transform='translate(60,157)%20rotate(114)%20scale(5.2)'/%3E%3Cpath%20d='M0,-1%20C0.55,-0.9%200.75,-0.3%200.45,0.35%20C0.25,0.75%20-0.25,0.75%20-0.45,0.35%20C-0.75,-0.3%20-0.55,-0.9%200,-1%20Z'%20fill='%23fff'%20fill-opacity='0.7'%20transform='translate(223,52)%20rotate(107)%20scale(7.2)'/%3E%3Cpath%20d='M0,-1%20C0.55,-0.9%200.75,-0.3%200.45,0.35%20C0.25,0.75%20-0.25,0.75%20-0.45,0.35%20C-0.75,-0.3%20-0.55,-0.9%200,-1%20Z'%20fill='%23fff'%20fill-opacity='0.94'%20transform='translate(182,30)%20rotate(2)%20scale(5.2)'/%3E%3Cpath%20d='M0,-1%20C0.55,-0.9%200.75,-0.3%200.45,0.35%20C0.25,0.75%20-0.25,0.75%20-0.45,0.35%20C-0.75,-0.3%20-0.55,-0.9%200,-1%20Z'%20fill='%23fff'%20fill-opacity='0.51'%20transform='translate(36,201)%20rotate(71)%20scale(7.5)'/%3E%3Cpath%20d='M0,-1%20C0.55,-0.9%200.75,-0.3%200.45,0.35%20C0.25,0.75%20-0.25,0.75%20-0.45,0.35%20C-0.75,-0.3%20-0.55,-0.9%200,-1%20Z'%20fill='%23fff'%20fill-opacity='0.56'%20transform='translate(225,65)%20rotate(1)%20scale(7.9)'/%3E%3C/svg%3E");
          mask-image:url("data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='280'%20height='280'%20viewBox='0%200%20280%20280'%3E%3Cpath%20d='M0,-1%20C0.55,-0.9%200.75,-0.3%200.45,0.35%20C0.25,0.75%20-0.25,0.75%20-0.45,0.35%20C-0.75,-0.3%20-0.55,-0.9%200,-1%20Z'%20fill='%23fff'%20fill-opacity='0.93'%20transform='translate(245,199)%20rotate(95)%20scale(5.4)'/%3E%3Cpath%20d='M0,-1%20C0.55,-0.9%200.75,-0.3%200.45,0.35%20C0.25,0.75%20-0.25,0.75%20-0.45,0.35%20C-0.75,-0.3%20-0.55,-0.9%200,-1%20Z'%20fill='%23fff'%20fill-opacity='0.54'%20transform='translate(11,181)%20rotate(309)%20scale(6.3)'/%3E%3Cpath%20d='M0,-1%20C0.55,-0.9%200.75,-0.3%200.45,0.35%20C0.25,0.75%20-0.25,0.75%20-0.45,0.35%20C-0.75,-0.3%20-0.55,-0.9%200,-1%20Z'%20fill='%23fff'%20fill-opacity='0.98'%20transform='translate(28,202)%20rotate(231)%20scale(5.1)'/%3E%3Cpath%20d='M0,-1%20C0.55,-0.9%200.75,-0.3%200.45,0.35%20C0.25,0.75%20-0.25,0.75%20-0.45,0.35%20C-0.75,-0.3%20-0.55,-0.9%200,-1%20Z'%20fill='%23fff'%20fill-opacity='0.56'%20transform='translate(224,88)%20rotate(26)%20scale(5.1)'/%3E%3Cpath%20d='M0,-1%20C0.55,-0.9%200.75,-0.3%200.45,0.35%20C0.25,0.75%20-0.25,0.75%20-0.45,0.35%20C-0.75,-0.3%20-0.55,-0.9%200,-1%20Z'%20fill='%23fff'%20fill-opacity='0.89'%20transform='translate(267,40)%20rotate(196)%20scale(7.2)'/%3E%3Cpath%20d='M0,-1%20C0.55,-0.9%200.75,-0.3%200.45,0.35%20C0.25,0.75%20-0.25,0.75%20-0.45,0.35%20C-0.75,-0.3%20-0.55,-0.9%200,-1%20Z'%20fill='%23fff'%20fill-opacity='0.86'%20transform='translate(60,157)%20rotate(114)%20scale(5.2)'/%3E%3Cpath%20d='M0,-1%20C0.55,-0.9%200.75,-0.3%200.45,0.35%20C0.25,0.75%20-0.25,0.75%20-0.45,0.35%20C-0.75,-0.3%20-0.55,-0.9%200,-1%20Z'%20fill='%23fff'%20fill-opacity='0.7'%20transform='translate(223,52)%20rotate(107)%20scale(7.2)'/%3E%3Cpath%20d='M0,-1%20C0.55,-0.9%200.75,-0.3%200.45,0.35%20C0.25,0.75%20-0.25,0.75%20-0.45,0.35%20C-0.75,-0.3%20-0.55,-0.9%200,-1%20Z'%20fill='%23fff'%20fill-opacity='0.94'%20transform='translate(182,30)%20rotate(2)%20scale(5.2)'/%3E%3Cpath%20d='M0,-1%20C0.55,-0.9%200.75,-0.3%200.45,0.35%20C0.25,0.75%20-0.25,0.75%20-0.45,0.35%20C-0.75,-0.3%20-0.55,-0.9%200,-1%20Z'%20fill='%23fff'%20fill-opacity='0.51'%20transform='translate(36,201)%20rotate(71)%20scale(7.5)'/%3E%3Cpath%20d='M0,-1%20C0.55,-0.9%200.75,-0.3%200.45,0.35%20C0.25,0.75%20-0.25,0.75%20-0.45,0.35%20C-0.75,-0.3%20-0.55,-0.9%200,-1%20Z'%20fill='%23fff'%20fill-opacity='0.56'%20transform='translate(225,65)%20rotate(1)%20scale(7.9)'/%3E%3C/svg%3E");
  -webkit-mask-size:280px 280px; mask-size:280px 280px;
  animation:sakA 17s linear infinite;
}
/* 뒤쪽 꽃잎 — 크고 흐리게 */
body::after{
  -webkit-mask-image:url("data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='400'%20height='400'%20viewBox='0%200%20400%20400'%3E%3Cpath%20d='M0,-1%20C0.55,-0.9%200.75,-0.3%200.45,0.35%20C0.25,0.75%20-0.25,0.75%20-0.45,0.35%20C-0.75,-0.3%20-0.55,-0.9%200,-1%20Z'%20fill='%23fff'%20fill-opacity='0.67'%20transform='translate(304,109)%20rotate(103)%20scale(11.5)'/%3E%3Cpath%20d='M0,-1%20C0.55,-0.9%200.75,-0.3%200.45,0.35%20C0.25,0.75%20-0.25,0.75%20-0.45,0.35%20C-0.75,-0.3%20-0.55,-0.9%200,-1%20Z'%20fill='%23fff'%20fill-opacity='0.75'%20transform='translate(50,76)%20rotate(8)%20scale(9.7)'/%3E%3Cpath%20d='M0,-1%20C0.55,-0.9%200.75,-0.3%200.45,0.35%20C0.25,0.75%20-0.25,0.75%20-0.45,0.35%20C-0.75,-0.3%20-0.55,-0.9%200,-1%20Z'%20fill='%23fff'%20fill-opacity='0.71'%20transform='translate(301,262)%20rotate(101)%20scale(9.7)'/%3E%3Cpath%20d='M0,-1%20C0.55,-0.9%200.75,-0.3%200.45,0.35%20C0.25,0.75%20-0.25,0.75%20-0.45,0.35%20C-0.75,-0.3%20-0.55,-0.9%200,-1%20Z'%20fill='%23fff'%20fill-opacity='0.85'%20transform='translate(211,106)%20rotate(47)%20scale(10.2)'/%3E%3Cpath%20d='M0,-1%20C0.55,-0.9%200.75,-0.3%200.45,0.35%20C0.25,0.75%20-0.25,0.75%20-0.45,0.35%20C-0.75,-0.3%20-0.55,-0.9%200,-1%20Z'%20fill='%23fff'%20fill-opacity='0.53'%20transform='translate(82,96)%20rotate(21)%20scale(11.7)'/%3E%3Cpath%20d='M0,-1%20C0.55,-0.9%200.75,-0.3%200.45,0.35%20C0.25,0.75%20-0.25,0.75%20-0.45,0.35%20C-0.75,-0.3%20-0.55,-0.9%200,-1%20Z'%20fill='%23fff'%20fill-opacity='0.87'%20transform='translate(292,357)%20rotate(76)%20scale(10.0)'/%3E%3Cpath%20d='M0,-1%20C0.55,-0.9%200.75,-0.3%200.45,0.35%20C0.25,0.75%20-0.25,0.75%20-0.45,0.35%20C-0.75,-0.3%20-0.55,-0.9%200,-1%20Z'%20fill='%23fff'%20fill-opacity='0.93'%20transform='translate(385,302)%20rotate(62)%20scale(12.0)'/%3E%3C/svg%3E");
          mask-image:url("data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='400'%20height='400'%20viewBox='0%200%20400%20400'%3E%3Cpath%20d='M0,-1%20C0.55,-0.9%200.75,-0.3%200.45,0.35%20C0.25,0.75%20-0.25,0.75%20-0.45,0.35%20C-0.75,-0.3%20-0.55,-0.9%200,-1%20Z'%20fill='%23fff'%20fill-opacity='0.67'%20transform='translate(304,109)%20rotate(103)%20scale(11.5)'/%3E%3Cpath%20d='M0,-1%20C0.55,-0.9%200.75,-0.3%200.45,0.35%20C0.25,0.75%20-0.25,0.75%20-0.45,0.35%20C-0.75,-0.3%20-0.55,-0.9%200,-1%20Z'%20fill='%23fff'%20fill-opacity='0.75'%20transform='translate(50,76)%20rotate(8)%20scale(9.7)'/%3E%3Cpath%20d='M0,-1%20C0.55,-0.9%200.75,-0.3%200.45,0.35%20C0.25,0.75%20-0.25,0.75%20-0.45,0.35%20C-0.75,-0.3%20-0.55,-0.9%200,-1%20Z'%20fill='%23fff'%20fill-opacity='0.71'%20transform='translate(301,262)%20rotate(101)%20scale(9.7)'/%3E%3Cpath%20d='M0,-1%20C0.55,-0.9%200.75,-0.3%200.45,0.35%20C0.25,0.75%20-0.25,0.75%20-0.45,0.35%20C-0.75,-0.3%20-0.55,-0.9%200,-1%20Z'%20fill='%23fff'%20fill-opacity='0.85'%20transform='translate(211,106)%20rotate(47)%20scale(10.2)'/%3E%3Cpath%20d='M0,-1%20C0.55,-0.9%200.75,-0.3%200.45,0.35%20C0.25,0.75%20-0.25,0.75%20-0.45,0.35%20C-0.75,-0.3%20-0.55,-0.9%200,-1%20Z'%20fill='%23fff'%20fill-opacity='0.53'%20transform='translate(82,96)%20rotate(21)%20scale(11.7)'/%3E%3Cpath%20d='M0,-1%20C0.55,-0.9%200.75,-0.3%200.45,0.35%20C0.25,0.75%20-0.25,0.75%20-0.45,0.35%20C-0.75,-0.3%20-0.55,-0.9%200,-1%20Z'%20fill='%23fff'%20fill-opacity='0.87'%20transform='translate(292,357)%20rotate(76)%20scale(10.0)'/%3E%3Cpath%20d='M0,-1%20C0.55,-0.9%200.75,-0.3%200.45,0.35%20C0.25,0.75%20-0.25,0.75%20-0.45,0.35%20C-0.75,-0.3%20-0.55,-0.9%200,-1%20Z'%20fill='%23fff'%20fill-opacity='0.93'%20transform='translate(385,302)%20rotate(62)%20scale(12.0)'/%3E%3C/svg%3E");
  -webkit-mask-size:400px 400px; mask-size:400px 400px;
  opacity:.55;
  animation:sakB 31s linear infinite;
}
@keyframes sakA{from{-webkit-mask-position:0 0;mask-position:0 0}
  to{-webkit-mask-position:-120px 280px;mask-position:-120px 280px}}
@keyframes sakB{from{-webkit-mask-position:0 0;mask-position:0 0}
  to{-webkit-mask-position:90px 400px;mask-position:90px 400px}}
@media (max-width:640px){ body::after{opacity:.35} }`},
  firefly:{ nm:'반딧불이', css:
`/* ═ 프리셋: 반딧불이 ═ */

/* 색 — 기본 연둣빛 반딧불. #ffe9a8(호박빛), #bfe3ff(푸른빛)도 예뻐요. */
body{ --firefly:#d8f3b0; }

body::before{
  content:'';position:fixed;inset:0;pointer-events:none;z-index:4;
  background-color:var(--firefly);
  -webkit-mask-image:url("data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='400'%20height='400'%20viewBox='0%200%20400%20400'%3E%3Ccircle%20cx='74'%20cy='335'%20r='2.7'%20fill='%23fff'%3E%3Canimate%20attributeName='opacity'%20values='0;1;0'%20dur='6.1s'%20begin='-0.4s'%20repeatCount='indefinite'/%3E%3CanimateTransform%20attributeName='transform'%20type='translate'%20values='0,0;-9,-4;0,0'%20dur='12.2s'%20begin='-0.4s'%20repeatCount='indefinite'/%3E%3C/circle%3E%3Ccircle%20cx='169'%20cy='57'%20r='2.7'%20fill='%23fff'%3E%3Canimate%20attributeName='opacity'%20values='0;1;0'%20dur='4.7s'%20begin='-2.2s'%20repeatCount='indefinite'/%3E%3CanimateTransform%20attributeName='transform'%20type='translate'%20values='0,0;-1,5;0,0'%20dur='9.4s'%20begin='-2.2s'%20repeatCount='indefinite'/%3E%3C/circle%3E%3Ccircle%20cx='80'%20cy='154'%20r='2.0'%20fill='%23fff'%3E%3Canimate%20attributeName='opacity'%20values='0;1;0'%20dur='7.1s'%20begin='-4.5s'%20repeatCount='indefinite'/%3E%3CanimateTransform%20attributeName='transform'%20type='translate'%20values='0,0;-10,3;0,0'%20dur='14.2s'%20begin='-4.5s'%20repeatCount='indefinite'/%3E%3C/circle%3E%3Ccircle%20cx='343'%20cy='343'%20r='2.4'%20fill='%23fff'%3E%3Canimate%20attributeName='opacity'%20values='0;1;0'%20dur='4.1s'%20begin='-2.3s'%20repeatCount='indefinite'/%3E%3CanimateTransform%20attributeName='transform'%20type='translate'%20values='0,0;-9,-10;0,0'%20dur='8.2s'%20begin='-2.3s'%20repeatCount='indefinite'/%3E%3C/circle%3E%3Ccircle%20cx='25'%20cy='353'%20r='1.7'%20fill='%23fff'%3E%3Canimate%20attributeName='opacity'%20values='0;1;0'%20dur='5.9s'%20begin='-6.8s'%20repeatCount='indefinite'/%3E%3CanimateTransform%20attributeName='transform'%20type='translate'%20values='0,0;-9,-7;0,0'%20dur='11.8s'%20begin='-6.8s'%20repeatCount='indefinite'/%3E%3C/circle%3E%3Ccircle%20cx='215'%20cy='226'%20r='2.5'%20fill='%23fff'%3E%3Canimate%20attributeName='opacity'%20values='0;1;0'%20dur='7.2s'%20begin='-0.7s'%20repeatCount='indefinite'/%3E%3CanimateTransform%20attributeName='transform'%20type='translate'%20values='0,0;-20,-13;0,0'%20dur='14.4s'%20begin='-0.7s'%20repeatCount='indefinite'/%3E%3C/circle%3E%3Ccircle%20cx='316'%20cy='321'%20r='2.6'%20fill='%23fff'%3E%3Canimate%20attributeName='opacity'%20values='0;1;0'%20dur='5.0s'%20begin='-0.9s'%20repeatCount='indefinite'/%3E%3CanimateTransform%20attributeName='transform'%20type='translate'%20values='0,0;21,11;0,0'%20dur='10.0s'%20begin='-0.9s'%20repeatCount='indefinite'/%3E%3C/circle%3E%3Ccircle%20cx='283'%20cy='364'%20r='1.9'%20fill='%23fff'%3E%3Canimate%20attributeName='opacity'%20values='0;1;0'%20dur='5.3s'%20begin='-5.5s'%20repeatCount='indefinite'/%3E%3CanimateTransform%20attributeName='transform'%20type='translate'%20values='0,0;25,-2;0,0'%20dur='10.6s'%20begin='-5.5s'%20repeatCount='indefinite'/%3E%3C/circle%3E%3Ccircle%20cx='276'%20cy='150'%20r='1.8'%20fill='%23fff'%3E%3Canimate%20attributeName='opacity'%20values='0;1;0'%20dur='6.8s'%20begin='-6.4s'%20repeatCount='indefinite'/%3E%3CanimateTransform%20attributeName='transform'%20type='translate'%20values='0,0;-9,-13;0,0'%20dur='13.6s'%20begin='-6.4s'%20repeatCount='indefinite'/%3E%3C/circle%3E%3C/svg%3E");
          mask-image:url("data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='400'%20height='400'%20viewBox='0%200%20400%20400'%3E%3Ccircle%20cx='74'%20cy='335'%20r='2.7'%20fill='%23fff'%3E%3Canimate%20attributeName='opacity'%20values='0;1;0'%20dur='6.1s'%20begin='-0.4s'%20repeatCount='indefinite'/%3E%3CanimateTransform%20attributeName='transform'%20type='translate'%20values='0,0;-9,-4;0,0'%20dur='12.2s'%20begin='-0.4s'%20repeatCount='indefinite'/%3E%3C/circle%3E%3Ccircle%20cx='169'%20cy='57'%20r='2.7'%20fill='%23fff'%3E%3Canimate%20attributeName='opacity'%20values='0;1;0'%20dur='4.7s'%20begin='-2.2s'%20repeatCount='indefinite'/%3E%3CanimateTransform%20attributeName='transform'%20type='translate'%20values='0,0;-1,5;0,0'%20dur='9.4s'%20begin='-2.2s'%20repeatCount='indefinite'/%3E%3C/circle%3E%3Ccircle%20cx='80'%20cy='154'%20r='2.0'%20fill='%23fff'%3E%3Canimate%20attributeName='opacity'%20values='0;1;0'%20dur='7.1s'%20begin='-4.5s'%20repeatCount='indefinite'/%3E%3CanimateTransform%20attributeName='transform'%20type='translate'%20values='0,0;-10,3;0,0'%20dur='14.2s'%20begin='-4.5s'%20repeatCount='indefinite'/%3E%3C/circle%3E%3Ccircle%20cx='343'%20cy='343'%20r='2.4'%20fill='%23fff'%3E%3Canimate%20attributeName='opacity'%20values='0;1;0'%20dur='4.1s'%20begin='-2.3s'%20repeatCount='indefinite'/%3E%3CanimateTransform%20attributeName='transform'%20type='translate'%20values='0,0;-9,-10;0,0'%20dur='8.2s'%20begin='-2.3s'%20repeatCount='indefinite'/%3E%3C/circle%3E%3Ccircle%20cx='25'%20cy='353'%20r='1.7'%20fill='%23fff'%3E%3Canimate%20attributeName='opacity'%20values='0;1;0'%20dur='5.9s'%20begin='-6.8s'%20repeatCount='indefinite'/%3E%3CanimateTransform%20attributeName='transform'%20type='translate'%20values='0,0;-9,-7;0,0'%20dur='11.8s'%20begin='-6.8s'%20repeatCount='indefinite'/%3E%3C/circle%3E%3Ccircle%20cx='215'%20cy='226'%20r='2.5'%20fill='%23fff'%3E%3Canimate%20attributeName='opacity'%20values='0;1;0'%20dur='7.2s'%20begin='-0.7s'%20repeatCount='indefinite'/%3E%3CanimateTransform%20attributeName='transform'%20type='translate'%20values='0,0;-20,-13;0,0'%20dur='14.4s'%20begin='-0.7s'%20repeatCount='indefinite'/%3E%3C/circle%3E%3Ccircle%20cx='316'%20cy='321'%20r='2.6'%20fill='%23fff'%3E%3Canimate%20attributeName='opacity'%20values='0;1;0'%20dur='5.0s'%20begin='-0.9s'%20repeatCount='indefinite'/%3E%3CanimateTransform%20attributeName='transform'%20type='translate'%20values='0,0;21,11;0,0'%20dur='10.0s'%20begin='-0.9s'%20repeatCount='indefinite'/%3E%3C/circle%3E%3Ccircle%20cx='283'%20cy='364'%20r='1.9'%20fill='%23fff'%3E%3Canimate%20attributeName='opacity'%20values='0;1;0'%20dur='5.3s'%20begin='-5.5s'%20repeatCount='indefinite'/%3E%3CanimateTransform%20attributeName='transform'%20type='translate'%20values='0,0;25,-2;0,0'%20dur='10.6s'%20begin='-5.5s'%20repeatCount='indefinite'/%3E%3C/circle%3E%3Ccircle%20cx='276'%20cy='150'%20r='1.8'%20fill='%23fff'%3E%3Canimate%20attributeName='opacity'%20values='0;1;0'%20dur='6.8s'%20begin='-6.4s'%20repeatCount='indefinite'/%3E%3CanimateTransform%20attributeName='transform'%20type='translate'%20values='0,0;-9,-13;0,0'%20dur='13.6s'%20begin='-6.4s'%20repeatCount='indefinite'/%3E%3C/circle%3E%3C/svg%3E");
  -webkit-mask-repeat:repeat; mask-repeat:repeat;
  -webkit-mask-size:400px 400px; mask-size:400px 400px;
  filter:drop-shadow(0 0 5px var(--firefly));
  animation:ffDrift 60s linear infinite;
}
@keyframes ffDrift{from{-webkit-mask-position:0 0;mask-position:0 0}
  to{-webkit-mask-position:-400px -180px;mask-position:-400px -180px}}`},
  marine:{ nm:'심해 부유물', css:
`/* ═ 프리셋: 심해 부유물 ═ */
body::before,
body::after{
  content:'';position:fixed;inset:0;pointer-events:none;z-index:4;
}
/* 미세 입자 — 아주 천천히 가라앉으며 흔들려요 */
body::before{
  background-image:
    radial-gradient(1.6px 1.6px at 249px 145px, rgba(230,240,250,0.23) 55%, transparent 100%),
    radial-gradient(1.4px 1.4px at 37px 134px, rgba(230,240,250,0.26) 55%, transparent 100%),
    radial-gradient(0.9px 0.9px at 194px 210px, rgba(230,240,250,0.4) 55%, transparent 100%),
    radial-gradient(1.4px 1.4px at 255px 40px, rgba(230,240,250,0.33) 55%, transparent 100%),
    radial-gradient(1.4px 1.4px at 44px 221px, rgba(230,240,250,0.36) 55%, transparent 100%),
    radial-gradient(0.7px 0.7px at 229px 183px, rgba(230,240,250,0.41) 55%, transparent 100%),
    radial-gradient(0.8px 0.8px at 248px 133px, rgba(230,240,250,0.41) 55%, transparent 100%),
    radial-gradient(0.8px 0.8px at 120px 272px, rgba(230,240,250,0.41) 55%, transparent 100%),
    radial-gradient(1.4px 1.4px at 158px 23px, rgba(230,240,250,0.31) 55%, transparent 100%),
    radial-gradient(1.3px 1.3px at 91px 239px, rgba(230,240,250,0.24) 55%, transparent 100%),
    radial-gradient(1.6px 1.6px at 30px 92px, rgba(230,240,250,0.34) 55%, transparent 100%),
    radial-gradient(1.0px 1.0px at 235px 81px, rgba(230,240,250,0.32) 55%, transparent 100%),
    radial-gradient(1.0px 1.0px at 216px 37px, rgba(230,240,250,0.29) 55%, transparent 100%),
    radial-gradient(0.7px 0.7px at 243px 184px, rgba(230,240,250,0.22) 55%, transparent 100%),
    radial-gradient(1.1px 1.1px at 139px 94px, rgba(230,240,250,0.39) 55%, transparent 100%),
    radial-gradient(0.9px 0.9px at 35px 268px, rgba(230,240,250,0.23) 55%, transparent 100%),
    radial-gradient(0.8px 0.8px at 254px 288px, rgba(230,240,250,0.26) 55%, transparent 100%),
    radial-gradient(1.0px 1.0px at 33px 205px, rgba(230,240,250,0.21) 55%, transparent 100%);
  background-size:300px 300px;
  animation:msA 52s linear infinite, msSway 9s ease-in-out infinite alternate;
}
/* 큰 부유물 — 더 느리게 */
body::after{
  background-image:
    radial-gradient(2.6px 2.6px at 134px 411px, rgba(230,240,250,0.18) 55%, transparent 100%),
    radial-gradient(2.4px 2.4px at 157px 237px, rgba(230,240,250,0.16) 55%, transparent 100%),
    radial-gradient(3.1px 3.1px at 303px 15px, rgba(230,240,250,0.13) 55%, transparent 100%),
    radial-gradient(2.6px 2.6px at 399px 248px, rgba(230,240,250,0.21) 55%, transparent 100%),
    radial-gradient(1.8px 1.8px at 354px 65px, rgba(230,240,250,0.11) 55%, transparent 100%),
    radial-gradient(2.2px 2.2px at 412px 101px, rgba(230,240,250,0.17) 55%, transparent 100%),
    radial-gradient(2.6px 2.6px at 53px 20px, rgba(230,240,250,0.15) 55%, transparent 100%),
    radial-gradient(1.8px 1.8px at 239px 381px, rgba(230,240,250,0.21) 55%, transparent 100%);
  background-size:440px 440px;
  animation:msB 90s linear infinite, msSway 13s ease-in-out -4s infinite alternate;
}
@keyframes msA{from{background-position:0 0}to{background-position:22px 300px}}
@keyframes msB{from{background-position:0 0}to{background-position:-30px 440px}}
@keyframes msSway{from{transform:translateX(-6px)}to{transform:translateX(6px)}}`},
  vhs:{ nm:'VHS 테이프', css:
`/* ═ 프리셋: VHS 테이프 ═ */
body::before{
  content:'';position:fixed;inset:0;pointer-events:none;z-index:5;opacity:.16;
  background:
    repeating-linear-gradient(0deg, rgba(255,255,255,.55) 0 1px, transparent 1px 3px),
    repeating-linear-gradient(90deg, rgba(0,0,0,.5) 0 1px, transparent 1px 5px);
  animation:vhsJit .4s steps(2) infinite;
}
body::after{
  content:'';position:fixed;inset:0;pointer-events:none;z-index:5;
  background:
    linear-gradient(180deg, rgba(120,255,220,.05), transparent 12%, transparent 88%, rgba(255,120,200,.06)),
    radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,.34) 100%);
  mix-blend-mode:screen;
}
@keyframes vhsJit{
  0%{background-position:0 0,0 0}
  50%{background-position:1px -1px,-2px 1px}
  100%{background-position:0 0,0 0}
}
/* 화면 전체 색감 — 살짝 바랜 테이프 톤 */
.head .bgimg,#bgphoto{filter:saturate(.82) contrast(1.06) hue-rotate(-4deg)}`},
  bubble:{ nm:'올라오는 거품', css:
`/* ═ 프리셋: 올라오는 거품 ═ */
body::before {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 9999;
  background-image: url("data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%201200%201200'%3E%3Ccircle%20cx='90'%20cy='1260'%20r='7.0'%20fill='rgba(225,242,254,0.34)'%3E%3Canimate%20attributeName='cy'%20values='1260;-60'%20dur='14s'%20begin='-2s'%20repeatCount='indefinite'/%3E%3Canimate%20attributeName='cx'%20values='90;108;84;98;90'%20dur='14s'%20begin='-2s'%20repeatCount='indefinite'/%3E%3Canimate%20attributeName='opacity'%20values='0;1;1;0'%20keyTimes='0;0.08;0.82;1'%20dur='14s'%20begin='-2s'%20repeatCount='indefinite'/%3E%3C/circle%3E%3Ccircle%20cx='250'%20cy='1260'%20r='4.0'%20fill='rgba(225,242,254,0.39)'%3E%3Canimate%20attributeName='cy'%20values='1260;-60'%20dur='18s'%20begin='-9s'%20repeatCount='indefinite'/%3E%3Canimate%20attributeName='cx'%20values='250;238;260;246;250'%20dur='18s'%20begin='-9s'%20repeatCount='indefinite'/%3E%3Canimate%20attributeName='opacity'%20values='0;1;1;0'%20keyTimes='0;0.08;0.82;1'%20dur='18s'%20begin='-9s'%20repeatCount='indefinite'/%3E%3C/circle%3E%3Ccircle%20cx='390'%20cy='1260'%20r='9.0'%20fill='rgba(225,242,254,0.3)'%3E%3Canimate%20attributeName='cy'%20values='1260;-60'%20dur='12s'%20begin='-5s'%20repeatCount='indefinite'/%3E%3Canimate%20attributeName='cx'%20values='390;404;380;396;390'%20dur='12s'%20begin='-5s'%20repeatCount='indefinite'/%3E%3Canimate%20attributeName='opacity'%20values='0;1;1;0'%20keyTimes='0;0.08;0.82;1'%20dur='12s'%20begin='-5s'%20repeatCount='indefinite'/%3E%3C/circle%3E%3Ccircle%20cx='520'%20cy='1260'%20r='5.0'%20fill='rgba(225,242,254,0.37)'%3E%3Canimate%20attributeName='cy'%20values='1260;-60'%20dur='16s'%20begin='-13s'%20repeatCount='indefinite'/%3E%3Canimate%20attributeName='cx'%20values='520;504;528;514;520'%20dur='16s'%20begin='-13s'%20repeatCount='indefinite'/%3E%3Canimate%20attributeName='opacity'%20values='0;1;1;0'%20keyTimes='0;0.08;0.82;1'%20dur='16s'%20begin='-13s'%20repeatCount='indefinite'/%3E%3C/circle%3E%3Ccircle%20cx='670'%20cy='1260'%20r='6.5'%20fill='rgba(225,242,254,0.34)'%3E%3Canimate%20attributeName='cy'%20values='1260;-60'%20dur='13s'%20begin='-1s'%20repeatCount='indefinite'/%3E%3Canimate%20attributeName='cx'%20values='670;680;656;674;670'%20dur='13s'%20begin='-1s'%20repeatCount='indefinite'/%3E%3Canimate%20attributeName='opacity'%20values='0;1;1;0'%20keyTimes='0;0.08;0.82;1'%20dur='13s'%20begin='-1s'%20repeatCount='indefinite'/%3E%3C/circle%3E%3Ccircle%20cx='800'%20cy='1260'%20r='3.5'%20fill='rgba(225,242,254,0.4)'%3E%3Canimate%20attributeName='cy'%20values='1260;-60'%20dur='19s'%20begin='-7s'%20repeatCount='indefinite'/%3E%3Canimate%20attributeName='cx'%20values='800;791;812;795;800'%20dur='19s'%20begin='-7s'%20repeatCount='indefinite'/%3E%3Canimate%20attributeName='opacity'%20values='0;1;1;0'%20keyTimes='0;0.08;0.82;1'%20dur='19s'%20begin='-7s'%20repeatCount='indefinite'/%3E%3C/circle%3E%3Ccircle%20cx='930'%20cy='1260'%20r='8.0'%20fill='rgba(225,242,254,0.32)'%3E%3Canimate%20attributeName='cy'%20values='1260;-60'%20dur='15s'%20begin='-11s'%20repeatCount='indefinite'/%3E%3Canimate%20attributeName='cx'%20values='930;946;922;940;930'%20dur='15s'%20begin='-11s'%20repeatCount='indefinite'/%3E%3Canimate%20attributeName='opacity'%20values='0;1;1;0'%20keyTimes='0;0.08;0.82;1'%20dur='15s'%20begin='-11s'%20repeatCount='indefinite'/%3E%3C/circle%3E%3Ccircle%20cx='1080'%20cy='1260'%20r='5.0'%20fill='rgba(225,242,254,0.37)'%3E%3Canimate%20attributeName='cy'%20values='1260;-60'%20dur='17s'%20begin='-4s'%20repeatCount='indefinite'/%3E%3Canimate%20attributeName='cx'%20values='1080;1067;1089;1073;1080'%20dur='17s'%20begin='-4s'%20repeatCount='indefinite'/%3E%3Canimate%20attributeName='opacity'%20values='0;1;1;0'%20keyTimes='0;0.08;0.82;1'%20dur='17s'%20begin='-4s'%20repeatCount='indefinite'/%3E%3C/circle%3E%3Ccircle%20cx='180'%20cy='1260'%20r='3.0'%20fill='rgba(225,242,254,0.41)'%3E%3Canimate%20attributeName='cy'%20values='1260;-60'%20dur='20s'%20begin='-15s'%20repeatCount='indefinite'/%3E%3Canimate%20attributeName='cx'%20values='180;191;173;185;180'%20dur='20s'%20begin='-15s'%20repeatCount='indefinite'/%3E%3Canimate%20attributeName='opacity'%20values='0;1;1;0'%20keyTimes='0;0.08;0.82;1'%20dur='20s'%20begin='-15s'%20repeatCount='indefinite'/%3E%3C/circle%3E%3Ccircle%20cx='1160'%20cy='1260'%20r='6.0'%20fill='rgba(225,242,254,0.35)'%3E%3Canimate%20attributeName='cy'%20values='1260;-60'%20dur='11s'%20begin='-6s'%20repeatCount='indefinite'/%3E%3Canimate%20attributeName='cx'%20values='1160;1150;1173;1157;1160'%20dur='11s'%20begin='-6s'%20repeatCount='indefinite'/%3E%3Canimate%20attributeName='opacity'%20values='0;1;1;0'%20keyTimes='0;0.08;0.82;1'%20dur='11s'%20begin='-6s'%20repeatCount='indefinite'/%3E%3C/circle%3E%3C/svg%3E");
  background-repeat: repeat-x;
  background-size: auto 100%;   /* 화면 높이에 맞춤 — 거품이 바닥부터 천장까지 */
  background-position: bottom center;
}`},
  lightdust:{ nm:'떠다니는 빛 입자', css:
`/* ═ 프리셋: 떠다니는 빛 입자 ═ */

/* 색 — 기본은 홈 테마색을 따라가요.
   직접 정하고 싶으면 var(--pri) 자리에 #ffe9b8 같은 색을 넣으세요. */
body{ --dust: var(--pri); }

body::before,
body::after{
  content:'';
  position:fixed;
  inset:0;
  pointer-events:none;   /* 클릭 방해 안 함 */
  z-index:4;             /* 화면을 덮지 않는 안전한 높이 */
}

/* 작은 알갱이 — 천천히 위로 */
body::before{
  background-image:
    radial-gradient(1.7px 1.7px at 88px 44px, color-mix(in srgb, var(--dust) 58%, transparent) 0%, transparent 100%),
    radial-gradient(1.8px 1.8px at 24px 216px, color-mix(in srgb, var(--dust) 78%, transparent) 0%, transparent 100%),
    radial-gradient(2.3px 2.3px at 155px 20px, color-mix(in srgb, var(--dust) 68%, transparent) 0%, transparent 100%),
    radial-gradient(1.7px 1.7px at 15px 28px, color-mix(in srgb, var(--dust) 59%, transparent) 0%, transparent 100%),
    radial-gradient(1.9px 1.9px at 67px 29px, color-mix(in srgb, var(--dust) 58%, transparent) 0%, transparent 100%),
    radial-gradient(1.3px 1.3px at 217px 150px, color-mix(in srgb, var(--dust) 69%, transparent) 0%, transparent 100%),
    radial-gradient(1.9px 1.9px at 167px 166px, color-mix(in srgb, var(--dust) 58%, transparent) 0%, transparent 100%),
    radial-gradient(1.7px 1.7px at 153px 155px, color-mix(in srgb, var(--dust) 69%, transparent) 0%, transparent 100%),
    radial-gradient(2.2px 2.2px at 17px 148px, color-mix(in srgb, var(--dust) 73%, transparent) 0%, transparent 100%),
    radial-gradient(1.8px 1.8px at 113px 42px, color-mix(in srgb, var(--dust) 74%, transparent) 0%, transparent 100%),
    radial-gradient(2.0px 2.0px at 149px 214px, color-mix(in srgb, var(--dust) 61%, transparent) 0%, transparent 100%),
    radial-gradient(2.0px 2.0px at 154px 152px, color-mix(in srgb, var(--dust) 78%, transparent) 0%, transparent 100%),
    radial-gradient(2.1px 2.1px at 30px 146px, color-mix(in srgb, var(--dust) 58%, transparent) 0%, transparent 100%),
    radial-gradient(1.8px 1.8px at 164px 58px, color-mix(in srgb, var(--dust) 89%, transparent) 0%, transparent 100%);
  background-size:240px 240px;
  animation: dustRise 46s linear infinite,
             dustGlow 7s ease-in-out infinite;
}

/* 큰 입자 — 더 느리게, 은은하게 */
body::after{
  background-image:
    radial-gradient(3.1px 3.1px at 224px 166px, color-mix(in srgb, var(--dust) 44%, transparent) 0%, transparent 100%),
    radial-gradient(2.7px 2.7px at 191px 159px, color-mix(in srgb, var(--dust) 35%, transparent) 0%, transparent 100%),
    radial-gradient(3.3px 3.3px at 130px 47px, color-mix(in srgb, var(--dust) 46%, transparent) 0%, transparent 100%),
    radial-gradient(3.7px 3.7px at 259px 181px, color-mix(in srgb, var(--dust) 39%, transparent) 0%, transparent 100%),
    radial-gradient(2.4px 2.4px at 317px 43px, color-mix(in srgb, var(--dust) 43%, transparent) 0%, transparent 100%),
    radial-gradient(2.5px 2.5px at 90px 181px, color-mix(in srgb, var(--dust) 45%, transparent) 0%, transparent 100%),
    radial-gradient(4.1px 4.1px at 221px 26px, color-mix(in srgb, var(--dust) 32%, transparent) 0%, transparent 100%),
    radial-gradient(3.8px 3.8px at 291px 299px, color-mix(in srgb, var(--dust) 40%, transparent) 0%, transparent 100%),
    radial-gradient(3.4px 3.4px at 180px 185px, color-mix(in srgb, var(--dust) 48%, transparent) 0%, transparent 100%);
  background-size:340px 340px;
  animation: dustDrift 88s linear infinite,
             dustGlow 11s ease-in-out -3s infinite;
}

@keyframes dustRise{
  from{ background-position:0 0; }
  to  { background-position:0 -240px; }
}
@keyframes dustDrift{
  from{ background-position:0 0; }
  to  { background-position:-340px -340px; }
}
@keyframes dustGlow{
  0%,100%{ opacity:.55; }
  50%    { opacity:1; }
}

/* 폰에서는 조금 옅게 */
@media (max-width:640px){
  body::before{ opacity:.7 }
  body::after { opacity:.55 }
}`},
  goldstar:{ nm:'금빛 별가루', css:
`/* ═ 프리셋: 금빛 별가루 ═ */

/* 색 — 금빛 별가루.
   테마색을 따라가게 하려면 var(--pri), 흰 눈가루는 #ffffff 로 바꾸세요. */
body{ --stardust: #ffe6a8; }

body::before,
body::after{
  content:'';
  position:fixed;
  inset:0;
  pointer-events:none;   /* 클릭 방해 없음 */
  z-index:4;             /* 화면을 덮지 않는 안전한 높이 */
  background-color:var(--stardust);
  -webkit-mask-repeat:repeat;  mask-repeat:repeat;
}

/* 앞쪽 별가루 — 조금 크고 빠르게 */
body::before{
  -webkit-mask-image:url("data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='230'%20height='230'%20viewBox='0%200%20230%20230'%3E%3Cpath%20d='M0,-1%20Q0.14,-0.14%201,0%20Q0.14,0.14%200,1%20Q-0.14,0.14%20-1,0%20Q-0.14,-0.14%200,-1%20Z'%20fill='%23fff'%20fill-opacity='0.8'%20transform='translate(46,111)%20rotate(61)%20scale(4.5)'/%3E%3Cpath%20d='M0,-1%20Q0.14,-0.14%201,0%20Q0.14,0.14%200,1%20Q-0.14,0.14%20-1,0%20Q-0.14,-0.14%200,-1%20Z'%20fill='%23fff'%20fill-opacity='0.71'%20transform='translate(219,59)%20rotate(65)%20scale(5.6)'/%3E%3Cpath%20d='M0,-1%20Q0.14,-0.14%201,0%20Q0.14,0.14%200,1%20Q-0.14,0.14%20-1,0%20Q-0.14,-0.14%200,-1%20Z'%20fill='%23fff'%20fill-opacity='0.88'%20transform='translate(50,133)%20rotate(1)%20scale(4.0)'/%3E%3Cpath%20d='M0,-1%20Q0.14,-0.14%201,0%20Q0.14,0.14%200,1%20Q-0.14,0.14%20-1,0%20Q-0.14,-0.14%200,-1%20Z'%20fill='%23fff'%20fill-opacity='0.53'%20transform='translate(98,153)%20rotate(29)%20scale(3.7)'/%3E%3Cpath%20d='M0,-1%20Q0.14,-0.14%201,0%20Q0.14,0.14%200,1%20Q-0.14,0.14%20-1,0%20Q-0.14,-0.14%200,-1%20Z'%20fill='%23fff'%20fill-opacity='1.0'%20transform='translate(63,181)%20rotate(52)%20scale(2.3)'/%3E%3Cpath%20d='M0,-1%20Q0.14,-0.14%201,0%20Q0.14,0.14%200,1%20Q-0.14,0.14%20-1,0%20Q-0.14,-0.14%200,-1%20Z'%20fill='%23fff'%20fill-opacity='0.63'%20transform='translate(161,117)%20rotate(63)%20scale(2.3)'/%3E%3Cpath%20d='M0,-1%20Q0.14,-0.14%201,0%20Q0.14,0.14%200,1%20Q-0.14,0.14%20-1,0%20Q-0.14,-0.14%200,-1%20Z'%20fill='%23fff'%20fill-opacity='0.97'%20transform='translate(181,33)%20rotate(2)%20scale(4.4)'/%3E%3Cpath%20d='M0,-1%20Q0.14,-0.14%201,0%20Q0.14,0.14%200,1%20Q-0.14,0.14%20-1,0%20Q-0.14,-0.14%200,-1%20Z'%20fill='%23fff'%20fill-opacity='0.52'%20transform='translate(43,193)%20rotate(2)%20scale(5.0)'/%3E%3Cpath%20d='M0,-1%20Q0.14,-0.14%201,0%20Q0.14,0.14%200,1%20Q-0.14,0.14%20-1,0%20Q-0.14,-0.14%200,-1%20Z'%20fill='%23fff'%20fill-opacity='0.64'%20transform='translate(120,45)%20rotate(62)%20scale(4.1)'/%3E%3Ccircle%20cx='40'%20cy='49'%20r='1.0'%20fill='%23fff'%20fill-opacity='0.51'/%3E%3Ccircle%20cx='211'%20cy='62'%20r='0.6'%20fill='%23fff'%20fill-opacity='0.39'/%3E%3Ccircle%20cx='174'%20cy='207'%20r='1.1'%20fill='%23fff'%20fill-opacity='0.64'/%3E%3Ccircle%20cx='197'%20cy='150'%20r='1.2'%20fill='%23fff'%20fill-opacity='0.33'/%3E%3Ccircle%20cx='145'%20cy='123'%20r='0.9'%20fill='%23fff'%20fill-opacity='0.47'/%3E%3Ccircle%20cx='89'%20cy='39'%20r='1.1'%20fill='%23fff'%20fill-opacity='0.48'/%3E%3Ccircle%20cx='95'%20cy='117'%20r='0.9'%20fill='%23fff'%20fill-opacity='0.44'/%3E%3Ccircle%20cx='126'%20cy='100'%20r='0.7'%20fill='%23fff'%20fill-opacity='0.68'/%3E%3Ccircle%20cx='42'%20cy='185'%20r='1.0'%20fill='%23fff'%20fill-opacity='0.74'/%3E%3Ccircle%20cx='2'%20cy='127'%20r='0.5'%20fill='%23fff'%20fill-opacity='0.57'/%3E%3Ccircle%20cx='135'%20cy='58'%20r='0.9'%20fill='%23fff'%20fill-opacity='0.44'/%3E%3Ccircle%20cx='161'%20cy='30'%20r='0.6'%20fill='%23fff'%20fill-opacity='0.38'/%3E%3Ccircle%20cx='91'%20cy='215'%20r='1.1'%20fill='%23fff'%20fill-opacity='0.46'/%3E%3Ccircle%20cx='154'%20cy='80'%20r='0.7'%20fill='%23fff'%20fill-opacity='0.38'/%3E%3Ccircle%20cx='210'%20cy='46'%20r='1.0'%20fill='%23fff'%20fill-opacity='0.47'/%3E%3Ccircle%20cx='176'%20cy='11'%20r='1.0'%20fill='%23fff'%20fill-opacity='0.7'/%3E%3Ccircle%20cx='63'%20cy='106'%20r='1.1'%20fill='%23fff'%20fill-opacity='0.37'/%3E%3Ccircle%20cx='191'%20cy='153'%20r='0.5'%20fill='%23fff'%20fill-opacity='0.46'/%3E%3Ccircle%20cx='131'%20cy='98'%20r='1.0'%20fill='%23fff'%20fill-opacity='0.72'/%3E%3Ccircle%20cx='64'%20cy='43'%20r='0.9'%20fill='%23fff'%20fill-opacity='0.5'/%3E%3Ccircle%20cx='106'%20cy='200'%20r='1.0'%20fill='%23fff'%20fill-opacity='0.33'/%3E%3Ccircle%20cx='75'%20cy='15'%20r='1.1'%20fill='%23fff'%20fill-opacity='0.6'/%3E%3C/svg%3E");
          mask-image:url("data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='230'%20height='230'%20viewBox='0%200%20230%20230'%3E%3Cpath%20d='M0,-1%20Q0.14,-0.14%201,0%20Q0.14,0.14%200,1%20Q-0.14,0.14%20-1,0%20Q-0.14,-0.14%200,-1%20Z'%20fill='%23fff'%20fill-opacity='0.8'%20transform='translate(46,111)%20rotate(61)%20scale(4.5)'/%3E%3Cpath%20d='M0,-1%20Q0.14,-0.14%201,0%20Q0.14,0.14%200,1%20Q-0.14,0.14%20-1,0%20Q-0.14,-0.14%200,-1%20Z'%20fill='%23fff'%20fill-opacity='0.71'%20transform='translate(219,59)%20rotate(65)%20scale(5.6)'/%3E%3Cpath%20d='M0,-1%20Q0.14,-0.14%201,0%20Q0.14,0.14%200,1%20Q-0.14,0.14%20-1,0%20Q-0.14,-0.14%200,-1%20Z'%20fill='%23fff'%20fill-opacity='0.88'%20transform='translate(50,133)%20rotate(1)%20scale(4.0)'/%3E%3Cpath%20d='M0,-1%20Q0.14,-0.14%201,0%20Q0.14,0.14%200,1%20Q-0.14,0.14%20-1,0%20Q-0.14,-0.14%200,-1%20Z'%20fill='%23fff'%20fill-opacity='0.53'%20transform='translate(98,153)%20rotate(29)%20scale(3.7)'/%3E%3Cpath%20d='M0,-1%20Q0.14,-0.14%201,0%20Q0.14,0.14%200,1%20Q-0.14,0.14%20-1,0%20Q-0.14,-0.14%200,-1%20Z'%20fill='%23fff'%20fill-opacity='1.0'%20transform='translate(63,181)%20rotate(52)%20scale(2.3)'/%3E%3Cpath%20d='M0,-1%20Q0.14,-0.14%201,0%20Q0.14,0.14%200,1%20Q-0.14,0.14%20-1,0%20Q-0.14,-0.14%200,-1%20Z'%20fill='%23fff'%20fill-opacity='0.63'%20transform='translate(161,117)%20rotate(63)%20scale(2.3)'/%3E%3Cpath%20d='M0,-1%20Q0.14,-0.14%201,0%20Q0.14,0.14%200,1%20Q-0.14,0.14%20-1,0%20Q-0.14,-0.14%200,-1%20Z'%20fill='%23fff'%20fill-opacity='0.97'%20transform='translate(181,33)%20rotate(2)%20scale(4.4)'/%3E%3Cpath%20d='M0,-1%20Q0.14,-0.14%201,0%20Q0.14,0.14%200,1%20Q-0.14,0.14%20-1,0%20Q-0.14,-0.14%200,-1%20Z'%20fill='%23fff'%20fill-opacity='0.52'%20transform='translate(43,193)%20rotate(2)%20scale(5.0)'/%3E%3Cpath%20d='M0,-1%20Q0.14,-0.14%201,0%20Q0.14,0.14%200,1%20Q-0.14,0.14%20-1,0%20Q-0.14,-0.14%200,-1%20Z'%20fill='%23fff'%20fill-opacity='0.64'%20transform='translate(120,45)%20rotate(62)%20scale(4.1)'/%3E%3Ccircle%20cx='40'%20cy='49'%20r='1.0'%20fill='%23fff'%20fill-opacity='0.51'/%3E%3Ccircle%20cx='211'%20cy='62'%20r='0.6'%20fill='%23fff'%20fill-opacity='0.39'/%3E%3Ccircle%20cx='174'%20cy='207'%20r='1.1'%20fill='%23fff'%20fill-opacity='0.64'/%3E%3Ccircle%20cx='197'%20cy='150'%20r='1.2'%20fill='%23fff'%20fill-opacity='0.33'/%3E%3Ccircle%20cx='145'%20cy='123'%20r='0.9'%20fill='%23fff'%20fill-opacity='0.47'/%3E%3Ccircle%20cx='89'%20cy='39'%20r='1.1'%20fill='%23fff'%20fill-opacity='0.48'/%3E%3Ccircle%20cx='95'%20cy='117'%20r='0.9'%20fill='%23fff'%20fill-opacity='0.44'/%3E%3Ccircle%20cx='126'%20cy='100'%20r='0.7'%20fill='%23fff'%20fill-opacity='0.68'/%3E%3Ccircle%20cx='42'%20cy='185'%20r='1.0'%20fill='%23fff'%20fill-opacity='0.74'/%3E%3Ccircle%20cx='2'%20cy='127'%20r='0.5'%20fill='%23fff'%20fill-opacity='0.57'/%3E%3Ccircle%20cx='135'%20cy='58'%20r='0.9'%20fill='%23fff'%20fill-opacity='0.44'/%3E%3Ccircle%20cx='161'%20cy='30'%20r='0.6'%20fill='%23fff'%20fill-opacity='0.38'/%3E%3Ccircle%20cx='91'%20cy='215'%20r='1.1'%20fill='%23fff'%20fill-opacity='0.46'/%3E%3Ccircle%20cx='154'%20cy='80'%20r='0.7'%20fill='%23fff'%20fill-opacity='0.38'/%3E%3Ccircle%20cx='210'%20cy='46'%20r='1.0'%20fill='%23fff'%20fill-opacity='0.47'/%3E%3Ccircle%20cx='176'%20cy='11'%20r='1.0'%20fill='%23fff'%20fill-opacity='0.7'/%3E%3Ccircle%20cx='63'%20cy='106'%20r='1.1'%20fill='%23fff'%20fill-opacity='0.37'/%3E%3Ccircle%20cx='191'%20cy='153'%20r='0.5'%20fill='%23fff'%20fill-opacity='0.46'/%3E%3Ccircle%20cx='131'%20cy='98'%20r='1.0'%20fill='%23fff'%20fill-opacity='0.72'/%3E%3Ccircle%20cx='64'%20cy='43'%20r='0.9'%20fill='%23fff'%20fill-opacity='0.5'/%3E%3Ccircle%20cx='106'%20cy='200'%20r='1.0'%20fill='%23fff'%20fill-opacity='0.33'/%3E%3Ccircle%20cx='75'%20cy='15'%20r='1.1'%20fill='%23fff'%20fill-opacity='0.6'/%3E%3C/svg%3E");
  -webkit-mask-size:230px 230px;  mask-size:230px 230px;
  animation: sdFallA 34s linear infinite,
             sdTwinkle 6s ease-in-out infinite;
}

/* 뒤쪽 별가루 — 곱고 느리게 */
body::after{
  -webkit-mask-image:url("data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='310'%20height='310'%20viewBox='0%200%20310%20310'%3E%3Cpath%20d='M0,-1%20Q0.14,-0.14%201,0%20Q0.14,0.14%200,1%20Q-0.14,0.14%20-1,0%20Q-0.14,-0.14%200,-1%20Z'%20fill='%23fff'%20fill-opacity='0.67'%20transform='translate(21,218)%20rotate(43)%20scale(3.0)'/%3E%3Cpath%20d='M0,-1%20Q0.14,-0.14%201,0%20Q0.14,0.14%200,1%20Q-0.14,0.14%20-1,0%20Q-0.14,-0.14%200,-1%20Z'%20fill='%23fff'%20fill-opacity='0.71'%20transform='translate(78,81)%20rotate(32)%20scale(4.7)'/%3E%3Cpath%20d='M0,-1%20Q0.14,-0.14%201,0%20Q0.14,0.14%200,1%20Q-0.14,0.14%20-1,0%20Q-0.14,-0.14%200,-1%20Z'%20fill='%23fff'%20fill-opacity='0.71'%20transform='translate(75,273)%20rotate(27)%20scale(5.3)'/%3E%3Cpath%20d='M0,-1%20Q0.14,-0.14%201,0%20Q0.14,0.14%200,1%20Q-0.14,0.14%20-1,0%20Q-0.14,-0.14%200,-1%20Z'%20fill='%23fff'%20fill-opacity='0.78'%20transform='translate(191,82)%20rotate(54)%20scale(5.2)'/%3E%3Cpath%20d='M0,-1%20Q0.14,-0.14%201,0%20Q0.14,0.14%200,1%20Q-0.14,0.14%20-1,0%20Q-0.14,-0.14%200,-1%20Z'%20fill='%23fff'%20fill-opacity='0.71'%20transform='translate(252,301)%20rotate(17)%20scale(5.3)'/%3E%3Cpath%20d='M0,-1%20Q0.14,-0.14%201,0%20Q0.14,0.14%200,1%20Q-0.14,0.14%20-1,0%20Q-0.14,-0.14%200,-1%20Z'%20fill='%23fff'%20fill-opacity='0.87'%20transform='translate(277,305)%20rotate(1)%20scale(3.1)'/%3E%3Ccircle%20cx='197'%20cy='66'%20r='1.2'%20fill='%23fff'%20fill-opacity='0.31'/%3E%3Ccircle%20cx='305'%20cy='168'%20r='1.0'%20fill='%23fff'%20fill-opacity='0.68'/%3E%3Ccircle%20cx='301'%20cy='217'%20r='0.7'%20fill='%23fff'%20fill-opacity='0.48'/%3E%3Ccircle%20cx='72'%20cy='70'%20r='0.6'%20fill='%23fff'%20fill-opacity='0.48'/%3E%3Ccircle%20cx='97'%20cy='14'%20r='0.9'%20fill='%23fff'%20fill-opacity='0.65'/%3E%3Ccircle%20cx='38'%20cy='62'%20r='1.0'%20fill='%23fff'%20fill-opacity='0.36'/%3E%3Ccircle%20cx='277'%20cy='168'%20r='0.8'%20fill='%23fff'%20fill-opacity='0.7'/%3E%3Ccircle%20cx='87'%20cy='94'%20r='0.6'%20fill='%23fff'%20fill-opacity='0.47'/%3E%3Ccircle%20cx='283'%20cy='25'%20r='0.9'%20fill='%23fff'%20fill-opacity='0.53'/%3E%3Ccircle%20cx='31'%20cy='6'%20r='0.8'%20fill='%23fff'%20fill-opacity='0.69'/%3E%3Ccircle%20cx='205'%20cy='292'%20r='0.6'%20fill='%23fff'%20fill-opacity='0.62'/%3E%3Ccircle%20cx='131'%20cy='162'%20r='1.0'%20fill='%23fff'%20fill-opacity='0.41'/%3E%3Ccircle%20cx='81'%20cy='160'%20r='1.0'%20fill='%23fff'%20fill-opacity='0.75'/%3E%3Ccircle%20cx='259'%20cy='283'%20r='0.8'%20fill='%23fff'%20fill-opacity='0.56'/%3E%3Ccircle%20cx='281'%20cy='32'%20r='0.9'%20fill='%23fff'%20fill-opacity='0.63'/%3E%3Ccircle%20cx='266'%20cy='160'%20r='0.7'%20fill='%23fff'%20fill-opacity='0.58'/%3E%3Ccircle%20cx='289'%20cy='99'%20r='0.5'%20fill='%23fff'%20fill-opacity='0.67'/%3E%3Ccircle%20cx='105'%20cy='183'%20r='0.5'%20fill='%23fff'%20fill-opacity='0.6'/%3E%3Ccircle%20cx='217'%20cy='57'%20r='1.1'%20fill='%23fff'%20fill-opacity='0.59'/%3E%3Ccircle%20cx='231'%20cy='260'%20r='0.9'%20fill='%23fff'%20fill-opacity='0.31'/%3E%3Ccircle%20cx='228'%20cy='243'%20r='0.9'%20fill='%23fff'%20fill-opacity='0.48'/%3E%3Ccircle%20cx='207'%20cy='38'%20r='0.7'%20fill='%23fff'%20fill-opacity='0.32'/%3E%3Ccircle%20cx='224'%20cy='23'%20r='0.7'%20fill='%23fff'%20fill-opacity='0.62'/%3E%3Ccircle%20cx='209'%20cy='220'%20r='0.8'%20fill='%23fff'%20fill-opacity='0.41'/%3E%3Ccircle%20cx='199'%20cy='169'%20r='0.8'%20fill='%23fff'%20fill-opacity='0.58'/%3E%3Ccircle%20cx='45'%20cy='21'%20r='0.8'%20fill='%23fff'%20fill-opacity='0.52'/%3E%3Ccircle%20cx='112'%20cy='232'%20r='0.9'%20fill='%23fff'%20fill-opacity='0.64'/%3E%3Ccircle%20cx='136'%20cy='127'%20r='0.8'%20fill='%23fff'%20fill-opacity='0.52'/%3E%3Ccircle%20cx='158'%20cy='197'%20r='1.1'%20fill='%23fff'%20fill-opacity='0.73'/%3E%3Ccircle%20cx='5'%20cy='84'%20r='0.7'%20fill='%23fff'%20fill-opacity='0.44'/%3E%3C/svg%3E");
          mask-image:url("data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='310'%20height='310'%20viewBox='0%200%20310%20310'%3E%3Cpath%20d='M0,-1%20Q0.14,-0.14%201,0%20Q0.14,0.14%200,1%20Q-0.14,0.14%20-1,0%20Q-0.14,-0.14%200,-1%20Z'%20fill='%23fff'%20fill-opacity='0.67'%20transform='translate(21,218)%20rotate(43)%20scale(3.0)'/%3E%3Cpath%20d='M0,-1%20Q0.14,-0.14%201,0%20Q0.14,0.14%200,1%20Q-0.14,0.14%20-1,0%20Q-0.14,-0.14%200,-1%20Z'%20fill='%23fff'%20fill-opacity='0.71'%20transform='translate(78,81)%20rotate(32)%20scale(4.7)'/%3E%3Cpath%20d='M0,-1%20Q0.14,-0.14%201,0%20Q0.14,0.14%200,1%20Q-0.14,0.14%20-1,0%20Q-0.14,-0.14%200,-1%20Z'%20fill='%23fff'%20fill-opacity='0.71'%20transform='translate(75,273)%20rotate(27)%20scale(5.3)'/%3E%3Cpath%20d='M0,-1%20Q0.14,-0.14%201,0%20Q0.14,0.14%200,1%20Q-0.14,0.14%20-1,0%20Q-0.14,-0.14%200,-1%20Z'%20fill='%23fff'%20fill-opacity='0.78'%20transform='translate(191,82)%20rotate(54)%20scale(5.2)'/%3E%3Cpath%20d='M0,-1%20Q0.14,-0.14%201,0%20Q0.14,0.14%200,1%20Q-0.14,0.14%20-1,0%20Q-0.14,-0.14%200,-1%20Z'%20fill='%23fff'%20fill-opacity='0.71'%20transform='translate(252,301)%20rotate(17)%20scale(5.3)'/%3E%3Cpath%20d='M0,-1%20Q0.14,-0.14%201,0%20Q0.14,0.14%200,1%20Q-0.14,0.14%20-1,0%20Q-0.14,-0.14%200,-1%20Z'%20fill='%23fff'%20fill-opacity='0.87'%20transform='translate(277,305)%20rotate(1)%20scale(3.1)'/%3E%3Ccircle%20cx='197'%20cy='66'%20r='1.2'%20fill='%23fff'%20fill-opacity='0.31'/%3E%3Ccircle%20cx='305'%20cy='168'%20r='1.0'%20fill='%23fff'%20fill-opacity='0.68'/%3E%3Ccircle%20cx='301'%20cy='217'%20r='0.7'%20fill='%23fff'%20fill-opacity='0.48'/%3E%3Ccircle%20cx='72'%20cy='70'%20r='0.6'%20fill='%23fff'%20fill-opacity='0.48'/%3E%3Ccircle%20cx='97'%20cy='14'%20r='0.9'%20fill='%23fff'%20fill-opacity='0.65'/%3E%3Ccircle%20cx='38'%20cy='62'%20r='1.0'%20fill='%23fff'%20fill-opacity='0.36'/%3E%3Ccircle%20cx='277'%20cy='168'%20r='0.8'%20fill='%23fff'%20fill-opacity='0.7'/%3E%3Ccircle%20cx='87'%20cy='94'%20r='0.6'%20fill='%23fff'%20fill-opacity='0.47'/%3E%3Ccircle%20cx='283'%20cy='25'%20r='0.9'%20fill='%23fff'%20fill-opacity='0.53'/%3E%3Ccircle%20cx='31'%20cy='6'%20r='0.8'%20fill='%23fff'%20fill-opacity='0.69'/%3E%3Ccircle%20cx='205'%20cy='292'%20r='0.6'%20fill='%23fff'%20fill-opacity='0.62'/%3E%3Ccircle%20cx='131'%20cy='162'%20r='1.0'%20fill='%23fff'%20fill-opacity='0.41'/%3E%3Ccircle%20cx='81'%20cy='160'%20r='1.0'%20fill='%23fff'%20fill-opacity='0.75'/%3E%3Ccircle%20cx='259'%20cy='283'%20r='0.8'%20fill='%23fff'%20fill-opacity='0.56'/%3E%3Ccircle%20cx='281'%20cy='32'%20r='0.9'%20fill='%23fff'%20fill-opacity='0.63'/%3E%3Ccircle%20cx='266'%20cy='160'%20r='0.7'%20fill='%23fff'%20fill-opacity='0.58'/%3E%3Ccircle%20cx='289'%20cy='99'%20r='0.5'%20fill='%23fff'%20fill-opacity='0.67'/%3E%3Ccircle%20cx='105'%20cy='183'%20r='0.5'%20fill='%23fff'%20fill-opacity='0.6'/%3E%3Ccircle%20cx='217'%20cy='57'%20r='1.1'%20fill='%23fff'%20fill-opacity='0.59'/%3E%3Ccircle%20cx='231'%20cy='260'%20r='0.9'%20fill='%23fff'%20fill-opacity='0.31'/%3E%3Ccircle%20cx='228'%20cy='243'%20r='0.9'%20fill='%23fff'%20fill-opacity='0.48'/%3E%3Ccircle%20cx='207'%20cy='38'%20r='0.7'%20fill='%23fff'%20fill-opacity='0.32'/%3E%3Ccircle%20cx='224'%20cy='23'%20r='0.7'%20fill='%23fff'%20fill-opacity='0.62'/%3E%3Ccircle%20cx='209'%20cy='220'%20r='0.8'%20fill='%23fff'%20fill-opacity='0.41'/%3E%3Ccircle%20cx='199'%20cy='169'%20r='0.8'%20fill='%23fff'%20fill-opacity='0.58'/%3E%3Ccircle%20cx='45'%20cy='21'%20r='0.8'%20fill='%23fff'%20fill-opacity='0.52'/%3E%3Ccircle%20cx='112'%20cy='232'%20r='0.9'%20fill='%23fff'%20fill-opacity='0.64'/%3E%3Ccircle%20cx='136'%20cy='127'%20r='0.8'%20fill='%23fff'%20fill-opacity='0.52'/%3E%3Ccircle%20cx='158'%20cy='197'%20r='1.1'%20fill='%23fff'%20fill-opacity='0.73'/%3E%3Ccircle%20cx='5'%20cy='84'%20r='0.7'%20fill='%23fff'%20fill-opacity='0.44'/%3E%3C/svg%3E");
  -webkit-mask-size:310px 310px;  mask-size:310px 310px;
  animation: sdFallB 62s linear infinite,
             sdTwinkle 9s ease-in-out -4s infinite;
}

/* 살짝 비스듬히 흩날려 내려요 */
@keyframes sdFallA{
  from{ -webkit-mask-position:0 0;          mask-position:0 0; }
  to  { -webkit-mask-position:-52px 230px;  mask-position:-52px 230px; }
}
@keyframes sdFallB{
  from{ -webkit-mask-position:0 0;          mask-position:0 0; }
  to  { -webkit-mask-position:44px 310px;   mask-position:44px 310px; }
}
@keyframes sdTwinkle{
  0%,100%{ opacity:.5; }
  50%    { opacity:1; }
}

/* 폰에서는 조금 옅게 */
@media (max-width:640px){
  body::before{ opacity:.75 }
  body::after { opacity:.5 }
}`},
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
  $('#s-mut-title').value=(p.mutualMemo&&p.mutualMemo.title)||''; $('#s-mut-text').value=(p.mutualMemo&&p.mutualMemo.text)||'';
  $('#s-gate').value=''; gateClear=false; renderGateState(); priVal=null; $('#s-pri').value=p.priColor||'#9db4ff'; $('#s-color').value=hslToHex(p.hue??222, p.sat??60, p.lum??62);
  $('#s-headmode').value=p.headMode||'wide'; $('#s-headh').value=p.headH||380; $('#s-headfit').value=p.headFit||'cover';
  $('#s-headgrad').value=p.headGrad||'dark'; $('#s-headtext').checked=p.headText!==false; $('#s-headh-v').textContent=(p.headH||380)+'px';
  $('#s-sidepos').value=p.sidePos||'right';
  hhSliderSync();
  $('#s-light').checked=!!p.light;
  $('#s-glass').checked=!!p.glass;
  $('#s-catstyle').value=catStyle();
  $('#s-catshape').value=catShape();
  $('#s-galcols').value=String(galCols());
  const smc=$('#s-memocols'); if(smc) smc.value=String(memoCols());
  const smp=$('#s-mpinmax'); if(smp) smp.value=String(mpinMax());
  const smh=$('#s-memoh'); if(smh) smh.value=st.page.memoH||'m';
  const smt=$('#s-memott'); if(smt) smt.checked=!!st.page.memoNoTt;
  const slt=$('#s-listtc');
  if(slt){
    slt.value=st.page.listTc||'#8899aa'; slt.dataset.on=st.page.listTc?'1':'';
    slt.oninput=()=>{ slt.dataset.on='1'; };
    const sx=$('#s-listtc-x'); if(sx) sx.onclick=()=>{ slt.dataset.on=''; slt.value='#8899aa'; msg('저장하면 테마 기본 색으로 돌아가요.'); };
  }
  $('#s-homestyle').value=homeStyle();
  $('#s-theme').value=p.theme||'default';
  renderStkList();
  $('#s-dim').value=p.bgDim??78; $('#s-dots').checked=p.dots!==false; $('#s-protect').checked=p.protectImg!==false; $('#s-stkm').checked=!!p.stkHideM; $('#s-stkoff').checked=p.stkOff!==true; $('#s-fx').value=p.fx ?? (p.sparkle?'sparkle':''); $('#s-fxc').value=p.fxC||'#ffb3c8'; fxCVal=null; $('#s-postpage').checked=!!p.postPage;
  $('#s-gatebtn').value=p.gateBtn||''; $('#s-listed').checked=!!p.listed; cardNew=null; bnrNew=null; renderCard(); renderBnr(); $('#s-lbicon').value=p.labelIcon??'◈'; gateColVal=null;
  $('#s-gatecolor').value=p.gateColor||'#ffffff';
  $('#del-h').textContent=st.handle||'—'; $('#s-del-confirm').value=''; delMsg('');
  renderMyInq(); renderAdmInq();
  if(st.myHandle==='jeste'){ getDoc(doc(db,'config','notice')).then(s=>{
    if(s.exists()) admNtcRender(noticeItems(s.data())); }).catch(()=>{}); }
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
      catShape: $('#s-catshape').value,
      galCols: +$('#s-galcols').value||3,
      memoCols: +($('#s-memocols')?.value)||3,
      mpinMax: +($('#s-mpinmax')?.value)||3,
      memoH: $('#s-memoh')?.value||'m',
      memoNoTt: !!$('#s-memott')?.checked,
      listTc: ($('#s-listtc')?.dataset.on ? $('#s-listtc').value : ''),
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
  layout:{homeStyle:'grid',headMode:'wide',headH:380,headFit:'cover',headGrad:'dark',headText:true,sidePos:'right',catStyle:'bar',catShape:'list',
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
  if(mode==='code' && !ref){
    $('#ref-wrap').classList.remove('hidden');
    err.textContent='초대해 준 분의 닉네임(또는 러브로그 주소)을 적어주세요.'; return; }
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
/* ---------- 이웃 전용 메모 (우상단 🔒) ---------- */
async function checkMutualMemo(){
  const link=$('#seal-mut'); if(!link) return;
  link.classList.add('hidden');
  const memo=st.page&&st.page.mutualMemo;
  if(!memo||!memo.text) return;
  const ok = st.mine || await ensureMutual();
  if(!ok) return;
  link.classList.remove('hidden');
  link.onclick=()=>{
    $('#mut-pop-t').textContent=memo.title||'FOR NEIGHBORS';
    $('#mut-pop-x').textContent=memo.text;
    $('#mut-pop').classList.remove('hidden');
  };
  $('#mut-pop-ok').onclick=()=>$('#mut-pop').classList.add('hidden');
}
const mutMsg=t=>{ const e=$('#s-mut-msg'); if(e) e.textContent=t; };
$('#s-mut-save').onclick=async()=>{
  if(!st.mine) return;
  const title=$('#s-mut-title').value.trim(), text=$('#s-mut-text').value.trim();
  if(!text){ mutMsg('내용을 적어주세요 — 지우려면 [메모 삭제]!'); return; }
  mutMsg('저장 중...');
  try{
    await updateDoc(doc(db,'pages',st.handle),{mutualMemo:{title,text}});
    st.page.mutualMemo={title,text}; checkMutualMemo();
    mutMsg('저장했어요! 맞배너 분들 화면 오른쪽 위에 🔒가 떠요.');
  }catch(e){ mutMsg('실패 — '+e.message); }
};
$('#s-mut-del').onclick=async()=>{
  if(!st.mine) return;
  if(!confirm('이웃 전용 메모를 삭제할까요?\n🔒도 함께 사라져요.')) return;
  try{
    await updateDoc(doc(db,'pages',st.handle),{mutualMemo:{title:'',text:''}});
    st.page.mutualMemo=null;
    $('#s-mut-title').value=''; $('#s-mut-text').value='';
    checkMutualMemo(); mutMsg('삭제했어요 — 🔒도 사라졌어요.');
  }catch(e){ mutMsg('실패 — '+e.message); }
};

/* ---------- 업데이트 공지 토스트 ---------- */
function noticeItems(n){
  if(Array.isArray(n.items) && n.items.length) return n.items;
  return n.text ? [{id:n.ver||1, text:n.text, date:''}] : [];   // 옛 단일 공지 호환
}
async function checkUpdNotice(){
  if(!st.myHandle) return;                              // 가입자에게만
  try{
    const sn=await getDoc(doc(db,'config','notice'));
    if(!sn.exists()) return;
    const n=sn.data();
    const items=noticeItems(n);
    if(!items.length || !n.ver) return;
    const seen=+localStorage.getItem('lv-upd-seen')||0;
    if(+n.ver<=seen) return;                            // 새 항목 없음
    $('#upd-body').innerHTML=items.map(it=>`
      <div class="upd-item">
        ${(+it.id>seen||it.date)?`<p class="upd-meta">${+it.id>seen?'<b class="upd-new">NEW!</b>':''}${esc(it.date||'')}</p>`:''}
        <div class="upd-tx">${esc(String(it.text||'').trim().replace(/\n{3,}/g,'\n\n'))}</div>
      </div>`).join('');
    $('#upd-toast').classList.remove('hidden');
    $('#upd-ok').onclick=()=>{
      localStorage.setItem('lv-upd-seen',String(n.ver));
      $('#upd-toast').classList.add('hidden');
    };
  }catch(e){}
}
/* ── 운영자: 공지 올리기/내리기 ── */
const admNtcMsg=t=>{ const e=$('#adm-notice-msg'); if(e) e.textContent=t; };
async function admNtcLoad(){
  try{ const s=await getDoc(doc(db,'config','notice'));
       return s.exists()? noticeItems(s.data()) : []; }
  catch(e){ return []; }
}
function admNtcRender(items){
  const box=$('#adm-ntc-list'); if(!box) return;
  box.innerHTML=items.length? items.map(it=>`
    <div class="ntc-row"><span class="ntc-d">${esc(it.date||'')}</span>
      <span class="ntc-t">${esc(it.text.slice(0,46))}${it.text.length>46?'…':''}</span>
      <button class="rmv" data-ntcx="${it.id}" style="font-size:10px">삭제</button></div>`).join('')
    : '<p class="note">떠 있는 공지가 없어요.</p>';
  box.querySelectorAll('[data-ntcx]').forEach(b=>b.onclick=async()=>{
    const items2=(await admNtcLoad()).filter(x=>String(x.id)!==b.dataset.ntcx);
    try{ await setDoc(doc(db,'config','notice'),
      {items:items2, ver:items2.length?Math.max(...items2.map(x=>+x.id||0)):Date.now(), at:serverTimestamp()});
      admNtcRender(items2); admNtcMsg('지웠어요.');
    }catch(e){ admNtcMsg('실패 — '+e.message); }
  });
}
$('#adm-notice-up').onclick=async()=>{
  if(st.myHandle!=='jeste') return;
  const text=$('#adm-notice').value.trim();
  if(!text){ admNtcMsg('내용을 적어주세요.'); return; }
  try{
    const items=[{id:Date.now(), text, date:today()}, ...await admNtcLoad()];
    await setDoc(doc(db,'config','notice'),{items, ver:items[0].id, at:serverTimestamp()});
    $('#adm-notice').value='';
    admNtcRender(items);
    admNtcMsg('올렸어요! 새 항목엔 NEW! 뱃지가 붙어요. 오래된 공지는 아래에서 지우면 돼요.');
  }catch(e){ admNtcMsg('실패 — '+e.message+' (config/notice 규칙 필요)'); }
};
$('#adm-notice-dn').onclick=async()=>{
  if(st.myHandle!=='jeste') return;
  if(!confirm('공지를 전부 내릴까요?')) return;
  try{ await setDoc(doc(db,'config','notice'),{items:[],ver:Date.now()}); admNtcRender([]); admNtcMsg('전부 내렸어요.'); }
  catch(e){ admNtcMsg('실패 — '+e.message); }
};

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
const DECO_SKIP=['uid','handle','createdAt','owner','email'];   // 꾸미기 백업에서 제외할 시스템 필드
function decoSnap(){                                             // st.page에서 꾸미기 전체 스냅샷
  const o={};
  Object.keys(st.page||{}).forEach(k=>{ if(!DECO_SKIP.includes(k)) o[k]=st.page[k]; });
  return o;
}
function buildBackup(withDeco, withPosts){
  const data={ exported:new Date().toISOString(), service:'lovelog', handle:st.handle,
    home:{ name:st.page.name||'', sub:st.page.sub||'' } };
  if(withDeco) data.deco=decoSnap();
  if(withPosts){ data.posts=st.posts; data.gallery=st.gallery; data.guest=st.guest; }
  return data;
}
$('#s-exp-json').onclick=()=>{
  if(!st.mine) return;
  const wd=$('#bk-deco')?.checked!==false, wp=$('#bk-posts')?.checked!==false;
  if(!wd && !wp){ msg('담을 항목을 하나는 골라주세요.'); return; }
  const tag = wd&&wp ? '' : (wd?'-deco':'-posts');
  dlFile(`lovelog-${st.handle}-backup${tag}-${expStamp()}.json`,
    JSON.stringify(buildBackup(wd,wp),null,2), 'application/json');
  msg('JSON 백업 저장!'+(wd?' 꾸미기 포함':'')+(wp?' · 글 '+st.posts.length+'편 포함':''));
};

/* ---------- 복원 (백업에서 불러오기, phase208) ---------- */
const POST_KEYS=['title','cat','date','ts','secret','pinned','cmtOff','priv','excerpt','html','imgs','raw','enc','body','feat','mpin'];
let bkData=null;
$('#bk-file')?.addEventListener('change', async e=>{
  bkData=null; $('#bk-scope').hidden=true;
  const f=e.target.files[0]; if(!f) return;
  try{
    const j=JSON.parse(await f.text());
    if(j.service!=='lovelog') throw new Error('러브로그 백업 파일이 아니에요.');
    bkData=j;
    const hasD=!!j.deco, hasP=Array.isArray(j.posts);
    if(!hasD && !hasP) throw new Error('이 백업엔 복원할 수 있는 내용이 없어요. (예전 백업엔 꾸미기가 담기지 않았어요 — 글만 복원할 수 있습니다)');
    $('#rs-deco').checked=hasD; $('#rs-deco').disabled=!hasD;
    $('#rs-posts').checked=hasP; $('#rs-posts').disabled=!hasP;
    $('#bk-scope').hidden=false;
    msg(`백업 확인 — ${j.handle?'@'+j.handle+' · ':''}${hasD?'꾸미기 ✓ ':''}${hasP?'글 '+j.posts.length+'편 ✓':''}`);
  }catch(err){ msg('읽기 실패 — '+err.message); e.target.value=''; }
});
$('#bk-restore')?.addEventListener('click', async ()=>{
  if(!st.mine || !bkData) return;
  const rd=$('#rs-deco').checked && bkData.deco;
  const rp=$('#rs-posts').checked && Array.isArray(bkData.posts);
  if(!rd && !rp){ msg('복원할 항목을 골라주세요.'); return; }
  if(bkData.handle && bkData.handle!==st.handle &&
     !confirm(`이 백업은 @${bkData.handle}의 것이에요. 이 홈(@${st.handle})에 입힐까요?`)) return;
  if(!confirm('복원을 시작할까요? 진행 전에 현재 상태가 자동으로 백업 저장됩니다.')) return;
  dlFile(`lovelog-${st.handle}-before-restore-${expStamp()}.json`,
    JSON.stringify(buildBackup(true,true),null,2), 'application/json');   // 안전망
  /* 🚚 사진 이사(phase209): 다른 홈 백업이면 사진을 내 스토리지로 복사해 URL 교체
     — 옛 홈이 지워져도 새 홈 사진이 안 깨지게. 실패한 사진은 원 주소 유지 */
  const cross = bkData.handle && bkData.handle!==st.handle;
  const migMap=new Map(); let migOk=0, migFail=0;
  const RX_STG=/https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/[^"\\]+/g;
  async function migUrl(u){
    if(migMap.has(u)) return migMap.get(u);
    try{
      const res=await fetch(u); if(!res.ok) throw 0;
      const blob=await res.blob();
      const nm='restore-'+Date.now()+'-'+(migOk+migFail)+'.'+(blob.type.split('/')[1]||'bin').replace('+xml','');
      const r=sref(stg,'u/'+st.me.uid+'/'+nm);
      await uploadBytes(r,blob,{contentType:blob.type,cacheControl:'public,max-age=31536000'});
      const nu=await getDownloadURL(r);
      migMap.set(u,nu); migOk++; return nu;
    }catch(e){ migMap.set(u,u); migFail++; return u; }
  }
  async function migStr(s){
    const urls=[...new Set((s.match(RX_STG)||[]))];
    for(let k=0;k<urls.length;k++){
      msg(`사진 이사 중... ${migOk+migFail+1}장째`);
      const raw=urls[k], nu=await migUrl(JSON.parse('"'+raw+'"'));   // JSON 이스케이프 해제 후 복사
      s=s.split(raw).join(JSON.stringify(nu).slice(1,-1));
    }
    return s;
  }
  try{
    if(rd){
      let deco={};
      Object.keys(bkData.deco).forEach(k=>{ if(!DECO_SKIP.includes(k)) deco[k]=bkData.deco[k]; });
      if(cross) deco=JSON.parse(await migStr(JSON.stringify(deco)));
      if(JSON.stringify(deco).length>980000) throw new Error('꾸미기 데이터가 용량을 넘어요.');
      msg('꾸미기 복원 중...');
      await updateDoc(doc(db,'pages',st.handle), deco);
    }
    if(rp){
      const posts=bkData.posts.filter(p=>p&&p.id);
      let n=0;
      for(const p of posts){
        let d2={};
        POST_KEYS.forEach(k=>{ if(p[k]!==undefined) d2[k]=p[k]; });
        if(cross) d2=JSON.parse(await migStr(JSON.stringify(d2)));   // 비밀글(enc)은 암호문이라 자연히 건드리지 않음
        if(d2.ts && typeof d2.ts==='object' && d2.ts.seconds) d2.ts=new Date(d2.ts.seconds*1000);
        await setDoc(doc(db,'pages',st.handle,'posts',p.id), d2, {merge:true});
        if(++n%10===0) msg(`글 복원 중... ${n}/${posts.length}`);
      }
      const gal=Array.isArray(bkData.gallery)?bkData.gallery.filter(g=>g&&g.id):[];
      for(const g of gal){
        let d3={...g}; delete d3.id;
        if(cross) d3=JSON.parse(await migStr(JSON.stringify(d3)));
        if(d3.ts && typeof d3.ts==='object' && d3.ts.seconds) d3.ts=new Date(d3.ts.seconds*1000);
        await setDoc(doc(db,'pages',st.handle,'gallery',g.id), d3, {merge:true});
      }
      msg(`글 ${posts.length}편 · 사진 ${gal.length}장 복원 완료!`);
    }
    alert('복원이 끝났어요!'+(migOk?` 사진 ${migOk}장을 새 홈으로 복사했어요.`:'')+(migFail?` (${migFail}장은 복사하지 못해 원 주소를 유지했어요)`:'')+' 화면을 새로 불러옵니다.');
    location.reload();
  }catch(err){ msg('복원 실패 — '+err.message); }
});
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
