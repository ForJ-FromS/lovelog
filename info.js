/* ============================================================
   LOVELOG — 성향글 페이지 (phase296c)
   러브로그 홈(app.js)과 완전히 분리된 독립 페이지.
   같은 파이어베이스 데이터만 공유하고, 화면·꾸미기는 여기서만 다룬다.
   · 장(章)  : pages/{핸들}/posts 중 cat === '__info'
   · 꾸미기  : pages/{핸들}.info  (홈 설정과 필드가 겹치지 않음)
   ============================================================ */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithPopup, GoogleAuthProvider }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp,
  collection, query, where, getDocs }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { getStorage, ref as sref, uploadBytes, getDownloadURL }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';
import { firebaseConfig } from './firebase-config.js';
import { bodyHTML, htmlToText, scopePostCSS, cleanHTML, htmlNl, esc } from './fmt.js?v=312';

const $ = s => document.querySelector(s);
const INFOCAT = '__info';
const app = initializeApp(firebaseConfig), auth = getAuth(app),
      db = getFirestore(app), stg = getStorage(app);

/* 핸들 — 서브도메인(jeste.luvlog.me) 우선, 본 주소에서는 ?u=핸들 */
const HANDLE = (()=>{
  const q = new URLSearchParams(location.search).get('u');
  if(q) return q.toLowerCase();
  const h = location.hostname.toLowerCase().split('.');
  if(h.length>2 && !['www','luvlog'].includes(h[0]) && !location.hostname.endsWith('github.io')) return h[0];
  const seg = location.pathname.split('/').filter(Boolean);
  return (seg.length>1 ? seg[0] : '').toLowerCase();
})();

const st = { me:null, mine:false, page:null, cfg:{}, chs:[], ix:0, editing:null, imgs:[] };
let toastT;
const msg = t => { const el=$('#toast'); if(!el) return;
  el.textContent=t; el.classList.add('on'); clearTimeout(toastT);
  toastT=setTimeout(()=>el.classList.remove('on'), 2600); };

const FONTS = {
  sans:{ nm:'고딕', fam:"'Noto Sans KR',sans-serif" },
  serif:{ nm:'명조', fam:"'Noto Serif KR',serif" },
  mono:{ nm:'모노', fam:"'IBM Plex Mono','Noto Sans KR',monospace" },
};
const NAVS = { arrow:'‹ › 화살표', pill:'장 이름 알약', dot:'● 점' };
const RESERVED = ['guide','index','app','assets','api','luvlog','www','admin','404','static','info'];

/* ── 사진 올리기 — 긴 변 1600px으로 줄여서 저장 ───────────── */
async function shrink(file, maxW=1600, q=.86){
  if(file.type==='image/gif') return file;
  const img = await new Promise((res,rej)=>{ const i=new Image();
    i.onload=()=>res(i); i.onerror=rej; i.src=URL.createObjectURL(file); });
  const sc = Math.min(1, maxW/img.width);
  const c = document.createElement('canvas');
  c.width = Math.round(img.width*sc); c.height = Math.round(img.height*sc);
  c.getContext('2d').drawImage(img,0,0,c.width,c.height);
  return await new Promise(r=>c.toBlob(r,'image/jpeg',q));
}
async function upload(file, maxW){
  if(!st.me) throw new Error('로그인이 필요해요.');
  const blob = await shrink(file, maxW);
  const ext = (file.type==='image/gif') ? 'gif' : 'jpg';
  const name = Date.now().toString(36)+Math.random().toString(36).slice(2,7)+'.'+ext;
  const r = sref(stg, 'u/'+st.me.uid+'/'+name);
  await uploadBytes(r, blob, { contentType: ext==='gif'?'image/gif':'image/jpeg',
    cacheControl:'public,max-age=31536000' });
  return await getDownloadURL(r);
}

/* ── 꾸미기 값 읽기 ───────────────────────────────────────── */
const cfg = () => st.cfg || {};
const navMode = () => NAVS[cfg().nav] ? cfg().nav : 'arrow';
const slugOf = () => st.page?.infoSlug || 'info';

function applyLook(){
  const c = cfg(), r = document.documentElement.style;
  document.body.classList.toggle('light', !!c.light);
  if(c.bgC) r.setProperty('--bg', c.bgC);
  if(c.inkC){ r.setProperty('--body', c.inkC); r.setProperty('--ink', c.inkC); }
  if(c.priC) r.setProperty('--pri', c.priC);
  r.setProperty('--fam', (FONTS[c.font]||FONTS.sans).fam);
  r.setProperty('--w', (c.width||640)+'px');
  r.setProperty('--dim', ((c.bgDim==null?55:c.bgDim)/100).toFixed(2));
  $('#bgphoto').style.backgroundImage = c.bg ? `url("${c.bg}")` : '';
  const hp = $('#hero-ph');
  hp.classList.toggle('hidden', !c.hero);
  hp.style.backgroundImage = c.hero ? `url("${c.hero}")` : '';
  $('#hero').style.setProperty('--hh', (c.heroH||220)+'px');
  $('#ov').textContent = '@'+HANDLE.toUpperCase();
  $('#ttl').textContent = c.title || st.page?.name || HANDLE;
  $('#sb').textContent = c.sub || '';
  $('#sb').classList.toggle('hidden', !c.sub);
  document.title = (c.title || st.page?.name || HANDLE);
  let fav = document.getElementById('favi');
  if(c.fav){ if(!fav){ fav=document.createElement('link'); fav.rel='icon'; fav.id='favi';
      document.head.appendChild(fav); } fav.href=c.fav; }
  else if(fav) fav.remove();
  let css = document.getElementById('user-css');
  if(!css){ css=document.createElement('style'); css.id='user-css'; document.head.appendChild(css); }
  css.textContent = c.css || '';
  $('#foot').textContent = c.foot === '' ? '' : (c.foot || '');
}

/* ── 장 렌더 ──────────────────────────────────────────────── */
function render(){
  const ch = st.chs;
  $('#obar').classList.toggle('hidden', !st.mine);
  if(st.mine) $('#obar').innerHTML =
    `<button data-add="1">＋ 새 장</button>
     <button data-deco="1">🎨 이 공간 꾸미기</button>
     <button data-copy="1">🔗 링크 복사</button>
     <p class="nt">주인에게만 보이는 줄이에요 — 방문자에겐 글과 넘김 버튼만 보여요.</p>`;
  if(!ch.length){
    $('#ch-t').classList.add('hidden');
    $('#own').classList.add('hidden');
    $('#ch-b').innerHTML = `<p class="empty">${st.mine
      ? '아직 장이 없어요 — 아래 [＋ 새 장]으로 첫 장을 써보세요.'
      : '아직 성향글이 없습니다.'}</p>`;
    $('#nav').innerHTML='';
    bind(); return;
  }
  st.ix = Math.min(Math.max(0, st.ix), ch.length-1);
  const p = ch[st.ix];
  $('#ch-t').classList.toggle('hidden', !p.title);
  $('#ch-t').textContent = p.title || '';
  let body = p.body || '';
  if(p.html) body = htmlNl(body);
  $('#ch-b').innerHTML = scopePostCSS(body);
  $('#own').classList.toggle('hidden', !st.mine);
  if(st.mine) $('#own').innerHTML =
    `<i data-ed="1" title="이 장 고치기">✎</i>`
    +`<i data-mv="-1" class="${st.ix<=0?'off':''}" title="앞으로 보내기">↑</i>`
    +`<i data-mv="1" class="${st.ix>=ch.length-1?'off':''}" title="뒤로 보내기">↓</i>`
    +`<i data-del="1" title="이 장 지우기">🗑</i>`;
  const nv = navMode();
  $('#nav').innerHTML = nv==='pill'
    ? ch.map((x,i)=>`<span class="pl${i===st.ix?' on':''}" data-go="${i}">${esc(x.title||('장 '+(i+1)))}</span>`).join('')
    : nv==='dot'
    ? ch.map((x,i)=>`<span class="dt${i===st.ix?' on':''}" data-go="${i}" title="${esc(x.title||'')}"></span>`).join('')
    : `<span class="ar${st.ix<=0?' off':''}" data-go="${st.ix-1}">‹</span>`
      +`<span class="ct">${st.ix+1} / ${ch.length}</span>`
      +`<span class="ar${st.ix>=ch.length-1?' off':''}" data-go="${st.ix+1}">›</span>`;
  bind();
}
function bind(){
  document.querySelectorAll('[data-go]').forEach(el=>{
    if(el.classList.contains('off')) return;
    el.onclick=()=>{ const j=+el.dataset.go;
      if(j<0||j>=st.chs.length||j===st.ix) return;
      st.ix=j; render(); window.scrollTo({top:0,behavior:'smooth'}); };
  });
  const on=(sel,fn)=>{ const el=$(sel); if(el) el.onclick=fn; };
  on('[data-ed]', ()=>openEditor(st.chs[st.ix]));
  on('[data-add]', ()=>openEditor(null));
  on('[data-deco]', openDeco);
  on('[data-copy]', ()=>{
    const u = 'https://'+HANDLE+'.luvlog.me/info.html';
    if(navigator.clipboard) navigator.clipboard.writeText(u).then(()=>msg('링크를 복사했어요 — '+u), ()=>msg(u));
    else msg(u);
  });
  on('[data-del]', async ()=>{
    const p=st.chs[st.ix];
    if(!confirm(`「${p.title||'제목 없음'}」 장을 지울까요?\n되돌릴 수 없어요.`)) return;
    try{ await deleteDoc(doc(db,'pages',HANDLE,'posts',p.id)); }
    catch(e){ msg('삭제 실패 — '+e.message); return; }
    st.ix=Math.max(0,st.ix-1); await loadChapters(); render(); msg('장을 지웠어요.');
  });
  document.querySelectorAll('[data-mv]').forEach(el=>{
    if(el.classList.contains('off')) return;
    el.onclick=async()=>{
      const j=st.ix+(+el.dataset.mv); if(j<0||j>=st.chs.length) return;
      const seq=st.chs.map(x=>x.id); [seq[st.ix],seq[j]]=[seq[j],seq[st.ix]];
      try{ await Promise.all(seq.map((id,i)=>updateDoc(doc(db,'pages',HANDLE,'posts',id),{ord:i}))); }
      catch(e){ msg('순서 저장 실패 — '+e.message); return; }
      seq.forEach((id,i)=>{ const q=st.chs.find(y=>y.id===id); if(q) q.ord=i; });
      st.chs.sort((a,b)=>a.ord-b.ord);
      st.ix=j; render(); msg('순서를 바꿨어요!');
    };
  });
}

/* ── 시트 ─────────────────────────────────────────────────── */
function sheet(title, sub, inner){
  closeSheet();
  const d=document.createElement('div'); d.className='sheet'; d.id='sheet';
  d.innerHTML=`<div class="card"><span class="x" id="sheet-x">✕</span>
    <h3>${esc(title)}</h3><p class="sub">${esc(sub)}</p>${inner}</div>`;
  document.body.appendChild(d);
  $('#sheet-x').onclick=closeSheet;
  d.onclick=e=>{ if(e.target===d) closeSheet(); };
  return d;
}
const closeSheet=()=>{ const s=$('#sheet'); if(s) s.remove(); };

/* ── 장 쓰기·고치기 ───────────────────────────────────────── */
function openEditor(p){
  st.editing = p ? p.id : null;
  st.imgs = p && Array.isArray(p.imgs) ? p.imgs.slice() : [];
  const raw = p ? (typeof p.raw==='string' && p.raw!=='' ? p.raw : htmlToText(p.body||'')) : '';
  sheet(p?'장 고치기':'새 장', '칸 하나에 쓰고 싶은 걸 쭉 쓰면 돼요.', `
    <div class="row"><input type="text" id="ed-title" placeholder="장 이름 (예: ABOUT)" value="${esc(p?.title||'')}"></div>
    <div class="fmtbar" id="ed-fmt">
      <button data-mk="**" title="굵게"><b>B</b></button>
      <button data-mk="*" title="기울임"><i>I</i></button>
      <button data-mk="__" title="밑줄"><u>U</u></button>
      <button data-mk="==" title="형광">≡</button>
      <button data-ln="&gt; " title="인용">❝</button>
      <button data-fold="1" title="접은 글">▸</button>
      <button data-link="1" title="링크">🔗</button>
      <button data-hr="1" title="구분선">—</button>
    </div>
    <textarea id="ed-body" placeholder="본문 — **굵게** *기울임* __밑줄__ ==형광== 도 돼요">${esc(raw)}</textarea>
    <div class="row" style="margin-top:10px">
      <label class="filelab">🖼 사진 넣기<input type="file" id="ed-img" accept="image/*"></label>
      <span class="note" style="margin:0">넣으면 커서 자리에 [사진N]이 들어가요.</span>
    </div>
    <div class="row" style="justify-content:flex-end;margin-top:6px">
      <button class="btn" id="ed-pv">미리보기</button>
      <button class="btn go" id="ed-go">${p?'저장':'발행'}</button>
    </div>
    <div id="ed-pvbox" class="bd hidden" style="border-top:1px dashed var(--line);padding-top:16px"></div>`);

  const ta=$('#ed-body');
  const wrapSel=(mk)=>{ const s=ta.selectionStart, e=ta.selectionEnd, v=ta.value;
    ta.value=v.slice(0,s)+mk+(v.slice(s,e)||'글자')+mk+v.slice(e);
    ta.focus(); ta.setSelectionRange(s+mk.length, s+mk.length+(e-s||2)); };
  const atLine=(pre)=>{ const s=ta.selectionStart, v=ta.value;
    const ls=v.lastIndexOf('\n',s-1)+1;
    ta.value=v.slice(0,ls)+pre+v.slice(ls); ta.focus(); };
  const insert=(txt)=>{ const s=ta.selectionStart, v=ta.value;
    ta.value=v.slice(0,s)+txt+v.slice(s); ta.focus();
    ta.setSelectionRange(s+txt.length, s+txt.length); };
  $('#ed-fmt').querySelectorAll('button').forEach(b=>b.onclick=()=>{
    if(b.dataset.mk) return wrapSel(b.dataset.mk);
    if(b.dataset.ln) return atLine('> ');
    if(b.dataset.hr) return insert('\n\n---\n\n');
    if(b.dataset.fold) return insert('\n[접기:제목]\n내용\n[/접기]\n');
    if(b.dataset.link) return insert('[글자](https://)');
  });
  $('#ed-pv').onclick=()=>{
    const box=$('#ed-pvbox');
    box.classList.toggle('hidden');
    if(!box.classList.contains('hidden')) box.innerHTML=render1(ta.value);
  };
  $('#ed-img').onchange=async e=>{
    const f=e.target.files[0]; if(!f) return;
    msg('사진 올리는 중…');
    try{ const url=await upload(f, 1600); st.imgs.push(url);
      insert(`[사진${st.imgs.length}]`); msg('사진을 넣었어요.'); }
    catch(err){ msg('사진 실패 — '+err.message); }
    e.target.value='';
  };
  $('#ed-go').onclick=save;
}
/* [사진N] 자리에 실제 이미지를 끼워 최종 HTML을 만든다 */
function render1(raw){
  let html = bodyHTML(raw);
  html = html.replace(/\[사진(\d+)\]/g, (m,n)=>{
    const u = st.imgs[+n-1];
    return u ? `<img src="${esc(u)}" alt="" loading="lazy">` : m;
  });
  return html;
}
async function save(){
  const title=$('#ed-title').value.trim();
  const raw=$('#ed-body').value;
  if(!raw.trim()){ msg('내용을 써주세요.'); return; }
  const body=render1(raw);
  const now=new Date(), pad=n=>String(n).padStart(2,'0');
  const date=now.getFullYear()+'.'+pad(now.getMonth()+1)+'.'+pad(now.getDate());
  msg('저장 중…');
  try{
    if(st.editing){
      await setDoc(doc(db,'pages',HANDLE,'posts',st.editing), {
        cat:INFOCAT, title, raw, body, imgs:st.imgs, html:false,
        ord: st.chs.find(c=>c.id===st.editing)?.ord ?? 0,
        date: st.chs.find(c=>c.id===st.editing)?.date || date,
        ts: st.chs.find(c=>c.id===st.editing)?.ts || serverTimestamp(),
        editedAt: serverTimestamp() }, {merge:true});
    }else{
      const base='info-'+Date.now().toString(36);
      await setDoc(doc(db,'pages',HANDLE,'posts',base), {
        cat:INFOCAT, title, raw, body, imgs:st.imgs, html:false,
        ord: st.chs.length, date, ts: serverTimestamp() });
    }
  }catch(e){ msg('저장 실패 — '+e.message); return; }
  closeSheet();
  await loadChapters();
  if(!st.editing) st.ix=st.chs.length-1;
  render(); msg(st.editing?'저장했어요!':'새 장을 올렸어요!');
  st.editing=null;
}

/* ── 꾸미기 ───────────────────────────────────────────────── */
async function saveCfg(patch, ok){
  const out={}; Object.entries(patch).forEach(([k,v])=>out['info.'+k]=v);   // 홈 설정과 절대 안 섞이게
  try{ await updateDoc(doc(db,'pages',HANDLE), out); }
  catch(e){ msg('저장 실패 — '+e.message); return false; }
  st.cfg={...st.cfg, ...patch}; applyLook();
  if(ok) msg(ok);
  return true;
}
function openDeco(){
  const c=cfg();
  sheet('이 공간 꾸미기', '여기서 바꾼 건 성향글에만 적용돼요 — 홈은 그대로예요.', `
  <div class="stabs">
    <b class="on" data-t="look">모양</b><b data-t="photo">사진</b>
    <b data-t="nav">장 넘김</b><b data-t="addr">주소</b><b data-t="css">직접 꾸미기</b>
  </div>
  <div data-p="look">
    <div class="row"><label>제목</label><input type="text" id="c-title" value="${esc(c.title||'')}" placeholder="${esc(st.page?.name||HANDLE)}"></div>
    <div class="row"><label>부제</label><input type="text" id="c-sub" value="${esc(c.sub||'')}" placeholder="선택"></div>
    <div class="row">
      <label>배경</label><input type="color" id="c-bgc" value="${esc(c.bgC||'#0d0f14')}">
      <label>글자</label><input type="color" id="c-inkc" value="${esc(c.inkC||'#e9edf5')}">
      <label>포인트</label><input type="color" id="c-pric" value="${esc(c.priC||'#c9a227')}">
      <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="c-light" ${c.light?'checked':''}>밝은 배경</label>
    </div>
    <div class="row">
      <label>폰트</label>
      <select id="c-font">${Object.keys(FONTS).map(k=>`<option value="${k}" ${(c.font||'sans')===k?'selected':''}>${FONTS[k].nm}</option>`).join('')}</select>
      <label>글 폭</label>
      <select id="c-width">${[560,640,760,900].map(w=>`<option value="${w}" ${(c.width||640)==w?'selected':''}>${w}px</option>`).join('')}</select>
    </div>
    <div class="row"><label>맨 아래 글자</label><input type="text" id="c-foot" value="${esc(c.foot||'')}" placeholder="비우면 아무것도 안 보여요"></div>
    <div class="row" style="justify-content:flex-end"><button class="btn go" id="c-look-go">저장</button></div>
  </div>
  <div data-p="photo" class="hidden">
    <div class="row"><label class="filelab">🖼 머리 사진<input type="file" id="c-hero" accept="image/*"></label>
      ${c.hero?`<button class="btn" id="c-hero-x">머리 사진 빼기</button>`:''}
      <label>높이</label><input type="range" id="c-heroh" min="140" max="520" step="10" value="${c.heroH||220}">
    </div>
    <div class="row"><label class="filelab">🌄 배경 사진<input type="file" id="c-bg" accept="image/*"></label>
      ${c.bg?`<button class="btn" id="c-bg-x">배경 빼기</button>`:''}
      <label>어둡기</label><input type="range" id="c-dim" min="0" max="95" step="5" value="${c.bgDim==null?55:c.bgDim}">
    </div>
    <div class="row"><label class="filelab">🔖 탭 아이콘<input type="file" id="c-fav" accept="image/*"></label></div>
    <p class="note">사진은 고르는 즉시 올라가고, 슬라이더는 놓는 순간 저장돼요.</p>
  </div>
  <div data-p="nav" class="hidden">
    <div class="row"><label>넘김 모양</label>
      <select id="c-nav">${Object.keys(NAVS).map(k=>`<option value="${k}" ${navMode()===k?'selected':''}>${NAVS[k]}</option>`).join('')}</select>
    </div>
    <p class="note">장 순서는 글 오른쪽 위 ↑↓ 로 바꿔요.</p>
  </div>
  <div data-p="addr" class="hidden">
    <div class="row"><span class="note" style="margin:0">${esc(HANDLE)}.luvlog.me/info.html</span>
      <button class="btn" id="c-copy">🔗 링크 복사</button></div>
    <div class="row"><label style="display:flex;gap:7px;align-items:center">
      <input type="checkbox" id="c-pub" ${st.page?.infoPub?'checked':''}>홈 오른쪽 위에 INFO 탭 보이기</label></div>
    <p class="note">끄면 링크를 아는 사람만 들어와요. 홈에서는 이 페이지가 어디에도 안 뜹니다.</p>
  </div>
  <div data-p="css" class="hidden">
    <p class="note">이 페이지에만 걸리는 CSS예요 — 홈 CSS와 섞이지 않아요.</p>
    <textarea id="c-css" placeholder=".ch h2{letter-spacing:.3em}">${esc(c.css||'')}</textarea>
    <div class="row" style="justify-content:flex-end;margin-top:10px"><button class="btn go" id="c-css-go">저장</button></div>
  </div>`);

  document.querySelectorAll('.stabs b').forEach(b=>b.onclick=()=>{
    document.querySelectorAll('.stabs b').forEach(x=>x.classList.toggle('on',x===b));
    document.querySelectorAll('[data-p]').forEach(p=>p.classList.toggle('hidden',p.dataset.p!==b.dataset.t));
  });
  $('#c-look-go').onclick=()=>saveCfg({
    title:$('#c-title').value.trim(), sub:$('#c-sub').value.trim(),
    bgC:$('#c-bgc').value, inkC:$('#c-inkc').value, priC:$('#c-pric').value,
    light:$('#c-light').checked, font:$('#c-font').value, width:+$('#c-width').value,
    foot:$('#c-foot').value.trim() }, '저장했어요!');
  $('#c-css-go').onclick=()=>saveCfg({ css:$('#c-css').value }, 'CSS를 저장했어요!');
  $('#c-nav').onchange=e=>saveCfg({nav:e.target.value}, '넘김 모양을 바꿨어요.').then(()=>render());
  const pic=async(inp, key, maxW, ok)=>{
    const el=$(inp); if(!el) return;
    el.onchange=async e=>{ const f=e.target.files[0]; if(!f) return;
      msg('올리는 중…');
      try{ const url=await upload(f, maxW); await saveCfg({[key]:url}, ok); openDeco(); }
      catch(err){ msg('실패 — '+err.message); }
      e.target.value=''; };
  };
  pic('#c-hero','hero',1800,'머리 사진을 넣었어요.');
  pic('#c-bg','bg',2000,'배경 사진을 넣었어요.');
  pic('#c-fav','fav',96,'탭 아이콘을 넣었어요.');
  const xb=(sel,key,ok)=>{ const b=$(sel); if(b) b.onclick=()=>saveCfg({[key]:''}, ok).then(()=>openDeco()); };
  xb('#c-hero-x','hero','머리 사진을 뺐어요.');
  xb('#c-bg-x','bg','배경을 뺐어요.');
  const rng=(sel,key)=>{ const r=$(sel); if(!r) return;
    r.oninput=()=>{ st.cfg[key]=+r.value; applyLook(); };
    r.onchange=()=>saveCfg({[key]:+r.value}); };
  rng('#c-heroh','heroH'); rng('#c-dim','bgDim');
  $('#c-copy').onclick=()=>{
    const u='https://'+HANDLE+'.luvlog.me/info.html';
    if(navigator.clipboard) navigator.clipboard.writeText(u).then(()=>msg('복사했어요 — '+u), ()=>msg(u));
    else msg(u);
  };
  $('#c-pub').onchange=async e=>{
    const v=e.target.checked;
    try{ await updateDoc(doc(db,'pages',HANDLE),{infoPub:v}); st.page.infoPub=v;
      msg(v?'홈에 INFO 탭을 보여요.':'INFO 탭을 숨겼어요.'); }
    catch(err){ msg('저장 실패 — '+err.message); e.target.checked=!v; }
  };
}

/* ── 불러오기 ─────────────────────────────────────────────── */
async function loadChapters(){
  let docs=[];
  try{
    const snap=await getDocs(query(collection(db,'pages',HANDLE,'posts'), where('cat','==',INFOCAT)));
    docs=snap.docs.map(d=>({id:d.id,...d.data()}));
  }catch(e){ console.warn('장 불러오기 실패', e); }
  if(!st.mine) docs=docs.filter(p=>!p.priv && !p.secret);
  else docs=docs.filter(p=>!p.secret);
  docs.sort((a,b)=>((a.ord??1e9)-(b.ord??1e9)) || String(a.date||'').localeCompare(String(b.date||'')));
  st.chs=docs;
}
async function sha256(t){
  const h=await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t));
  return [...new Uint8Array(h)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
function showApp(){
  $('#load').classList.add('hidden');
  $('#gate').classList.add('hidden');
  $('#app').classList.remove('hidden');
  applyLook(); render();
}
async function boot(){
  if(!HANDLE){ $('#load').innerHTML='<p style="color:var(--muted);font-size:12px">주소가 올바르지 않아요.</p>'; return; }
  let snap;
  try{ snap=await getDoc(doc(db,'pages',HANDLE)); }
  catch(e){ $('#load').innerHTML='<p style="color:var(--muted);font-size:12px">불러오지 못했어요 — '+esc(e.message)+'</p>'; return; }
  if(!snap.exists()){ $('#load').innerHTML='<p style="color:var(--muted);font-size:12px">없는 페이지예요.</p>'; return; }
  st.page=snap.data();
  st.cfg=st.page.info||{};
  st.mine = !!(st.me && st.page.owner===st.me.uid);
  if(st.page.unlisted && !st.mine){
    $('#load').innerHTML='<p style="color:var(--muted);font-size:12px">없는 페이지예요.</p>'; return; }
  await loadChapters();
  applyLook();
  /* 대문 비밀번호 — 성향글에 따로 걸어둔 경우에만 */
  const pw=st.cfg.gate;
  if(pw && !st.mine && sessionStorage.getItem('infogate_'+HANDLE)!==pw){
    $('#load').classList.add('hidden');
    $('#gate').classList.remove('hidden');
    $('#gate-name').textContent=st.cfg.title||st.page.name||HANDLE;
    $('#gate-go').onclick=async()=>{
      const h=await sha256($('#gate-pw').value);
      if(h!==pw){ $('#gate-err').textContent='비밀번호가 맞지 않아요.'; return; }
      sessionStorage.setItem('infogate_'+HANDLE, h); showApp();
    };
    $('#gate-pw').addEventListener('keydown',e=>{ if(e.key==='Enter') $('#gate-go').click(); });
    return;
  }
  showApp();
}
onAuthStateChanged(auth, async u=>{
  st.me=u||null;
  await boot();
});
/* 주인이 로그아웃 상태로 들어왔을 때 — 조용히 로그인 버튼만 하나 */
window.addEventListener('load', ()=>{
  setTimeout(()=>{
    if(st.me || !st.page || st.mine) return;
    const b=document.createElement('button');
    b.className='btn'; b.textContent='주인 로그인';
    b.style.cssText='position:fixed;right:14px;bottom:14px;z-index:70;opacity:.5;font-size:11px';
    b.onmouseenter=()=>b.style.opacity=1;
    b.onclick=()=>signInWithPopup(auth, new GoogleAuthProvider())
      .catch(e=>{ if(e.code!=='auth/popup-closed-by-user') msg('로그인 실패 — '+e.message); });
    document.body.appendChild(b);
  }, 1200);
});
