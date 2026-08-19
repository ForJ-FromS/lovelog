// ═══════════════════════════════════════════════
// LUVINFO — app.js v9 (신판: 장 2종 + 프리셋 4종)
// luvlog(lovelog-cc579)와 같은 Firebase, 별도 컬렉션(tsites/tusers)
// ═══════════════════════════════════════════════
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, increment, getDocs, collection, deleteDoc
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import {
  getStorage, ref as sref, uploadBytes, getDownloadURL
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';
import { firebaseConfig } from './firebase-config.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 9);

const BASE = location.origin + location.pathname.replace(/[^/]*$/, '');

// 구 index + 신 app 스큐에서도 안 죽는 바인딩 헬퍼
function gid(i) { return document.getElementById(i); }

// ═══ 가입 설정 ═══
// mode: 'open' = 누구나 가입 / 'code' = 초대 코드 입력해야 가입
// 코드제로 바꾸려면: mode를 'code'로, code에 원하는 초대 코드를 넣고 재배포
const SIGNUP = { mode: 'invite', code: '' }; // invite = config/tsignup 목록의 러브인포 전용 코드 / open = 자유 가입 / code = 고정 코드
const st = { user: null, myHandle: null, handle: null, site: null, mine: false, edit: false, dirty: false, cur: 0 };

console.log('[LUVINFO] app.js v46 로드');

function setDirty() {
  st.dirty = true;
  const b = document.getElementById('ob-save');
  if (b) b.classList.add('attn');
}

function toast(m) {
  const t = $('#toast');
  t.textContent = m;
  t.classList.add('on');
  clearTimeout(t._tm);
  t._tm = setTimeout(() => t.classList.remove('on'), 2400);
}

// ── 프리셋 기본값 (색 피커 표시용) ──
const CARDC = { white: '#FFFFFF', dark: '#101017', diary: '#FFFDF8', cute: '#FFFFFF', mono: '#FAFAFA', glass: '#FFFFFF', midnight: '#121733', forest: '#182A22', retro: '#C9C9C9', vhs: '#101013' };
const PRESETS = {
  white: { bg: '#FDFDFC', tx: '#1F1E1C', pri: '#1F1E1C' },
  dark:  { bg: '#08080B', tx: '#E8E4DA', pri: '#C9A227' },
  diary: { bg: '#F7F3EA', tx: '#4A4238', pri: '#B0693C' },
  cute:  { bg: '#FDF6F8', tx: '#5C4A52', pri: '#E58FA8' },
  mono:  { bg: '#FFFFFF', tx: '#151515', pri: '#151515' },
  glass: { bg: '#EDF0F7', tx: '#3A3F52', pri: '#6B7AA8' },
  midnight: { bg: '#0B1026', tx: '#DCE0F2', pri: '#8E9BD8' },
  forest: { bg: '#12201A', tx: '#E3E9E1', pri: '#7FB89A' },
  retro: { bg: '#C0C0C0', tx: '#1F1F1F', pri: '#000080' },
  vhs: { bg: '#060608', tx: '#E8E8E8', pri: '#FF3B4E' }
};

function defaultSite(ownerUid, handle) {
  return {
    ownerUid,
    head: { mode: 'text', over: 'INFO', title: handle.toUpperCase(), sub: 'TASTE ARCHIVE', img: '' },
    theme: { preset: 'white', bg: '', tx: '', pri: '', font: "'Pretendard'", nav: 'dot', num: 'on', css: '', corner: '', cardop: '', bgImg: '', bgDim: 84, valign: '' },
    gate: { on: false, msg: '', pw: '', img: '' },
    chapters: [{
      id: uid(), title: '기본', type: 'cell',
      body: '첫 장이에요. 하단 ✎ 편집을 눌러 자유롭게 고쳐보세요.\n\n빈 줄로 문단을 나누고, 사진과 접은 글도 넣을 수 있어요.\n\n{접기:접은 글은 이렇게}\n눌러서 펼치는 내용이 여기 들어가요.\n{접기끝}',
      imgs: []
    }],
    heart: 0,
    updated: Date.now()
  };
}

// ═══════════ 라우팅 ═══════════
function homeUrl(h) { return BASE + encodeURIComponent(h); }
function beautifyUrl() {
  // ?h=핸들 → /핸들 로 주소창 정리 (다른 쿼리가 있으면 건드리지 않음)
  try {
    const sp = new URLSearchParams(location.search);
    const keys = [...sp.keys()];
    if (!st.handle) return;
    if (keys.length && !(keys.length === 1 && keys[0] === 'h')) return;
    const want = new URL(homeUrl(st.handle)).pathname;
    if (location.pathname === want && !location.search) return;
    history.replaceState(null, '', homeUrl(st.handle));
  } catch (e) { /* 무시 */ }
}
function targetHandle() {
  const saved = sessionStorage.getItem('sh_route');
  if (saved) { sessionStorage.removeItem('sh_route'); history.replaceState(null, '', saved); }
  const seg = (location.pathname.match(/[^/]+$/) || [''])[0];
  if (seg && seg !== 'index.html') return seg.toLowerCase();
  const q = new URLSearchParams(location.search).get('h');
  return q ? q.toLowerCase() : null;
}

async function boot() {
  onAuthStateChanged(auth, async (u) => {
    st.user = u;
    if (u) {
      try {
        const ud = await getDoc(doc(db, 'tusers', u.uid));
        st.myHandle = ud.exists() ? ud.data().handle : null;
      } catch (e) { console.log('[LUVINFO] tusers err', e); }
    } else {
      st.myHandle = null;
    }
    route();
  });
}

async function route() {
  const h = st._routed ? st.handle : targetHandle();
  st._routed = true;
  $('#loading').style.display = 'none';
  if (!h) {
    if (st.myHandle) {
      $('#landing-my').style.display = 'block';
      $('#btn-myhome').onclick = () => { location.href = homeUrl(st.myHandle); };
    }
    if (st.user) {
      $('#btn-start').textContent = st.myHandle ? '다른 계정으로 시작하기' : '핸들 만들기 (계속)';
      gid('btn-logout').style.display = '';
    }
    gid('btn-logout').onclick = doLogout;
    if (gid('landing-inq')) gid('landing-inq').onclick = (e) => { e.preventDefault(); if (st.myHandle === 'jeste') openOps(); else openInq(); };
    $('#landing').classList.add('show');
    $('#btn-start').onclick = login;
    return;
  }
  st.handle = h;
  beautifyUrl();
  let d;
  try { d = await getDoc(doc(db, 'tsites', h)); }
  catch (e) { console.log('[LUVINFO] load err', e); toast('불러오기 실패'); return; }
  if (!d.exists()) {
    $('#landing').classList.add('show');
    $('#landing .desc').textContent = '@' + h + ' — 존재하지 않는 페이지예요.';
    $('#btn-start').onclick = login;
    return;
  }
  st.site = migrate(d.data());
  st.mine = !!(st.user && st.site.ownerUid === st.user.uid);
  if (st.site.priv && !st.mine) {
    // 비공개 홈 — 방문자에게는 없는 페이지처럼
    $('#landing').classList.add('show');
    $('#landing .desc').textContent = '@' + h + ' — 존재하지 않는 페이지예요.';
    $('#btn-start').onclick = login;
    return;
  }
  if (st.site.priv && st.mine) setTimeout(() => toast('🔒 비공개 상태예요 — 나만 볼 수 있어요'), 400);
  const g = st.site.gate || {};
  if (g.on && !st.mine && sessionStorage.getItem('sh_gate_' + h) !== '1') {
    showGate(g);
    return;
  }
  showSite();
}

// v8(블록 구조) 문서 → 신 구조로 (하트·게이트만 승계, 새 출발)
function migrate(data) {
  if (data.chapters) return data;
  const fresh = defaultSite(data.ownerUid, st.handle);
  fresh.heart = data.heart || 0;
  if (data.gate) fresh.gate = { on: !!data.gate.on, msg: data.gate.msg || '', pw: data.gate.pw || '', img: data.gate.img || '' };
  fresh._migrated = true;
  return fresh;
}

function showGate(g) {
  $('#gate').classList.add('show');
  if (g.img) { $('#gate-img').src = g.img; $('#gate-img').style.display = 'block'; }
  $('#gate-msg').textContent = g.msg || 'WELCOME';
  $('#gate-pw').style.display = g.pw ? 'block' : 'none';
  const enter = () => {
    if (g.pw && $('#gate-pw').value !== g.pw) { toast('비밀번호가 달라요'); return; }
    sessionStorage.setItem('sh_gate_' + st.handle, '1');
    $('#gate').classList.remove('show');
    showSite();
  };
  $('#gate-enter').onclick = enter;
  $('#gate-pw').onkeydown = (e) => { if (e.key === 'Enter') enter(); };
}

// ═══════════ 로그인 / 가입 ═══════════
async function doLogout() {
  try { await signOut(auth); toast('로그아웃했어요'); setTimeout(() => location.href = BASE, 600); }
  catch (e) { console.log('[LUVINFO] logout err', e); toast('로그아웃 실패'); }
}

async function login() {
  try {
    const r = await signInWithPopup(auth, new GoogleAuthProvider());
    const ud = await getDoc(doc(db, 'tusers', r.user.uid));
    if (!ud.exists()) { openClaim(r.user); return; }
    if (!ud.data().email) {
      try { await setDoc(doc(db, 'tusers', r.user.uid), { email: r.user.email || '' }, { merge: true }); }
      catch (e) { console.log('[LUVINFO] email backfill err', e); }
    }
    location.href = homeUrl(ud.data().handle);
  } catch (e) {
    console.log('[LUVINFO] login err', e);
    toast('로그인에 실패했어요');
  }
}

function openClaim(user) {
  $('#landing').classList.remove('show');
  $('#claim').classList.add('on');
  if (gid('claim-code')) {
    gid('claim-code').value = '';
    const needCode = SIGNUP.mode === 'invite' || SIGNUP.mode === 'code';
    gid('claim-code').style.display = needCode ? '' : 'none';
    gid('claim-code').previousElementSibling.style.display = needCode ? '' : 'none';
  }
  $('#claim-cancel').onclick = () => { $('#claim').classList.remove('on'); $('#landing').classList.add('show'); };
  $('#claim-ok').onclick = async () => {
    if (SIGNUP.mode === 'code') {
      const c = (gid('claim-code') ? gid('claim-code').value : '').trim();
      if (c !== SIGNUP.code) { toast('초대 코드가 달라요'); return; }
    }
    let onceCode = null;
    if (SIGNUP.mode === 'invite') {
      const code = (gid('claim-code') ? gid('claim-code').value : '').trim().toLowerCase();
      if (!code) { toast('초대 코드를 입력해 주세요'); return; }
      try {
        // ①다회용: config/tsignup 목록 ②1회용: invites/{코드} (svc=luvinfo, 미사용)
        const [ts, iv] = await Promise.all([
          getDoc(doc(db, 'config', 'tsignup')),
          getDoc(doc(db, 'invites', code))
        ]);
        const codes = (ts.exists() ? (ts.data().list || []) : []).map((x) => String(x).trim().toLowerCase());
        const ivd = iv.exists() ? (iv.data() || {}) : null;
        const onceOk = ivd && ivd.svc === 'luvinfo' && ivd.used !== true;
        if (!codes.includes(code) && !onceOk) {
          toast(ivd && ivd.svc === 'luvinfo' ? '이미 사용된 코드예요' : '초대 코드가 달라요');
          return;
        }
        if (!codes.includes(code) && onceOk) onceCode = code;
      } catch (e) {
        console.log('[LUVINFO] invite check err', e);
        toast('코드 확인에 실패했어요 — 잠시 후 다시 시도해 주세요');
        return;
      }
    }
    const h = $('#claim-h').value.trim().toLowerCase();
    if (!/^[a-z0-9]{2,20}$/.test(h)) { toast('영문 소문자·숫자 2~20자로 입력해 주세요'); return; }
    // 시스템 예약어 + 예약 핸들 목록(러브로그 config/reserved 공유 + 러브인포 전용 config/treserved)
    const SYS_RESERVED = ['admin', 'api', 'www', 'index', 'login', 'signup', 'app', 'assets', 'static', 'luvinfo', 'luvlog', 'info', 'help', 'about', 'guide'];
    try {
      const [r1, r2, r3] = await Promise.all([
        getDoc(doc(db, 'config', 'reserved')),
        getDoc(doc(db, 'config', 'treserved')),
        getDoc(doc(db, 'config', 'tallow'))
      ]);
      const norm = (arr) => arr.map((x) => String(x).trim().toLowerCase());
      const allow = norm(r3.exists() ? (r3.data().list || []) : []);
      if (!allow.includes(h)) {
        if (SYS_RESERVED.includes(h)) { toast('사용할 수 없는 핸들이에요'); return; }
        const rl = norm([]
          .concat(r1.exists() ? (r1.data().list || []) : [])
          .concat(r2.exists() ? (r2.data().list || []) : []));
        if (rl.includes(h)) { toast('사용할 수 없는 핸들이에요'); return; }
      }
    } catch (e) { console.log('[LUVINFO] reserved check err', e); }
    const ex = await getDoc(doc(db, 'tsites', h));
    if (ex.exists()) { toast('이미 사용 중인 핸들이에요'); return; }
    try {
      await setDoc(doc(db, 'tsites', h), defaultSite(user.uid, h));
      await setDoc(doc(db, 'tusers', user.uid), {
        handle: h,
        email: user.email || '',
        joined: new Date().toISOString().slice(0, 10),
        ts: Date.now()
      });
      if (onceCode) {
        try { await setDoc(doc(db, 'invites', onceCode), { used: true, usedBy: user.uid, usedAt: Date.now() }, { merge: true }); }
        catch (e) { console.log('[LUVINFO] invite consume err', e); }
      }
      location.href = homeUrl(h);
    } catch (e) {
      console.log('[LUVINFO] claim err', e);
      toast('생성 실패 — 잠시 후 다시 시도해 주세요');
    }
  };
}

// ═══════════ 렌더 ═══════════
function applyTheme() {
  const t = st.site.theme || {};
  document.body.dataset.preset = t.preset || 'white';
  const b = document.body.style;
  if (t.bg) b.setProperty('--bg', t.bg); else b.removeProperty('--bg');
  if (t.tx) b.setProperty('--tx', t.tx); else b.removeProperty('--tx');
  if (t.pri) b.setProperty('--pri', t.pri); else b.removeProperty('--pri');
  b.setProperty('--font', t.font || "'Pretendard'");
  const nocss = new URLSearchParams(location.search).get('nocss') === '1';
  $('#usercss').textContent = nocss ? '' : (t.css || '');
  if (t.corner) document.body.dataset.corner = t.corner; else delete document.body.dataset.corner;
  if (t.valign) document.body.dataset.valign = t.valign; else delete document.body.dataset.valign;
  if (t.cardC && /^#[0-9a-fA-F]{6}$/.test(t.cardC)) {
    const r = parseInt(t.cardC.slice(1, 3), 16), g = parseInt(t.cardC.slice(3, 5), 16), bl = parseInt(t.cardC.slice(5, 7), 16);
    b.setProperty('--cardbase', r + ', ' + g + ', ' + bl);
  } else {
    b.removeProperty('--cardbase');
  }
  if (t.cardop) document.body.dataset.op = t.cardop; else delete document.body.dataset.op;
  const sb = $('#site');
  if (t.bgImg) {
    const dim = Math.min(96, Math.max(30, parseInt(t.bgDim) || 84));
    const ov = 'color-mix(in srgb, var(--bg) ' + dim + '%, transparent)';
    sb.style.backgroundImage = 'linear-gradient(' + ov + ', ' + ov + '), url("' + t.bgImg + '")';
    sb.style.backgroundSize = 'cover';
    sb.style.backgroundPosition = 'center';
    sb.style.backgroundAttachment = 'fixed';
  } else {
    sb.style.backgroundImage = '';
  }
  document.body.dataset.chtitle = (st.site.theme && st.site.theme.chtitle) || '';
  const favEl = document.getElementById('fav');
  if (favEl) favEl.href = st.site.favicon || 'data:,';
  const hd = st.site.head || {};
  document.body.dataset.head = hd.mode || 'text';
  $('#h-over').textContent = hd.over || '';
  $('#h-over').style.display = hd.over ? '' : 'none';
  $('#h-title').textContent = hd.title || '';
  $('#h-sub').textContent = hd.sub || '';
  $('#h-sub').style.display = hd.sub ? '' : 'none';
  const hi = $('#head-img');
  hi.style.height = (parseInt(hd.h) || 200) + 'px';
  if (hd.img) {
    // img + object-fit: 위아래(py)를 움직여도 크기 불변, 확대(sc)는 별도
    const py = Math.min(100, Math.max(0, parseInt(hd.py ?? 50)));
    const sc = Math.min(300, Math.max(100, parseInt(hd.sc) || 100));
    hi.style.backgroundImage = '';
    hi.style.overflow = 'hidden';
    hi.innerHTML = '<img src="' + esc(hd.img) + '" alt="" draggable="false" style="width:100%;height:100%;object-fit:cover;object-position:50% ' + py + '%;transform:scale(' + (sc / 100) + ');transform-origin:50% ' + py + '%;display:block;">';
  } else {
    hi.innerHTML = '';
    hi.style.backgroundImage = 'linear-gradient(150deg, var(--line), var(--card))';
  }
  document.title = (hd.title || st.handle) + ' — LUVINFO';
}

function showSite() {
  $('#site').style.display = 'block';
  $('#fabs').style.display = 'flex';
  checkNotice();
  if (gid('fab-logout')) {
    gid('fab-logout').style.display = st.user ? 'block' : 'none';
    gid('fab-logout').onclick = doLogout;
  }
  applyTheme();
  renderChapter();
  renderFoot();
  if (st.mine) {
    $('#fab-edit').style.display = 'block';
    $('#fab-view').style.display = 'block';
    $('#fab-edit').onclick = toggleEdit;
    if (st.myHandle === 'jeste' && gid('fab-ops')) {
      gid('fab-ops').style.display = 'block';
      gid('fab-ops').onclick = openOps;
    }
    if (st.site._migrated) toast('새 구조로 새 출발이에요 — ✎ 편집으로 채워보세요');
  } else if (!st.user) {
    $('#fab-login').style.display = 'block';
    $('#fab-login').onclick = login;
  } else if (st.myHandle && st.myHandle !== st.handle) {
    $('#fab-my').style.display = 'block';
    $('#fab-my').onclick = () => { location.href = homeUrl(st.myHandle); };
  }
  bindShell();
}

function chDisplayName(ch, i) {
  const numOn = (st.site.theme?.num || 'on') === 'on';
  const nn = String(i + 1).padStart(2, '0');
  if (ch.title && numOn) return nn + ' — ' + ch.title;
  if (ch.title) return ch.title;
  if (numOn) return nn;
  return '';
}

function renderChapter() {
  const chs = st.site.chapters || [];
  if (st.cur >= chs.length) st.cur = Math.max(0, chs.length - 1);
  const ch = chs[st.cur];
  const titleEl = $('#ch-title');
  const bodyEl = $('#ch-body');
  if (!ch) {
    titleEl.style.display = 'none';
    $('#ch-timg-top').innerHTML = '';
    $('#ch-timg-bot').innerHTML = '';
    bodyEl.innerHTML = '<p style="text-align:center;color:var(--mute);font-size:12.5px;letter-spacing:.1em;padding:40px 0;">아직 장이 없어요' + (st.mine ? ' — ✎ 편집으로 시작' : '') + '</p>';
    renderPager();
    return;
  }
  const name = chDisplayName(ch, st.cur);
  titleEl.textContent = name;
  titleEl.style.display = name ? '' : 'none';
  const tImg = ch.timg ? '<img src="' + esc(ch.timg) + '" alt="">' : '';
  $('#ch-timg-top').innerHTML = (tImg && (ch.timgPos || 'top') === 'top') ? tImg : '';
  $('#ch-timg-bot').innerHTML = (tImg && ch.timgPos === 'bot') ? tImg : '';
  if (ch.pw && !st.mine && sessionStorage.getItem('li_chpw_' + st.handle + '_' + ch.id) !== '1') {
    bodyEl.innerHTML = '<div class="ch-lock"><div class="lk">🔒</div><p>이 장은 비밀번호가 있어요</p>' +
      '<input type="password" id="chpw-in" autocomplete="off" placeholder="PASSWORD"><button class="mini-btn" id="chpw-ok">입장</button></div>';
    const tryPw = () => {
      if ($('#chpw-in').value === ch.pw) {
        sessionStorage.setItem('li_chpw_' + st.handle + '_' + ch.id, '1');
        renderChapter();
      } else { toast('비밀번호가 달라요'); }
    };
    $('#chpw-ok').onclick = tryPw;
    $('#chpw-in').onkeydown = (e) => { if (e.key === 'Enter') tryPw(); };
    renderPager();
    return;
  }
  document.body.dataset.chhead = (ch.type === 'html' && !ch.showHead) ? 'off' : 'on';
  if (ch.type === 'html') {
    let body = ch.body || '';
    if (!body && ch.bodyRef) {
      if (htmlCache[ch.id] !== undefined) {
        body = htmlCache[ch.id];
      } else {
        bodyEl.innerHTML = '<p style="text-align:center;color:var(--mute);font-size:11px;letter-spacing:.24em;padding:60px 0;">LOADING…</p>';
        const refAt = ch.bodyRef;
        fetch(refAt)
          .then((r) => r.text())
          .then((t) => {
            if (ch.bodyRef !== refAt || ch.body) return; // 그 사이 새 내용이 생겼으면 옛 응답 폐기
            htmlCache[ch.id] = t;
            if ((st.site.chapters || [])[st.cur] === ch) renderChapter();
          })
          .catch((e) => {
            console.log('[LUVINFO] html fetch err', e);
            bodyEl.innerHTML = '<p style="text-align:center;color:var(--mute);font-size:12px;padding:60px 0;">이 장을 불러오지 못했어요 — 새로고침해 주세요</p>';
          });
        renderPager();
        return;
      }
    }
    const scope = 'hb-' + ch.id;
    bodyEl.innerHTML = '<div class="htmlblk ' + scope + '"></div>';
    const holder = bodyEl.querySelector('.htmlblk');
    holder.innerHTML = scopeHtml(body, '.' + scope);
    runScripts(holder);
  } else {
    migrateBlocks(ch);
    renderBlocks(ch, bodyEl);
  }
  renderPager();
}

// 대용량 HTML 장 본문 캐시 (Storage 오프로드용)
const htmlCache = {};

// HTML 장 스크립트 실행: innerHTML로 넣은 <script>는 죽어 있으므로 재생성
function runScripts(root) {
  root.querySelectorAll('script').forEach((old) => {
    const s = document.createElement('script');
    Array.from(old.attributes).forEach((a) => s.setAttribute(a.name, a.value));
    s.textContent = old.textContent;
    old.replaceWith(s);
  });
}

// HTML 장 격리: <style>이 페이지 크롬을 오염시키지 않게 셀렉터에 스코프를 접두
function scopeCSS(css, scope) {
  return css.replace(/(^|[{}])([^{}@;]+)\{/g, (m, boundary, sel) => {
    const scoped = sel.split(',').map((s) => {
      s = s.trim();
      if (!s) return s;
      if (/^(body|html|:root)$/i.test(s)) return scope;
      return scope + ' ' + s;
    }).filter(Boolean).join(', ');
    return boundary + ' ' + scoped + ' {';
  });
}
function scopeHtml(html, scope) {
  return html.replace(/<style([^>]*)>([\s\S]*?)<\/style>/gi, (m, attrs, css) => '<style' + attrs + '>' + scopeCSS(css, scope) + '</style>');
}

// 보통 장 본문: 빈 줄 문단 + [사진N] + {접기:제목}…{접기끝}
function renderCellBody(body, imgs) {
  const parts = [];
  let rest = body || '';
  const re = /\{접기:(.*?)\}([\s\S]*?)\{접기끝\}/;
  let m;
  while ((m = re.exec(rest))) {
    parts.push({ fold: false, v: rest.slice(0, m.index) });
    parts.push({ fold: true, title: m[1], v: m[2] });
    rest = rest.slice(m.index + m[0].length);
  }
  parts.push({ fold: false, v: rest });

  const block = (raw) => {
    let s = esc((raw || '').trim());
    if (!s) return '';
    s = s.replace(/\[사진(\d+)\]/g, (mm, n) => {
      const u = (imgs || [])[parseInt(n) - 1];
      return u ? '</p><img src="' + esc(u) + '" alt="" loading="lazy"><p>' : '';
    });
    s = s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    s = s.replace(/__(.+?)__/g, '<u>$1</u>');
    s = s.replace(/~~(.+?)~~/g, '<s>$1</s>');
    s = s.replace(/==(.+?)==/g, '<mark>$1</mark>');
    return s.split(/\n{2,}/).map((p) => {
      if (p.trim() === '---') return '<div class="divider">✦</div>';
      return '<p>' + p.replace(/\n/g, '<br>') + '</p>';
    }).join('');
  };

  return parts.map((p) => {
    if (!p.fold) return block(p.v);
    return '<div class="fold"><div class="fold-head"><span>' + esc(p.title || '더 보기') + '</span></div>' +
      '<div class="fold-body"><div class="fold-body-in">' + block(p.v) + '</div></div></div>';
  }).join('');
}

// ═══════════ 블록 렌더 ═══════════
const CORNER_PX = { round: '16px', soft: '6px', sharp: '0px' };
const OP_VAL = { solid: '1', half: '.55', clear: '0' };

function blkVars(stl, base) {
  const corner = (stl && stl.corner) || (base && base.corner) || '';
  const op = (stl && stl.op) || (base && base.op) || '';
  let s = '';
  if (corner && CORNER_PX[corner]) s += '--radius:' + CORNER_PX[corner] + ';';
  if (op && OP_VAL[op] !== undefined) s += '--cardop:' + OP_VAL[op] + ';';
  return s;
}

function renderBlocks(ch, bodyEl) {
  bodyEl.innerHTML = '';
  let host = bodyEl;
  if (ch.wrap && ch.wrap.on) {
    const w = document.createElement('div');
    w.className = 'chwrap';
    w.dataset.on = '1';
    w.style.cssText = blkVars(ch.wrap, null);
    bodyEl.appendChild(w);
    host = w;
  }
  const blocks = ch.blocks || [];
  if (!blocks.length) {
    host.innerHTML = '<p style="text-align:center;color:var(--mute);font-size:12.5px;letter-spacing:.1em;padding:40px 0;">아직 블록이 없어요' + (st.mine ? ' — ✎ 편집으로 채워보세요' : '') + '</p>';
    return;
  }
  blocks.forEach((blk) => {
    const div = document.createElement('div');
    div.className = 'blk';
    const card = (blk.style && blk.style.card) || (ch.bstyle && ch.bstyle.card) || '';
    div.dataset.card = card === 'on' ? 'on' : 'off';
    div.style.cssText = blkVars(blk.style, ch.bstyle);
    const d = blk.data || {};
    if (blk.kind === 'txt') div.innerHTML = '<div class="cellbody">' + renderCellBody(d.body, d.imgs) + '</div>';
    else if (blk.kind === 'pf') div.appendChild(buildProfile(d));
    else if (blk.kind === 'gal' && (d.imgs || []).length) div.appendChild(buildGallery(d));
    else if (blk.kind === 'mu') div.appendChild(buildMusic(d));
    else if (blk.kind === 'stk' && (d.items || []).length) div.appendChild(buildSticker(d));
    else if (blk.kind === 'bn' && (d.items || []).length) div.appendChild(buildBanner(d));
    else if (blk.kind === 'lnk' && (d.items || []).length) div.appendChild(buildLinks(d));
    else if (blk.kind === 'quo' && d.text) div.appendChild(buildQuote(d));
    else if (blk.kind === 'dd' && d.date) div.appendChild(buildDday(d));
    else return;
    host.appendChild(div);
  });
}

// 구(마커) 구조 → 블록 구조 변환
function migrateBlocks(ch) {
  if (ch.blocks) return;
  const blocks = [];
  const el = ch.el || {};
  const kindOf = { '[프로필]': 'pf', '[갤러리]': 'gal', '[음악]': 'mu', '[스티커]': 'stk', '[배너]': 'bn' };
  const used = {};
  const pushTxt = (seg) => {
    seg = (seg || '').trim();
    if (!seg) return;
    const imgs = [];
    const body = seg.replace(/\[사진(\d+)\]/g, (m, n) => {
      const u = (ch.imgs || [])[parseInt(n) - 1];
      if (!u) return '';
      imgs.push(u);
      return '[사진' + imgs.length + ']';
    });
    blocks.push({ id: uid(), kind: 'txt', data: { body, imgs }, style: {} });
  };
  let rest = ch.body || '';
  const re = /\[(프로필|갤러리|음악|스티커|배너)\]/;
  let m;
  while ((m = re.exec(rest))) {
    pushTxt(rest.slice(0, m.index));
    const kind = kindOf['[' + m[1] + ']'];
    if (el[kind] && !used[kind]) {
      blocks.push({ id: uid(), kind, data: el[kind], style: {} });
      used[kind] = true;
    }
    rest = rest.slice(m.index + m[0].length);
  }
  pushTxt(rest);
  Object.keys(el).forEach((kind) => {
    if (!used[kind] && el[kind]) blocks.push({ id: uid(), kind, data: el[kind], style: {} });
  });
  ch.blocks = blocks;
  ch.bstyle = ch.bstyle || {};
  ch.wrap = ch.wrap || { on: false };
}

// ═══════════ 장 내 요소 렌더 ═══════════
function imgVars(o) {
  const z = parseInt(o.z) || 100;
  // 주의: style 속성이 큰따옴표라 url은 반드시 작은따옴표 (v17 사진 안 보임 사고)
  return "background-image:url('" + esc(o.u || o.img || '') + "');--pz:" + z + '%;--px:' + (o.x ?? 50) + '%;--py:' + (o.y ?? 50) + '%;';
}

function buildProfile(p) {
  const d = document.createElement('div');
  d.className = 'pf';
  d.dataset.pos = p.pos || 'left';
  const imgStyle = (p.img ? imgVars({ u: p.img, z: p.z, x: p.x, y: p.y }) : '') + '--psize:' + (parseInt(p.size) || 64) + 'px;';
  d.innerHTML =
    '<div class="pf-img" data-shape="' + esc(p.shape || 'circle') + '" style="' + imgStyle + '">' + (p.img ? '' : '✦') + '</div>' +
    '<div class="pf-txt">' +
    (p.nm ? '<span class="pf-nm">' + esc(p.nm) + '</span>' : '') +
    (p.acc ? '<span class="pf-acc">' + esc(p.acc) + '</span>' : '') +
    (p.ds ? '<div class="pf-ds">' + esc(p.ds).replace(/\n/g, '<br>') + '</div>' : '') +
    '</div>';
  return d;
}

function buildGallery(g) {
  const wrap = document.createElement('div');
  wrap.className = 'gal';
  const imgs = g.imgs || [];
  if (g.layout === 'slider') {
    wrap.innerHTML = '<div class="gal-slider"><div class="gal-track">' +
      imgs.map((it) => '<div class="gal-slide" style="background-image:url(\'' + esc(it.u) + '\')"></div>').join('') +
      '</div><div class="gal-arrow gal-prev">‹</div><div class="gal-arrow gal-next">›</div><div class="gal-nav"></div></div>';
    initGalSlider(wrap.querySelector('.gal-slider'), imgs);
  } else {
    wrap.innerHTML = '<div class="gal-grid" data-cols="' + (parseInt(g.layout) || 3) + '">' +
      imgs.map((it) => '<div class="gal-cell" style="' + imgVars(it).replace(/--p/g, '--g') + '"></div>').join('') +
      '</div>';
    wrap.querySelectorAll('.gal-cell').forEach((c, i) => {
      c.onclick = () => { $('#lb-img').src = imgs[i].u; $('#lightbox').classList.add('on'); };
    });
  }
  return wrap;
}

function initGalSlider(rootEl, imgs) {
  let cur = 0;
  const slides = rootEl.querySelectorAll('.gal-slide');
  const nav = rootEl.querySelector('.gal-nav');
  slides.forEach((s, i) => {
    s.onclick = () => { $('#lb-img').src = imgs[i].u; $('#lightbox').classList.add('on'); };
    const dd = document.createElement('div');
    dd.className = 'gal-dot' + (i === 0 ? ' on' : '');
    dd.onclick = () => go(i);
    nav.appendChild(dd);
  });
  function go(i) {
    cur = (i + slides.length) % slides.length;
    slides.forEach((s) => { s.style.transform = 'translateX(-' + (cur * 100) + '%)'; });
    nav.querySelectorAll('.gal-dot').forEach((dd, j) => dd.classList.toggle('on', j === cur));
  }
  rootEl.querySelector('.gal-prev').onclick = (e) => { e.stopPropagation(); go(cur - 1); };
  rootEl.querySelector('.gal-next').onclick = (e) => { e.stopPropagation(); go(cur + 1); };
}

function buildMusic(m) {
  const d = document.createElement('div');
  d.className = 'music';
  d.innerHTML = '<div class="m-disc"></div><div class="m-info">' +
    '<div class="m-title">' + esc(m.title || '') + '</div>' +
    '<div class="m-artist">' + esc(m.artist || '') + '</div>' +
    '<div class="m-bar"><i></i></div></div><button class="m-btn">▶</button>';
  const btn = d.querySelector('.m-btn');
  let audio = null;
  btn.onclick = () => {
    if (m.url) {
      if (!audio) {
        audio = new Audio(m.url);
        audio.ontimeupdate = () => { if (audio.duration) d.querySelector('.m-bar i').style.width = (audio.currentTime / audio.duration * 100) + '%'; };
        audio.onended = () => { d.classList.remove('playing'); btn.textContent = '▶'; };
      }
      if (audio.paused) { audio.play().catch(() => toast('오디오를 재생할 수 없어요')); d.classList.add('playing'); btn.textContent = '❚❚'; }
      else { audio.pause(); d.classList.remove('playing'); btn.textContent = '▶'; }
    } else {
      d.classList.toggle('playing');
      btn.textContent = d.classList.contains('playing') ? '❚❚' : '▶';
    }
  };
  return d;
}

function buildSticker(s) {
  const d = document.createElement('div');
  d.className = 'stk';
  d.innerHTML = (s.items || []).map((it) =>
    '<img src="' + esc(it.u) + '" style="width:' + (parseInt(it.size) || 64) + 'px;transform:rotate(' + (parseInt(it.rot) || 0) + 'deg);" alt="">'
  ).join('');
  return d;
}

function buildQuote(d) {
  const w = document.createElement('div');
  w.className = 'quoblk';
  w.innerHTML = '<span class="qmark">“</span><p>' + esc(d.text || '').replace(/\n/g, '<br>') + '</p>' +
    (d.by ? '<i>— ' + esc(d.by) + '</i>' : '');
  return w;
}

function buildDday(d) {
  const w = document.createElement('div');
  w.className = 'ddblk';
  const target = new Date(d.date + 'T00:00:00');
  let txt = '';
  if (!isNaN(target)) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const diff = Math.round((target - today) / 86400000);
    txt = diff > 0 ? 'D-' + diff : (diff === 0 ? 'D-DAY' : 'D+' + (-diff));
  }
  w.innerHTML = '<b>' + txt + '</b>' + (d.label ? '<span>' + esc(d.label) + '</span>' : '') +
    '<i>' + esc(d.date || '') + '</i>';
  return w;
}

function buildLinks(d) {
  const w = document.createElement('div');
  w.className = 'lnkblk';
  w.innerHTML = (d.items || []).map((it) =>
    '<a class="lnkrow" href="' + esc(it.u || '#') + '" target="_blank" rel="noopener"><span>→ ' + esc(it.t || it.u || '') + '</span><i>↗</i></a>'
  ).join('');
  return w;
}

function buildBanner(bn) {
  const d = document.createElement('div');
  d.className = 'banners';
  d.innerHTML = (bn.items || []).map((it) => {
    if (it.h) return '<a data-bh="' + esc(it.h) + '" href="' + esc(homeUrl(it.h)) + '"><span class="tb">@' + esc(it.h) + '</span></a>';
    return '<a href="' + esc(it.url || '#') + '" target="_blank" rel="noopener"><img src="' + esc(it.img) + '" alt=""></a>';
  }).join('');
  d.querySelectorAll('[data-bh]').forEach(async (a) => {
    const info = await bannerInfo(a.dataset.bh);
    if (!info) { const tb = a.querySelector('.tb'); if (tb) tb.textContent = '@' + a.dataset.bh + ' (없음)'; return; }
    if (info.img) a.innerHTML = '<img src="' + esc(info.img) + '" alt="">' + (info.mut ? '<span class="mut">♥</span>' : '');
    else a.innerHTML = '<span class="tb">' + esc(info.title) + '</span>' + (info.mut ? '<span class="mut">♥</span>' : '');
  });
  return d;
}

const bannerCache = {};
async function bannerInfo(h) {
  if (bannerCache[h] !== undefined) return bannerCache[h];
  try {
    const d = await getDoc(doc(db, 'tsites', h));
    if (!d.exists()) return (bannerCache[h] = null);
    const s = d.data();
    if (s.priv) return (bannerCache[h] = null);
    let mut = false;
    (s.chapters || []).forEach((c) => {
      // 현행: 블록 스택(v17~) / 하위 호환: 옛 el.bn 구조
      (c.blocks || []).forEach((b) => {
        if (b.kind === 'bn') ((b.data?.items) || []).forEach((it) => { if (it.h === st.handle) mut = true; });
      });
      ((c.el?.bn?.items) || []).forEach((it) => { if (it.h === st.handle) mut = true; });
    });
    return (bannerCache[h] = { img: s.myBanner || '', title: s.head?.title || h, mut });
  } catch (e) {
    console.log('[LUVINFO] bannerInfo err', e);
    return null;
  }
}

// ═══════════ 사진 조정 팝업 (공용) ═══════════
let adjT = null, adjCb = null, adjDrag = null;
function openAdjust(target, cb) {
  adjT = target; adjCb = cb;
  target.z = parseInt(target.z) || 100;
  target.x = target.x ?? 50;
  target.y = target.y ?? 50;
  const v = $('#adj-view');
  v.style.backgroundImage = 'url("' + (target.u || target.img || '') + '")';
  $('#adj-zoom').value = target.z;
  adjApply();
  $('#adj-bg').classList.add('on');
  $('#adj').classList.add('on');
}
function adjApply() {
  const v = $('#adj-view');
  v.style.backgroundSize = adjT.z + '% auto';
  v.style.backgroundPosition = adjT.x + '% ' + adjT.y + '%';
}
function closeAdjust() {
  $('#adj-bg').classList.remove('on');
  $('#adj').classList.remove('on');
  if (adjCb) adjCb();
  adjT = null; adjCb = null;
}
function bindAdjust() {
  const v = $('#adj-view');
  $('#adj-ok').onclick = closeAdjust;
  $('#adj-bg').onclick = closeAdjust;
  $('#adj-zoom').oninput = (e) => { if (adjT) { adjT.z = parseInt(e.target.value); adjApply(); } };
  v.addEventListener('pointerdown', (e) => {
    if (!adjT) return;
    adjDrag = { cx: e.clientX, cy: e.clientY, x: adjT.x, y: adjT.y };
    v.classList.add('grab');
    v.setPointerCapture(e.pointerId);
  });
  v.addEventListener('pointermove', (e) => {
    if (!adjDrag || !adjT) return;
    const r = v.getBoundingClientRect();
    const sc = Math.max((adjT.z / 100) - 1, .3);
    adjT.x = Math.min(100, Math.max(0, adjDrag.x - (e.clientX - adjDrag.cx) / r.width * 100 / sc));
    adjT.y = Math.min(100, Math.max(0, adjDrag.y - (e.clientY - adjDrag.cy) / r.height * 100 / sc));
    adjApply();
  });
  v.addEventListener('pointerup', () => { adjDrag = null; v.classList.remove('grab'); });
}

function renderPager() {
  const nav = st.site.theme?.nav || 'dot';
  const chs = st.site.chapters || [];
  const pg = $('#pager');
  pg.innerHTML = '';
  if (chs.length <= 1) return;
  const arrow = (dir, label) => {
    const b = document.createElement('button');
    b.className = 'pg-arrow';
    b.textContent = label;
    b.onclick = () => go(st.cur + dir);
    return b;
  };
  if (nav === 'arrow') {
    pg.appendChild(arrow(-1, '‹'));
    const n = document.createElement('span');
    n.className = 'pg-num';
    n.textContent = (st.cur + 1) + ' / ' + chs.length;
    pg.appendChild(n);
    pg.appendChild(arrow(1, '›'));
  } else if (nav === 'pill') {
    chs.forEach((ch, i) => {
      const b = document.createElement('button');
      b.className = 'pg-pill' + (i === st.cur ? ' on' : '');
      b.textContent = ch.title || String(i + 1).padStart(2, '0');
      b.onclick = () => go(i);
      pg.appendChild(b);
    });
  } else {
    pg.appendChild(arrow(-1, '‹'));
    const dots = document.createElement('div');
    dots.className = 'pg-dots';
    chs.forEach((_, i) => {
      const d = document.createElement('div');
      d.className = 'pg-dot' + (i === st.cur ? ' on' : '');
      d.onclick = () => go(i);
      dots.appendChild(d);
    });
    pg.appendChild(dots);
    pg.appendChild(arrow(1, '›'));
  }
}

function go(i) {
  const chs = st.site.chapters || [];
  if (!chs.length) return;
  st.cur = ((i % chs.length) + chs.length) % chs.length;
  renderChapter();
  window.scrollTo({ top: 0 });
}

let codesCache = null;
async function loadCodes() {
  const s = await getDoc(doc(db, 'config', 'tsignup'));
  codesCache = s.exists() ? (s.data().list || []).map(String) : [];
  return codesCache;
}
function renderCodes() {
  const box = gid('codes-list');
  if (!box) return;
  if (!codesCache || !codesCache.length) {
    box.innerHTML = '<p style="color:var(--mute);font-size:12px;">코드가 없어요 — 위에서 만들면 바로 가입에 쓸 수 있어요.<br>⚠ 코드가 하나도 없으면 아무도 가입 못 해요.</p>';
    return;
  }
  box.innerHTML = codesCache.map((c, i) =>
    '<div style="display:flex;align-items:center;gap:8px;border:1px solid var(--line);border-radius:10px;padding:9px 12px;margin-bottom:8px;">' +
    '<code style="flex:1;font-size:13px;letter-spacing:.04em;">' + esc(c) + '</code>' +
    '<button class="mini-btn" data-ccopy="' + i + '">복사</button>' +
    '<i data-cdel="' + i + '" style="cursor:pointer;font-style:normal;color:var(--mute);">🗑</i></div>'
  ).join('');
  box.querySelectorAll('[data-ccopy]').forEach((x) => {
    x.onclick = () => navigator.clipboard?.writeText(codesCache[parseInt(x.dataset.ccopy)]).then(() => toast('복사!')).catch(() => toast('복사 실패'));
  });
  box.querySelectorAll('[data-cdel]').forEach((x) => {
    x.onclick = async () => {
      const i = parseInt(x.dataset.cdel);
      if (!confirm('코드 「' + codesCache[i] + '」를 폐기할까요? 이 코드로는 더 이상 가입할 수 없어요.')) return;
      codesCache.splice(i, 1);
      await saveCodes();
    };
  });
}
async function saveCodes() {
  try {
    await setDoc(doc(db, 'config', 'tsignup'), { list: codesCache });
    renderCodes();
    toast('저장했어요 ✓');
  } catch (e) {
    console.log('[LUVINFO] codes err', e);
    toast('저장 실패 — config/tsignup 쓰기 규칙이 게시됐는지 확인해 주세요');
  }
}
async function openOps() {
  gid('ops-bg').classList.add('on');
  gid('ops-sheet').classList.add('on');
  gid('ops-out').value = '';
  try { const n = await getDoc(doc(db, 'config', 'tnotice')); if (gid('ops-notice')) gid('ops-notice').value = (n.exists() && n.data().text) || ''; } catch (e) { /* */ }
  gid('codes-list').innerHTML = '<p style="color:var(--mute);font-size:12px;">불러오는 중…</p>';
  try { await loadCodes(); renderCodes(); }
  catch (e) { gid('codes-list').innerHTML = '<p style="color:var(--mute);font-size:12px;">불러오기 실패</p>'; }
  renderOnceList();
  renderInqBox();
}
async function checkNotice() {
  try {
    const s = await getDoc(doc(db, 'config', 'tnotice'));
    if (!s.exists()) return;
    const d = s.data() || {};
    if (!d.text || !d.id) return;
    if (localStorage.getItem('li_notice_seen') === String(d.id)) return;
    gid('notice-body').textContent = d.text;
    gid('notice-bg').classList.add('on');
    gid('notice-pop').classList.add('on');
    const close = () => {
      localStorage.setItem('li_notice_seen', String(d.id));
      gid('notice-bg').classList.remove('on');
      gid('notice-pop').classList.remove('on');
    };
    gid('notice-ok').onclick = close;
    gid('notice-close').onclick = close;
    gid('notice-bg').onclick = close;
  } catch (e) { /* 공지는 실패해도 조용히 */ }
}

async function renderOnceList() {
  const box = gid('once-list');
  if (!box) return;
  box.innerHTML = '<p style="color:var(--mute);font-size:12px;">불러오는 중…</p>';
  try {
    const qs = await getDocs(collection(db, 'invites'));
    const mineOnce = [];
    qs.forEach((s) => { const d = s.data() || {}; if (d.svc === 'luvinfo') mineOnce.push({ id: s.id, ...d }); });
    mineOnce.sort((a, b) => (b.at || 0) - (a.at || 0));
    const fresh = mineOnce.filter((c) => c.used !== true);
    const spent = mineOnce.length - fresh.length;
    if (!mineOnce.length) { box.innerHTML = '<p style="color:var(--mute);font-size:12px;">아직 만든 1회용 코드가 없어요.</p>'; return; }
    box.innerHTML =
      (fresh.length ? fresh.map((c) =>
        '<div style="display:flex;align-items:center;gap:8px;border:1px solid var(--line);border-radius:10px;padding:8px 12px;margin-bottom:6px;">' +
        '<code style="flex:1;font-size:12.5px;">' + esc(c.id) + '</code>' +
        '<button class="mini-btn" data-ocopy="' + esc(c.id) + '">복사</button>' +
        '<i data-okill="' + esc(c.id) + '" style="cursor:pointer;font-style:normal;color:var(--mute);" title="폐기">🗑</i></div>'
      ).join('') : '<p style="color:var(--mute);font-size:12px;">미사용 코드가 없어요.</p>') +
      (spent ? '<p style="color:var(--mute);font-size:11px;margin-top:4px;">사용·폐기됨 ' + spent + '개</p>' : '');
    box.querySelectorAll('[data-ocopy]').forEach((x) => {
      x.onclick = () => navigator.clipboard?.writeText(x.dataset.ocopy).then(() => toast('복사!')).catch(() => toast('복사 실패'));
    });
    box.querySelectorAll('[data-okill]').forEach((x) => {
      x.onclick = async () => {
        if (!confirm('코드 「' + x.dataset.okill + '」를 폐기할까요? 이 코드로는 가입할 수 없게 돼요.')) return;
        try {
          await setDoc(doc(db, 'invites', x.dataset.okill), { used: true, usedAt: Date.now(), revoked: true }, { merge: true });
          renderOnceList();
          toast('폐기했어요');
        } catch (e) { console.log('[LUVINFO] revoke err', e); toast('폐기 실패'); }
      };
    });
  } catch (e) {
    console.log('[LUVINFO] once list err', e);
    box.innerHTML = '<p style="color:var(--mute);font-size:12px;">불러오기 실패</p>';
  }
}
function closeOps() {
  gid('ops-bg').classList.remove('on');
  gid('ops-sheet').classList.remove('on');
}
function genCode(prefix) {
  const words = ['star', 'wave', 'luna', 'nova', 'echo', 'aqua', 'iris', 'onyx', 'mint', 'fern'];
  const w = prefix || words[Math.floor(Math.random() * words.length)];
  const n = Math.random().toString(36).slice(2, 6);
  return (w + '-' + n).toLowerCase();
}
async function opsMake() {
  const prefix = gid('ops-prefix').value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  const kind = gid('ops-kind').value;
  let count = Math.min(50, Math.max(1, parseInt(gid('ops-count').value) || 1));
  const made = [];
  try {
    if (kind === 'multi') {
      if (!codesCache) { try { await loadCodes(); } catch (e) { codesCache = []; } }
      let c;
      do { c = genCode(prefix); } while (codesCache.includes(c));
      codesCache.unshift(c);
      await setDoc(doc(db, 'config', 'tsignup'), { list: codesCache });
      renderCodes();
      made.push(c);
    } else {
      for (let i = 0; i < count; i++) {
        const c = genCode(prefix);
        await setDoc(doc(db, 'invites', c), { svc: 'luvinfo', used: false, at: Date.now() });
        made.push(c);
      }
    }
    gid('ops-out').value = made.join('\n');
    toast(made.length + '개 만들었어요 ✓');
    if (kind === 'once') renderOnceList();
  } catch (e) {
    console.log('[LUVINFO] ops make err', e);
    toast('코드 생성 실패 — 규칙이 게시됐는지 확인해 주세요');
  }
}

async function openInq() {
  if (!st.user) { toast('문의는 로그인 후 보낼 수 있어요'); return; }
  gid('inq-body').value = '';
  gid('inq-bg').classList.add('on');
  gid('inq-sheet').classList.add('on');
  const mine = gid('inq-mine');
  if (mine) {
    mine.innerHTML = '';
    try {
      const qs = await getDocs(collection(db, 'tinquiries'));
      const rows = [];
      qs.forEach((s) => { const d = s.data(); if (d.uid === st.user.uid) rows.push(d); });
      rows.sort((a, b) => (b.ts || 0) - (a.ts || 0));
      if (rows.length) {
        mine.innerHTML = '<label style="display:block;font-size:11px;letter-spacing:.06em;color:var(--dim);margin:14px 0 8px;">내가 보낸 문의</label>' +
          rows.map((r) =>
            '<div style="border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin-bottom:8px;font-size:12px;">' +
            '<div style="color:var(--dim);font-size:10.5px;margin-bottom:4px;">' + esc(r.date || '') + '</div>' +
            '<div style="white-space:pre-wrap;word-break:break-word;">' + esc(r.body || '') + '</div>' +
            (r.reply ? '<div style="margin-top:8px;padding:8px 10px;border-left:2px solid var(--pri);background:rgba(127,127,127,.06);white-space:pre-wrap;word-break:break-word;">' + esc(r.reply) + '</div>' : '<div style="margin-top:6px;color:var(--mute);font-size:10.5px;">답변 대기 중</div>') +
            '</div>').join('');
      }
    } catch (e) { /* 본인 read 실패 시 조용히 */ }
  }
}
function closeInq() {
  gid('inq-bg').classList.remove('on');
  gid('inq-sheet').classList.remove('on');
}
async function sendInq() {
  const body = gid('inq-body').value.trim();
  if (!body) { toast('내용을 적어주세요'); return; }
  if (body.length > 2000) { toast('2000자 이내로 적어주세요'); return; }
  try {
    await setDoc(doc(db, 'tinquiries', uid()), {
      uid: st.user.uid,
      handle: st.myHandle || '',
      email: st.user.email || '',
      body,
      ts: Date.now(),
      date: new Date().toISOString().slice(0, 10)
    });
    closeInq();
    toast('문의를 보냈어요 ✓');
  } catch (e) {
    console.log('[LUVINFO] inq err', e);
    toast('전송 실패 — 규칙이 아직 없을 수 있어요 (운영자에게 알려주세요)');
  }
}
async function renderInqBox() {
  const box = gid('inqbox-list');
  if (!box) return;
  box.innerHTML = '<p style="color:var(--mute);font-size:12px;">불러오는 중…</p>';
  try {
    const qs = await getDocs(collection(db, 'tinquiries'));
    const rows = [];
    qs.forEach((s) => rows.push({ id: s.id, ...s.data() }));
    rows.sort((a, b) => (b.ts || 0) - (a.ts || 0));
    if (!rows.length) { box.innerHTML = '<p style="color:var(--mute);font-size:12px;">아직 문의가 없어요.</p>'; return; }
    box.innerHTML = rows.map((r) =>
      '<div style="border:1px solid var(--line);border-radius:12px;padding:12px 14px;margin-bottom:10px;">' +
      '<div style="font-size:11px;color:var(--dim);margin-bottom:6px;">' + esc(r.date || '') + ' · @' + esc(r.handle || '?') + (r.email ? ' · ' + esc(r.email) : '') + (r.reply ? ' · ✓ 답변함' : '') +
      ' <i data-inqdel="' + esc(r.id) + '" style="float:right;cursor:pointer;font-style:normal;color:var(--mute);">🗑</i></div>' +
      '<div style="font-size:12.5px;white-space:pre-wrap;word-break:break-word;">' + esc(r.body || '') + '</div>' +
      '<textarea data-inqre="' + esc(r.id) + '" class="code" style="min-height:64px;margin-top:8px;width:100%;box-sizing:border-box;" placeholder="답변 쓰기 — 문의한 사람이 ✉ 문의 창에서 보게 돼요">' + esc(r.reply || '') + '</textarea>' +
      '<div style="margin-top:6px;"><button class="mini-btn" data-inqsave="' + esc(r.id) + '">답변 저장</button></div></div>'
    ).join('');
    box.querySelectorAll('[data-inqdel]').forEach((x) => {
      x.onclick = async () => {
        if (!confirm('이 문의를 지울까요?')) return;
        try { await deleteDoc(doc(db, 'tinquiries', x.dataset.inqdel)); renderInqBox(); toast('지웠어요'); }
        catch (e) { toast('삭제 실패'); }
      };
    });
    box.querySelectorAll('[data-inqsave]').forEach((x) => {
      x.onclick = async () => {
        const ta = box.querySelector('[data-inqre="' + x.dataset.inqsave + '"]');
        try {
          await setDoc(doc(db, 'tinquiries', x.dataset.inqsave), { reply: ta.value, repliedAt: Date.now() }, { merge: true });
          toast('답변 저장 ✓');
        } catch (e) { console.log('[LUVINFO] reply err', e); toast('저장 실패 — 규칙에 update 허용이 있는지 확인해 주세요'); }
      };
    });
  } catch (e) {
    console.log('[LUVINFO] inqbox err', e);
    box.innerHTML = '<p style="color:var(--mute);font-size:12px;">불러오기 실패 — tinquiries 규칙이 게시됐는지 확인해 주세요.</p>';
  }
}

function renderFoot() {
  $('#hcount').textContent = st.site.heart || 0;
  const liked = localStorage.getItem('sh_like_' + st.handle) === '1';
  $('#heart').classList.toggle('liked', liked);
  $('#heart .h').textContent = liked ? '♥' : '♡';
  const d = new Date(st.site.updated || Date.now());
  $('#upd-date').textContent = d.getFullYear() + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + String(d.getDate()).padStart(2, '0');
  const ft = gid('foot-txt');
  if (ft) {
    const txt = (st.site.footTxt || '').trim();
    ft.textContent = txt;
    ft.style.display = txt ? '' : 'none';
  }
  const lv = (st.site.luvlog || '').trim();
  if (gid('foot-lv')) {
    gid('foot-lv').style.display = lv ? '' : 'none';
    if (lv && gid('foot-luvlog')) gid('foot-luvlog').href = 'https://' + lv + '.luvlog.me';
  }
  const f = st.site.foot || {};
  const showEl = (id, on) => { const el = gid(id); if (el) el.style.display = on === false ? 'none' : ''; };
  showEl('heart', f.heart);
  const cp = document.querySelector('.copy-btn'); if (cp) cp.style.display = f.copy === false ? 'none' : '';
  showEl('foot-guide', f.guide);
  const gi = gid('foot-guide'); const gdot = gi && gi.nextElementSibling; if (gdot && gdot.tagName === 'I') gdot.style.display = (f.guide === false || f.inq === false) ? 'none' : '';
  showEl('foot-inq', f.inq);
  showEl('upd-date', f.date);
  const hl = document.querySelector('.heart-line'); if (hl) hl.style.display = (f.heart === false && f.copy === false) ? 'none' : '';
}

let shellBound = false;
function bindShell() {
  if (shellBound) return;
  shellBound = true;
  // 접은 글 · 사진 라이트박스 (위임)
  $('#ch-body').addEventListener('click', (e) => {
    const fh = e.target.closest('.fold-head');
    if (fh) { fh.parentElement.classList.toggle('open'); return; }
    const img = e.target.closest('.cellbody img');
    if (img) { $('#lb-img').src = img.src; $('#lightbox').classList.add('on'); }
  });
  $('#lightbox').onclick = () => $('#lightbox').classList.remove('on');
  $('#heart').onclick = async () => {
    if (st.mine) { toast('내 하트는 셀 수 없어요 🙂'); return; }
    const key = 'sh_like_' + st.handle;
    const liked = localStorage.getItem(key) === '1';
    const delta = liked ? -1 : 1;
    localStorage.setItem(key, liked ? '0' : '1');
    st.site.heart = (st.site.heart || 0) + delta;
    renderFoot();
    try { await updateDoc(doc(db, 'tsites', st.handle), { heart: increment(delta) }); }
    catch (e) { console.log('[LUVINFO] heart err', e); }
  };
  $('#copy-link').onclick = () => {
    navigator.clipboard?.writeText(homeUrl(st.handle))
      .then(() => toast('링크를 복사했어요 ✓'))
      .catch(() => toast('복사에 실패했어요'));
  };
  $('#foot-brand').onclick = (e) => { e.preventDefault(); location.href = BASE; };
  if (gid('foot-inq')) gid('foot-inq').onclick = (e) => {
    e.preventDefault();
    if (st.myHandle === 'jeste') openOps();
    else openInq();
  };
  if (gid('inq-close')) gid('inq-close').onclick = closeInq;
  if (gid('inq-bg')) gid('inq-bg').onclick = closeInq;
  if (gid('inq-send')) gid('inq-send').onclick = sendInq;

  // 운영
  if (gid('ops-close')) gid('ops-close').onclick = closeOps;
  if (gid('ops-bg')) gid('ops-bg').onclick = closeOps;
  if (gid('ops-make')) gid('ops-make').onclick = opsMake;
  if (gid('once-refresh')) gid('once-refresh').onclick = renderOnceList;
  if (gid('ops-notice-save')) gid('ops-notice-save').onclick = async () => {
    const text = gid('ops-notice').value.trim();
    if (!text) { toast('공지 내용을 적어주세요'); return; }
    try {
      await setDoc(doc(db, 'config', 'tnotice'), { text, id: Date.now(), date: new Date().toISOString().slice(0, 10) });
      toast('공지 올렸어요 ✓ — 유저들이 다음 방문 때 봐요');
    } catch (e) { console.log('[LUVINFO] notice err', e); toast('공지 저장 실패 — tnotice 쓰기 규칙 확인'); }
  };
  if (gid('ops-notice-del')) gid('ops-notice-del').onclick = async () => {
    if (!confirm('공지를 내릴까요?')) return;
    try { await setDoc(doc(db, 'config', 'tnotice'), { text: '', id: 0 }); gid('ops-notice').value = ''; toast('공지 내렸어요'); }
    catch (e) { toast('실패'); }
  };
  if (gid('ops-copy')) gid('ops-copy').onclick = () => {
    const v = gid('ops-out').value.trim();
    if (!v) { toast('복사할 코드가 없어요'); return; }
    navigator.clipboard?.writeText(v).then(() => toast('전체 복사!')).catch(() => toast('복사 실패'));
  };
  $('#ob-add').onclick = () => openChapterEdit(null, 'cell');
  $('#ob-addhtml').onclick = () => openChapterEdit(null, 'html');
  $('#ob-deco').onclick = openDeco;
  $('#ob-save').onclick = saveSite;

  // 장 도구
  $('#ct-edit').onclick = () => { const ch = st.site.chapters[st.cur]; if (ch) openChapterEdit(ch, ch.type); };
  $('#ct-up').onclick = () => moveChapter(-1);
  $('#ct-down').onclick = () => moveChapter(1);
  $('#ct-del').onclick = () => {
    const chs = st.site.chapters;
    if (!chs[st.cur]) return;
    if (!confirm('이 장을 삭제할까요?')) return;
    chs.splice(st.cur, 1);
    setDirty();
    if (st.cur >= chs.length) st.cur = Math.max(0, chs.length - 1);
    renderChapter();
  };

  // 시트 닫기
  $('#es-close').onclick = closeEditSheet;
  $('#es-cancel').onclick = closeEditSheet;
  $('#edit-bg').onclick = closeEditSheet;
  $('#dc-close').onclick = closeDeco;
  $('#deco-bg').onclick = closeDeco;

  // 스큐(구 index + 신 app) 방어: 한 구획이 죽어도 나머지는 산다
  try { bindDeco(); } catch (e) { console.log('[LUVINFO] bindDeco err (index 구버전 캐시?)', e); }
  try { bindEditor(); } catch (e) {
    console.log('[LUVINFO] bindEditor err (index 구버전 캐시?)', e);
    toast('편집 기능이 일부 로드되지 않았어요 — Ctrl+Shift+R로 새로고침해 주세요');
  }
  try { bindAdjust(); } catch (e) { console.log('[LUVINFO] bindAdjust err (index 구버전 캐시?)', e); }
  const fv = $('#fab-view');
  if (fv) fv.onclick = () => {
    const on = document.body.classList.toggle('mv');
    fv.textContent = on ? '💻' : '📱';
  };
}

function moveChapter(d) {
  const chs = st.site.chapters;
  const j = st.cur + d;
  if (j < 0 || j >= chs.length) return;
  const [ch] = chs.splice(st.cur, 1);
  chs.splice(j, 0, ch);
  st.cur = j;
  setDirty();
  renderChapter();
}

// ═══════════ 편집 모드 ═══════════
function toggleEdit() {
  st.edit = document.body.classList.toggle('edit');
  $('#fab-edit').textContent = st.edit ? '보기 모드' : '✎ 편집';
  if (!st.edit) {
    closeEditSheet(); closeDeco();
    if (st.dirty) toast('저장하지 않은 변경이 있어요 — ✓ 저장을 눌러 주세요');
  }
}

// ── 장 편집 시트 (블록 스택) ──
let work = null;
let isNewCh = false;
let editingBlk = null;

const KIND_LABEL = { txt: '글', pf: '프로필', gal: '갤러리', mu: '음악', stk: '스티커', bn: '배너', lnk: '링크', quo: '인용구', dd: '디데이' };

function newBlockData(kind) {
  if (kind === 'txt') return { body: '', imgs: [] };
  if (kind === 'pf') return { img: '', z: 100, x: 50, y: 50, pos: 'left', shape: 'circle', size: 64, nm: '', acc: '', ds: '' };
  if (kind === 'gal') return { layout: '3', imgs: [] };
  if (kind === 'mu') return { title: '', artist: '', url: '' };
  if (kind === 'stk') return { items: [] };
  if (kind === 'bn') return { items: [] };
  if (kind === 'lnk') return { items: [] };
  if (kind === 'quo') return { text: '', by: '' };
  if (kind === 'dd') return { label: '', date: '' };
  return {};
}

function blkSummary(blk) {
  const d = blk.data || {};
  if (blk.kind === 'txt') return (d.body || '').trim().replace(/\n/g, ' ').slice(0, 26) || '(빈 글)';
  if (blk.kind === 'pf') return d.nm || d.acc || '(이름 없음)';
  if (blk.kind === 'gal') return (d.imgs || []).length + '장 · ' + (d.layout === 'slider' ? '슬라이더' : d.layout + '열');
  if (blk.kind === 'mu') return d.title || '(제목 없음)';
  if (blk.kind === 'stk') return (d.items || []).length + '개';
  if (blk.kind === 'bn') return (d.items || []).length + '개';
  if (blk.kind === 'lnk') return (d.items || []).length + '개';
  if (blk.kind === 'quo') return (d.text || '').slice(0, 14);
  if (blk.kind === 'dd') return d.label || d.date || '';
  return '';
}

function openChapterEdit(ch, type) {
  work = ch || { id: uid(), title: '', pw: '', type, body: '', blocks: type === 'cell' ? [] : undefined, bstyle: {}, wrap: { on: false } };
  isNewCh = !ch;
  editingBlk = null;
  if (type === 'cell') { migrateBlocks(work); work.bstyle = work.bstyle || {}; work.wrap = work.wrap || { on: false }; }
  $('#es-title').textContent = ch ? '장 수정' : (type === 'html' ? '새 HTML 장' : '새 장');
  $('#es-name').value = work.title || '';
  $('#es-pw').value = work.pw || '';
  if (gid('es-timgpos')) gid('es-timgpos').value = work.timgPos || 'top';
  if (gid('es-timg-chip')) gid('es-timg-chip').textContent = work.timg ? '이미지 있음 ✓' : '없음';
  const isHtml = type === 'html';
  $('#es-cellrow').style.display = isHtml ? 'none' : 'block';
  $('#bl-edit').style.display = 'none';
  $('#es-htmlrow').style.display = isHtml ? 'block' : 'none';
  if (isHtml) {
    if (gid('es-showhead')) gid('es-showhead').checked = !!work.showHead;
    const cached = work.body || htmlCache[work.id];
    if (!cached && work.bodyRef) {
      $('#es-html').value = '불러오는 중…';
      const wid = work.id;
      const refAt = work.bodyRef;
      fetch(refAt).then((r) => r.text()).then((t) => {
        if (!work || work.id !== wid || work.bodyRef !== refAt || work.body) return;
        htmlCache[wid] = t;
        if ($('#es-html').value === '불러오는 중…') $('#es-html').value = t;
      }).catch(() => { if (work && work.id === wid) { $('#es-html').value = ''; toast('본문을 불러오지 못했어요'); } });
    } else {
      $('#es-html').value = cached || '';
    }
  } else {
    $('#ebs-card').value = work.bstyle.card || '';
    $('#ebs-corner').value = work.bstyle.corner || '';
    $('#ebs-op').value = work.bstyle.op || '';
    $('#ew-on').value = work.wrap.on ? '1' : '';
    $('#ew-corner').value = work.wrap.corner || '';
    $('#ew-op').value = work.wrap.op || '';
    renderBlockList();
  }
  $('#edit-bg').classList.add('on');
  $('#edit-sheet').classList.add('on');
}

function renderBlockList() {
  const box = $('#bl-list');
  const blocks = work.blocks || [];
  if (!blocks.length) {
    box.innerHTML = '<div class="bl-empty">아래 ＋ 버튼으로 블록을 쌓아보세요</div>';
    return;
  }
  box.innerHTML = blocks.map((blk, i) =>
    '<div class="blrow"><span class="kind">' + KIND_LABEL[blk.kind] + '</span>' +
    '<span class="sum">' + esc(blkSummary(blk)) + '</span>' +
    '<button class="ct" data-bmv="' + i + ',-1" title="위로">↑</button>' +
    '<button class="ct" data-bmv="' + i + ',1" title="아래로">↓</button>' +
    '<button class="ct" data-bed="' + i + '" title="수정">✎</button>' +
    '<button class="ct del" data-brm="' + i + '" title="삭제">🗑</button></div>'
  ).join('');
  box.querySelectorAll('[data-bmv]').forEach((x) => {
    x.onclick = () => {
      const [i, d] = x.dataset.bmv.split(',').map(Number);
      const j = i + d;
      if (j < 0 || j >= blocks.length) return;
      [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
      renderBlockList();
    };
  });
  box.querySelectorAll('[data-bed]').forEach((x) => {
    x.onclick = () => openBlockEdit(blocks[parseInt(x.dataset.bed)]);
  });
  box.querySelectorAll('[data-brm]').forEach((x) => {
    x.onclick = () => {
      if (!confirm('이 블록을 삭제할까요?')) return;
      blocks.splice(parseInt(x.dataset.brm), 1);
      renderBlockList();
    };
  });
}

function openBlockEdit(blk) {
  editingBlk = blk;
  $('#es-cellrow').style.display = 'none';
  $('#bl-edit').style.display = 'block';
  ['txt', 'pf', 'gal', 'mu', 'stk', 'bn', 'lnk', 'quo', 'dd'].forEach((k) => {
    $('#ble-' + k).style.display = blk.kind === k ? 'block' : 'none';
  });
  const d = blk.data;
  if (blk.kind === 'txt') {
    $('#es-body').value = d.body || '';
    renderImgChips(d.imgs = d.imgs || []);
    restoreDraft();
  } else if (blk.kind === 'pf') {
    $('#ep-nm').value = d.nm || '';
    $('#ep-acc').value = d.acc || '';
    $('#ep-ds').value = d.ds || '';
    $('#ep-pos').value = d.pos || 'left';
    $('#ep-shape').value = d.shape || 'circle';
    $('#ep-size').value = parseInt(d.size) || 64;
    $('#ep-sizev').textContent = (parseInt(d.size) || 64) + 'px';
  } else if (blk.kind === 'gal') {
    $('#eg-layout').value = d.layout || '3';
    renderGalChips();
  } else if (blk.kind === 'mu') {
    $('#em-title').value = d.title || '';
    $('#em-artist').value = d.artist || '';
    $('#em-url').value = d.url || '';
  } else if (blk.kind === 'stk') {
    renderStkChips();
  } else if (blk.kind === 'bn') {
    $('#eb-hin').value = '';
    renderBnChips();
  } else if (blk.kind === 'lnk') {
    renderLnkChips();
  } else if (blk.kind === 'quo') {
    $('#eq-text').value = blk.data.text || '';
    $('#eq-by').value = blk.data.by || '';
  } else if (blk.kind === 'dd') {
    $('#ed-label').value = blk.data.label || '';
    $('#ed-date').value = blk.data.date || '';
  }
  $('#bs-card').value = blk.style?.card || '';
  $('#bs-corner').value = blk.style?.corner || '';
  $('#bs-op').value = blk.style?.op || '';
}

function saveBlockFields() {
  if (!editingBlk) return;
  const d = editingBlk.data;
  if (editingBlk.kind === 'txt') {
    d.body = $('#es-body').value;
  } else if (editingBlk.kind === 'pf') {
    d.nm = $('#ep-nm').value.trim();
    d.acc = $('#ep-acc').value.trim();
    d.ds = $('#ep-ds').value;
    d.pos = $('#ep-pos').value;
    d.shape = $('#ep-shape').value;
    d.size = parseInt($('#ep-size').value) || 64;
  } else if (editingBlk.kind === 'gal') {
    d.layout = $('#eg-layout').value;
  } else if (editingBlk.kind === 'mu') {
    d.title = $('#em-title').value.trim();
    d.artist = $('#em-artist').value.trim();
    d.url = $('#em-url').value.trim();
  } else if (editingBlk.kind === 'quo') {
    d.text = $('#eq-text').value;
    d.by = $('#eq-by').value.trim();
  } else if (editingBlk.kind === 'dd') {
    d.label = $('#ed-label').value.trim();
    d.date = $('#ed-date').value.trim();
  }
  editingBlk.style = {
    card: $('#bs-card').value,
    corner: $('#bs-corner').value,
    op: $('#bs-op').value
  };
}

function closeBlockEdit() {
  saveBlockFields();
  if (editingBlk && editingBlk.kind === 'txt') localStorage.removeItem('li_draft_' + st.handle);
  editingBlk = null;
  $('#bl-edit').style.display = 'none';
  $('#es-cellrow').style.display = 'block';
  renderBlockList();
}

function renderImgChips(imgs) {
  const box = $('#es-imgs');
  box.innerHTML = imgs.map((u, i) =>
    '<div class="imgchip"><img src="' + esc(u) + '" alt=""><b>[사진' + (i + 1) + ']</b><i data-rm="' + i + '">✕</i></div>'
  ).join('');
  box.querySelectorAll('[data-rm]').forEach((x) => {
    x.onclick = () => {
      imgs.splice(parseInt(x.dataset.rm), 1);
      renderImgChips(imgs);
      toast('사진을 뺐어요 — 본문의 [사진N] 번호를 확인해 주세요');
    };
  });
}

function renderGalChips() {
  const box = $('#eg-imgs');
  const imgs = editingBlk?.data.imgs || [];
  box.innerHTML = imgs.map((it, i) =>
    '<div class="imgchip"><img src="' + esc(it.u) + '" alt="">' +
    '<i data-gmv="' + i + ',-1" style="color:var(--dim);">◀</i><i data-gmv="' + i + ',1" style="color:var(--dim);">▶</i>' +
    '<i data-adj="' + i + '" style="color:var(--pri);">🔍</i><i data-grm="' + i + '">✕</i></div>'
  ).join('');
  box.querySelectorAll('[data-gmv]').forEach((x) => {
    x.onclick = () => {
      const [i, dd] = x.dataset.gmv.split(',').map(Number);
      const j = i + dd;
      if (j < 0 || j >= imgs.length) return;
      [imgs[i], imgs[j]] = [imgs[j], imgs[i]];
      renderGalChips();
    };
  });
  box.querySelectorAll('[data-adj]').forEach((x) => {
    x.onclick = () => openAdjust(imgs[parseInt(x.dataset.adj)], () => setDirty());
  });
  box.querySelectorAll('[data-grm]').forEach((x) => {
    x.onclick = () => { imgs.splice(parseInt(x.dataset.grm), 1); renderGalChips(); };
  });
}

function renderStkChips() {
  const box = $('#esk-imgs');
  const items = editingBlk?.data.items || [];
  box.innerHTML = items.map((it, i) =>
    '<div class="imgchip"><img src="' + esc(it.u) + '" alt="" style="object-fit:contain;">' +
    '<input type="text" data-sksize="' + i + '" value="' + (parseInt(it.size) || 64) + '" title="크기(px)" style="width:44px;background:var(--bg);border:1px solid var(--line);border-radius:6px;color:var(--tx);font-size:10.5px;padding:4px 5px;font-family:inherit;">' +
    '<input type="text" data-skrot="' + i + '" value="' + (parseInt(it.rot) || 0) + '" title="기울기(도)" style="width:38px;background:var(--bg);border:1px solid var(--line);border-radius:6px;color:var(--tx);font-size:10.5px;padding:4px 5px;font-family:inherit;">' +
    '<i data-skrm="' + i + '">✕</i></div>'
  ).join('');
  box.querySelectorAll('[data-skrm]').forEach((x) => {
    x.onclick = () => { items.splice(parseInt(x.dataset.skrm), 1); renderStkChips(); };
  });
  box.querySelectorAll('[data-sksize]').forEach((x) => {
    x.oninput = () => { items[parseInt(x.dataset.sksize)].size = parseInt(x.value) || 64; };
  });
  box.querySelectorAll('[data-skrot]').forEach((x) => {
    x.oninput = () => { items[parseInt(x.dataset.skrot)].rot = parseInt(x.value) || 0; };
  });
}

function renderLnkChips() {
  const box = $('#el-list');
  if (!box) return;
  const items = editingBlk?.data.items || [];
  box.innerHTML = items.map((it, i) =>
    '<div class="imgchip" style="width:100%;box-sizing:border-box;">' +
    '<input type="text" data-lt="' + i + '" value="' + esc(it.t || '') + '" placeholder="라벨" style="flex:1;min-width:80px;background:var(--bg);border:1px solid var(--line);border-radius:6px;color:var(--tx);font-size:11px;padding:5px 7px;font-family:inherit;">' +
    '<input type="text" data-lu="' + i + '" value="' + esc(it.u || '') + '" placeholder="https://…" style="flex:1.4;min-width:110px;background:var(--bg);border:1px solid var(--line);border-radius:6px;color:var(--tx);font-size:11px;padding:5px 7px;font-family:inherit;">' +
    '<i data-lrm="' + i + '">✕</i></div>'
  ).join('');
  box.querySelectorAll('[data-lrm]').forEach((x) => { x.onclick = () => { items.splice(parseInt(x.dataset.lrm), 1); renderLnkChips(); }; });
  box.querySelectorAll('[data-lt]').forEach((x) => { x.oninput = () => { items[parseInt(x.dataset.lt)].t = x.value; }; });
  box.querySelectorAll('[data-lu]').forEach((x) => { x.oninput = () => { items[parseInt(x.dataset.lu)].u = x.value.trim(); }; });
}

function renderBnChips() {
  const box = $('#eb-imgs');
  if (!box) return;
  const items = editingBlk?.data.items || [];
  box.innerHTML = items.map((it, i) => {
    if (it.h) return '<div class="imgchip"><b style="color:var(--pri);">@' + esc(it.h) + '</b><i data-bnrm="' + i + '">✕</i></div>';
    return '<div class="imgchip"><img src="' + esc(it.img) + '" alt="">' +
      '<input type="text" data-bnurl="' + i + '" value="' + esc(it.url || '') + '" placeholder="연결 URL" style="width:120px;background:var(--bg);border:1px solid var(--line);border-radius:6px;color:var(--tx);font-size:10.5px;padding:4px 6px;font-family:inherit;">' +
      '<i data-bnrm="' + i + '">✕</i></div>';
  }).join('');
  box.querySelectorAll('[data-bnrm]').forEach((x) => {
    x.onclick = () => { items.splice(parseInt(x.dataset.bnrm), 1); renderBnChips(); };
  });
  box.querySelectorAll('[data-bnurl]').forEach((x) => {
    x.oninput = () => { items[parseInt(x.dataset.bnurl)].url = x.value.trim(); };
  });
}

function insertAt(ta, text) {
  const s = ta.selectionStart ?? ta.value.length;
  ta.value = ta.value.slice(0, s) + text + ta.value.slice(ta.selectionEnd ?? s);
  ta.focus();
  ta.selectionStart = ta.selectionEnd = s + text.length;
}

function wrapSel(ta, pre, post) {
  const s = ta.selectionStart ?? 0;
  const e = ta.selectionEnd ?? 0;
  const sel = ta.value.slice(s, e) || '내용';
  ta.value = ta.value.slice(0, s) + pre + sel + post + ta.value.slice(e);
  ta.focus();
  ta.selectionStart = s + pre.length;
  ta.selectionEnd = s + pre.length + sel.length;
}

// 임시저장 (글 블록)
let draftTm = null;
function saveDraft() {
  clearTimeout(draftTm);
  draftTm = setTimeout(() => {
    if (!editingBlk || editingBlk.kind !== 'txt') return;
    const body = $('#es-body').value;
    if (!body.trim()) { localStorage.removeItem('li_draft_' + st.handle); return; }
    try {
      localStorage.setItem('li_draft_' + st.handle, JSON.stringify({ blkId: editingBlk.id, body, at: Date.now() }));
    } catch (e) { /* 무시 */ }
  }, 1200);
}
function restoreDraft() {
  try {
    const raw = localStorage.getItem('li_draft_' + st.handle);
    if (!raw || !editingBlk) return;
    const d = JSON.parse(raw);
    if (d.blkId !== editingBlk.id || !d.body || d.body === $('#es-body').value) return;
    const min = Math.max(1, Math.round((Date.now() - d.at) / 60000));
    if (confirm(min + '분 전에 쓰다 만 내용이 있어요. 이어서 쓸까요?\n[취소]하면 지워져요.')) {
      $('#es-body').value = d.body;
    } else {
      localStorage.removeItem('li_draft_' + st.handle);
    }
  } catch (e) { /* 무시 */ }
}

let editorBound = false;
function bindEditor() {
  if (editorBound) return;
  editorBound = true;
  const ta = () => $('#es-body');
  // 블록 추가
  document.querySelectorAll('#bl-add [data-add]').forEach((b) => {
    b.onclick = () => {
      const kind = b.dataset.add;
      const blk = { id: uid(), kind, data: newBlockData(kind), style: {} };
      work.blocks.push(blk);
      renderBlockList();
      openBlockEdit(blk);
    };
  });
  $('#ble-back').onclick = closeBlockEdit;
  $('#ble-ok').onclick = closeBlockEdit;
  // 서식
  $('#fmt-b').onclick = () => wrapSel(ta(), '**', '**');
  $('#fmt-hl').onclick = () => wrapSel(ta(), '==', '==');
  $('#fmt-u').onclick = () => wrapSel(ta(), '__', '__');
  $('#fmt-s').onclick = () => wrapSel(ta(), '~~', '~~');
  $('#fmt-hr').onclick = () => insertAt(ta(), '\n\n---\n\n');
  $('#es-fold').onclick = () => insertAt(ta(), '\n{접기:제목}\n내용\n{접기끝}\n');
  $('#es-photo').onclick = () => {
    if (!editingBlk) return;
    uploadMulti((urls) => {
      const imgs = editingBlk.data.imgs = editingBlk.data.imgs || [];
      const startN = imgs.length;
      urls.forEach((u) => imgs.push(u));
      const tags = urls.map((_, k) => '[사진' + (startN + k + 1) + ']').join(' ');
      insertAt(ta(), '\n' + tags + '\n');
      renderImgChips(imgs);
    });
  };
  $('#es-body').addEventListener('input', saveDraft);
  $('#es-htmlphoto').onclick = () => uploadOne((url) => insertAt($('#es-html'), '<img src="' + url + '">'));
  if (gid('es-htmlfile')) gid('es-htmlfile').onclick = () => gid('es-htmlfile-input') && gid('es-htmlfile-input').click();
  if (gid('es-timg-up')) gid('es-timg-up').onclick = () => uploadOne((url) => { if (work) { work.timg = url; if (gid('es-timg-chip')) gid('es-timg-chip').textContent = '이미지 있음 ✓'; } });
  if (gid('es-timg-del')) gid('es-timg-del').onclick = () => { if (work) { work.timg = ''; if (gid('es-timg-chip')) gid('es-timg-chip').textContent = '없음'; } };
  if (gid('es-htmlfile-input')) gid('es-htmlfile-input').onchange = (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      const cur = $('#es-html').value.trim();
      if (cur && cur !== '불러오는 중…' && !confirm('지금 있는 코드를 이 파일 내용으로 바꿀까요?')) return;
      $('#es-html').value = String(rd.result || '');
      toast('파일을 불러왔어요 — 확인 후 ✓ 저장!');
    };
    rd.onerror = () => toast('파일을 읽지 못했어요');
    rd.readAsText(f);
  };

  // 붙여넣기·끌어넣기
  const grabFiles = (list) => Array.from(list || []).filter((f) => f.type && f.type.startsWith('image/'));
  const addPasted = async (files, isHtml) => {
    if (!files.length) return;
    toast('업로드 중… (' + files.length + '장)');
    try {
      const urls = [];
      for (const f of files) { const u = await uploadFile(f); if (u) urls.push(u); }
      if (!urls.length) return;
      if (isHtml) {
        urls.forEach((u) => insertAt($('#es-html'), '<img src="' + u + '">'));
      } else if (editingBlk && editingBlk.kind === 'txt') {
        const imgs = editingBlk.data.imgs = editingBlk.data.imgs || [];
        const startN = imgs.length;
        urls.forEach((u) => imgs.push(u));
        const tags = urls.map((_, k) => '[사진' + (startN + k + 1) + ']').join(' ');
        insertAt($('#es-body'), '\n' + tags + '\n');
        renderImgChips(imgs);
      }
      toast('업로드 완료');
      saveDraft();
    } catch (e) { console.log('[LUVINFO] paste err', e); toast('업로드 실패'); }
  };
  [['#es-body', false], ['#es-html', true]].forEach(([sel, isHtml]) => {
    const el = $(sel);
    el.addEventListener('paste', (e) => {
      const files = grabFiles(e.clipboardData?.files);
      if (files.length) { e.preventDefault(); addPasted(files, isHtml); }
    });
    el.addEventListener('dragover', (e) => e.preventDefault());
    el.addEventListener('drop', (e) => {
      const files = grabFiles(e.dataTransfer?.files);
      if (files.length) { e.preventDefault(); addPasted(files, isHtml); }
    });
  });

  // 프로필
  $('#ep-size').oninput = (e) => { $('#ep-sizev').textContent = e.target.value + 'px'; };
  $('#ep-up').onclick = () => {
    if (!editingBlk) return;
    uploadOne((url) => {
      const d = editingBlk.data;
      d.img = url; d.z = 100; d.x = 50; d.y = 50;
      toast('업로드 완료 — 🔍 사진 조정으로 위치를 잡아보세요');
    });
  };
  $('#ep-adj').onclick = () => {
    if (!editingBlk?.data.img) { toast('먼저 사진을 업로드해 주세요'); return; }
    openAdjust(editingBlk.data, null);
  };
  // 갤러리
  $('#eg-up').onclick = () => {
    if (!editingBlk) return;
    uploadMulti((urls) => {
      const d = editingBlk.data;
      d.imgs = (d.imgs || []).concat(urls.map((u) => ({ u, z: 100, x: 50, y: 50 })));
      renderGalChips();
    });
  };
  // 스티커
  $('#esk-up').onclick = () => {
    if (!editingBlk) return;
    uploadMulti((urls) => {
      const d = editingBlk.data;
      d.items = (d.items || []).concat(urls.map((u) => ({ u, size: 64, rot: 0 })));
      renderStkChips();
    });
  };
  // 배너
  if (gid('el-add')) gid('el-add').onclick = () => {
    if (!editingBlk || editingBlk.kind !== 'lnk') return;
    (editingBlk.data.items = editingBlk.data.items || []).push({ t: '', u: '' });
    renderLnkChips();
  };
  $('#eb-addh').onclick = async () => {
    if (!editingBlk) return;
    const inp = $('#eb-hin');
    const h = (inp.value || '').trim().toLowerCase().replace(/^@/, '');
    if (!/^[a-z0-9]{2,20}$/.test(h)) { toast('핸들 형식이 아니에요 (영문 소문자·숫자)'); return; }
    if (h === st.handle) { toast('내 핸들은 추가할 수 없어요'); return; }
    const ex = await getDoc(doc(db, 'tsites', h));
    if (!ex.exists()) { toast('@' + h + ' — 존재하지 않는 러브인포예요'); return; }
    editingBlk.data.items.push({ h });
    delete bannerCache[h];
    inp.value = '';
    renderBnChips();
  };
  $('#eb-up').onclick = () => {
    if (!editingBlk) return;
    uploadMulti((urls) => {
      const d = editingBlk.data;
      d.items = (d.items || []).concat(urls.map((u) => ({ img: u, url: '' })));
      renderBnChips();
    });
  };

  $('#es-ok').onclick = confirmChapterEdit;
}

function confirmChapterEdit() {
  if (editingBlk) saveBlockFields();
  work.title = $('#es-name').value.trim();
  work.pw = $('#es-pw').value.trim();
    if (gid('es-timgpos')) work.timgPos = gid('es-timgpos').value;
  if (work.type === 'html') {
    work.body = $('#es-html').value;
    if (gid('es-showhead')) work.showHead = gid('es-showhead').checked;
    if (gid('es-timgpos')) work.timgPos = gid('es-timgpos').value;
  } else {
    work.bstyle = {
      card: $('#ebs-card').value,
      corner: $('#ebs-corner').value,
      op: $('#ebs-op').value
    };
    work.wrap = {
      on: $('#ew-on').value === '1',
      corner: $('#ew-corner').value,
      op: $('#ew-op').value
    };
  }
  if (isNewCh) {
    st.site.chapters = st.site.chapters || [];
    st.site.chapters.push(work);
    st.cur = st.site.chapters.length - 1;
  }
  localStorage.removeItem('li_draft_' + st.handle);
  setDirty();
  closeEditSheet();
  renderChapter();
  setTimeout(() => { if (st.dirty) toast('화면에 반영했어요 — 하단 ✓ 저장을 눌러야 서버에 저장돼요!'); }, 400);
}

function closeEditSheet() {
  editingBlk = null;
  $('#edit-bg').classList.remove('on');
  $('#edit-sheet').classList.remove('on');
}

// ── 꾸미기 시트 ──
function openDeco() {
  const t = st.site.theme;
  const p = PRESETS[t.preset || 'white'];
  $('#dc-preset').value = t.preset || 'white';
  $('#dc-bg').value = t.bg || p.bg;
  $('#dc-tx').value = t.tx || p.tx;
  $('#dc-pri').value = t.pri || p.pri;
  $('#dc-font').value = t.font || "'Pretendard'";
  $('#dc-nav').value = t.nav || 'dot';
  $('#dc-num').value = t.num || 'on';
  if (gid('dc-chtitle')) gid('dc-chtitle').value = t.chtitle || '';
  if (gid('dc-css')) gid('dc-css').value = t.css || '';
  if (gid('dc-luvlog')) gid('dc-luvlog').value = st.site.luvlog || '';
  if (gid('dc-foottxt')) gid('dc-foottxt').value = st.site.footTxt || '';
  if (gid('dc-priv')) gid('dc-priv').value = st.site.priv ? '1' : '';
  const ff = st.site.foot || {};
  [['df-heart', 'heart'], ['df-copy', 'copy'], ['df-guide', 'guide'], ['df-inq', 'inq'], ['df-date', 'date']].forEach(([id, key]) => {
    if (gid(id)) gid(id).checked = ff[key] !== false;
  });
  $('#dc-corner').value = t.corner || '';
  $('#dc-cardop').value = t.cardop || '';
  $('#dc-bgdim').value = parseInt(t.bgDim) || 84;
  $('#dc-bgdimv').textContent = (parseInt(t.bgDim) || 84) + '%';
  $('#dc-valign').value = t.valign || '';
  $('#dc-cardc').value = t.cardC || CARDC[t.preset || 'white'] || '#FFFFFF';
  const hd = st.site.head;
  if (gid('dc-hh')) { gid('dc-hh').value = parseInt(hd.h) || 200; gid('dc-hhv').textContent = (parseInt(hd.h) || 200) + 'px'; }
  if (gid('dc-hy')) gid('dc-hy').value = parseInt(hd.py ?? 50);
  if (gid('dc-hz')) { gid('dc-hz').value = Math.max(100, parseInt(hd.sc) || 100); if (gid('dc-hzv')) gid('dc-hzv').textContent = (Math.max(100, parseInt(hd.sc) || 100)) + '%'; }
  $('#dc-head').value = hd.mode || 'text';
  $('#dc-over').value = hd.over || '';
  $('#dc-title').value = hd.title || '';
  $('#dc-sub').value = hd.sub || '';
  const g = st.site.gate || {};
  $('#dc-gate').value = g.on ? 'on' : 'off';
  $('#dc-gate-opts').style.display = g.on ? 'block' : 'none';
  $('#dc-gate-msg').value = g.msg || '';
  $('#dc-gate-pw').value = g.pw || '';
  $('#dc-css').value = t.css || '';
  $('#deco-bg').classList.add('on');
  $('#deco-sheet').classList.add('on');
}

function closeDeco() {
  $('#deco-bg').classList.remove('on');
  $('#deco-sheet').classList.remove('on');
}

let decoBound = false;
function bindDeco() {
  if (decoBound) return;
  decoBound = true;
  const t = () => st.site.theme;
  $('#dc-preset').onchange = (e) => {
    const p = e.target.value;
    if (p === (t().preset || 'white')) return;
    if (!confirm('프리셋을 적용하면 현재 색 설정을 프리셋 기본값으로 덮어씁니다. 적용할까요?')) {
      e.target.value = t().preset || 'white';
      return;
    }
    t().preset = p;
    t().bg = ''; t().tx = ''; t().pri = ''; t().cardC = '';
    setDirty();
    applyTheme();
    renderChapter();
    openDeco();
  };
  $('#dc-bg').oninput = (e) => { t().bg = e.target.value; setDirty(); applyTheme(); };
  $('#dc-tx').oninput = (e) => { t().tx = e.target.value; setDirty(); applyTheme(); };
  $('#dc-pri').oninput = (e) => { t().pri = e.target.value; setDirty(); applyTheme(); };
  $('#dc-font').onchange = (e) => { t().font = e.target.value; setDirty(); applyTheme(); };
  $('#dc-nav').onchange = (e) => { t().nav = e.target.value; setDirty(); renderPager(); };
  $('#dc-num').onchange = (e) => { t().num = e.target.value; setDirty(); renderChapter(); };
  if (gid('dc-chtitle')) gid('dc-chtitle').onchange = (e) => { t().chtitle = e.target.value; setDirty(); applyTheme(); };
  if (gid('dc-css')) gid('dc-css').oninput = (e) => { t().css = e.target.value; setDirty(); applyTheme(); };
  [['df-heart', 'heart'], ['df-copy', 'copy'], ['df-guide', 'guide'], ['df-inq', 'inq'], ['df-date', 'date']].forEach(([id, key]) => {
    if (gid(id)) gid(id).onchange = (e) => {
      st.site.foot = st.site.foot || {};
      st.site.foot[key] = e.target.checked;
      setDirty(); renderFoot();
    };
  });
  if (gid('dc-priv')) gid('dc-priv').onchange = (e) => {
    st.site.priv = e.target.value === '1';
    setDirty();
    toast(st.site.priv ? '비공개로 설정 — ✓ 저장해야 적용돼요' : '공개로 설정 — ✓ 저장해야 적용돼요');
  };
  if (gid('dc-foottxt')) gid('dc-foottxt').oninput = (e) => {
    st.site.footTxt = e.target.value.slice(0, 200);
    setDirty(); renderFoot();
  };
  if (gid('dc-luvlog')) gid('dc-luvlog').oninput = (e) => {
    st.site.luvlog = e.target.value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    setDirty(); renderFoot();
  };
  $('#dc-corner').onchange = (e) => { t().corner = e.target.value; setDirty(); applyTheme(); };
  $('#dc-cardop').onchange = (e) => { t().cardop = e.target.value; setDirty(); applyTheme(); };
  $('#dc-valign').onchange = (e) => { t().valign = e.target.value; setDirty(); applyTheme(); };
  $('#dc-cardc').oninput = (e) => { t().cardC = e.target.value; setDirty(); applyTheme(); };
  $('#dc-cardc-del').onclick = () => { t().cardC = ''; setDirty(); applyTheme(); $('#dc-cardc').value = CARDC[t().preset || 'white'] || '#FFFFFF'; toast('카드 색을 프리셋 기본으로'); };
  $('#dc-mybn-up').onclick = () => uploadOne((url) => { st.site.myBanner = url; setDirty(); toast('내 배너 설정 — 저장을 눌러 주세요'); });
  $('#dc-mybn-del').onclick = () => { st.site.myBanner = ''; setDirty(); toast('내 배너 제거'); };
  $('#dc-backup').onclick = () => {
    const data = JSON.stringify(st.site, null, 2);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    a.download = 'luvinfo-' + st.handle + '-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };
  $('#dc-restore').onclick = () => {
    const fi = $('#file-json');
    fi.value = '';
    fi.onchange = () => {
      const f = fi.files[0];
      if (!f) return;
      const rd = new FileReader();
      rd.onload = () => {
        try {
          const data = JSON.parse(rd.result);
          if (!data.chapters) { toast('러브인포 백업 파일이 아니에요'); return; }
          if (!confirm('백업으로 복원하면 지금 내용을 덮어씁니다. 계속할까요?')) return;
          data.ownerUid = st.site.ownerUid;
          data.heart = st.site.heart || 0;
          st.site = data;
          setDirty();
          st.cur = 0;
          applyTheme();
          renderChapter();
          renderFoot();
          toast('복원했어요 — ✓ 저장을 눌러야 서버에 반영돼요');
        } catch (e) { console.log('[LUVINFO] restore err', e); toast('파일을 읽을 수 없어요'); }
      };
      rd.readAsText(f);
    };
    fi.click();
  };
  $('#dc-bgdim').oninput = (e) => { t().bgDim = parseInt(e.target.value); $('#dc-bgdimv').textContent = e.target.value + '%'; setDirty(); applyTheme(); };
  $('#dc-head').onchange = (e) => { st.site.head.mode = e.target.value; setDirty(); applyTheme(); };
  $('#dc-over').oninput = (e) => { st.site.head.over = e.target.value; setDirty(); applyTheme(); };
  $('#dc-title').oninput = (e) => { st.site.head.title = e.target.value; setDirty(); applyTheme(); };
  $('#dc-sub').oninput = (e) => { st.site.head.sub = e.target.value; setDirty(); applyTheme(); };
  $('#dc-himg-up').onclick = () => uploadOne((url) => {
    st.site.head.img = url;
    if ((st.site.head.mode || 'text') === 'text' || st.site.head.mode === 'none') {
      st.site.head.mode = 'both';
      $('#dc-head').value = 'both';
      toast('머리글 이미지 설정 — 구성을 "이미지 + 글"로 바꿨어요');
    } else {
      toast('머리글 이미지 설정');
    }
    setDirty();
    applyTheme();
  });
  $('#dc-himg-del').onclick = () => { st.site.head.img = ''; delete st.site.head.z; delete st.site.head.py; delete st.site.head.sc; setDirty(); applyTheme(); };
  if (gid('dc-lvimport')) gid('dc-lvimport').onclick = async () => {
    const lh = ($('#dc-lvh').value.trim() || st.handle || '').toLowerCase();
    if (!lh) { toast('러브로그 핸들을 입력해 주세요'); return; }
    toast('가져오는 중…');
    let d;
    try {
      const snap = await getDoc(doc(db, 'pages', lh));
      if (!snap.exists()) { toast('러브로그 @' + lh + ' 홈을 못 찾았어요'); return; }
      d = snap.data();
    } catch (e) { console.log('[LUVINFO] lvimport err', e); toast('가져오기 실패'); return; }
    const t = st.site.theme = st.site.theme || {};
    const got = [];
    const pick = (...keys) => { for (const k of keys) { if (d[k] !== undefined && d[k] !== '' && d[k] !== null) return d[k]; } return undefined; };
    const bg = pick('color', 'bg', 'bgC');
    if (bg) { t.bg = bg; got.push('배경색'); }
    const pri = pick('pri', 'priC', 'point');
    if (pri) { t.pri = pri; got.push('포인트색'); }
    if (d.light !== undefined) { t.tx = d.light ? '#24242C' : '#EDEDF2'; got.push('글자색(' + (d.light ? '밝음' : '어둠') + ' 기준)'); }
    const cardC = pick('cardC', 'cardColor');
    if (cardC) { t.cardC = cardC; got.push('카드 색'); }
    const corner = pick('corner');
    if (corner === 'soft' || corner === 'sharp') { t.corner = corner === 'soft' ? 'soft' : 'sharp'; got.push('모서리'); }
    const font = pick('font', 'fontFam');
    if (font) {
      const fv = String(font);
      // 러브로그는 키워드('sans' 등), 러브인포는 CSS 패밀리 — 키워드 맵 우선, 실패 시 문자열 대조
      const FONT_MAP = {
        sans: "'Pretendard'", pretendard: "'Pretendard'",
        serif: "'Noto Serif KR'", myeongjo: "'Nanum Myeongjo'", nanummj: "'Nanum Myeongjo'",
        gowun: "'Gowun Dodum'", gowundodum: "'Gowun Dodum'", gowunbatang: "'Gowun Batang'",
        plex: "'IBM Plex Sans KR'", ibmplex: "'IBM Plex Sans KR'", gaegu: "'Gaegu'"
      };
      const opts = Array.from(document.querySelectorAll('#dc-font option')).map((o) => o.value);
      const mapped = FONT_MAP[fv.toLowerCase()];
      if (mapped && opts.includes(mapped)) { t.font = mapped; got.push('폰트'); }
      else {
        const opt = opts.find((v) => fv.includes(v.replace(/'/g, '')) || v.includes(fv.replace(/'/g, '')));
        if (opt) { t.font = opt; got.push('폰트'); }
      }
    }
    const hd = st.site.head = st.site.head || {};
    const himg = pick('headImg', 'head');
    const heads = Array.isArray(d.heads) ? d.heads.filter(Boolean) : [];
    const img = himg || heads[0];
    if (img && typeof img === 'string') { hd.img = img; delete hd.z; delete hd.py; delete hd.sc; if ((hd.mode || 'text') === 'text' || hd.mode === 'none') hd.mode = 'both'; got.push('머리글 이미지'); }
    const title = pick('title', 'name');
    if (title) { hd.title = String(title); got.push('제목'); }
    const over = [pick('overSym'), pick('overTxt')].filter(Boolean).join(' ');
    if (over) { hd.over = over; got.push('머리글 라벨'); }
    const sub = pick('sub', 'subtitle', 'desc');
    if (sub && typeof sub === 'string') { hd.sub = sub; got.push('부제'); }
    const fav = pick('fav', 'favicon');
    if (fav && typeof fav === 'string') { st.site.favicon = fav; got.push('파비콘'); }
    const bgImg = pick('bgImg');
    if (bgImg && typeof bgImg === 'string') {
      t.bgImg = bgImg;
      const bd = parseInt(pick('bgDim'));
      if (!isNaN(bd)) t.bgDim = Math.min(96, Math.max(30, bd));
      got.push('배경 이미지');
    }
    const gImg = pick('enterImg');
    const gMsg = pick('enterText');
    if (gImg || gMsg) {
      st.site.gate = st.site.gate || { on: false, msg: '', pw: '', img: '' };
      if (gImg) st.site.gate.img = String(gImg);
      if (gMsg) st.site.gate.msg = String(gMsg);
      // 비밀번호는 가져오지 않음 — 러브로그는 암호화 저장이라 형식이 달라요
      if (st.site.gate.pw && /^[0-9a-f]{64}$/i.test(st.site.gate.pw)) st.site.gate.pw = ''; // 이전 가져오기로 들어온 해시 청소
      got.push('대문 이미지·문구 (비밀번호는 러브인포에서 새로 설정해 주세요)');
    }
    if (!got.length) { toast('가져올 수 있는 설정을 못 찾았어요 — 러브로그 홈 구조가 예상과 달라요'); return; }
    setDirty();
    applyTheme();
    renderChapter();
    openDeco();
    toast('가져왔어요: ' + got.join(' · ') + ' — 마음에 들면 ✓ 저장!');
  };
  if (gid('dc-hy')) gid('dc-hy').oninput = (e) => {
    st.site.head.py = parseInt(e.target.value);
    setDirty(); applyTheme();
  };
  if (gid('dc-hz')) gid('dc-hz').oninput = (e) => {
    st.site.head.sc = parseInt(e.target.value);
    if (gid('dc-hzv')) gid('dc-hzv').textContent = e.target.value + '%';
    setDirty(); applyTheme();
  };
  if (gid('dc-hh')) gid('dc-hh').oninput = (e) => {
    st.site.head.h = parseInt(e.target.value) || 200;
    if (gid('dc-hhv')) gid('dc-hhv').textContent = st.site.head.h + 'px';
    setDirty(); applyTheme();
  };
  if (gid('dc-fav-up')) gid('dc-fav-up').onclick = () => uploadOne((url) => { st.site.favicon = url; setDirty(); applyTheme(); toast('파비콘 적용!'); });
  if (gid('dc-fav-del')) gid('dc-fav-del').onclick = () => { st.site.favicon = ''; setDirty(); applyTheme(); };
  if (gid('dc-del-home')) gid('dc-del-home').onclick = async () => {
    const typed = prompt('정말 삭제하려면 핸들(' + st.handle + ')을 그대로 입력해 주세요.\n장·사진·설정이 전부 사라지고 되돌릴 수 없어요.');
    if (typed === null) return;
    if (typed.trim().toLowerCase() !== st.handle) { toast('핸들이 달라요 — 삭제 취소'); return; }
    try {
      await deleteDoc(doc(db, 'tsites', st.handle));
      await deleteDoc(doc(db, 'tusers', st.user.uid));
      toast('삭제했어요 — 안녕히!');
      setTimeout(() => { signOut(auth).finally(() => location.href = BASE); }, 900);
    } catch (e) { console.log('[LUVINFO] del home err', e); toast('삭제 실패'); }
  };
  $('#dc-bimg-up').onclick = () => uploadOne((url) => { st.site.theme.bgImg = url; setDirty(); applyTheme(); toast('배경 이미지 설정'); });
  $('#dc-bimg-del').onclick = () => { st.site.theme.bgImg = ''; setDirty(); applyTheme(); };
  $('#dc-gate').onchange = (e) => {
    st.site.gate = st.site.gate || {};
    st.site.gate.on = e.target.value === 'on';
    setDirty();
    $('#dc-gate-opts').style.display = st.site.gate.on ? 'block' : 'none';
  };
  $('#dc-gate-msg').oninput = (e) => { st.site.gate.msg = e.target.value; setDirty(); };
  $('#dc-gate-pw').oninput = (e) => { st.site.gate.pw = e.target.value; setDirty(); };
  $('#dc-gimg-up').onclick = () => uploadOne((url) => { st.site.gate.img = url; setDirty(); toast('대문 이미지 설정'); });
  $('#dc-gimg-del').onclick = () => { st.site.gate.img = ''; setDirty(); };
  $('#dc-css').oninput = (e) => { t().css = e.target.value; setDirty(); $('#usercss').textContent = e.target.value; };
  $('#dc-save').onclick = saveSite;
}

// ═══════════ 업로드 ═══════════
async function uploadFile(file) {
  if (file.size > 5 * 1024 * 1024) { toast(file.name + ' — 5MB를 넘어요'); return null; }
  const path = 'tsites/' + st.handle + '/' + Date.now() + '_' + file.name.replace(/[^a-zA-Z0-9._-]/g, '');
  const r = sref(storage, path);
  await uploadBytes(r, file);
  return await getDownloadURL(r);
}

function uploadOne(cb) {
  const fi = $('#file-one');
  fi.value = '';
  fi.onchange = async () => {
    if (!fi.files[0]) return;
    toast('업로드 중…');
    try { const url = await uploadFile(fi.files[0]); if (url) { cb(url); toast('업로드 완료'); } }
    catch (e) { console.log('[LUVINFO] up err', e); toast('업로드 실패'); }
  };
  fi.click();
}

function uploadMulti(cb) {
  const fi = $('#file-multi');
  fi.value = '';
  fi.onchange = async () => {
    if (!fi.files.length) return;
    toast('업로드 중… (' + fi.files.length + '장)');
    try {
      const urls = [];
      for (const f of fi.files) { const u = await uploadFile(f); if (u) urls.push(u); }
      if (urls.length) { cb(urls); toast('업로드 완료'); }
    } catch (e) { console.log('[LUVINFO] upm err', e); toast('업로드 실패'); }
  };
  fi.click();
}

// ═══════════ 저장 ═══════════
async function offloadBigHtml() {
  for (const ch of st.site.chapters || []) {
    if (ch.type !== 'html') continue;
    const body = ch.body || '';
    if (body.length > 150000) {
      const path = 'tsites/' + st.handle + '/html_' + ch.id + '_' + Date.now() + '.html';
      const r = sref(storage, path);
      await uploadBytes(r, new Blob([body], { type: 'text/html; charset=utf-8' }));
      ch.bodyRef = await getDownloadURL(r);
      htmlCache[ch.id] = body;
      ch.body = '';
    } else if (ch.bodyRef && body) {
      ch.bodyRef = '';
      delete htmlCache[ch.id];
    }
  }
}

async function saveSite() {
  if (!st.mine) return;
  delete st.site._migrated;
  st.site.updated = Date.now();
  try { await offloadBigHtml(); }
  catch (e) {
    console.log('[LUVINFO] offload err', e);
    toast('큰 HTML 장 보관에 실패했어요 — 다시 시도해 주세요');
    return;
  }
  // undefined 필드는 Firestore가 거부하므로 저장 직전 전부 제거 (배열 속은 null로)
  const payload = JSON.parse(JSON.stringify(st.site));
  const size = new Blob([JSON.stringify(payload)]).size;
  if (size > 950000) {
    toast('용량 초과에 가까워요 (' + Math.round(size / 1024) + 'KB / 최대 약 1MB) — HTML 장을 줄여 주세요');
    if (size > 1000000) return;
  }
  try {
    await setDoc(doc(db, 'tsites', st.handle), payload);
    st.dirty = false;
    const sb = document.getElementById('ob-save');
    if (sb) sb.classList.remove('attn');
    renderFoot();
    toast('저장했어요 ✓');
  } catch (e) {
    console.log('[LUVINFO] save err', e);
    toast('저장 실패 — 콘솔을 확인해 주세요');
  }
}

window.addEventListener('beforeunload', (e) => {
  if (st.dirty) { e.preventDefault(); e.returnValue = ''; }
});

boot();
