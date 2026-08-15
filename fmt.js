/* ============================================================
   LOVELOG — 글 서식 변환 (phase296c에서 app.js에서 분리)
   러브로그 홈(app.js)과 성향글 페이지(info.html)가 같은 규칙을 쓰도록
   양쪽이 이 파일 하나를 가져다 씁니다. 여기엔 순수 변환 함수만 둡니다.
   ============================================================ */
export const esc = s => String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

/* 다이어리 서식 — **굵게** *기울임* __밑줄__ ~~취소선~~ ==형광== */
export const inlineFmt=s=>s
  .replace(/\*\*([^*]+)\*\*/g,'<b>$1</b>')          /* 줄바꿈에 걸친 굵게 허용(phase211) */
  .replace(/\*([^*]+)\*/g,'<i>$1</i>')               /* 기울임도 줄바꿈 허용(phase267 — 문단 경계는 자연 차단) */
  .replace(/__([^_]+)__/g,'<u>$1</u>')
  .replace(/~~([^~]+)~~/g,'<s>$1</s>')
  .replace(/==([^=]+)==/g,'<mark>$1</mark>')
  .replace(/\{\{(\d{2}):([^}]+)\}\}/g,(m,n,x)=>{ n=Math.min(44,Math.max(10,+n));   /* {{18:크게}} 글자 크기(phase265) */
    return `<span style="font-size:${n}px">${x}</span>`; })
  .replace(/\{\{(#(?:[0-9a-fA-F]{3}){1,2}):([^}]+)\}\}/g,'<span style="color:$1">$2</span>')   /* {{#f00:빨강}} */
  .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g,'<a class="ext-link" href="$2" target="_blank" rel="noopener">$1</a>');   /* [글자](주소) 링크(phase286) */
export const spanFix=t=>{                                             // 문단 넘는 **·__·~~·== 쌍 재분배(phase269d)
  [['\\*\\*','**'],['__','__'],['~~','~~'],['==','==']].forEach(([re,mk])=>{
    t=t.replace(new RegExp(re+'([\\s\\S]*?)'+re,'g'), (m,inner)=>
      inner.includes('\n\n')
        ? inner.split(/\n{2,}/).map(seg=>seg.trim()?mk+seg+mk:seg).join('\n\n')
        : m);
  });
  return t;
};
export const bodyCore=t=>t.split(/\n{2,}/).map(p=>{
  const raw0=p.trim();
  const yt=raw0.match(/^https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?\S*v=|youtu\.be\/)([\w-]{11})\S*$/);
  if(yt) return `<div class="yt-wrap"><iframe src="https://www.youtube.com/embed/${yt[1]}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`;   /* 유튜브 단독 줄 = 재생 카드(phase269) */
  if(/^https?:\/\/\S+$/.test(raw0))
    return `<p class="al-c"><a class="ext-link" href="${esc(raw0)}" target="_blank" rel="noopener">🔗 ${esc(raw0.replace(/^https?:\/\//,'').slice(0,44))}${raw0.length>52?'…':''}</a></p>`;   /* 단독 URL = 링크 알약 */
  if(/^(-{3,}|―{3,})$/.test(raw0)) return '<hr>';                     /* 구분선 5종(phase266) */
  if(/^={3,}$/.test(raw0)) return '<hr class="hr-b">';
  if(/^\.{3,}$/.test(raw0)) return '<hr class="hr-dot">';
  if(/^~{3,}$/.test(raw0)) return '<hr class="hr-zz">';
  if(/^\*{3,}$/.test(raw0)) return '<hr class="hr-dia">';
  const lines=raw0.split('\n');
  if(lines.length && lines.every(l=>/^\d+[.)]\s/.test(l)))            /* 전 줄이 1. 이면 순서 목록 */
    return '<ol>'+lines.map(l=>'<li>'+inlineFmt(esc(l.replace(/^\d+[.)]\s/,'')))+'</li>').join('')+'</ol>';
  if(lines.length && lines.every(l=>/^[-•]\s/.test(l)))               /* 전 줄이 - 또는 • 면 점 목록 */
    return '<ul>'+lines.map(l=>'<li>'+inlineFmt(esc(l.replace(/^[-•]\s/,'')))+'</li>').join('')+'</ul>';
  if(lines.length && lines.every(l=>/^>\s?/.test(l)))                 /* 전 줄이 > 면 인용 상자(phase286) */
    return '<blockquote>'+lines.map(l=>inlineFmt(esc(l.replace(/^>\s?/,'')))).join('<br>')+'</blockquote>';
  let cls='', body=p;
  const m=body.match(/^((?:\*\*|__|~~|==)*)@([crji])\s/);
  if(m){ cls={c:' class="al-c"',r:' class="al-r"',j:' class="al-j"',i:' class="ind"'}[m[2]];
    body=m[1]+body.slice(m[0].length); }                       /* **@c 글** 도 인식(phase269d) */                                    /* @c 가운데 @r 오른쪽 @j 양쪽 @i 들여쓰기 */
  return `<p${cls||''}>`+inlineFmt(esc(body)).replace(/\n/g,'<br>')+'</p>';
}).join('');
/* [접기:제목] ~ [/접기] — 눌러서 펼치는 접은 글(phase285). 문단 분해 전에 블록을 뽑아 재귀 처리 */
export const bodyHTML=t=>{
  t=spanFix(t);
  const folds=[];
  t=t.replace(/^\[접기(?::([^\]\n]*))?\]\s*\n([\s\S]*?)\n?\[\/접기\]\s*$/gm,(m,tt,inner)=>{
    folds.push({tt:(tt||'').trim(),inner}); return '\n\n\u0001FOLD'+(folds.length-1)+'\u0001\n\n'; });
  let html=bodyCore(t);
  html=html.replace(/<p[^>]*>\u0001FOLD(\d+)\u0001<\/p>|\u0001FOLD(\d+)\u0001/g,(m,a,b)=>{
    const f=folds[+(a??b)];
    return `<details class="fold"><summary>${inlineFmt(esc(f.tt||'펼쳐 보기'))}</summary><div class="fold-in">${bodyCore(f.inner)}</div></details>`; });
  return html;
};
export const htmlToText=h=>String(h||'')
  .replace(/<br\s*\/?>/gi,'\n')
  .replace(/<\/p>\s*<p[^>]*>/gi,'\n\n')
  .replace(/<\/?p[^>]*>/gi,'')
  .replace(/<img[^>]*>/gi,'')
  .replace(/<[^>]+>/g,'')
  .replace(/&nbsp;/g,' ').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
  .replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&')
  .trim();
/* 글 속 <style>이 홈 전체를 물들이지 않게 — 셀렉터를 #pv-body 스코프로 */
export function scopePostCSS(html){
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
export const cleanHTML=h=>h
  .replace(/<script[\s\S]*?<\/script\s*>/gi,'')
  .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi,'')
  .replace(/javascript:/gi,'');
/* HTML 글의 '태그 바깥 텍스트' 줄바꿈 살리기(phase280):
   본문 첫 블록 태그 이전(머리말)·마지막 '>' 이후(맺음말)의 개행만 <br>로 —
   태그 내부·CSS는 일절 안 건드림. <br> 뒤 개행은 이중 줄바꿈 방지로 보존. */
export const htmlNl=t=>{
  const nl=x=>x.replace(/(<br\s*\/?>)?\r?\n/gi,(m,br)=>br?br+'\n':'<br>\n');
  const i=t.search(/<(?:!doctype|html|head|style|link|script|div|section|article|table|main|center|iframe|figure|ul|ol|blockquote|p|img|h[1-6])\b/i);
  if(i<0) return nl(t);                       // 블록 태그가 아예 없으면 전체 변환
  let lead=nl(t.slice(0,i)), rest=t.slice(i);
  const g=rest.lastIndexOf('>');
  if(g>-1 && g<rest.length-1) rest=rest.slice(0,g+1)+nl(rest.slice(g+1));
  return lead+rest;
};
