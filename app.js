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
const show = id => VIEWS.forEach(v=>$('#'+v).classList.toggle('hidden',v!==id));
const enc=new TextEncoder(), dec=new TextDecoder();

if(!firebaseConfig.apiKey || firebaseConfig.apiKey.includes('여기에')){ show('view-setup'); throw new Error('cfg'); }
const app=initializeApp(firebaseConfig), auth=getAuth(app), db=getFirestore(app);

const st = { me:null, myHandle:null, handle:null, page:null, posts:[], gallery:[],
             cat:'recent', q:'', cur:null, curBody:null, mine:false };

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
const ytId=u=>{ const m=String(u||'').match(/(?:youtu\.be\/|v=|shorts\/|embed\/)([A-Za-z0-9_-]{11})/); return m?m[1]:null; };
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
  const snap=await getDoc(doc(db,'pages',handle));
  if(!snap.exists()){ show('view-page');
    $('#pg-name').textContent='없는 페이지예요'; $('#pg-sub').textContent='@'+handle; return; }
  st.page=snap.data();
  st.mine = st.me && st.page.owner===st.me.uid;
  document.documentElement.style.setProperty('--h', st.page.hue ?? 222);
  // 대문 비밀번호
  if(st.page.gate && !st.mine && sessionStorage.getItem('gate_'+handle)!==st.page.gate){
    $('#gate-name').textContent = st.page.name || handle;
    show('view-gate');
    $('#gate-go').onclick = async ()=>{
      const h=await sha256($('#gate-pw').value);
      if(h===st.page.gate){ sessionStorage.setItem('gate_'+handle,h); enterPage(); }
      else $('#gate-err').textContent='비밀번호가 맞지 않아요.';
    };
    return;
  }
  enterPage();
}
async function enterPage(){
  const p=st.page, h=st.handle;
  document.title=(p.name||h)+' — LOVELOG';
  $('#pg-name').textContent=p.name||h;
  $('#pg-sub').textContent=p.sub||'';
  $('#pg-over').textContent='@'+h.toUpperCase();
  $('#pg-hero').style.backgroundImage = p.heroImg?`url(${p.heroImg})`:'';
  const dd0=(p.ddays||[])[0];
  $('#pg-dday-main').innerHTML = dd0?`<p class="n">${esc(dday(dd0.date))}</p><p class="t">${esc(dd0.title)}</p>`:'';
  // 사이드 디데이(2개째부터도 전부)
  const side=$('#side-dday');
  if(p.ddays&&p.ddays.length){ side.classList.remove('hidden');
    $('#dd-list').innerHTML=p.ddays.map(d=>
      `<div class="dd-item"><span class="t">${esc(d.title)}</span><span class="n">${esc(dday(d.date))}</span></div>`).join('');
  } else side.classList.add('hidden');
  // BGM
  const bs=$('#side-bgm'), vid=ytId(p.bgm?.url);
  if(vid){ bs.classList.remove('hidden');
    $('#bgm-title').textContent=p.bgm.title||'배경음악';
    let playing=false;
    $('#bgm-btn').onclick=()=>{
      playing=!playing;
      $('#bgm-frame').innerHTML = playing
        ? `<iframe src="https://www.youtube.com/embed/${vid}?autoplay=1&loop=1&playlist=${vid}" allow="autoplay; encrypted-media"></iframe>`:'';
      $('#bgm-btn .ic').textContent = playing?'■':'▶';
    };
  } else bs.classList.add('hidden');
  $('#btn-pen').classList.toggle('hidden',!st.mine);
  $('#cat-add').classList.toggle('hidden',!st.mine);
  show('view-page');
  await loadContent();
  renderCats(); renderList(); renderGal();
  // 딥링크 ?p=
  const pm=new URLSearchParams(location.search).get('p');
  if(pm) openPost(pm);
}
async function loadContent(){
  const [ps,gs]=await Promise.all([
    getDocs(query(collection(db,'pages',st.handle,'posts'),orderBy('ts','desc'))),
    getDocs(query(collection(db,'pages',st.handle,'gallery'),orderBy('ts','desc')))
  ]);
  st.posts=ps.docs.map(d=>({id:d.id,...d.data()}));
  st.gallery=gs.docs.map(d=>({id:d.id,...d.data()}));
}

/* ---------- 렌더 ---------- */
function cats(){ return st.page.cats||['archive','ooc']; }
function renderCats(){
  const cnt=c=>st.posts.filter(p=>p.cat===c).length;
  $('#cats').innerHTML =
    cats().map(c=>`<li><a data-c="${esc(c)}" class="${st.cat===c?'on':''}">
      <span>${esc(c)}${st.mine?` <span class="x" data-x="${esc(c)}">✕</span>`:''}</span>
      <span class="n">${cnt(c)}</span></a></li>`).join('')
    +`<li><a data-c="recent" class="${st.cat==='recent'?'on':''}"><span>전체</span><span class="n">${st.posts.length}</span></a></li>`;
  document.querySelectorAll('#cats a').forEach(a=>a.onclick=e=>{
    if(e.target.dataset.x){ removeCat(e.target.dataset.x); return; }
    st.cat=a.dataset.c; renderCats(); renderList(); backToList();
  });
}
function renderList(){
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
      <span class="t">${esc(p.title)}</span>
      <span class="k">${p.secret?'🔒':''}</span></li>`).join('')
    :'<p class="pl-empty">아직 글이 없습니다.</p>';
  $('#more-btn').style.display=(st.cat==='recent'&&!st.q&&rest.length>7)?'':'none';
  document.querySelectorAll('[data-id]').forEach(el=>el.onclick=()=>openPost(el.dataset.id));
}
function renderGal(all){
  const arr=all?st.gallery:st.gallery.slice(0,4);
  $('#gal').innerHTML = arr.length?arr.map(g=>
    `<a data-g="${g.id}"><img src="${g.img}" alt="" draggable="false"></a>`).join('')
    :'<p class="pl-empty">아직 이미지가 없습니다.</p>';
  document.querySelectorAll('#gal a').forEach(a=>a.onclick=()=>{
    const g=st.gallery.find(x=>x.id===a.dataset.g);
    if(g){ $('#lb-img').src=g.img; $('#lb').classList.add('show'); }
  });
}
$('#gal-more').onclick=()=>renderGal(true);
$('#lb').onclick=()=>$('#lb').classList.remove('show');
document.addEventListener('contextmenu',e=>{
  if(e.target.closest&&(e.target.closest('#gal')||e.target.closest('#lb'))) e.preventDefault();
});

/* ---------- 글 읽기 ---------- */
function backToList(){ $('#post-view').classList.add('hidden');
  $('#list-view').classList.remove('hidden'); st.cur=null;
  history.replaceState(null,'','./?u='+st.handle); }
$('#pv-back').onclick=backToList;
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
  history.replaceState(null,'','./?u='+st.handle+'&p='+id);
  window.scrollTo({top:0});
}
$('#pv-copy').onclick=()=>{
  const url=location.origin+location.pathname+'?u='+st.handle+'&p='+(st.cur?.id||'');
  (navigator.clipboard?navigator.clipboard.writeText(url).then(()=>alert('링크를 복사했어요!\n'+url))
    :Promise.reject()).catch(()=>prompt('이 링크를 복사하세요',url));
};
$('#pv-del').onclick=async()=>{
  const p=st.cur; if(!p||!st.mine) return;
  if(!confirm('「'+p.title+'」 글을 삭제할까요?')) return;
  await deleteDoc(doc(db,'pages',st.handle,'posts',p.id));
  st.posts=st.posts.filter(x=>x.id!==p.id);
  backToList(); renderCats(); renderList();
};

/* ---------- 검색 ---------- */
$('#q').addEventListener('input',e=>{ st.q=e.target.value.trim().toLowerCase(); renderList(); });
$('#more-btn').onclick=()=>{ st.cat='recent'; st.q='__all__'; st.q=''; 
  $('#rows').innerHTML=''; const rest=st.posts.filter(p=>!p.pinned);
  $('#v-label').textContent='ALL';
  $('#rows').innerHTML=rest.map(p=>`
    <li class="row" data-id="${p.id}">
      <span class="d">${esc((p.date||'').slice(5))}</span>
      <span class="t">${esc(p.title)}</span><span class="k">${p.secret?'🔒':''}</span></li>`).join('');
  $('#more-btn').style.display='none';
  document.querySelectorAll('#rows [data-id]').forEach(el=>el.onclick=()=>openPost(el.dataset.id));
};

/* ---------- 카테고리 추가/삭제 ---------- */
$('#cat-add').onclick=async()=>{
  const c=prompt('새 카테고리 이름'); if(!c) return;
  const name=c.trim(); if(!name||cats().includes(name)) return;
  const next=[...cats(),name];
  await updateDoc(doc(db,'pages',st.handle),{cats:next});
  st.page.cats=next; renderCats(); refreshWriteCats();
};
async function removeCat(c){
  if(!confirm(`'${c}' 카테고리를 삭제할까요? (글은 남고 '전체'에서 보여요)`)) return;
  const next=cats().filter(x=>x!==c);
  await updateDoc(doc(db,'pages',st.handle),{cats:next});
  st.page.cats=next; if(st.cat===c) st.cat='recent';
  renderCats(); renderList(); refreshWriteCats();
}

/* ---------- 관리 패널 ---------- */
function refreshWriteCats(){
  $('#w-cat').innerHTML=cats().map(c=>`<option>${esc(c)}</option>`).join('');
}
$('#btn-pen').onclick=()=>{ refreshWriteCats(); fillSettings(); $('#panel').classList.add('show'); };
$('#p-close').onclick=()=>$('#panel').classList.remove('show');
$('#panel').addEventListener('click',e=>{ if(e.target.id==='panel') $('#panel').classList.remove('show'); });
document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('.tabs button').forEach(x=>x.classList.toggle('on',x===b));
  document.querySelectorAll('.pane').forEach(p=>p.classList.toggle('hidden',p.dataset.pane!==b.dataset.tab));
});
$('#w-secret').addEventListener('change',e=>$('#w-pw').style.display=e.target.checked?'':'none');
const msg=t=>$('#p-msg').textContent=t;

$('#w-go').onclick=async()=>{
  const title=$('#w-title').value.trim(), cat=$('#w-cat').value,
        secret=$('#w-secret').checked, pw=$('#w-pw').value, pin=$('#w-pin').checked,
        raw=$('#w-body').value;
  if(!title){ msg('제목을 입력하세요.'); return; }
  if(secret&&!pw){ msg('비밀글 비밀번호를 입력하세요.'); return; }
  msg('발행 중...');
  try{
    const html=bodyHTML(raw);
    const data={ title, cat, date:today(), ts:serverTimestamp(),
      secret, pinned:pin,
      excerpt: secret?'':raw.replace(/\s+/g,' ').trim().slice(0,70) };
    if(secret) data.enc=await encTxt(pw,html); else data.body=html;
    if(pin) await Promise.all(st.posts.filter(p=>p.pinned).map(p=>
      updateDoc(doc(db,'pages',st.handle,'posts',p.id),{pinned:false})));
    await addDoc(collection(db,'pages',st.handle,'posts'),data);
    await loadContent(); renderCats(); renderList();
    ['w-title','w-pw','w-body'].forEach(i=>$('#'+i).value='');
    $('#w-secret').checked=false; $('#w-pin').checked=false; $('#w-pw').style.display='none';
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
      {img,title:$('#g-title').value.trim(),ts:serverTimestamp()});
    await loadContent(); renderGal(); $('#g-title').value=''; $('#g-file').value='';
    msg('업로드 완료!');
  }catch(e){ msg('오류: '+e.message); }
};

function ddRow(d={title:'',date:''}){
  const div=document.createElement('div'); div.className='p-row';
  div.innerHTML=`<input placeholder="제목" value="${esc(d.title)}">
    <input type="date" value="${esc(d.date)}" style="flex:.8">
    <button class="rmv">✕</button>`;
  div.querySelector('.rmv').onclick=()=>div.remove();
  return div;
}
$('#s-dd-add').onclick=()=>$('#s-ddays').appendChild(ddRow());
let heroNew=null;
$('#s-hero').addEventListener('change',async e=>{
  const f=e.target.files[0]; if(!f) return;
  msg('대문 이미지 압축 중...'); heroNew=await compress(f,1600,.78); msg('');
});
function fillSettings(){
  const p=st.page;
  $('#s-name').value=p.name||''; $('#s-sub').value=p.sub||'';
  $('#s-bgm-url').value=p.bgm?.url||''; $('#s-bgm-title').value=p.bgm?.title||'';
  $('#s-gate').value=''; $('#s-hue').value=p.hue??'';
  const dd=$('#s-ddays'); dd.innerHTML='';
  (p.ddays&&p.ddays.length?p.ddays:[]).forEach(d=>dd.appendChild(ddRow(d)));
  heroNew=null;
}
$('#s-go').onclick=async()=>{
  msg('저장 중...');
  try{
    const gateIn=$('#s-gate').value;
    const data={
      name:$('#s-name').value.trim()||st.handle,
      sub:$('#s-sub').value.trim(),
      heroImg: heroNew ?? st.page.heroImg ?? '',
      ddays:[...document.querySelectorAll('#s-ddays .p-row')].map(r=>{
        const [t,d]=r.querySelectorAll('input');
        return {title:t.value.trim(),date:d.value};
      }).filter(x=>x.title&&x.date),
      bgm:{url:$('#s-bgm-url').value.trim(),title:$('#s-bgm-title').value.trim()},
      hue: parseInt($('#s-hue').value)||222,
      updatedAt:serverTimestamp()
    };
    if(gateIn) data.gate=await sha256(gateIn);
    else if(gateIn==='' && $('#s-gate').dataset.clear==='1') data.gate='';
    if(JSON.stringify(data).length>900000){ msg('이미지 용량이 커서 저장할 수 없어요.'); return; }
    await updateDoc(doc(db,'pages',st.handle),data);
    st.page={...st.page,...data};
    msg('저장 완료!');
    enterPage();
  }catch(e){ msg('오류: '+e.message); }
};
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
    history.replaceState(null,'','./?u='+handle); loadPage(handle);
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
  else { history.replaceState(null,'','./?u='+st.myHandle); loadPage(st.myHandle); }
});
