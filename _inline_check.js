
window.addEventListener('error',e=>{
  const x=document.getElementById('dateLine');
  if(x) x.textContent='ERRORE JS: '+(e.message||e);
});


/* ====== DB ====== */
const KEY='vg_db_full_v6';
const LEGACY_KEYS=['vg_db_full_v5'];
const PHOTO_DB='vg_photos_v1';
const PHOTO_STORE='photos';
const PROVINCE=[ "AG","AL","AN","AO","AP","AQ","AR","AT","AV","BA","BG","BI","BL","BN","BO","BR","BS","BT","BZ","CA","CB","CE","CH","CL","CN","CO","CR","CS","CT","CZ","EN","FC","FE","FG","FI","FM","FR","GE","GO","GR","IM","IS","KR","LC","LE","LI","LO","LT","LU","MB","MC","ME","MI","MN","MO","MS","MT","NA","NO","NU","OR","PA","PC","PD","PE","PG","PI","PN","PO","PR","PT","PU","PV","PZ","RA","RC","RE","RG","RI","RM","RN","RO","SA","SI","SO","SP","SR","SS","SU","SV","TA","TE","TN","TO","TP","TR","TS","TV","UD","VA","VB","VC","VE","VI","VR","VT","VV" ];
const uid=()=>Math.random().toString(36).slice(2,10)+Date.now().toString(36);
const esc=s=>String(s??'').replace(/[&<>"]/g,m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[m]));
const money=n=>Number(n||0).toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2});
const round5=n=>Math.round(n/5)*5;

function defDB(){
  return {version:'v5',articoli:[],clienti:[],ordini:[],createdAt:new Date().toISOString()};
}
function normalizeDBShape(o){
  if(!o || typeof o!=='object') return defDB();
  const db={
    version:o.version||'v6',
    articoli:Array.isArray(o.articoli)?o.articoli:[],
    clienti:Array.isArray(o.clienti)?o.clienti:[],
    ordini:Array.isArray(o.ordini)?o.ordini:[],
    createdAt:o.createdAt||new Date().toISOString()
  };
  db.articoli=db.articoli.map(x=>({
    ...x,
    foto: [],
    photoIds:Array.isArray(x?.photoIds)?x.photoIds.filter(Boolean).slice(0,6):[]
  }));
  db.ordini=db.ordini.map(x=>({
    ...x,
    righe:Array.isArray(x?.righe)?x.righe:[],
    totale:Number(x?.totale||0),
    incassato:Number(x?.incassato||0)
  }));
  return db;
}
function mergeById(arrA=[], arrB=[]){
  const map=new Map();
  [...arrA, ...arrB].forEach(it=>{
    if(!it || !it.id) return;
    const prev=map.get(it.id);
    if(!prev){ map.set(it.id, it); return; }
    const prevScore=(prev._ts||0)+(Array.isArray(prev.righe)?prev.righe.length:0);
    const nextScore=(it._ts||0)+(Array.isArray(it.righe)?it.righe.length:0);
    if(nextScore>=prevScore) map.set(it.id, {...prev, ...it});
  });
  return Array.from(map.values());
}
function loadDB(){
  try{
    const legacyKeys = (typeof LEGACY_KEYS!=='undefined' ? LEGACY_KEYS : []);
    const keys=[...legacyKeys, KEY];
    const found=[];
    keys.forEach(k=>{
      const raw=localStorage.getItem(k);
      if(!raw) return;
      try{ found.push({key:k, db:normalizeDBShape(JSON.parse(raw))}); }catch(_e){}
    });
    if(!found.length) return defDB();

    let merged=defDB();
    found.forEach(({db})=>{
      merged={
        version:'v6',
        createdAt: merged.createdAt||db.createdAt||new Date().toISOString(),
        articoli: mergeById(merged.articoli, db.articoli),
        clienti: mergeById(merged.clienti, db.clienti),
        ordini: mergeById(merged.ordini, db.ordini)
      };
    });

    const mergedRaw = JSON.stringify(merged);
    const rawMain=localStorage.getItem(KEY);
    if(rawMain!==mergedRaw) localStorage.setItem(KEY, mergedRaw);

    // Dopo la migrazione, le chiavi legacy non devono più rimettere in vita record cancellati.
    legacyKeys.forEach(k=>{ try{ localStorage.removeItem(k); }catch(_e){} });
    return merged;
  }catch(e){ return defDB(); }
}
function saveDB(db){
  try{
    localStorage.setItem(KEY, JSON.stringify(db));
    const legacyKeys = (typeof LEGACY_KEYS!=='undefined' ? LEGACY_KEYS : []);
    legacyKeys.forEach(k=>{ try{ localStorage.removeItem(k); }catch(_e){} });
  }catch(err){
    const msg=String(err?.message||err||'');
    if(/quota|storage/i.test(msg)) toast('Salvataggio fallito: archivio locale pieno o sporco');
    else toast('Salvataggio fallito');
    return false;
  }
  try{ renderAll(); }catch(err){ console.error('Render post-salvataggio fallito', err); }
  return true;
}

function openPhotoDB(){
  return new Promise((res,rej)=>{
    const req=indexedDB.open(PHOTO_DB,1);
    req.onupgradeneeded=()=>{
      const db=req.result;
      if(!db.objectStoreNames.contains(PHOTO_STORE)) db.createObjectStore(PHOTO_STORE);
    };
    req.onsuccess=()=>res(req.result);
    req.onerror=()=>rej(req.error||new Error('IndexedDB non disponibile'));
  });
}
async function idbSet(key,val){
  const db=await openPhotoDB();
  return new Promise((res,rej)=>{
    const tx=db.transaction(PHOTO_STORE,'readwrite');
    tx.objectStore(PHOTO_STORE).put(val,key);
    tx.oncomplete=()=>res(true);
    tx.onerror=()=>rej(tx.error||new Error('Errore salvataggio foto'));
    tx.onabort=()=>rej(tx.error||new Error('Salvataggio foto abortito'));
  });
}
async function idbGet(key){
  const db=await openPhotoDB();
  return new Promise((res,rej)=>{
    const tx=db.transaction(PHOTO_STORE,'readonly');
    const req=tx.objectStore(PHOTO_STORE).get(key);
    req.onsuccess=()=>res(req.result||null);
    req.onerror=()=>rej(req.error||new Error('Errore lettura foto'));
  });
}
async function idbDelete(key){
  const db=await openPhotoDB();
  return new Promise((res,rej)=>{
    const tx=db.transaction(PHOTO_STORE,'readwrite');
    tx.objectStore(PHOTO_STORE).delete(key);
    tx.oncomplete=()=>res(true);
    tx.onerror=()=>rej(tx.error||new Error('Errore eliminazione foto'));
    tx.onabort=()=>rej(tx.error||new Error('Eliminazione foto abortita'));
  });
}
async function idbListKeys(){
  const db=await openPhotoDB();
  return new Promise((res,rej)=>{
    const tx=db.transaction(PHOTO_STORE,'readonly');
    const store=tx.objectStore(PHOTO_STORE);
    const req=store.getAllKeys ? store.getAllKeys() : null;
    if(req){
      req.onsuccess=()=>res((req.result||[]).map(String));
      req.onerror=()=>rej(req.error||new Error('Errore lettura chiavi foto'));
      return;
    }
    const out=[];
    const cur=store.openCursor();
    cur.onsuccess=(e)=>{
      const cursor=e.target.result;
      if(cursor){ out.push(String(cursor.key)); cursor.continue(); }
      else res(out);
    };
    cur.onerror=()=>rej(cur.error||new Error('Errore cursore foto'));
  });
}
async function idbCount(){
  const db=await openPhotoDB();
  return new Promise((res,rej)=>{
    const tx=db.transaction(PHOTO_STORE,'readonly');
    const req=tx.objectStore(PHOTO_STORE).count();
    req.onsuccess=()=>res(Number(req.result||0));
    req.onerror=()=>rej(req.error||new Error('Errore conteggio foto'));
  });
}
async function getArticlePics(a){
  if(!a) return [];
  if(Array.isArray(a.photoIds) && a.photoIds.length){
    const out=[];
    for(const id of a.photoIds){ const x=await idbGet(id); if(x) out.push(x); }
    return out;
  }
  return Array.isArray(a.foto)?a.foto.filter(Boolean):[];
}
async function migratePhotosToIndexedDB(){
  const db=loadDB();
  let changed=false;
  for(const a of db.articoli||[]){
    if(Array.isArray(a.foto) && a.foto.length && (!Array.isArray(a.photoIds) || !a.photoIds.length)){
      a.photoIds=[];
      for(const src of a.foto.slice(0,6)){
        const pid='ph_'+uid();
        await idbSet(pid,src);
        a.photoIds.push(pid);
      }
      a.foto=[];
      changed=true;
    }
    if(!Array.isArray(a.photoIds)) a.photoIds=[];
  }
  if(changed) localStorage.setItem(KEY, JSON.stringify(db));
}
async function estimateStorageInfo(){
  if(navigator.storage && navigator.storage.estimate){
    const e=await navigator.storage.estimate();
    return {usage:Number(e.usage||0), quota:Number(e.quota||0)};
  }
  return null;
}
function fmtMB(n){ return (n/1024/1024).toFixed(2)+' MB'; }

/* ====== DATE LINE ====== */
function setDateLine(){
  const x=document.getElementById('dateLine');
  if(!x) return;
  const d=new Date();
  const days=["domenica","lunedì","martedì","mercoledì","giovedì","venerdì","sabato"];
  const dd=String(d.getDate()).padStart(2,'0');
  const mm=String(d.getMonth()+1).padStart(2,'0');
  const yyyy=d.getFullYear();
  x.textContent=`${days[d.getDay()]} ${dd}/${mm}/${yyyy} • ${d.toLocaleTimeString('it-IT')}`;
}
setInterval(setDateLine, 1000); document.addEventListener('DOMContentLoaded', setDateLine);

/* ====== QUALITY + PRICE RULES ====== */
function qualityFromCode(code){
  const c=String(code||'').trim();
  if(!c) return '';
  const first=c[0];
  if(first==='2' || first==='3') return 'ORIGINALE';
  if(first==='1' || /[A-Za-z]/.test(first)) return 'STANDARD';
  return 'STANDARD';
}
function calcFromUsd(usd, qual){
  const costo=(Number(usd||0)*0.90)+5;
  if(!isFinite(costo)) return {costo:0, sell:0, marg:0};
  if(qual==='ORIGINALE'){
    let guad=costo*0.30;
    if(guad<60) guad=60;
    if(guad>75) guad=75;
    const sell=round5(costo+guad);
    return {costo, sell, marg:guad};
  }else{
    let marg=costo*0.55;
    if(marg<50) marg=50;
    if(marg>60) marg=60;
    const sell=round5(costo+marg);
    return {costo, sell, marg};
  }
}
function promoValid(a){
  if(!a.promoAttiva) return false;
  const p=Number(a.prezzoPromo||0);
  const d=String(a.scadenzaPromo||'').trim(); // yyyy-mm-dd
  if(!(p>0) || d.length<8) return false;
  const today=todayStr();
  return d>=today;
}
function currentPrice(a){
  return promoValid(a) ? Number(a.prezzoPromo) : Number(a.prezzoVendita||0);
}


function orderPaidStatus(o){
  const stato=String(o?.stato||'').trim().toLowerCase();
  const autoPaidStatuses=new Set(['pagato','in lavorazione','spedito','consegnato']);
  return autoPaidStatuses.has(stato);
}

function orderIncassato(o){
  if(orderPaidStatus(o)) return Number(o?.totale||0);
  return Number(o?.incassato||0);
}

function orderMargin(o, db){
  const righe=Array.isArray(o?.righe)?o.righe:[];
  let margin=0;
  for(const r of righe){
    const prezzo=Number(r?.prezzo||0);
    const art=(db?.articoli||[]).find(x=>x.id===r.articoloId || (r.codice && x.codice===r.codice));
    const costo=Number(art?.costoEur||r?.costoEur||0);
    margin += Math.max(0, prezzo - costo);
  }
  return margin;
}

/* ====== POST (rules) ====== */
function emojiQualityForPost(a){
  const q=qualityFromCode(a.codice);
  return (q==='ORIGINALE') ? '🥇' : '🔝💯';
}
function buildPost(a){
  const brand=(a.brand||'').trim();
  const modello=(a.modello||'').trim();
  if(!a.codice) return '';
  const qemoji=emojiQualityForPost(a);
  let lines=[];
  if(a.promoAttiva) lines.push('🔥PROMOZIONE🔥');
  lines.push(`${brand} ${modello} ${qemoji}`.trim());
  const qual=qualityFromCode(a.codice);
  if(qual==='ORIGINALE') lines.push('QUALITÀ SUPERIORE');
  else if(qual) lines.push(`Qualità ${qual}`);
  if((a.descrizione||'').trim()) lines.push((a.descrizione||'').trim());
  const detail=[];
  if(a.taglia) detail.push(`Taglia ${a.taglia}`);
  if(a.variante) detail.push(a.variante);
  if(a.colore) detail.push(a.colore);
  if(a.misura) detail.push(`Mis. ${a.misura}`);
  if(detail.length) lines.push(detail.join(' • '));
  if(a.scatola) lines.push('Con scatola 🎁');
  if(a.materiale) lines.push(`🧵 ${a.materiale}`);
  if(a.colori) lines.push(a.colori);
  if(a.tracolla) lines.push(a.tracolla);
  lines.push(`cod. ${a.codice}`);
  return lines.join('\n');
}

function withIntlPrefix(tel){
  const raw=String(tel||'').trim();
  if(!raw) return '';
  if(raw.startsWith('+')) return raw;
  if(raw.startsWith('00')) return '+'+raw.slice(2).replace(/\s+/g,'');
  const digits=raw.replace(/\D+/g,'');
  if(!digits) return raw;
  if(digits.startsWith('39')) return '+'+digits;
  return '+39 '+digits;
}
function buildShippingAddress(c){
  const name=(c?.nome||'').trim();
  const addr=(c?.indirizzo||'').trim();
  const cap=(c?.cap||'').trim();
  const city=(c?.citta||'').trim();
  const prov=(c?.provincia||'').trim();
  const phone=withIntlPrefix(c?.telefono||'');
  const cityLine=[cap,city,prov].filter(Boolean).join(' ');
  return ['Shipping Address',name,addr,cityLine,'Italy',phone].filter(Boolean).join('\n');
}
function refreshClientShipping(){
  const el=document.getElementById('c_ship');
  if(!el) return;
  const c={
    nome:document.getElementById('c_nome')?.value||'',
    telefono:document.getElementById('c_tel')?.value||'',
    indirizzo:document.getElementById('c_ind')?.value||'',
    cap:document.getElementById('c_cap')?.value||'',
    citta:document.getElementById('c_citta')?.value||'',
    provincia:document.getElementById('c_prov')?.value||''
  };
  el.value=buildShippingAddress(c);
  fitTextarea(el);
}

/* ====== NAV ====== */
let activeModalId=null;
function renderPageState(name){
  document.querySelectorAll('.section').forEach(s=>s.classList.remove('active'));
  const sec=document.getElementById('sec_'+name); if(sec) sec.classList.add('active');
  document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active', t.dataset.go===name));
  document.querySelectorAll('.navBottom button').forEach(b=>b.classList.toggle('active', b.dataset.go===name));
}
function go(name, push=true){
  renderPageState(name);
  if(push) history.pushState({page:name},'', '#'+name);
}
window.addEventListener('popstate',(e)=>{
  if(activeModalId){ const mid=activeModalId; activeModalId=null; document.getElementById(mid).style.display='none'; return; }
  const page=(e.state&&e.state.page) || location.hash.replace('#','') || 'home';
  renderPageState(page);
});

/* ====== UI helpers ====== */
function show(id, push=true){ const el=document.getElementById(id); if(!el) return; el.style.display='flex'; activeModalId=id; if(push) history.pushState({page:location.hash.replace('#','')||'home', modal:id},'', location.href); }
function hide(id, fromPop=false){ const el=document.getElementById(id); if(!el) return; el.style.display='none'; if(activeModalId===id) activeModalId=null; if(!fromPop && history.state && history.state.modal===id) history.back(); }
function toast(msg){
  let t=document.getElementById('vg_toast');
  if(!t){ t=document.createElement('div'); t.id='vg_toast';
    t.style.cssText='position:fixed;left:50%;bottom:78px;transform:translateX(-50%);background:#111827;color:#fff;padding:10px 12px;border-radius:12px;font-weight:900;font-size:12px;z-index:9999;box-shadow:0 12px 24px rgba(0,0,0,.25);max-width:90vw;text-align:center;display:none';
    document.body.appendChild(t);
  }
  t.textContent=msg; t.style.display='block';
  clearTimeout(window.__t); window.__t=setTimeout(()=>t.style.display='none',1400);
}
let confirmCallback=null;
function askConfirm(text, cb, title='Conferma'){ document.getElementById('confirmTitle').textContent=title; document.getElementById('confirmText').textContent=text; confirmCallback=cb; show('mConfirm'); }
function closeConfirm(run){ hide('mConfirm'); const fn=confirmCallback; confirmCallback=null; if(run && typeof fn==='function') fn(); }
function toggleCloudSyncMini(){ const el=document.getElementById('cloudSyncMini'); if(!el) return; el.classList.toggle('show'); }
function copyTextFrom(el){
  const t=el.value||el.textContent||'';
  if(!t) return toast('Niente da copiare');
  navigator.clipboard?.writeText(t).then(()=>toast('Copiato')).catch(()=>{ try{ el.select(); document.execCommand('copy'); toast('Copiato'); }catch(e){ toast('Copia non disponibile'); } });
}

/* ====== RENDER ====== */
function dashboardMood(incMonth, prevMonth, openOrders, totalOrders){
  const ratio = prevMonth>0 ? incMonth/prevMonth : (incMonth>0 ? 1.2 : 0);
  if(totalOrders===0) return {title:'Si riparte da qui', sub:'Nessun ordine registrato: dashboard pronta a ripartire.'};
  if(incMonth===0 && openOrders>0) return {title:'Vendite ferme, ordini da chiudere', sub:'Questo mese non risulta ancora incassato: conviene spingere le chiusure.'};
  if(incMonth===0) return {title:'Mese molto lento', sub:'Poche vendite registrate: serve rimettere movimento.'};
  if(openOrders>=6 && incMonth>0) return {title:'Bel movimento, occhio ai tempi', sub:'Le vendite girano ma hai parecchi ordini ancora aperti.'};
  if(ratio>=1.25) return {title:'Vendite in spinta', sub:'Questo mese sta andando meglio del precedente.'};
  if(ratio>=0.9) return {title:'Andamento stabile', sub:'Flusso regolare: numeri sotto controllo.'};
  if(ratio>=0.5) return {title:'Si muove, ma può fare meglio', sub:'Le vendite ci sono, però il ritmo è ancora basso.'};
  return {title:'Vendite basse, da scuotere', sub:'Il mese è fiacco: conviene spingere ordini e follow-up.'};
}

function renderHome(){
  const db=loadDB();
  const now=new Date(), curMonth=now.getMonth(), curYear=now.getFullYear();
  const ordini=db.ordini||[];
  const inCorso=ordini.filter(o=>String(o.stato||'').trim().toLowerCase()!=='consegnato').length;
  const totaleOrdini=ordini.reduce((s,o)=>s+Number(o.totale||0),0);
  const mediaOrdini=ordini.length ? totaleOrdini / ordini.length : 0;
  const guadagnoTot=ordini.reduce((s,o)=>s+(orderPaidStatus(o)?orderMargin(o,db):0),0);
  const sameMonth=o=>{ const d=new Date((o.data||'')+'T12:00:00'); return !isNaN(d) && d.getMonth()===curMonth && d.getFullYear()===curYear; };
  const guadagnoMese=ordini.filter(sameMonth).reduce((s,o)=>s+(orderPaidStatus(o)?orderMargin(o,db):0),0);
  const incMese=ordini.filter(sameMonth).reduce((s,o)=>s+orderIncassato(o),0);
  const incTot=ordini.reduce((s,o)=>s+orderIncassato(o),0);
  const daIncassare=Math.max(0, totaleOrdini-incTot);

  document.getElementById('c_open_orders').textContent=inCorso;
  document.getElementById('c_profit_month').textContent=money(guadagnoMese);
  document.getElementById('c_avg_order').textContent=money(mediaOrdini);
  document.getElementById('c_profit_total').textContent=money(guadagnoTot);
  document.getElementById('c_inc_month').textContent=money(incMese);
  document.getElementById('c_due_total').textContent=money(daIncassare);

  const months=[];
  for(let i=5;i>=0;i--){
    const d=new Date(curYear, curMonth-i, 1);
    const label=d.toLocaleDateString('it-IT',{month:'short'}).replace('.','');
    const value=ordini.filter(o=>{ const od=new Date((o.data||'')+'T12:00:00'); return !isNaN(od) && od.getMonth()===d.getMonth() && od.getFullYear()===d.getFullYear(); }).reduce((s,o)=>s+orderIncassato(o),0);
    months.push({label:label.charAt(0).toUpperCase()+label.slice(1), value});
  }
  const max=Math.max(1,...months.map(m=>m.value));
  document.getElementById('homeSpark').innerHTML=months.map((m,idx)=>`<div class="sparkCol"><div class="sparkBarWrap"><div class="sparkBar ${idx===months.length-1?'soft':''}" style="height:${Math.max(12,Math.round((m.value/max)*100))}%" title="${esc(m.label)}: ${money(m.value)}"></div></div><div class="sparkLbl">${esc(m.label)}</div></div>`).join('');

  const prevMonth=months.length>1 ? months[months.length-2].value : 0;
  const mood=dashboardMood(incMese, prevMonth, inCorso, ordini.length);
  document.getElementById('homeMood').textContent=mood.title;
  document.getElementById('homeMoodSub').textContent=mood.sub;

  const last=ordini.slice().sort((a,b)=>(b._ts||0)-(a._ts||0))[0];
  const exp=db.articoli.filter(promoValid).sort((a,b)=>String(a.scadenzaPromo).localeCompare(String(b.scadenzaPromo)))[0];
  const lines=[];
  lines.push(last?`Ultimo ordine: ${last.stato} • ${last.data||''}`:'Ultimo ordine: nessuno');
  lines.push(exp?`Promo attiva: ${exp.brand||''} ${exp.modello||''}`:'Promo attiva: nessuna');
  lines.push(`Ordini aperti: ${inCorso} • Incassato mese ${money(incMese)}`);

  const list=document.getElementById('dashList');
  list.innerHTML=lines.map((t,i)=>{
    const target=(i===1)?'articoli':'ordini';
    return `<div class="row" data-go="${target}" style="grid-template-columns:1fr"><div class="main"><div class="t">${esc(t)}</div></div></div>`;
  }).join('');
}

function renderArt(){
  const db=loadDB();
  const q=document.getElementById('qArt').value.trim().toLowerCase();
  const items=db.articoli.filter(a=>{
    const hay=((a.codice||'')+' '+(a.brand||'')+' '+(a.modello||'')+' '+(a.categoria||'')+' '+(a.descrizione||'')+' '+(a.colore||'')+' '+(a.taglia||'')+' '+(a.variante||'')).toLowerCase();
    return !q || hay.includes(q);
  }).sort((a,b)=>String(b._ts||0).localeCompare(String(a._ts||0)));
  const el=document.getElementById('listArt');
  el.innerHTML=items.map(a=>{
    const promo=pseudoPromoBadge(a);
    return `<div class="row" data-open="art" data-id="${a.id}">
      <img class="thumb artThumb" data-photo-for="${a.id}" style="display:none"/>
      <div>
        <div class="t">${esc(a.modello||'-')}</div>
        <div class="s">${esc(a.brand||'')} • ${esc(a.codice||'')} • ${esc(qualityFromCode(a.codice))}</div>
        ${promo}
      </div>
      <div style="text-align:right">
        <div class="k">Prezzo</div><div class="t">${money(currentPrice(a))}</div>
        <div style="margin-top:8px"><button class="btn orderAdd small" type="button" data-action="addArtToOrder" data-id="${a.id}">Aggiungi a ordine</button></div>
      </div>
    </div>`;
  }).join('') || `<div class="card"><div class="small">Nessun articolo</div></div>`;
  hydrateArticleThumbs(items);
}
async function hydrateArticleThumbs(items){
  for(const a of items){
    const pics=await getArticlePics(a);
    const el=document.querySelector('[data-photo-for="'+a.id+'"]');
    if(el && pics[0]){ el.src=pics[0]; el.style.display='block'; }
  }
}
function pseudoPromoBadge(a){
  if(!a.promoAttiva) return '';
  const ok=promoValid(a);
  if(ok) return `<div class="pill promo" style="margin-top:6px"><span class="dot"></span>PROMO attiva</div>`;
  return `<div class="pill" style="margin-top:6px">PROMO impostata</div>`;
}

function renderCli(){
  const db=loadDB();
  const q=document.getElementById('qCli').value.trim().toLowerCase();
  const items=db.clienti.filter(c=>{
    const hay=((c.nome||'')+' '+(c.telefono||'')+' '+(c.citta||'')+' '+(c.provincia||'')).toLowerCase();
    return !q || hay.includes(q);
  }).sort((a,b)=>String(b._ts||0).localeCompare(String(a._ts||0)));
  const el=document.getElementById('listCli');
  el.innerHTML=items.map(c=>`
    <div class="row" data-open="cli" data-id="${c.id}" style="grid-template-columns:1fr auto">
      <div>
        <div class="t">${esc(c.nome||'-')}</div>
        <div class="s">${esc(c.telefono||'')} • ${esc(c.citta||'')} (${esc(c.provincia||'')})</div>
      </div>
      <div class="pill">${esc(c.provincia||'-')}</div>
    </div>
  `).join('') || `<div class="card"><div class="small">Nessun cliente</div></div>`;
}

function renderOrd(){
  const db=loadDB();
  const q=document.getElementById('qOrd').value.trim().toLowerCase();
  const items=db.ordini.filter(o=>{
    const c=db.clienti.find(x=>x.id===o.clienteId);
    const hay=((o.id||'')+' '+(o.stato||'')+' '+(c?c.nome:'')).toLowerCase();
    return !q || hay.includes(q);
  }).sort((a,b)=>String(b._ts||0).localeCompare(String(a._ts||0)));
  const el=document.getElementById('listOrd');
  el.innerHTML=items.map(o=>{
    const c=db.clienti.find(x=>x.id===o.clienteId);
    return `<div class="row" data-open="ord" data-id="${o.id}" style="grid-template-columns:1fr auto">
      <div>
        <div class="t">${esc(c?c.nome:'-')} • <span class="priceHot">${money(o.totale||0)}</span></div>
        <div class="s">${esc(o.stato||'-')} • ${esc(o.data||'')}</div>
      </div>
      <div class="pill">${esc(o.stato||'-')}</div>
    </div>`;
  }).join('') || `<div class="card"><div class="small">Nessun ordine</div></div>`;
}

function renderBarChart(rows, moneyValues=true){
  if(!rows.length) return `<div class="small">Nessun dato.</div>`;
  const max=Math.max(...rows.map(r=>r.value),1);
  return `<div class="chartBars">${rows.map(r=>`<div class="chartRow"><div class="k">${esc(r.label)}</div><div class="barTrack"><div class="barFill" style="width:${Math.max(4,(r.value/max)*100)}%"></div></div><div class="t">${moneyValues?money(r.value):r.value}</div></div>`).join('')}</div>`;
}
async function renderStorageInfo(){
  const box=document.getElementById('storageInfo');
  if(!box) return;
  try{
    const est=await estimateStorageInfo();
    if(!est || !est.quota){ box.textContent='Il browser non espone il limite preciso, ma con IndexedDB hai molto più margine rispetto a localStorage.'; return; }
    const perc=((est.usage/est.quota)*100).toFixed(1);
    box.innerHTML=`<div class="mutedBox">Usati <b>${fmtMB(est.usage)}</b> su circa <b>${fmtMB(est.quota)}</b> disponibili (${perc}%).</div>`;
  }catch(e){ box.textContent='Impossibile leggere la quota del browser.'; }
}
async function getDiagnostics(){
  const db=loadDB();
  const articleRefs=new Set();
  let embeddedPhotos=0;
  let duplicatedRefs=0;
  let articoliConFoto=0;
  for(const a of db.articoli||[]){
    const ids=Array.isArray(a.photoIds)?a.photoIds.filter(Boolean).map(String):[];
    const uniq=new Set(ids);
    if(ids.length) articoliConFoto++;
    duplicatedRefs += Math.max(0, ids.length-uniq.size);
    uniq.forEach(id=>articleRefs.add(id));
    if(Array.isArray(a.foto) && a.foto.length) embeddedPhotos += a.foto.length;
  }
  let idbKeys=[]; let quota=null; let idbError='';
  try{ idbKeys=await idbListKeys(); }catch(e){ idbError=String(e?.message||e||''); }
  try{ quota=await estimateStorageInfo(); }catch(_e){}
  const idbSetKeys=new Set(idbKeys.map(String));
  let missingRefs=0;
  articleRefs.forEach(id=>{ if(!idbSetKeys.has(String(id))) missingRefs++; });
  let orphanPhotos=0;
  idbSetKeys.forEach(id=>{ if(!articleRefs.has(String(id))) orphanPhotos++; });
  const legacyKeys=[...(typeof LEGACY_KEYS!=='undefined'?LEGACY_KEYS:[])].filter(k=>!!localStorage.getItem(k));
  return {
    articoli: db.articoli.length,
    clienti: db.clienti.length,
    ordini: db.ordini.length,
    articoliConFoto,
    referencedPhotos: articleRefs.size,
    photosInIDB: idbKeys.length,
    embeddedPhotos,
    duplicatedRefs,
    missingRefs,
    orphanPhotos,
    legacyKeys,
    quota,
    idbError
  };
}
async function renderDiagnostics(){
  const box=document.getElementById('diagBox');
  if(!box) return;
  box.innerHTML='Lettura archivio in corso…';
  try{
    const d=await getDiagnostics();
    const storageLine=d.quota&&d.quota.quota ? `Usati <b>${fmtMB(d.quota.usage||0)}</b> su circa <b>${fmtMB(d.quota.quota||0)}</b>.` : 'Quota browser non disponibile.';
    box.innerHTML=`
      <div class="smallGrid">
        <div class="mutedBox"><div class="k">Articoli</div><div class="v">${d.articoli}</div></div>
        <div class="mutedBox"><div class="k">Clienti</div><div class="v">${d.clienti}</div></div>
        <div class="mutedBox"><div class="k">Ordini</div><div class="v">${d.ordini}</div></div>
        <div class="mutedBox"><div class="k">Articoli con foto</div><div class="v">${d.articoliConFoto}</div></div>
        <div class="mutedBox"><div class="k">Foto referenziate</div><div class="v">${d.referencedPhotos}</div></div>
        <div class="mutedBox"><div class="k">Foto in IndexedDB</div><div class="v">${d.photosInIDB}</div></div>
      </div>
      <div class="smallGrid" style="margin-top:10px">
        <div class="mutedBox"><div class="k">Foto vecchie nel DB</div><div class="v">${d.embeddedPhotos}</div><div class="small">Da pulire</div></div>
        <div class="mutedBox"><div class="k">Riferimenti doppi</div><div class="v">${d.duplicatedRefs}</div><div class="small">Stesso file agganciato più volte</div></div>
        <div class="mutedBox"><div class="k">Foto mancanti</div><div class="v">${d.missingRefs}</div><div class="small">Articolo punta a foto non trovate</div></div>
        <div class="mutedBox"><div class="k">Foto orfane</div><div class="v">${d.orphanPhotos}</div><div class="small">Occupano spazio ma nessun articolo le usa</div></div>
      </div>
      <div class="mutedBox" style="margin-top:10px">${storageLine}</div>
      <div class="mutedBox" style="margin-top:10px">Chiavi archivio trovate: <b>${([KEY,...d.legacyKeys].filter((v,i,a)=>a.indexOf(v)===i).join(', ')||KEY)}</b></div>
      ${d.idbError?`<div class="mutedBox" style="margin-top:10px;color:#991b1b">Errore IndexedDB: ${esc(d.idbError)}</div>`:''}
    `;
  }catch(e){
    box.innerHTML=`<div class="mutedBox" style="color:#991b1b">Diagnostica fallita: ${esc(String(e?.message||e||'Errore sconosciuto'))}</div>`;
  }
}
async function repairArchive(){
  const db=loadDB();
  const referenced=new Set();
  for(const a of db.articoli||[]){
    if(Array.isArray(a.foto) && a.foto.length){
      if(!Array.isArray(a.photoIds)) a.photoIds=[];
      for(const src of a.foto.slice(0,6)){
        const pid='ph_'+uid();
        await idbSet(pid,src);
        a.photoIds.push(pid);
      }
      a.foto=[];
    }
    const ids=Array.isArray(a.photoIds)?a.photoIds.filter(Boolean).map(String):[];
    const uniq=[];
    const seen=new Set();
    for(const id of ids){
      if(seen.has(id)) continue;
      seen.add(id);
      uniq.push(id);
    }
    a.photoIds=uniq.slice(0,6);
    a.photoIds.forEach(id=>referenced.add(String(id)));
  }
  const keys=await idbListKeys().catch(()=>[]);
  for(const key of keys){
    if(!referenced.has(String(key))){
      try{ await idbDelete(key); }catch(_e){}
    }
  }
  if(!saveDB(db)) throw new Error('Riparazione completata a metà: database principale non salvato.');
  await renderDiagnostics();
}
function renderFinanze(){
  const db=loadDB();
  const fatt=db.ordini.reduce((s,o)=>s+Number(o.totale||0),0);
  const inc=db.ordini.reduce((s,o)=>s+orderIncassato(o),0);
  const profit=db.ordini.reduce((s,o)=>s+(orderPaidStatus(o)?orderMargin(o,db):0),0);
  const due=Math.max(0,fatt-inc);
  const now=new Date(), curMonth=now.getMonth(), curYear=now.getFullYear();
  const sameMonth=o=>{ const d=new Date((o.data||'')+'T12:00:00'); return !isNaN(d) && d.getMonth()===curMonth && d.getFullYear()===curYear; };
  const sameYear=o=>{ const d=new Date((o.data||'')+'T12:00:00'); return !isNaN(d) && d.getFullYear()===curYear; };
  const profitMonth=db.ordini.filter(sameMonth).reduce((s,o)=>s+(orderPaidStatus(o)?orderMargin(o,db):0),0);
  const profitYear=db.ordini.filter(sameYear).reduce((s,o)=>s+(orderPaidStatus(o)?orderMargin(o,db):0),0);
  const incMonth=db.ordini.filter(sameMonth).reduce((s,o)=>s+orderIncassato(o),0);
  const fattMonth=db.ordini.filter(sameMonth).reduce((s,o)=>s+Number(o.totale||0),0);
  document.getElementById('f_fatt').textContent=money(fatt);
  document.getElementById('f_inc').textContent=money(inc);
  document.getElementById('f_due').textContent=money(due);
  document.getElementById('f_profit').textContent=money(profit);
  document.getElementById('f_profit_month').textContent=money(profitMonth);
  document.getElementById('f_profit_year').textContent=money(profitYear);

  const bySt={};
  db.ordini.forEach(o=>{
    const k=o.stato||'Sconosciuto';
    bySt[k]??={tot:0,inc:0,n:0};
    bySt[k].tot+=Number(o.totale||0);
    bySt[k].inc+=orderIncassato(o);
    bySt[k].n+=1;
  });
  const sRows=Object.entries(bySt).sort((a,b)=>b[1].inc-a[1].inc);
  document.getElementById('finByStatus').innerHTML=sRows.length ? sRows.map(([k,v])=>`
    <div class="row" style="grid-template-columns:1fr auto">
      <div>
        <div class="t">${esc(k)}</div>
        <div class="s">${v.n} ordini • totale ${money(v.tot)}</div>
      </div>
      <div class="priceHot">${money(v.inc)}</div>
    </div>
  `).join('') : `<div class="small">Nessun dato.</div>`;

  const byCat={};
  db.ordini.forEach(o=>(o.righe||[]).forEach(r=>{
    const a=db.articoli.find(x=>x.id===r.articoloId);
    const k=(a?.categoria||r.categoria||'Senza categoria').trim()||'Senza categoria';
    byCat[k]??={rev:0,qty:0};
    byCat[k].rev+=Number(r.prezzo||0);
    byCat[k].qty+=1;
  }));
  const cRows=Object.entries(byCat).sort((a,b)=>b[1].rev-a[1].rev);
  document.getElementById('finByCat').innerHTML=cRows.length ? cRows.map(([k,v])=>`
    <div class="row" style="grid-template-columns:1fr auto">
      <div>
        <div class="t">${esc(k)}</div>
        <div class="s">${v.qty} righe ordine</div>
      </div>
      <div class="priceHot">${money(v.rev)}</div>
    </div>
  `).join('') : `<div class="small">Nessun dato.</div>`;

  const monthNames=['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
  const trend=[];
  for(let i=5;i>=0;i--){
    const d=new Date(curYear, curMonth-i, 1);
    const m=d.getMonth(), y=d.getFullYear();
    const rows=db.ordini.filter(o=>{ const od=new Date((o.data||'')+'T12:00:00'); return !isNaN(od)&&od.getMonth()===m&&od.getFullYear()===y; });
    trend.push({label:monthNames[m], value:rows.reduce((s,o)=>s+(orderPaidStatus(o)?orderMargin(o,db):0),0)});
  }
  document.getElementById('finTrendChart').innerHTML=renderBarChart(trend,true);

  const yearRows=[];
  for(let m=0;m<12;m++){
    const rows=db.ordini.filter(o=>{ const od=new Date((o.data||'')+'T12:00:00'); return !isNaN(od)&&od.getMonth()===m&&od.getFullYear()===curYear; });
    yearRows.push({label:monthNames[m]+' inc', value:rows.reduce((s,o)=>s+orderIncassato(o),0)});
    yearRows.push({label:monthNames[m]+' marg', value:rows.reduce((s,o)=>s+(orderPaidStatus(o)?orderMargin(o,db):0),0)});
  }
  document.getElementById('finYearChart').innerHTML=`<div class="smallGrid"><div class="mutedBox"><div class="k">Incassato mese corrente</div><div class="v">${money(incMonth)}</div><div class="small">Fatturato mese ${money(fattMonth)}</div></div><div class="mutedBox"><div class="k">Margine medio ordine</div><div class="v">${money(db.ordini.length ? profit/db.ordini.length : 0)}</div><div class="small">Su ${db.ordini.length} ordini</div></div></div>` + renderBarChart(yearRows,true);
  renderStorageInfo();
}

function renderAll(){ renderHome(); renderArt(); renderCli(); renderOrd(); renderFinanze(); }

/* ====== ART view/edit ====== */
let currentArtId=null;
async function openArtView(id){
  const db=loadDB(); const a=db.articoli.find(x=>x.id===id); if(!a) return;
  currentArtId=id;
  const pics=await getArticlePics(a);
  const hero=document.getElementById('vArtHero');
  const thumbs=document.getElementById('vArtThumbs');
  hero.src=pics[0]||''; hero.style.display=pics[0]?'block':'none';
  thumbs.innerHTML=pics.map(src=>`<img src="${src}" onclick="document.getElementById('vArtHero').src='${src}'"/>`).join('');
  document.getElementById('vArtCod').textContent=a.codice||'-';
  document.getElementById('vArtQual').textContent=qualityFromCode(a.codice)||'-';
  document.getElementById('vArtPrezzo').textContent=money(a.prezzoVendita||0);
  document.getElementById('vArtPrezzoUse').textContent=money(currentPrice(a));
  const pill=document.getElementById('vArtPromoPill');
  pill.innerHTML = promoValid(a)?`<div class="pill promo" style="margin-top:6px"><span class="dot"></span>PROMO attiva</div>`:(a.promoAttiva?`<div class="pill" style="margin-top:6px">PROMO impostata</div>`:'');
  document.getElementById('vArtPost').value=buildPost(a);
  fitTextarea(document.getElementById('vArtPost'));
  show('mArtView');
}
async function openArtEdit(id){
  const db=loadDB();
  const a=id?db.articoli.find(x=>x.id===id):null;
  currentArtId=id||null;
  document.getElementById('artEditTitle').textContent = a?'Modifica articolo':'Nuovo articolo';
  const set=(k,v)=>document.getElementById(k).value=(v===0?0:(v||''));

  if(!a){
    ['a_cod','a_brand','a_mod','a_cat','a_desc','a_forn','a_taglia','a_variante','a_colore','a_mis','a_usd','a_promo_price','a_promo_date','a_note','a_post','a_qual','a_eur','a_sell','a_final','a_margin','a_margin_pct']
    .forEach(fid => document.getElementById(fid).value='');
    document.getElementById('a_promo_on').checked=false;
    document.getElementById('a_photo').value='';
    renderArtPhotoPrev([]);
    show('mArtEdit');
    return;
  }
  set('a_cod', a?.codice); set('a_brand', a?.brand); set('a_mod', a?.modello);
  set('a_cat', a?.categoria); set('a_desc', a?.descrizione); set('a_forn', a?.fornitore);
  set('a_taglia', a?.taglia); set('a_variante', a?.variante); set('a_colore', a?.colore);
  set('a_mis', a?.misura); set('a_usd', a?.costoUsd||'');
  document.getElementById('a_promo_on').checked = !!a?.promoAttiva;
  set('a_promo_date', a?.scadenzaPromo); set('a_promo_price', a?.prezzoPromo||'');
  document.getElementById('a_note').value=a?.note||'';
  document.getElementById('a_post').value=a?.post||'';
  fitTextarea(document.getElementById('a_post'));
  document.getElementById('a_photo').value='';
  renderArtAutoFields();
  renderArtPhotoPrev(await getArticlePics(a));
  show('mArtEdit');
}
function renderArtPhotoPrev(pics){
  const box=document.getElementById('a_photo_prev');
  box.innerHTML=(pics||[]).map(src=>`<img src="${src}"/>`).join('');
}
function fitTextarea(el){
  if(!el) return;
  el.style.height='auto';
  el.style.height=Math.max(el.scrollHeight,96)+'px';
}
function initTextareaAutosize(ids){
  ids.forEach(id=>{
    const el=document.getElementById(id);
    if(!el || el.dataset.autoSized==='1') return;
    el.dataset.autoSized='1';
    ['input','focus','change'].forEach(evt=>el.addEventListener(evt,()=>fitTextarea(el)));
    fitTextarea(el);
  });
}
function setArticlePostAuto(text){
  const el=document.getElementById('a_post');
  if(!el) return;
  if(document.activeElement===el) return;
  const prevScroll=el.scrollTop;
  el.value=text;
  fitTextarea(el);
  el.scrollTop=prevScroll;
}
function renderArtAutoFields(){
  const code=document.getElementById('a_cod').value.trim();
  const usdRaw=document.getElementById('a_usd').value.trim();
  const hasCode=code!=='';
  const hasUsd=usdRaw!=='' && !Number.isNaN(Number(usdRaw));
  const qual=hasCode ? qualityFromCode(code) : '';
  document.getElementById('a_qual').value=qual||'';

  if(!hasCode && !hasUsd){
    document.getElementById('a_eur').value='';
    document.getElementById('a_sell').value='';
    document.getElementById('a_final').value='';
    document.getElementById('a_margin').value='';
    document.getElementById('a_margin_pct').textContent='';
    document.getElementById('a_post').value='';
    fitTextarea(document.getElementById('a_post'));
    return;
  }

  if(!hasUsd){
    document.getElementById('a_eur').value='';
    document.getElementById('a_sell').value='';
    document.getElementById('a_final').value='';
    document.getElementById('a_margin').value='';
    document.getElementById('a_margin_pct').textContent='';
    const draft={
      codice:code,
      brand:document.getElementById('a_brand').value.trim(),
      modello:document.getElementById('a_mod').value.trim(),
      promoAttiva:document.getElementById('a_promo_on').checked,
      prezzoPromo:Number(document.getElementById('a_promo_price').value||0),
      scadenzaPromo:document.getElementById('a_promo_date').value.trim(),
      prezzoVendita:0,
      misura:document.getElementById('a_mis').value.trim(),
      taglia:document.getElementById('a_taglia').value.trim(),
      variante:document.getElementById('a_variante').value.trim(),
      colore:document.getElementById('a_colore').value.trim(),
      descrizione:document.getElementById('a_desc').value.trim(),
      fornitore:document.getElementById('a_forn').value.trim(),
      materiale:'', colori:'', tracolla:'', scatola:false
    };
    setArticlePostAuto(buildPost(draft));
    return;
  }

  const usd=Number(usdRaw);
  if(usdRaw===''){ document.getElementById('a_eur').value=''; document.getElementById('a_sell').value=''; document.getElementById('a_final').value=''; document.getElementById('a_margin').value=''; document.getElementById('a_margin_pct').textContent=''; return; }
  const r=calcFromUsd(usd, qual);
  document.getElementById('a_eur').value = isFinite(r.costo)?money(r.costo):'';
  document.getElementById('a_sell').value = isFinite(r.sell)?String(r.sell):'';
  const promoOn=document.getElementById('a_promo_on').checked;
  const promoPrice=Number(document.getElementById('a_promo_price').value||0);
  const promoDate=document.getElementById('a_promo_date').value.trim();
  const a={codice:code, prezzoVendita:r.sell, promoAttiva:promoOn, prezzoPromo:promoPrice, scadenzaPromo:promoDate};
  const finalPrice = r.sell ? round5(currentPrice(a)) : 0;
  document.getElementById('a_final').value = finalPrice ? String(finalPrice) : '';
  const margin = Math.max(0, finalPrice - (Number(r.costo)||0));
  document.getElementById('a_margin').value = margin ? money(margin) : '';
  document.getElementById('a_margin_pct').textContent = (finalPrice && margin) ? ('Margine ' + Math.round((margin/finalPrice)*100) + '%') : '';
  // auto post
  const draft={
    codice:code, brand:document.getElementById('a_brand').value.trim(),
    modello:document.getElementById('a_mod').value.trim(),
    promoAttiva:promoOn, prezzoPromo:promoPrice, scadenzaPromo:promoDate,
    prezzoVendita:r.sell,
    misura:document.getElementById('a_mis').value.trim(),
    taglia:document.getElementById('a_taglia').value.trim(),
    variante:document.getElementById('a_variante').value.trim(),
    colore:document.getElementById('a_colore').value.trim(),
    descrizione:document.getElementById('a_desc').value.trim(),
    fornitore:document.getElementById('a_forn').value.trim(),
    materiale:'', colori:'', tracolla:'', scatola:false
  };
  setArticlePostAuto(buildPost(draft));
}

async function fileToDataURL(file){
  return new Promise((res,rej)=>{
    const r=new FileReader();
    r.onload=()=>res(r.result);
    r.onerror=()=>rej(r.error);
    r.readAsDataURL(file);
  });
}
async function compressImageFile(file,maxSide=1600,quality=0.78){
  const src=await fileToDataURL(file);
  return new Promise((res,rej)=>{
    const img=new Image();
    img.onload=()=>{
      let w=img.width,h=img.height;
      const scale=Math.min(1,maxSide/Math.max(w,h));
      w=Math.max(1,Math.round(w*scale));
      h=Math.max(1,Math.round(h*scale));
      const canvas=document.createElement('canvas');
      canvas.width=w; canvas.height=h;
      const ctx=canvas.getContext('2d');
      ctx.drawImage(img,0,0,w,h);
      let out=canvas.toDataURL('image/jpeg',quality);
      if(out.length>1600000) out=canvas.toDataURL('image/jpeg',0.62);
      res(out);
    };
    img.onerror=()=>rej(new Error('Impossibile leggere la foto selezionata'));
    img.src=src;
  });
}

async function saveArt(){
  try{
    const db=loadDB();
    const code=document.getElementById('a_cod').value.trim();
    if(!code){ toast('Codice articolo obbligatorio'); return; }

    const exists = db.articoli.find(a => 
      a.codice.toLowerCase() === code.toLowerCase() 
      && a.id !== currentArtId
    );
    if(exists){
      toast('Codice articolo già esistente');
      return;
    }
    const qual=qualityFromCode(code);
    const usd=Number(document.getElementById('a_usd').value||0);
    const r=calcFromUsd(usd, qual);
    const obj={
      id: currentArtId||uid(),
      codice: code,
      brand: document.getElementById('a_brand').value.trim(),
      modello: document.getElementById('a_mod').value.trim(),
      categoria: document.getElementById('a_cat').value.trim(),
      descrizione: document.getElementById('a_desc').value.trim(),
      fornitore: document.getElementById('a_forn').value.trim(),
      taglia: document.getElementById('a_taglia').value.trim(),
      variante: document.getElementById('a_variante').value.trim(),
      colore: document.getElementById('a_colore').value.trim(),
      misura: document.getElementById('a_mis').value.trim(),
      costoUsd: usd,
      costoEur: r.costo,
      prezzoVendita: r.sell,
      promoAttiva: document.getElementById('a_promo_on').checked,
      prezzoPromo: Number(document.getElementById('a_promo_price').value||0),
      scadenzaPromo: document.getElementById('a_promo_date').value.trim(),
      post: document.getElementById('a_post').value,
      note: document.getElementById('a_note').value,
      foto: [],
      photoIds: []
    };
    const old=currentArtId?db.articoli.find(x=>x.id===currentArtId):null;
    obj.photoIds = Array.isArray(old?.photoIds) ? old.photoIds.slice() : [];
    const f=document.getElementById('a_photo').files[0];
    if(f){
      const data=await compressImageFile(f);
      const pid='ph_'+uid();
      await idbSet(pid,data);
      obj.photoIds.unshift(pid);
      obj.photoIds=obj.photoIds.slice(0,6);
    }
    obj._ts=Date.now();
    const i=db.articoli.findIndex(x=>x.id===obj.id);
    if(i>=0) db.articoli[i]=obj; else db.articoli.unshift(obj);
    if(!saveDB(db)){
      const newPid = obj.photoIds?.[0];
      if(f && newPid && (!old || !Array.isArray(old.photoIds) || old.photoIds[0]!==newPid)) { try{ await idbDelete(newPid); }catch(_e){} }
      return;
    }
    if(cloudEnabled()){
      const saved=await cloudSaveOne('art', obj, db);
      const idx=db.articoli.findIndex(x=>x.id===obj.id || x.codice===obj.codice);
      if(idx>=0) db.articoli[idx]={...db.articoli[idx], ...saved, _ts: Date.now()};
      saveDBLocal(db);
    }
    hide('mArtEdit');
    toast(cloudEnabled() ? 'Salvato anche nel cloud' : 'Salvato');
  }catch(err){
    toast('Errore salvataggio articolo'); console.error(err);
  }
}
async function deleteArt(){
  if(!currentArtId) return hide('mArtEdit');
  
  const db=loadDB();
  const old=db.articoli.find(a=>a.id===currentArtId);
  for(const pid of (old?.photoIds||[])) await idbDelete(pid);
  db.articoli=db.articoli.filter(a=>a.id!==currentArtId);
  currentArtId=null;
  if(!saveDB(db)) return;
  if(old && cloudEnabled()) await cloudDeleteOne('art', old);
  hide('mArtEdit');
  renderArt();
  toast(cloudEnabled() ? 'Articolo eliminato anche dal cloud' : 'Articolo eliminato');
}

/* ====== CLIENTI ====== */
let currentCliId=null;
function openCliEdit(id){
  const db=loadDB(); const c=id?db.clienti.find(x=>x.id===id):null;
  currentCliId=id||null;
  document.getElementById('cliEditTitle').textContent=c?'Modifica cliente':'Nuovo cliente';
  document.getElementById('c_nome').value=c?.nome||'';
  document.getElementById('c_tel').value=c?.telefono||'';
  document.getElementById('c_ind').value=c?.indirizzo||'';
  document.getElementById('c_cap').value=c?.cap||'';
  document.getElementById('c_citta').value=c?.citta||'';
  document.getElementById('c_prov').value=c?.provincia||'';
  document.getElementById('c_note').value=c?.note||'';
  refreshClientShipping();
  show('mCliEdit');
}
async function saveCli(){
  const db=loadDB();
  const nome=document.getElementById('c_nome').value.trim();
  if(!nome){ toast('Nome obbligatorio'); return; }

  const exists = db.clienti.find(c =>
    c.nome.toLowerCase() === nome.toLowerCase()
    && c.id !== currentCliId
  );
  if(exists){
    toast('Cliente già esistente');
    return;
  }
  const obj={
    id: currentCliId||uid(),
    nome,
    telefono: document.getElementById('c_tel').value.trim(),
    indirizzo: document.getElementById('c_ind').value.trim(),
    cap: document.getElementById('c_cap').value.trim(),
    citta: document.getElementById('c_citta').value.trim(),
    provincia: document.getElementById('c_prov').value,
    note: document.getElementById('c_note').value,
    _ts: Date.now()
  };
  const i=db.clienti.findIndex(x=>x.id===obj.id);
  if(i>=0) db.clienti[i]=obj; else db.clienti.unshift(obj);
  if(!saveDB(db)) return;
  if(cloudEnabled()){
    const saved=await cloudSaveOne('cli', obj, db);
    const idx=db.clienti.findIndex(x=>x.id===obj.id || (obj.telefono && x.telefono===obj.telefono) || x.nome===obj.nome);
    if(idx>=0) db.clienti[idx]={...db.clienti[idx], ...saved, _ts: Date.now()};
    saveDBLocal(db);
  }
  hide('mCliEdit');
  toast(cloudEnabled() ? 'Salvato anche nel cloud' : 'Salvato');
}
async function deleteCli(){
  if(!currentCliId) return hide('mCliEdit');
  
  const db=loadDB();
  const old=db.clienti.find(c=>c.id===currentCliId);
  db.clienti=db.clienti.filter(c=>c.id!==currentCliId);
  if(!saveDB(db)) return;
  if(old && cloudEnabled()) await cloudDeleteOne('cli', old);
  hide('mCliEdit');
  toast(cloudEnabled() ? 'Cliente eliminato anche dal cloud' : 'Cliente eliminato');
}

/* ====== ORDINI ====== */
let currentOrdId=null;
let ordRows=[];
function openOrdEdit(id, prefillArticleId=null){
  const db=loadDB(); const o=id?db.ordini.find(x=>x.id===id):null;
  currentOrdId=id||null;
  document.getElementById('ordEditTitle').textContent=o?'Modifica ordine':'Nuovo ordine';
  document.getElementById('o_cli_q').value='';
  document.getElementById('o_art_q').value='';
  fillClientSelect(db);
  fillArtSelect(db);
  document.getElementById('o_cli').value=o?.clienteId||'';
  document.getElementById('o_stato').value=o?.stato||'Richiesto';
  document.getElementById('o_data').value=o?.data||todayStr();
  document.getElementById('o_note').value=o?.note||'';
  document.getElementById('o_art').value='';
  document.getElementById('o_price').value='';
  ordRows=(o?.righe||[]).slice();
  if(prefillArticleId){
    const a=db.articoli.find(x=>x.id===prefillArticleId);
    if(a && !ordRows.some(r=>r.articoloId===prefillArticleId)){
      ordRows.push({articoloId:a.id, codice:a?.codice||'', modello:a?.modello||'', prezzo:Number(currentPrice(a)||0)});
    }
  }
  renderOrdRows();
  updateOrderPriceFromSelection();
  show('mOrdEdit');
}
function todayStr(){
  const d=new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function fillClientSelect(db, filter=''){
  const sel=document.getElementById('o_cli');
  const q=filter.toLowerCase();
  const items=db.clienti.filter(c=>{
    const hay=(c.nome+' '+(c.telefono||'')+' '+(c.citta||'')).toLowerCase();
    return !q || hay.includes(q);
  });
  sel.innerHTML='<option value="">Seleziona</option>'+items.map(c=>`<option value="${c.id}">${esc(c.nome)} • ${esc(c.provincia||'')}</option>`).join('');
}
function fillArtSelect(db, filter=''){
  const sel=document.getElementById('o_art');
  const prev=Array.from(sel.selectedOptions||[]).map(o=>o.value);
  const q=filter.toLowerCase();
  const items=db.articoli.filter(a=>{
    const hay=((a.codice||'')+' '+(a.brand||'')+' '+(a.modello||'')+' '+(a.categoria||'')+' '+(a.descrizione||'')+' '+(a.colore||'')+' '+(a.taglia||'')+' '+(a.variante||'')).toLowerCase();
    return !q || hay.includes(q);
  });
  sel.innerHTML=items.map(a=>`<option value="${a.id}">${esc(a.brand||'')} ${esc(a.modello||'')} • ${esc(a.codice||'')}</option>`).join('');
  prev.forEach(v=>{ const opt=Array.from(sel.options).find(o=>o.value===v); if(opt) opt.selected=true; });
}
function selectedOrderArticleIds(){ return Array.from(document.getElementById('o_art').selectedOptions||[]).map(o=>o.value).filter(Boolean); }
function updateOrderPriceFromSelection(){
  const db=loadDB();
  const ids=selectedOrderArticleIds();
  const priceInput=document.getElementById('o_price');
  if(ids.length!==1){ if(ids.length===0) priceInput.value=''; return; }
  const a=db.articoli.find(x=>x.id===ids[0]);
  const price=currentPrice(a);
  priceInput.value = price ? String(price) : ''; 
}
function addRow(){
  const db=loadDB();
  const ids=selectedOrderArticleIds();
  if(!ids.length){ toast('Seleziona almeno un articolo'); return; }
  const manual=Number(document.getElementById('o_price').value||0);
  ids.forEach((artId,idx)=>{
    const a=db.articoli.find(x=>x.id===artId);
    if(!a) return;
    if(ordRows.some(r=>r.articoloId===artId)) return;
    const prezzo=(ids.length===1 && manual>0) ? manual : Number(currentPrice(a)||0);
    ordRows.push({articoloId:artId, codice:a?.codice||'', modello:a?.modello||'', prezzo});
  });
  Array.from(document.getElementById('o_art').options).forEach(o=>o.selected=false);
  document.getElementById('o_art_q').value='';
  document.getElementById('o_price').value='';
  fillArtSelect(db);
  renderOrdRows();
}
function renderOrdRows(){
  const box=document.getElementById('o_rows');
  box.innerHTML=ordRows.map((r,i)=>`<div class="row" style="grid-template-columns:1fr auto">
    <div><div class="t">${esc(r.codice)} • ${esc(r.modello)}</div><div class="s">${money(r.prezzo||0)}</div></div>
    <button class="btn danger" data-action="delRow" data-i="${i}">X</button>
  </div>`).join('') || `<div class="small">Nessuna riga</div>`;
  const tot=ordRows.reduce((s,r)=>s+Number(r.prezzo||0),0);
  document.getElementById('o_tot').textContent=money(tot);
}
async function saveOrd(){
  const db=loadDB();
  const cli=document.getElementById('o_cli').value;
  if(!cli){ toast('Seleziona un cliente'); return; }
  if(!ordRows.length){ toast('Aggiungi almeno una riga'); return; }
  const tot=ordRows.reduce((s,r)=>s+Number(r.prezzo||0),0);
  const obj={
    id: currentOrdId||('ORD-'+uid().slice(0,6).toUpperCase()),
    clienteId: cli,
    stato: document.getElementById('o_stato').value,
    data: document.getElementById('o_data').value.trim()||todayStr(),
    note: document.getElementById('o_note').value.trim(),
    righe: ordRows.slice(),
    totale: tot,
    _ts: Date.now()
  };
  const i=db.ordini.findIndex(x=>x.id===obj.id);
  if(i>=0) db.ordini[i]=obj; else db.ordini.unshift(obj);
  if(!saveDB(db)) return;
  if(cloudEnabled()){
    const saved=await cloudSaveOne('ord', obj, db);
    const idx=db.ordini.findIndex(x=>x.id===obj.id || x.id===saved?.id);
    if(idx>=0) db.ordini[idx]={...db.ordini[idx], ...saved, _ts: Date.now()};
    saveDBLocal(db);
  }
  hide('mOrdEdit');
  toast(cloudEnabled() ? 'Salvato anche nel cloud' : 'Salvato');
}
async function deleteOrd(){
  if(!currentOrdId) return hide('mOrdEdit');
  
  const db=loadDB();
  const old=db.ordini.find(o=>o.id===currentOrdId);
  db.ordini=db.ordini.filter(o=>o.id!==currentOrdId);
  if(!saveDB(db)) return;
  if(old && cloudEnabled()) await cloudDeleteOne('ord', old);
  hide('mOrdEdit');
  toast(cloudEnabled() ? 'Ordine eliminato anche dal cloud' : 'Ordine eliminato');
}

/* ====== IMPORT/EXPORT ====== */
async function exportDB(mode){
  const db=loadDB();
  const out=JSON.parse(JSON.stringify(db));
  for(const art of out.articoli){
    if(mode==='lite') art.foto=[];
    else art.foto=await getArticlePics(art);
  }
  out.exportedAt=new Date().toISOString();
  const blob=new Blob([JSON.stringify(out,null,2)],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=`vanity_glamour_${mode}_${Date.now()}.json`;
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1500);
  document.getElementById('importHint').textContent = `Export fatto (${mode}). Database esportato correttamente.`;
}
function importDB(file){
  const r=new FileReader();
  r.onload=async()=>{
    try{
      const o=JSON.parse(r.result);
      if(!o || !Array.isArray(o.articoli)||!Array.isArray(o.clienti)||!Array.isArray(o.ordini)) throw new Error('JSON non compatibile');
      for(const art of o.articoli){
        art.photoIds=[];
        if(Array.isArray(art.foto) && art.foto.length){
          for(const src of art.foto.slice(0,6)){
            const pid='ph_'+uid();
            await idbSet(pid,src);
            art.photoIds.push(pid);
          }
        }
        art.foto=[];
      }
      localStorage.setItem(KEY, JSON.stringify(o));
      renderAll();
      document.getElementById('importHint').textContent = 'Import OK. Database ricaricato con foto su IndexedDB.';
      toast('Import OK');
    }catch(e){
      toast('Import fallito'); console.error(e);
    }
  };
  r.readAsText(file);
}

/* ====== EVENTS ====== */
document.addEventListener('click',(ev)=>{
  const el=ev.target.closest('[data-action],[data-go],[data-open]');
  if(!el) return;
  if(el.dataset.go){ ev.preventDefault(); go(el.dataset.go); return; }
  if(el.dataset.open){
    const id=el.dataset.id;
    if(el.dataset.open==='art') openArtView(id);
    if(el.dataset.open==='cli') openCliEdit(id);
    if(el.dataset.open==='ord') openOrdEdit(id);
    return;
  }
  const a=el.dataset.action;
  if(a==='newArt') return openArtEdit(null);
  if(a==='newCli') return openCliEdit(null);
  if(a==='newOrd') return openOrdEdit(null);
  if(a==='exportFull') return exportDB('full');
  if(a==='exportLite') return exportDB('lite');
  if(a==='refreshDiag'){ renderDiagnostics(); toast('Diagnostica aggiornata'); return; }
  if(a==='repairArchive'){
    askConfirm('Riparo archivio foto e pulizia riferimenti sporchi?', ()=>repairArchive().then(()=>toast('Archivio riparato')).catch(err=>{toast('Riparazione fallita'); console.error(err);}),'Ripara archivio');
    return;
  }
  if(a==='hardReset'){ askConfirm('Azzero tutti i dati locali di questa app?', ()=>{ [KEY, ...(typeof LEGACY_KEYS!=='undefined'?LEGACY_KEYS:[])].forEach(k=>localStorage.removeItem(k)); location.reload(); }, 'Reset locale'); return; }
  if(a==='copyPost') return copyTextFrom(document.getElementById('vArtPost'));
  if(a==='copyCliShip') return copyTextFrom(document.getElementById('c_ship'));
  if(a==='addArtToOrder'){ const id=el.dataset.id; if(id) return openOrdEdit(null, id); return; }
  if(a==='addArtToOrderFromView'){ if(currentArtId) { hide('mArtView'); return openOrdEdit(null, currentArtId); } return; }
  if(a==='editFromView'){ hide('mArtView'); return openArtEdit(currentArtId); }
  if(a==='closeView') return hide('mArtView');
  if(a==='closeEdit') return hide('mArtEdit');
  if(a==='saveArt') return saveArt();
  if(a==='deleteArt') return deleteArt();
  if(a==='saveCli') return saveCli();
  if(a==='closeCli') return hide('mCliEdit');
  if(a==='deleteCli') return deleteCli();
  if(a==='saveOrd') return saveOrd();
  if(a==='closeOrd') return hide('mOrdEdit');
  if(a==='deleteOrd') return deleteOrd();
  if(a==='addRow') return addRow();
  if(a==='cloudPull'){ document.getElementById('cloudSyncMini')?.classList.remove('show'); return pullCloudToLocal().catch(err=>{toast('Sync cloud fallita'); console.error(err);}); }
  if(a==='cloudPush'){ document.getElementById('cloudSyncMini')?.classList.remove('show'); return pushLocalToCloud().catch(err=>{toast('Sync cloud fallita'); console.error(err);}); }
  if(a==='doCloudLogin') return cloudLogin();
  if(a==='closeCloudLogin') return hide('mCloudLogin');
  if(a==='confirmYes') return closeConfirm(true);
  if(a==='confirmNo') return closeConfirm(false);
  if(a==='delRow'){ const i=Number(el.dataset.i); ordRows.splice(i,1); renderOrdRows(); return; }
});

document.getElementById('qArt').addEventListener('input', renderArt);
document.getElementById('qCli').addEventListener('input', renderCli);
['c_nome','c_tel','c_ind','c_cap','c_citta','c_prov'].forEach(id=>{ const el=document.getElementById(id); if(el) el.addEventListener('input', refreshClientShipping); if(el) el.addEventListener('change', refreshClientShipping); });
document.getElementById('qOrd').addEventListener('input', renderOrd);

['a_cod','a_brand','a_mod','a_mis','a_usd','a_promo_on','a_promo_price','a_promo_date','a_forn','a_desc','a_taglia','a_variante','a_colore'].forEach(id=>{
  const el=document.getElementById(id);
  el.addEventListener(id==='a_promo_on'?'change':'input', renderArtAutoFields);
});

document.getElementById('o_cli_q').addEventListener('input',()=>fillClientSelect(loadDB(), document.getElementById('o_cli_q').value));
document.getElementById('o_art_q').addEventListener('input',()=>{
  fillArtSelect(loadDB(), document.getElementById('o_art_q').value);
  updateOrderPriceFromSelection();
});
document.getElementById('o_art').addEventListener('change', updateOrderPriceFromSelection);

document.getElementById('importFile').addEventListener('change',(e)=>{
  const f=e.target.files[0];
  if(f) importDB(f);
  e.target.value='';
});
document.getElementById('btnCloudLogin')?.addEventListener('click', ()=>show('mCloudLogin'));
document.getElementById('btnCloudLogout')?.addEventListener('click', cloudLogout);
document.getElementById('btnCloudSync')?.addEventListener('click', ()=>{ if(!cloudSession){ toast('Prima fai login cloud'); return; } toggleCloudSyncMini(); });

// Province select
const provSel=document.getElementById('c_prov');
provSel.innerHTML='<option value="">Seleziona</option>'+PROVINCE.map(p=>`<option value="${p}">${p}</option>`).join('');

/* ====== CLOUD / SUPABASE ====== */
let cloudClient=null;
let cloudSession=null;
let cloudBusy=false;
const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUuid=v=>UUID_RE.test(String(v||''));
function cloudUi(){
  const s=document.getElementById('cloudState');
  const bIn=document.getElementById('btnCloudLogin');
  const bSync=document.getElementById('btnCloudSync');
  const bOut=document.getElementById('btnCloudLogout');
  if(!s||!bIn||!bSync||!bOut) return;
  const logged=!!cloudSession;
  const hide=(el,on)=>{ el.hidden=!!on; el.style.display=on?'none':''; };
  if(!window.VG_SUPABASE_READY){
    s.textContent='Cloud';
    hide(bIn,true); hide(bSync,true); hide(bOut,true);
    return;
  }
  if(cloudBusy){ s.textContent='Cloud'; }
  else if(cloudSession?.user?.email){ s.textContent='Cloud'; }
  else { s.textContent='Cloud'; }
  hide(bIn,logged);
  hide(bSync,!logged);
  hide(bOut,!logged);
}
function cloudEnabled(){ return !!(window.VG_SUPABASE_READY && cloudSession); }
async function cloudSaveOne(type, payload, dbRef){
  if(!cloudEnabled()) return payload;
  cloudBusy=true; cloudUi();
  try{
    if(type==='art') return await upsertCloudArticle(payload);
    if(type==='cli') return await upsertCloudClient(payload);
    if(type==='ord') return await upsertCloudOrder(payload, dbRef||loadDB());
    return payload;
  }finally{
    cloudBusy=false; cloudUi();
  }
}
async function cloudDeleteOne(type, payload){
  if(!cloudEnabled() || !payload) return;
  cloudBusy=true; cloudUi();
  try{
    if(type==='art') return await deleteCloudArticle(payload);
    if(type==='cli') return await deleteCloudClient(payload);
    if(type==='ord') return await deleteCloudOrder(payload);
  }finally{
    cloudBusy=false; cloudUi();
  }
}
async function ensureCloud(){
  if(cloudClient) return cloudClient;
  if(!window.VG_SUPABASE_READY) return null;
  cloudClient=await window.VG_SUPABASE_READY;
  const {data:{session}}=await cloudClient.auth.getSession();
  cloudSession=session||null;
  cloudClient.auth.onAuthStateChange((_e,session)=>{ cloudSession=session||null; cloudUi(); });
  cloudUi();
  return cloudClient;
}
function saveDBLocal(db){
  try{ localStorage.setItem(KEY, JSON.stringify(db)); }catch(err){ console.error(err); }
}
async function ensureCategoryId(nome){
  if(!nome) return null;
  const sb=await ensureCloud();
  if(!sb||!cloudSession) return null;
  const {data,error}=await sb.from('categorie').upsert({nome:String(nome).trim()},{onConflict:'nome'}).select('id,nome').single();
  if(error) throw error;
  return data?.id||null;
}
async function upsertCloudArticle(art){
  const sb=await ensureCloud();
  if(!sb||!cloudSession) return art;
  const categoria_id=await ensureCategoryId(art.categoria||'');
  const payload={
    sku: art.codice||null,
    nome: [art.brand, art.modello].filter(Boolean).join(' ').trim() || art.modello || art.codice || 'Articolo',
    descrizione: art.descrizione || art.note || null,
    categoria_id,
    marca: art.brand || null,
    colore: art.colore || null,
    taglia: art.taglia || null,
    materiale: art.variante || art.misura || null,
    prezzo_acquisto: Number(art.costoEur || 0),
    prezzo_vendita: Number(art.prezzoVendita || 0),
    giacenza: 0,
    attivo: true
  };
  if(isUuid(art.id)) payload.id=art.id;
  const {data,error}=await sb.from('prodotti').upsert(payload,{onConflict:'sku'}).select('*').single();
  if(error) throw error;
  return {...art, id:data.id, _cloud:true};
}
async function deleteCloudArticle(art){
  const sb=await ensureCloud();
  if(!sb||!cloudSession) return;
  if(isUuid(art?.id)){
    const {error}=await sb.from('prodotti').delete().eq('id', art.id);
    if(error) throw error;
  }else if(art?.codice){
    const {error}=await sb.from('prodotti').delete().eq('sku', art.codice);
    if(error) throw error;
  }
}
async function upsertCloudClient(cli){
  const sb=await ensureCloud();
  if(!sb||!cloudSession) return cli;
  const payload={
    nome: cli.nome || 'Cliente',
    cognome: null,
    telefono: cli.telefono || null,
    email: cli.email || null,
    indirizzo: cli.indirizzo || null,
    citta: cli.citta || null,
    cap: cli.cap || null,
    provincia: cli.provincia || null,
    paese: 'Italia',
    note: cli.note || null
  };
  let data=null, error=null;
  if(isUuid(cli.id)){
    ({data,error}=await sb.from('clienti').upsert({...payload,id:cli.id}).select('*').single());
  }else{
    ({data,error}=await sb.from('clienti').insert(payload).select('*').single());
  }
  if(error) throw error;
  return {...cli, id:data.id, _cloud:true};
}
async function deleteCloudClient(cli){
  const sb=await ensureCloud();
  if(!sb||!cloudSession||!isUuid(cli?.id)) return;
  const {error}=await sb.from('clienti').delete().eq('id', cli.id);
  if(error) throw error;
}
async function upsertCloudOrder(ord, db){
  const sb=await ensureCloud();
  if(!sb||!cloudSession) return ord;
  let clienteId=ord.clienteId;
  if(!isUuid(clienteId)){
    const localCli=(db.clienti||[]).find(c=>c.id===clienteId);
    if(localCli){
      const savedCli=await upsertCloudClient(localCli);
      clienteId=savedCli.id;
      const ci=db.clienti.findIndex(c=>c.id===localCli.id);
      if(ci>=0) db.clienti[ci]=savedCli;
    }
  }
  if(!isUuid(clienteId)) throw new Error('Cliente ordine non sincronizzato');
  const payload={
    numero_ordine: ord.numeroOrdine || (isUuid(ord.id)?('VGAPP-'+ord.id.slice(0,8)):String(ord.id||'VGAPP-'+uid().slice(0,6)).slice(0,50)),
    cliente_id: clienteId,
    data_ordine: ord.data || todayStr(),
    stato: (ord.stato||'Richiesto').toLowerCase().includes('conseg') ? 'consegnato' : ((ord.stato||'').toLowerCase().includes('sped') ? 'spedito' : ((ord.stato||'').toLowerCase().includes('ann') ? 'annullato' : 'in_lavorazione')),
    totale: Number(ord.totale || 0),
    pagato: true,
    note: ord.note || null
  };
  if(isUuid(ord.id)) payload.id=ord.id;
  const {data,error}=await sb.from('ordini').upsert(payload,{onConflict:'numero_ordine'}).select('*').single();
  if(error) throw error;
  const ordineId=data.id;
  const {error:delErr}=await sb.from('righe_ordine').delete().eq('ordine_id', ordineId);
  if(delErr) throw delErr;
  const righe=[];
  for(const r of (ord.righe||[])){
    let prodottoId=r.articoloId;
    if(!isUuid(prodottoId)){
      const localArt=(db.articoli||[]).find(a=>a.id===r.articoloId || a.codice===r.codice);
      if(localArt){
        const savedArt=await upsertCloudArticle(localArt);
        prodottoId=savedArt.id;
        const ai=db.articoli.findIndex(a=>a.id===localArt.id);
        if(ai>=0) db.articoli[ai]=savedArt;
      }
    }
    if(!isUuid(prodottoId)) continue;
    righe.push({ordine_id:ordineId, prodotto_id:prodottoId, quantita:1, prezzo_unitario:Number(r.prezzo||0), sconto:0});
  }
  if(righe.length){
    const {error:righeErr}=await sb.from('righe_ordine').insert(righe);
    if(righeErr) throw righeErr;
  }
  return {...ord, id:ordineId, clienteId, numeroOrdine:data.numero_ordine, _cloud:true};
}
async function deleteCloudOrder(ord){
  const sb=await ensureCloud();
  if(!sb||!cloudSession) return;
  let error=null;
  if(isUuid(ord?.id)) ({error}=await sb.from('ordini').delete().eq('id', ord.id));
  else ({error}=await sb.from('ordini').delete().eq('numero_ordine', String(ord?.id||'')));
  if(error) throw error;
}
async function pullCloudToLocal(){
  const sb=await ensureCloud();
  if(!sb||!cloudSession) throw new Error('Login cloud mancante');
  cloudBusy=true; cloudUi();
  try{
    const [{data:cats,error:catsErr},{data:prod,error:prodErr},{data:cli,error:cliErr},{data:ord,error:ordErr},{data:righe,error:righeErr}] = await Promise.all([
      sb.from('categorie').select('id,nome'),
      sb.from('prodotti').select('*').order('created_at',{ascending:false}),
      sb.from('clienti').select('*').order('created_at',{ascending:false}),
      sb.from('ordini').select('*').order('data_ordine',{ascending:false}),
      sb.from('righe_ordine').select('ordine_id,prodotto_id,prezzo_unitario,prodotti(id,sku,nome)')
    ]);
    if(catsErr||prodErr||cliErr||ordErr||righeErr) throw (catsErr||prodErr||cliErr||ordErr||righeErr);
    const catMap=new Map((cats||[]).map(c=>[c.id,c.nome]));
    const prodMap=new Map((prod||[]).map(p=>[p.id,p]));
    const righeByOrd=new Map();
    (righe||[]).forEach(r=>{
      const arr=righeByOrd.get(r.ordine_id)||[];
      arr.push({articoloId:r.prodotto_id,codice:r.prodotti?.sku||prodMap.get(r.prodotto_id)?.sku||'',modello:r.prodotti?.nome||prodMap.get(r.prodotto_id)?.nome||'',prezzo:Number(r.prezzo_unitario||0)});
      righeByOrd.set(r.ordine_id,arr);
    });
    const db={version:'v6',createdAt:new Date().toISOString(),
      articoli:(prod||[]).map(p=>({id:p.id,codice:p.sku||'',brand:p.marca||'',modello:p.nome||'',categoria:catMap.get(p.categoria_id)||'',descrizione:p.descrizione||'',fornitore:'',taglia:p.taglia||'',variante:p.materiale||'',colore:p.colore||'',misura:'',costoUsd:0,costoEur:Number(p.prezzo_acquisto||0),prezzoVendita:Number(p.prezzo_vendita||0),promoAttiva:false,prezzoPromo:0,scadenzaPromo:'',post:'',note:'',foto:[],photoIds:[],_ts:Date.now(),_cloud:true})),
      clienti:(cli||[]).map(c=>({id:c.id,nome:[c.nome,c.cognome].filter(Boolean).join(' ').trim(),telefono:c.telefono||'',indirizzo:c.indirizzo||'',cap:c.cap||'',citta:c.citta||'',provincia:c.provincia||'',note:c.note||'',_ts:Date.now(),_cloud:true})),
      ordini:(ord||[]).map(o=>({id:o.id,numeroOrdine:o.numero_ordine,clienteId:o.cliente_id,stato:o.stato==='in_lavorazione'?'Richiesto':(o.stato==='spedito'?'Spedito':(o.stato==='consegnato'?'Consegnato':'Annullato')),data:o.data_ordine||todayStr(),note:o.note||'',righe:righeByOrd.get(o.id)||[],totale:Number(o.totale||0),_ts:Date.now(),_cloud:true}))
    };
    saveDBLocal(db);
    renderAll();
    renderDiagnostics();
    toast('Dati cloud caricati');
  } finally { cloudBusy=false; cloudUi(); }
}
async function pushLocalToCloud(){
  const sb=await ensureCloud();
  if(!sb||!cloudSession) throw new Error('Login cloud mancante');
  cloudBusy=true; cloudUi();
  try{
    const db=loadDB();
    for(let i=0;i<db.articoli.length;i++) db.articoli[i]=await upsertCloudArticle(db.articoli[i]);
    for(let i=0;i<db.clienti.length;i++) db.clienti[i]=await upsertCloudClient(db.clienti[i]);
    for(let i=0;i<db.ordini.length;i++) db.ordini[i]=await upsertCloudOrder(db.ordini[i], db);
    saveDBLocal(db);
    renderAll();
    renderDiagnostics();
    toast('Dati locali mandati nel cloud');
  } finally { cloudBusy=false; cloudUi(); }
}
async function cloudLogin(){
  try{
    const sb=await ensureCloud();
    if(!sb){ toast('Supabase non disponibile'); return; }
    const email=document.getElementById('cloudEmail')?.value.trim();
    const password=document.getElementById('cloudPassword')?.value||'';
    if(!email || !password){ toast('Inserisci email e password'); return; }
    cloudBusy=true; cloudUi();
    const {data,error}=await sb.auth.signInWithPassword({email,password});
    if(error) throw error;
    cloudSession=data.session||null;
    hide('mCloudLogin');
    document.getElementById('cloudPassword').value='';
    cloudUi();
    toast('Login cloud riuscito');
  }catch(err){ toast('Login cloud fallito'); console.error(err); }
  finally{ cloudBusy=false; cloudUi(); }
}
async function cloudLogout(){
  try{
    const sb=await ensureCloud(); if(!sb) return;
    await sb.auth.signOut(); cloudSession=null; cloudUi(); toast('Cloud scollegato');
  }catch(err){ toast('Logout cloud fallito'); console.error(err); }
}

/* init */
renderAll();
renderDiagnostics();
const initial=location.hash.replace('#','')||'home';
history.replaceState({page:initial},'', '#'+initial);
go(initial,false);
cloudUi();
ensureCloud().catch(err=>console.warn('Cloud init fallita', err));
