import fs from "node:fs";
import path from "node:path";
import type { EgoStore } from "./store.ts";
import type { NavEvent, Shot, SpaceEvent } from "./types.ts";

/** JSON-embed safely inside a <script> tag. */
function jsonForScript(value: unknown): string {
	return JSON.stringify(value).replace(/</g, "\\u003c").replace(/-->/g, "--\\>");
}

interface ExportShot {
	id: number;
	url?: string;
	title?: string;
	ts: number;
	taskSpace?: string;
	img: string;
}

/**
 * Render a single self-contained, interactive HTML report of the browser
 * session: a merged event timeline, screenshots grouped by task space or
 * domain, live filtering/search, and a keyboard-driven lightbox. Every image is
 * embedded as a base64 data URI, so the file is fully shareable. Returns path.
 */
export function exportHtml(store: EgoStore): string {
	const shots: ExportShot[] = store.shots.map((s: Shot) => {
		let img = "";
		try {
			img = `data:image/png;base64,${fs.readFileSync(s.file).toString("base64")}`;
		} catch {
			/* skip unreadable shot */
		}
		return { id: s.id, url: s.url, title: s.title, ts: s.ts, taskSpace: s.taskSpace, img };
	});

	const spaces: SpaceEvent[] = store.spaces;
	const navs: NavEvent[] = store.navs;
	const sessionId = store.dir.split("/").pop() || "session";

	const data = {
		sessionId,
		generatedAt: Date.now(),
		shots,
		spaces,
		navs,
	};

	const html = `<!doctype html>
<html lang=en>
<head>
<meta charset=utf-8>
<meta name=viewport content="width=device-width,initial-scale=1">
<title>ego session · ${sessionId}</title>
<style>${CSS}</style>
</head>
<body>
<div id=app><div class=boot>loading session…</div></div>
<script>window.__EGO__=${jsonForScript(data)};</script>
<script>${JS}</script>
</body>
</html>`;

	const out = path.join(store.dir, "report.html");
	fs.writeFileSync(out, html);
	return out;
}

const CSS = `
:root{
  color-scheme:light dark;
  --bg:#f6f7fb; --panel:#fff; --ink:#11131a; --dim:#6b7280; --line:#e5e7eb;
  --brand:#6366f1; --brand2:#ec4899; --ok:#10b981; --warn:#f59e0b; --accent:#3b82f6;
  --chip:#eef2ff; --shadow:0 1px 2px rgba(0,0,0,.06),0 8px 24px rgba(0,0,0,.06);
}
@media (prefers-color-scheme:dark){:root{
  --bg:#0b0d12; --panel:#12151c; --ink:#e7e9ee; --dim:#8b93a5; --line:#222838;
  --chip:#1b2030; --shadow:0 1px 2px rgba(0,0,0,.4),0 12px 40px rgba(0,0,0,.5);
}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);
  font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
.boot{padding:4rem;text-align:center;color:var(--dim)}
header.top{position:sticky;top:0;z-index:30;backdrop-filter:blur(12px);
  background:color-mix(in srgb,var(--panel) 82%,transparent);border-bottom:1px solid var(--line)}
.top-in{max-width:1240px;margin:auto;padding:.8rem 1.2rem;display:flex;flex-wrap:wrap;gap:.8rem;align-items:center}
.logo{font-weight:800;letter-spacing:.3px;font-size:1.05rem;display:flex;align-items:center;gap:.5rem}
.logo .dot{width:1.6rem;height:1.6rem;border-radius:7px;display:grid;place-items:center;
  background:linear-gradient(135deg,var(--brand),var(--brand2));color:#fff;font-size:.95rem}
.stats{display:flex;gap:.4rem;flex-wrap:wrap}
.chip{background:var(--chip);border:1px solid var(--line);border-radius:999px;padding:.18rem .6rem;font-size:.8rem;color:var(--dim);white-space:nowrap}
.chip b{color:var(--ink)}
.spacer{flex:1}
.controls{display:flex;gap:.5rem;flex-wrap:wrap;align-items:center}
.seg{display:flex;background:var(--chip);border:1px solid var(--line);border-radius:10px;padding:2px}
.seg button{border:0;background:transparent;color:var(--dim);padding:.35rem .7rem;border-radius:8px;cursor:pointer;font:inherit;font-weight:600}
.seg button.on{background:var(--panel);color:var(--ink);box-shadow:var(--shadow)}
select,input[type=search]{font:inherit;color:var(--ink);background:var(--panel);border:1px solid var(--line);border-radius:9px;padding:.4rem .6rem}
input[type=search]{min-width:200px}
main{max-width:1240px;margin:auto;padding:1.4rem 1.2rem 5rem}
.group{margin:1.6rem 0}
.group>h2{display:flex;align-items:center;gap:.6rem;font-size:1rem;margin:0 0 .8rem;cursor:pointer;user-select:none}
.group>h2 .caret{transition:transform .15s;color:var(--dim)}
.group.collapsed>h2 .caret{transform:rotate(-90deg)}
.group.collapsed .grid{display:none}
.gtag{font-size:.72rem;color:var(--dim);font-weight:600;background:var(--chip);border:1px solid var(--line);border-radius:999px;padding:.1rem .55rem}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:1rem}
.card{border:1px solid var(--line);border-radius:14px;overflow:hidden;background:var(--panel);box-shadow:var(--shadow);cursor:zoom-in;transition:transform .12s,box-shadow .12s}
.card:hover{transform:translateY(-3px);box-shadow:0 10px 30px rgba(0,0,0,.18)}
.thumb{position:relative;aspect-ratio:16/10;background:#0001;overflow:hidden}
.thumb img{width:100%;height:100%;object-fit:cover;object-position:top center;display:block}
.thumb .num{position:absolute;top:.5rem;left:.5rem;background:rgba(0,0,0,.62);color:#fff;border-radius:7px;font-size:.72rem;padding:.1rem .4rem;font-weight:700}
.meta{padding:.6rem .75rem}
.meta .t{font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.meta .u{font-size:.82em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--accent)}
.meta .s{font-size:.76em;color:var(--dim);margin-top:.15rem;display:flex;gap:.4rem;flex-wrap:wrap;align-items:center}
.pill{background:var(--chip);border:1px solid var(--line);border-radius:999px;padding:0 .45rem}
.empty{padding:4rem;text-align:center;color:var(--dim)}
/* timeline */
.tl{position:relative;margin:1rem 0 0;padding-left:2.2rem}
.tl:before{content:"";position:absolute;left:.8rem;top:.4rem;bottom:.4rem;width:2px;background:var(--line)}
.ev{position:relative;margin:0 0 1rem}
.ev .ic{position:absolute;left:-2.2rem;top:-.1rem;width:1.7rem;height:1.7rem;border-radius:50%;
  display:grid;place-items:center;background:var(--panel);border:1px solid var(--line);font-size:.9rem;box-shadow:var(--shadow)}
.ev .body{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:.6rem .8rem;box-shadow:var(--shadow)}
.ev .when{font-size:.74rem;color:var(--dim)}
.ev .head{font-weight:650;display:flex;gap:.5rem;align-items:center;flex-wrap:wrap}
.ev.shot .body{display:flex;gap:.8rem;align-items:center;cursor:zoom-in}
.ev.shot img{width:110px;height:70px;object-fit:cover;object-position:top center;border-radius:8px;border:1px solid var(--line)}
.badge{font-size:.7rem;font-weight:700;border-radius:999px;padding:.05rem .5rem;border:1px solid var(--line)}
.badge.create{color:var(--ok)} .badge.complete{color:var(--dim)} .badge.handoff{color:var(--warn)}
.badge.takeover{color:var(--brand2)} .badge.reuse{color:var(--accent)} .badge.nav{color:var(--accent)}
/* spaces */
.scards{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:1rem;margin-top:1rem}
.scard{border:1px solid var(--line);border-radius:14px;background:var(--panel);box-shadow:var(--shadow);padding:1rem;cursor:pointer}
.scard h3{margin:.1rem 0 .4rem;font-size:1rem;display:flex;align-items:center;gap:.5rem}
.scard .row{display:flex;justify-content:space-between;color:var(--dim);font-size:.82rem;margin:.15rem 0}
.scard .mini{display:flex;gap:.3rem;margin-top:.6rem;flex-wrap:wrap}
.scard .mini img{width:46px;height:32px;object-fit:cover;border-radius:5px;border:1px solid var(--line)}
.live{width:.55rem;height:.55rem;border-radius:50%;display:inline-block}
.live.on{background:var(--ok);box-shadow:0 0 0 3px color-mix(in srgb,var(--ok) 30%,transparent)}
.live.off{background:var(--dim)}
/* lightbox */
.lb{position:fixed;inset:0;z-index:60;background:rgba(8,9,13,.92);display:none;flex-direction:column}
.lb.show{display:flex}
.lb-top{display:flex;gap:1rem;align-items:center;padding:.8rem 1.1rem;color:#e7e9ee}
.lb-top .t{font-weight:700}.lb-top .u{color:#9aa3b8;font-size:.85rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lb-top a{color:#93c5fd}
.lb-stage{flex:1;display:grid;place-items:center;overflow:auto;padding:0 1rem 1rem}
.lb-stage img{max-width:100%;max-height:100%;border-radius:10px;box-shadow:0 20px 60px rgba(0,0,0,.6)}
.lb-x,.lb-nav{background:rgba(255,255,255,.1);color:#fff;border:1px solid rgba(255,255,255,.18);border-radius:10px;cursor:pointer;font:inherit}
.lb-x{padding:.35rem .7rem;font-weight:700}
.lb-nav{position:absolute;top:50%;transform:translateY(-50%);width:3rem;height:3rem;font-size:1.4rem;display:grid;place-items:center}
.lb-nav.prev{left:1rem}.lb-nav.next{right:1rem}
.lb-nav:hover,.lb-x:hover{background:rgba(255,255,255,.2)}
.count{color:#9aa3b8;font-size:.82rem}
.kbd{font-size:.72rem;color:#9aa3b8;margin-left:auto}
@media (max-width:600px){.kbd{display:none}.thumb{aspect-ratio:16/11}}
`;

const JS = String.raw`
(function(){
  var D = window.__EGO__ || {shots:[],spaces:[],navs:[]};
  var shots = D.shots||[], spaces = D.spaces||[], navs = D.navs||[];
  var state = {view:'gallery', group:'space', space:'all', domain:'all', q:''};

  function domainOf(u){ try{ return new URL(u).hostname.replace(/^www\./,''); }catch(e){ return ''; } }
  function esc(s){ return (s==null?'':String(s)).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
  function fmt(ts){ var d=new Date(ts); return d.toLocaleString(); }
  function fmtT(ts){ var d=new Date(ts); return d.toLocaleTimeString(); }

  // ---- derived ----
  function spaceNames(){ var set=[]; shots.forEach(function(s){ if(s.taskSpace&&set.indexOf(s.taskSpace)<0)set.push(s.taskSpace); });
    spaces.forEach(function(e){ if(e.name&&set.indexOf(e.name)<0)set.push(e.name); }); return set; }
  function domains(){ var set=[]; shots.forEach(function(s){ var d=domainOf(s.url); if(d&&set.indexOf(d)<0)set.push(d); }); return set.sort(); }

  function filtered(){
    var q=state.q.trim().toLowerCase();
    return shots.filter(function(s){
      if(state.space!=='all' && s.taskSpace!==state.space) return false;
      if(state.domain!=='all' && domainOf(s.url)!==state.domain) return false;
      if(q){ var hay=((s.title||'')+' '+(s.url||'')+' '+(s.taskSpace||'')).toLowerCase(); if(hay.indexOf(q)<0) return false; }
      return true;
    });
  }

  function spaceSummary(){
    var map={};
    spaces.forEach(function(ev){
      var c=map[ev.name]||(map[ev.name]={name:ev.name,open:true,events:0,lastTs:0});
      c.events++; c.lastTs=Math.max(c.lastTs,ev.ts);
      if(ev.action==='complete')c.open=false; else c.open=true;
    });
    shots.forEach(function(s){ if(!s.taskSpace)return; var c=map[s.taskSpace]||(map[s.taskSpace]={name:s.taskSpace,open:true,events:0,lastTs:0}); c.lastTs=Math.max(c.lastTs,s.ts); });
    return Object.keys(map).map(function(k){return map[k];}).sort(function(a,b){return b.lastTs-a.lastTs;});
  }

  // ---- lightbox ----
  var lbList=[], lbIdx=0;
  function openLB(list,i){ lbList=list; lbIdx=i; renderLB(); document.getElementById('lb').classList.add('show'); }
  function closeLB(){ document.getElementById('lb').classList.remove('show'); }
  function moveLB(d){ if(!lbList.length)return; lbIdx=(lbIdx+d+lbList.length)%lbList.length; renderLB(); }
  function renderLB(){
    var s=lbList[lbIdx]; if(!s)return;
    document.getElementById('lb-title').textContent=s.title||('Shot #'+s.id);
    var u=document.getElementById('lb-url'); u.innerHTML=s.url?('<a href="'+esc(s.url)+'" target=_blank rel=noopener>'+esc(s.url)+'</a>'):'<span>no url</span>';
    document.getElementById('lb-count').textContent=(lbIdx+1)+' / '+lbList.length+(s.taskSpace?(' · '+s.taskSpace):'')+' · '+fmt(s.ts);
    document.getElementById('lb-img').src=s.img||'';
  }

  // ---- views ----
  function viewGallery(){
    var list=filtered();
    if(!list.length) return '<div class=empty>No screenshots match your filters.</div>';
    var keyFn = state.group==='domain' ? function(s){return domainOf(s.url)||'(no domain)';}
              : state.group==='none'   ? function(){return '__all__';}
              :                          function(s){return s.taskSpace||'(no space)';};
    var groups={}, order=[];
    list.forEach(function(s){ var k=keyFn(s); if(!groups[k]){groups[k]=[];order.push(k);} groups[k].push(s); });
    return order.map(function(k){
      var items=groups[k];
      var cards=items.map(function(s){
        var gi=list.indexOf(s);
        return '<figure class=card data-i="'+gi+'">'
          +'<div class=thumb><span class=num>#'+s.id+'</span>'+(s.img?'<img loading=lazy src="'+s.img+'">':'')+'</div>'
          +'<figcaption class=meta><div class=t>'+esc(s.title||('Shot #'+s.id))+'</div>'
          +'<div class=u>'+esc(s.url||'')+'</div>'
          +'<div class=s>'+(s.taskSpace?'<span class=pill>'+esc(s.taskSpace)+'</span>':'')+'<span>'+esc(fmtT(s.ts))+'</span></div>'
          +'</figcaption></figure>';
      }).join('');
      var label = state.group==='none' ? 'All screenshots' : esc(k);
      return '<section class=group><h2 data-toggle><span class=caret>▾</span>'+label+' <span class=gtag>'+items.length+'</span></h2><div class=grid>'+cards+'</div></section>';
    }).join('');
  }

  function timelineEvents(){
    var evs=[];
    spaces.forEach(function(e){ if(state.space!=='all'&&e.name!==state.space)return; evs.push({ts:e.ts,kind:'space',action:e.action,name:e.name}); });
    navs.forEach(function(n){ if(state.space!=='all'&&n.taskSpace!==state.space)return; if(state.domain!=='all'&&domainOf(n.url)!==state.domain)return; evs.push({ts:n.ts,kind:'nav',url:n.url,title:n.title,space:n.taskSpace}); });
    filtered().forEach(function(s){ evs.push({ts:s.ts,kind:'shot',shot:s}); });
    evs.sort(function(a,b){return a.ts-b.ts;});
    return evs;
  }
  function viewTimeline(){
    var evs=timelineEvents();
    if(!evs.length) return '<div class=empty>No events match your filters.</div>';
    var flist=filtered();
    var icon={create:'➕',reuse:'♻️',complete:'✅',handoff:'🤝',takeover:'✋'};
    var rows=evs.map(function(e){
      if(e.kind==='space'){
        var label={create:'created task space',reuse:'reused task space',complete:'completed task space',handoff:'handed off to user',takeover:'took over task space'}[e.action]||e.action;
        return '<div class="ev space"><div class=ic>'+(icon[e.action]||'•')+'</div><div class=body>'
          +'<div class=head><span class="badge '+e.action+'">'+e.action+'</span> '+esc(label)+' <span class=pill>'+esc(e.name)+'</span></div>'
          +'<div class=when>'+esc(fmt(e.ts))+'</div></div></div>';
      }
      if(e.kind==='nav'){
        return '<div class="ev nav"><div class=ic>🌐</div><div class=body>'
          +'<div class=head><span class="badge nav">nav</span> '+esc(e.title||domainOf(e.url)||e.url)+'</div>'
          +'<div class=when><a href="'+esc(e.url)+'" target=_blank rel=noopener>'+esc(e.url)+'</a> · '+esc(fmt(e.ts))+(e.space?' · '+esc(e.space):'')+'</div></div></div>';
      }
      var s=e.shot, gi=flist.indexOf(s);
      return '<div class="ev shot" data-i="'+gi+'"><div class=ic>📸</div><div class=body>'
        +(s.img?'<img src="'+s.img+'">':'')
        +'<div><div class=head>#'+s.id+' '+esc(s.title||'screenshot')+'</div>'
        +'<div class=when>'+esc(s.url||'')+' · '+esc(fmt(s.ts))+(s.taskSpace?' · '+esc(s.taskSpace):'')+'</div></div></div></div>';
    }).join('');
    return '<div class=tl>'+rows+'</div>';
  }

  function viewSpaces(){
    var sum=spaceSummary();
    if(!sum.length) return '<div class=empty>No task spaces recorded.</div>';
    return '<div class=scards>'+sum.map(function(c){
      var sshots=shots.filter(function(s){return s.taskSpace===c.name;});
      var mini=sshots.slice(0,6).map(function(s){return s.img?'<img src="'+s.img+'">':'';}).join('');
      return '<div class=scard data-space="'+esc(c.name)+'">'
        +'<h3><span class="live '+(c.open?'on':'off')+'"></span>'+esc(c.name)+'</h3>'
        +'<div class=row><span>status</span><b>'+(c.open?'open':'completed')+'</b></div>'
        +'<div class=row><span>lifecycle events</span><b>'+c.events+'</b></div>'
        +'<div class=row><span>screenshots</span><b>'+sshots.length+'</b></div>'
        +'<div class=row><span>last activity</span><b>'+esc(fmtT(c.lastTs))+'</b></div>'
        +(mini?'<div class=mini>'+mini+'</div>':'')+'</div>';
    }).join('')+'</div>';
  }

  function body(){
    if(state.view==='timeline') return viewTimeline();
    if(state.view==='spaces') return viewSpaces();
    return viewGallery();
  }

  function controls(){
    var spOpts=['<option value=all>All spaces</option>'].concat(spaceNames().map(function(n){return '<option value="'+esc(n)+'"'+(state.space===n?' selected':'')+'>'+esc(n)+'</option>';})).join('');
    var dmOpts=['<option value=all>All domains</option>'].concat(domains().map(function(n){return '<option value="'+esc(n)+'"'+(state.domain===n?' selected':'')+'>'+esc(n)+'</option>';})).join('');
    var groupSel = state.view==='gallery'
      ? '<select id=f-group title="group by">'
        +'<option value=space'+(state.group==='space'?' selected':'')+'>Group: space</option>'
        +'<option value=domain'+(state.group==='domain'?' selected':'')+'>Group: domain</option>'
        +'<option value=none'+(state.group==='none'?' selected':'')+'>Group: none</option></select>'
      : '';
    return '<div class=controls>'
      +'<div class=seg>'
        +'<button data-view=gallery class="'+(state.view==='gallery'?'on':'')+'">Gallery</button>'
        +'<button data-view=timeline class="'+(state.view==='timeline'?'on':'')+'">Timeline</button>'
        +'<button data-view=spaces class="'+(state.view==='spaces'?'on':'')+'">Spaces</button>'
      +'</div>'
      +groupSel
      +'<select id=f-space>'+spOpts+'</select>'
      +'<select id=f-domain>'+dmOpts+'</select>'
      +'<input id=f-q type=search placeholder="search title / url…" value="'+esc(state.q)+'">'
      +'</div>';
  }

  function render(){
    var app=document.getElementById('app');
    app.innerHTML=
      '<header class=top><div class=top-in>'
      +'<div class=logo><span class=dot>π</span> ego session</div>'
      +'<div class=stats>'
        +'<span class=chip><b>'+shots.length+'</b> shots</span>'
        +'<span class=chip><b>'+spaceNames().length+'</b> spaces</span>'
        +'<span class=chip><b>'+navs.length+'</b> navigations</span>'
        +'<span class=chip>'+esc(D.sessionId||'')+'</span>'
      +'</div><div class=spacer></div>'+controls()
      +'</div></header>'
      +'<main id=main>'+body()+'</main>'
      +lbHtml();
    wire();
  }

  function lbHtml(){
    return '<div id=lb class=lb>'
      +'<div class=lb-top><span id=lb-title class=t></span><span id=lb-url class=u></span>'
      +'<span class=kbd>← → navigate · esc close</span>'
      +'<button class=lb-x id=lb-close>✕ close</button></div>'
      +'<div class=lb-stage><button class="lb-nav prev" id=lb-prev>‹</button>'
      +'<img id=lb-img alt="">'
      +'<button class="lb-nav next" id=lb-next>›</button></div>'
      +'<div style="text-align:center;padding:.6rem"><span id=lb-count class=count></span></div>'
      +'</div>';
  }

  function wire(){
    var main=document.getElementById('main');
    // view toggle
    Array.prototype.forEach.call(document.querySelectorAll('[data-view]'),function(b){
      b.onclick=function(){ state.view=b.getAttribute('data-view'); render(); };
    });
    bind('f-space','change',function(v){state.space=v;render();});
    bind('f-domain','change',function(v){state.domain=v;render();});
    var g=document.getElementById('f-group'); if(g)g.onchange=function(){state.group=g.value;render();};
    var q=document.getElementById('f-q'); if(q)q.oninput=function(){state.q=q.value; var m=document.getElementById('main'); m.innerHTML=body(); wireBody(); if(document.activeElement!==q){} };
    wireBody();
    // lightbox controls
    document.getElementById('lb-close').onclick=closeLB;
    document.getElementById('lb-prev').onclick=function(){moveLB(-1);};
    document.getElementById('lb-next').onclick=function(){moveLB(1);};
    document.getElementById('lb').onclick=function(e){ if(e.target.id==='lb')closeLB(); };
  }
  function wireBody(){
    // group collapse
    Array.prototype.forEach.call(document.querySelectorAll('[data-toggle]'),function(h){
      h.onclick=function(){ h.parentNode.classList.toggle('collapsed'); };
    });
    // open lightbox from cards / timeline shots
    Array.prototype.forEach.call(document.querySelectorAll('.card[data-i],.ev.shot[data-i]'),function(el){
      el.onclick=function(){ var i=parseInt(el.getAttribute('data-i'),10); if(i>=0) openLB(filtered(),i); };
    });
    // jump from space card into filtered gallery
    Array.prototype.forEach.call(document.querySelectorAll('.scard[data-space]'),function(el){
      el.onclick=function(){ state.space=el.getAttribute('data-space'); state.view='gallery'; render(); };
    });
  }
  function bind(id,ev,fn){ var el=document.getElementById(id); if(el)el.addEventListener(ev,function(){fn(el.value);}); }

  document.addEventListener('keydown',function(e){
    if(!document.getElementById('lb').classList.contains('show'))return;
    if(e.key==='Escape')closeLB();
    else if(e.key==='ArrowLeft')moveLB(-1);
    else if(e.key==='ArrowRight')moveLB(1);
  });

  render();
})();
`;
