/* ============================================================
   LOVERS CLUB — 뼈대 v1
   구글 로그인 → 초대코드 가입 → 내 페이지 생성/조회/간단수정
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
const show = id => {
  ['view-setup','view-loading','view-login','view-signup','view-page']
    .forEach(v => $('#'+v).classList.toggle('hidden', v!==id));
};

/* 설정 전이면 안내 화면 */
if(!firebaseConfig.apiKey || firebaseConfig.apiKey.includes('여기에')){
  show('view-setup');
  throw new Error('firebase-config 미설정');
}

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

let me = null;        // 로그인 유저
let myHandle = null;  // 내 핸들

/* ---------- 상단바 ---------- */
function renderTopbar(){
  const el = $('#topbar-user');
  if(me){
    el.innerHTML = (myHandle ? `<a href="./?u=${myHandle}" class="mono">@${myHandle}</a>` : '')
      + `<button class="btn" id="btn-logout">로그아웃</button>`;
    $('#btn-logout').onclick = () => signOut(auth);
  } else {
    el.innerHTML = '';
  }
}

/* ---------- 페이지 렌더 ---------- */
async function renderPage(handle){
  const snap = await getDoc(doc(db, 'pages', handle));
  if(!snap.exists()){
    $('#pg-name').textContent = '없는 페이지예요';
    $('#pg-handle').textContent = '@'+handle;
    $('#pg-bio').textContent = '주소를 다시 확인해 주세요.';
    $('#pg-edit').classList.add('hidden');
    show('view-page');
    return;
  }
  const p = snap.data();
  $('#pg-name').textContent = p.name || handle;
  $('#pg-handle').textContent = '@'+handle;
  $('#pg-bio').textContent = p.bio || '';
  $('#pg-avatar').textContent = (p.name || handle).slice(0,1).toUpperCase();
  document.title = (p.name || handle) + ' — LOVERS CLUB';

  const mine = me && p.owner === me.uid;
  $('#pg-edit').classList.toggle('hidden', !mine);
  if(mine){
    $('#ed-name').value = p.name || '';
    $('#ed-bio').value  = p.bio || '';
    $('#btn-save').onclick = async () => {
      $('#msg').textContent = '저장 중...';
      try{
        await updateDoc(doc(db,'pages',handle), {
          name: $('#ed-name').value.trim(),
          bio:  $('#ed-bio').value.trim(),
          updatedAt: serverTimestamp()
        });
        $('#msg').textContent = '저장 완료!';
        renderPage(handle);
      }catch(e){ $('#msg').textContent = '오류: '+e.message; }
    };
  }
  show('view-page');
}

/* ---------- 가입 ---------- */
async function signup(){
  const code   = $('#in-invite').value.trim();
  const handle = $('#in-handle').value.trim().toLowerCase();
  const name   = $('#in-name').value.trim();
  const err    = $('#signup-err');
  err.textContent = '';
  if(!code){ err.textContent = '초대코드를 입력해 주세요.'; return; }
  if(!/^[a-z0-9-]{2,20}$/.test(handle)){ err.textContent = '주소는 영문 소문자·숫자·하이픈 2~20자예요.'; return; }
  if(!name){ err.textContent = '표시 이름을 입력해 주세요.'; return; }
  try{
    await runTransaction(db, async tx => {
      const invRef  = doc(db,'invites',code);
      const pageRef = doc(db,'pages',handle);
      const userRef = doc(db,'users',me.uid);
      const [inv, page, user] = await Promise.all([tx.get(invRef), tx.get(pageRef), tx.get(userRef)]);
      if(!inv.exists())        throw new Error('초대코드가 올바르지 않아요.');
      if(inv.data().used)      throw new Error('이미 사용된 초대코드예요.');
      if(page.exists())        throw new Error('이미 누가 쓰고 있는 주소예요.');
      if(user.exists())        throw new Error('이 계정으로 만든 페이지가 이미 있어요.');
      tx.set(pageRef, { owner: me.uid, name, bio: '', createdAt: serverTimestamp() });
      tx.set(userRef, { handle, createdAt: serverTimestamp() });
      tx.update(invRef, { used: true, usedBy: me.uid, usedAt: serverTimestamp() });
    });
    myHandle = handle;
    renderTopbar();
    history.replaceState(null,'','./?u='+handle);
    renderPage(handle);
  }catch(e){ err.textContent = e.message; }
}

/* ---------- 시작 ---------- */
$('#btn-login').onclick  = () => signInWithPopup(auth, new GoogleAuthProvider()).catch(()=>{});
$('#btn-signup').onclick = signup;

onAuthStateChanged(auth, async user => {
  me = user;
  const viewing = new URLSearchParams(location.search).get('u');

  if(user){
    const u = await getDoc(doc(db,'users',user.uid));
    myHandle = u.exists() ? u.data().handle : null;
  } else myHandle = null;
  renderTopbar();

  if(viewing)      renderPage(viewing);        // 누군가의 페이지 구경 (로그인 무관)
  else if(!me)     show('view-login');
  else if(!myHandle) show('view-signup');
  else             { history.replaceState(null,'','./?u='+myHandle); renderPage(myHandle); }
});
