/* ============================================================
   LOVERS CLUB — v2 (위젯 꾸미기)
   프로필(배너·아바타·소개·태그) + 디데이 + 커플칸 + 캐릭터칸 + BGM
   ============================================================ */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, runTransaction, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const $ = s => document.querySelector(s);
const esc = s => String(s??'').replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const show = id => ['view-setup','view-loading','view-login','view-signup','view-page']
  .forEach(v => $('#'+v).classList.toggle('hidden', v!==id));

if(!firebaseConfig.apiKey || firebaseConfig.apiKey.includes('여기에')){
  show('view-setup'); throw new Error('config');
}
const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

let me = null, myHandle = null, curHandle = null, curData = null;

/* ---------- 유틸: 이미지 압축(base64) ---------- */
function compress(file, maxW, quality){
  return new Promise((res, rej)=>{
    const img = new Image();
    img.onload = ()=>{
      const scale = Math.min(1, maxW / img.width);
      const c = document.createElement('canvas');
      c.width = Math.round(img.width*scale);
      c.height = Math.round(img.height*scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      res(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = rej;
    img.src = URL.createObjectURL(file);
  });
}
function ytId(url){
  const m = String(url||'').match(/(?:youtu\.be\/|v=|shorts\/|embed\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}
function ddayNum(dateStr){
  const d = new Date(dateStr+'T00:00:00');
  const now = new Date(); now.setHours(0,0,0,0);
  const diff = Math.round((now - d) / 86400000);
  return diff >= 0 ? 'D+'+(diff+1) : 'D'+diff;
}

/* ---------- 상단바 ---------- */
function renderTopbar(){
  const el = $('#topbar-user');
  el.innerHTML = me
    ? (myHandle?`<a href="./?u=${myHandle}" class="mono">@${myHandle}</a>`:'')
      + `<button class="btn" id="btn-logout">로그아웃</button>`
    : '';
  const b = $('#btn-logout'); if(b) b.onclick = () => signOut(auth);
}

/* ---------- 페이지 렌더 ---------- */
async function renderPage(handle){
  curHandle = handle;
  const snap = await getDoc(doc(db,'pages',handle));
  if(!snap.exists()){
    $('#pg-name').textContent='없는 페이지예요';
    $('#pg-handle').textContent='@'+handle;
    $('#pg-bio').textContent='주소를 다시 확인해 주세요.';
    $('#widgets').innerHTML=''; $('#btn-deco').classList.add('hidden');
    show('view-page'); return;
  }
  const p = curData = snap.data();
  const mine = me && p.owner === me.uid;

  // 프로필
  $('#pg-name').textContent = p.name || handle;
  $('#pg-handle').textContent = '@'+handle;
  $('#pg-bio').textContent = p.bio || '';
  document.title = (p.name||handle)+' — LOVERS CLUB';
  const bn = $('#pg-banner');
  bn.style.backgroundImage = p.bannerImg ? `url(${p.bannerImg})` : '';
  const av = $('#pg-avatar');
  av.innerHTML = p.avatarImg ? `<img src="${p.avatarImg}" alt="">`
                             : esc((p.name||handle).slice(0,1).toUpperCase());
  $('#pg-tags').innerHTML = (p.tags||[]).map(t=>`<span class="tag">${esc(t)}</span>`).join('');

  // 위젯
  const W = [];
  if(p.ddays && p.ddays.length){
    W.push(`<div class="w-card"><p class="label">D-DAY</p><div class="dday-grid">`+
      p.ddays.map(d=>`<div class="dday"><p class="n">${esc(ddayNum(d.date))}</p>
        <p class="t">${esc(d.title)}</p><p class="d">${esc(d.date)}</p></div>`).join('')+
      `</div></div>`);
  }
  if(p.couple && (p.couple.title || p.couple.text || p.couple.img)){
    W.push(`<div class="w-card"><p class="label">COUPLE</p><div class="duo">`+
      (p.couple.img?`<div class="ph"><img src="${p.couple.img}" alt=""></div>`:'')+
      `<div class="tx"><h3>${esc(p.couple.title||'')}</h3><p>${esc(p.couple.text||'')}</p></div>
      </div></div>`);
  }
  if(p.chara && (p.chara.title || p.chara.text || p.chara.img)){
    W.push(`<div class="w-card"><p class="label">CHARACTER</p><div class="duo">`+
      (p.chara.img?`<div class="ph"><img src="${p.chara.img}" alt=""></div>`:'')+
      `<div class="tx"><h3>${esc(p.chara.title||'')}</h3><p>${esc(p.chara.text||'')}</p></div>
      </div></div>`);
  }
  if(p.bgm && ytId(p.bgm.url)){
    W.push(`<div class="w-card"><p class="label">NOW PLAYING</p>
      <div class="bgm-frame"><iframe src="https://www.youtube.com/embed/${ytId(p.bgm.url)}"
        allow="autoplay; encrypted-media" allowfullscreen></iframe></div>`+
      (p.bgm.title?`<p class="bgm-title">♪ ${esc(p.bgm.title)}</p>`:'')+`</div>`);
  }
  if(!W.length && mine){
    W.push(`<div class="empty-slot">아직 위젯이 비어 있어요 — 오른쪽 아래 ✎ 꾸미기를 눌러 채워보세요!</div>`);
  }
  $('#widgets').innerHTML = W.join('');

  $('#btn-deco').classList.toggle('hidden', !mine);
  show('view-page');
}

/* ---------- 꾸미기 패널 ---------- */
const imgState = {};   // {banner, avatar, cp, ch} → dataURL(새로 고른 것만)

function ddRow(d={title:'',date:''}){
  const div = document.createElement('div');
  div.className='dd-row';
  div.innerHTML = `<input type="text" placeholder="제목 (예: 결혼기념일)" value="${esc(d.title)}">
    <input type="date" value="${esc(d.date)}">
    <button class="rm" title="삭제">✕</button>`;
  div.querySelector('.rm').onclick = ()=>div.remove();
  return div;
}
function bindImg(inputId, thumbId, key, maxW, q){
  $('#'+inputId).addEventListener('change', async e=>{
    const f = e.target.files[0]; if(!f) return;
    $('#p-msg').textContent = '이미지 압축 중...';
    imgState[key] = await compress(f, maxW, q);
    const th = $('#'+thumbId); th.src = imgState[key]; th.classList.remove('hidden');
    $('#p-msg').textContent = '';
  });
}
function openPanel(){
  const p = curData || {};
  $('#e-name').value = p.name||'';
  $('#e-bio').value = p.bio||'';
  $('#e-tags').value = (p.tags||[]).join(', ');
  $('#e-cp-title').value = p.couple?.title||'';
  $('#e-cp-text').value = p.couple?.text||'';
  $('#e-ch-title').value = p.chara?.title||'';
  $('#e-ch-text').value = p.chara?.text||'';
  $('#e-bgm-url').value = p.bgm?.url||'';
  $('#e-bgm-title').value = p.bgm?.title||'';
  const dd = $('#e-ddays'); dd.innerHTML='';
  (p.ddays&&p.ddays.length ? p.ddays : [{title:'',date:''}]).forEach(d=>dd.appendChild(ddRow(d)));
  [['e-banner-th',p.bannerImg],['e-avatar-th',p.avatarImg],
   ['e-cp-th',p.couple?.img],['e-ch-th',p.chara?.img]].forEach(([id,src])=>{
    const th=$('#'+id);
    if(src){ th.src=src; th.classList.remove('hidden'); } else th.classList.add('hidden');
  });
  Object.keys(imgState).forEach(k=>delete imgState[k]);
  $('#p-msg').textContent='';
  $('#panel').classList.add('show');
}
async function savePanel(){
  const p = curData || {};
  const data = {
    name: $('#e-name').value.trim() || curHandle,
    bio: $('#e-bio').value.trim(),
    tags: $('#e-tags').value.split(',').map(t=>t.trim()).filter(Boolean),
    bannerImg: imgState.banner ?? p.bannerImg ?? '',
    avatarImg: imgState.avatar ?? p.avatarImg ?? '',
    ddays: [...document.querySelectorAll('#e-ddays .dd-row')].map(r=>{
      const [t,d] = r.querySelectorAll('input');
      return {title:t.value.trim(), date:d.value};
    }).filter(x=>x.title && x.date),
    couple: {
      title: $('#e-cp-title').value.trim(),
      text:  $('#e-cp-text').value.trim(),
      img:   imgState.cp ?? p.couple?.img ?? ''
    },
    chara: {
      title: $('#e-ch-title').value.trim(),
      text:  $('#e-ch-text').value.trim(),
      img:   imgState.ch ?? p.chara?.img ?? ''
    },
    bgm: { url: $('#e-bgm-url').value.trim(), title: $('#e-bgm-title').value.trim() },
    updatedAt: serverTimestamp()
  };
  const size = JSON.stringify(data).length;
  if(size > 900000){
    $('#p-msg').textContent = '이미지 용량이 커서 저장할 수 없어요 — 이미지 수를 줄이거나 작은 사진으로 바꿔주세요.';
    return;
  }
  $('#p-msg').textContent = '저장 중...';
  try{
    await updateDoc(doc(db,'pages',curHandle), data);
    $('#p-msg').textContent = '저장 완료!';
    setTimeout(()=>$('#panel').classList.remove('show'), 400);
    renderPage(curHandle);
  }catch(e){ $('#p-msg').textContent = '오류: '+e.message; }
}

/* ---------- 가입 ---------- */
async function signup(){
  const code = $('#in-invite').value.trim();
  const handle = $('#in-handle').value.trim().toLowerCase();
  const name = $('#in-name').value.trim();
  const err = $('#signup-err'); err.textContent='';
  if(!code){ err.textContent='초대코드를 입력해 주세요.'; return; }
  if(!/^[a-z0-9-]{2,20}$/.test(handle)){ err.textContent='주소는 영문 소문자·숫자·하이픈 2~20자예요.'; return; }
  if(!name){ err.textContent='표시 이름을 입력해 주세요.'; return; }
  try{
    await runTransaction(db, async tx=>{
      const invRef=doc(db,'invites',code), pageRef=doc(db,'pages',handle), userRef=doc(db,'users',me.uid);
      const [inv,page,user]=await Promise.all([tx.get(invRef),tx.get(pageRef),tx.get(userRef)]);
      if(!inv.exists()) throw new Error('초대코드가 올바르지 않아요.');
      if(inv.data().used) throw new Error('이미 사용된 초대코드예요.');
      if(page.exists()) throw new Error('이미 누가 쓰고 있는 주소예요.');
      if(user.exists()) throw new Error('이 계정으로 만든 페이지가 이미 있어요.');
      tx.set(pageRef,{owner:me.uid,name,bio:'',createdAt:serverTimestamp()});
      tx.set(userRef,{handle,createdAt:serverTimestamp()});
      tx.update(invRef,{used:true,usedBy:me.uid,usedAt:serverTimestamp()});
    });
    myHandle=handle; renderTopbar();
    history.replaceState(null,'','./?u='+handle);
    renderPage(handle);
  }catch(e){ err.textContent=e.message; }
}

/* ---------- 시작 ---------- */
$('#btn-login').onclick  = () => signInWithPopup(auth, new GoogleAuthProvider()).catch(()=>{});
$('#btn-signup').onclick = signup;
$('#btn-deco').onclick   = openPanel;
$('#p-close').onclick    = () => $('#panel').classList.remove('show');
$('#p-save').onclick     = savePanel;
$('#e-dd-add').onclick   = () => $('#e-ddays').appendChild(ddRow());
bindImg('e-banner','e-banner-th','banner', 1600, .78);
bindImg('e-avatar','e-avatar-th','avatar', 400, .8);
bindImg('e-cp-img','e-cp-th','cp', 900, .78);
bindImg('e-ch-img','e-ch-th','ch', 900, .78);
$('#panel').addEventListener('click', e=>{ if(e.target.id==='panel') $('#panel').classList.remove('show'); });

onAuthStateChanged(auth, async user=>{
  me = user;
  const viewing = new URLSearchParams(location.search).get('u');
  if(user){
    const u = await getDoc(doc(db,'users',user.uid));
    myHandle = u.exists() ? u.data().handle : null;
  } else myHandle = null;
  renderTopbar();
  if(viewing) renderPage(viewing);
  else if(!me) show('view-login');
  else if(!myHandle) show('view-signup');
  else { history.replaceState(null,'','./?u='+myHandle); renderPage(myHandle); }
});
