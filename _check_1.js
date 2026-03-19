
/* ====== DB ====== */
const KEY='vg_db_full_v6';
const LEGACY_KEYS=['vg_db_full_v5','vg_v7_web','vanity_glamour_v9_db'];
const PHOTO_DB='vg_photos_v1';
const PHOTO_STORE='photos';
const PROVINCE=[ "AG","AL","AN","AO","AP","AQ","AR","AT","AV","BA","BG","BI","BL","BN","BO","BR","BS","BT","BZ","CA","CB","CE","CH","CL","CN","CO","CR","CS","CT","CZ","EN","FC","FE","FG","FI","FM","FR","GE","GO","GR","IM","IS","KR","LC","LE","LI","LO","LT","LU","MB","MC","ME","MI","MN","MO","MS","MT","NA","NO","NU","OR","PA","PC","PD","PE","PG","PI","PN","PO","PR","PT","PU","PV","PZ","RA","RC","RE","RG","RI","RM","RN","RO","SA","SI","SO","SP","SR","SS","SU","SV","TA","TE","TN","TO","TP","TR","TS","TV","UD","VA","VB","VC","VE","VI","VR","VT","VV" ];
const uid=()=>Math.random().toString(36).slice(2,10)+Date.now().toString(36);
const esc=s=>String(s??'').replace(/[&<>"]/g,m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[m]));
const money=n=>Number(n||0).toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2});
const round5=n=>Math.round(n/5)*5;

function defDB(){
  return {version:'v6.5',articoli:[],clienti:[],ordini:[],categorie:[],brands:[],createdAt:new Date().toISOString()};
}
function normalizeDBShape(o){
  if(!o || typeof o!=='object') return defDB();
  const db={
    version:o.version||'v6',
    articoli:Array.isArray(o.articoli)?o.articoli:[],
    clienti:Array.isArray(o.clienti)?o.clienti:[],
    ordini:Array.isArray(o.ordini)?o.ordini:[],
    categorie:Array.isArray(o.categorie)?o.categorie:[],
    brands:Array.isArray(o.brands)?o.brands:[],
    createdAt:o.createdAt||new Date().toISOString()
  };
  db.articoli=db.articoli.map(x=>({
    ...x,
    codice:normalizeSpaceText(x?.codice||x?.sku||''),
    brand:normalizeSpaceText(x?.brand||x?.marca||''),
    categoria:normalizeSpaceText(x?.categoria||''),
    costoUsd:firstFiniteNumber(x?.costoUsd, x?.costoUSD, x?.usd, 0),
    costoEur:firstFiniteNumber(x?.costoEur, x?.costoEUR, x?.prezzo_acquisto, x?.costo, x?.costo_eur, 0),
    prezzoVendita:firstFiniteNumber(x?.prezzoVendita, x?.prezzo_vendita, x?.prezzo, x?.prezzo_vendita_iva, 0),
    promoAttiva:(typeof x?.promoAttiva==='boolean') ? x.promoAttiva : !!x?.promo_on,
    prezzoPromo:firstFiniteNumber(x?.prezzoPromo, x?.promoPrezzo, x?.promo_price, 0),
    scadenzaPromo:normalizeSpaceText(x?.scadenzaPromo||x?.promoScadenza||x?.promo_date||''),
    foto:Array.isArray(x?.foto)?x.foto.filter(Boolean).slice(0,6):[],
    photoIds:Array.isArray(x?.photoIds)?x.photoIds.filter(Boolean).slice(0,6):[]
  }));
  db.clienti=db.clienti.map(x=>({
    ...x,
    nome:normalizeSpaceText(x?.nome||x?.name||''),
    cognome:normalizeSpaceText(x?.cognome||x?.surname||''),
    telefono:normalizePhone(x?.telefono||x?.tel||x?.phone||''),
    email:normalizeEmail(x?.email||''),
    indirizzo:normalizeSpaceText(x?.indirizzo||x?.address||''),
    cap:normalizeSpaceText(x?.cap||''),
    citta:normalizeSpaceText(x?.citta||x?.city||''),
    provincia:normalizeSpaceText(x?.provincia||x?.province||''),
    note:typeof x?.note==='string'?x.note:(x?.note||'')
  }));
  db.ordini=db.ordini.map(x=>{
    const righe=Array.isArray(x?.righe)?x.righe.map(r=>({
      ...r,
      articoloId:String(r?.articoloId||''),
      codice:normalizeSpaceText(r?.codice||r?.sku||''),
      modello:normalizeSpaceText(r?.modello||r?.nome||''),
      prezzo:Number(r?.prezzo||r?.prezzo_unitario||0),
      sconto:Number(r?.sconto||0)
    })):[];
    const scontoCliente=calcOrderDiscount(x);
    const subTotale=calcOrderSubtotal(righe);
    const totalValue=Number(x?.totale);
    return {
      ...x,
      numeroOrdine:ensureOrderNumber(x),
      clienteId:String(x?.clienteId||''),
      righe,
      foto:Array.isArray(x?.foto)?x.foto.filter(Boolean).slice(0,12):[],
      fotoManuali:Array.isArray(x?.fotoManuali)?x.fotoManuali.filter(Boolean).slice(0,12):[],
      fotoArticoli:Array.isArray(x?.fotoArticoli)?x.fotoArticoli.filter(Boolean).slice(0,12):[],
      orderPhotoIds:Array.isArray(x?.orderPhotoIds)?x.orderPhotoIds.filter(Boolean).slice(0,12):[],
      scontoCliente,
      subTotale,
      totale:(totalValue>0 || subTotale===0) ? totalValue : calcOrderNetTotal(righe, scontoCliente),
      incassato:Number(x?.incassato||0)
    };
  });

  const artDedup=dedupeArticoliWithMap(db.articoli||[]);
  db.articoli=artDedup.items;

  db.clienti=db.clienti.map(c=>({...c, nome:normalizeClientDisplayName(c)}));
  const cliDedup=dedupeClientiWithMap(db.clienti||[]);
  db.clienti=cliDedup.items.map(c=>({...c, nome:normalizeClientDisplayName(c)}));

  db.ordini=db.ordini.map(o=>({
    ...o,
    numeroOrdine:ensureOrderNumber(o),
    clienteId:cliDedup.idMap.get(String(o?.clienteId||'')) || String(o?.clienteId||''),
    righe:(Array.isArray(o?.righe)?o.righe:[]).map(r=>({
      ...r,
      articoloId:artDedup.idMap.get(String(r?.articoloId||'')) || String(r?.articoloId||''),
      codice:normalizeSpaceText(r?.codice||r?.sku||''),
      modello:normalizeSpaceText(r?.modello||r?.nome||''),
      prezzo:Number(r?.prezzo||r?.prezzo_unitario||0)
    }))
  }));
  const ordDedup=dedupeOrdiniWithMap(db.ordini||[]);
  db.ordini=ordDedup.items.map(o=>({
    ...o,
    numeroOrdine:ensureOrderNumber(o),
    righe:Array.isArray(o?.righe)?o.righe:[]
  }));

  db.categorie=[...new Set((db.categorie||[]).map(x=>normalizeSpaceText(x)).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'it',{sensitivity:'base'}));
  db.brands=[...new Set((db.brands||[]).map(x=>normalizeSpaceText(x)).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'it',{sensitivity:'base'}));
  return db;
}

function normalizeSpaceText(v){ return String(v==null?'':v).trim().replace(/\s+/g,' '); }
function normalizeTextKey(v){ return normalizeSpaceText(v).toLowerCase(); }
function normalizePhone(v){
  let out=normalizeSpaceText(v).replace(/[^\d+]/g,'');
  if(out.startsWith('00')) out='+'+out.slice(2);
  if(out.startsWith('+39')) out=out.slice(3);
  else if(out.startsWith('39') && out.length>=11) out=out.slice(2);
  return out;
}
function normalizeEmail(v){ return normalizeTextKey(v); }
function looksLikeUuid(v){ return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v||'')); }
function choosePreferredId(){
  const ids=Array.from(arguments).flat().map(v=>normalizeSpaceText(v)).filter(Boolean);
  return ids.find(looksLikeUuid) || ids[0] || '';
}
function recordRichnessScore(rec){
  let score=Number(rec?._ts||0);
  if(!rec || typeof rec!=='object') return score;
  Object.entries(rec).forEach(([k,v])=>{
    if(k==='_ts') return;
    if(Array.isArray(v)) score += v.filter(Boolean).length * 4;
    else if(v && typeof v==='object') score += 3;
    else if(typeof v==='number') score += Number.isFinite(v) ? 2 : 0;
    else if(normalizeSpaceText(v)) score += 1;
  });
  return score;
}
function normalizeClientDisplayName(x){
  const nome=normalizeSpaceText(x?.nome||x?.name||x?.nomeCompleto||'');
  const cognome=normalizeSpaceText(x?.cognome||x?.surname||'');
  if(nome && cognome){
    const cognKey=normalizeTextKey(cognome);
    const nomeKey=normalizeTextKey(nome);
    if(nomeKey===cognKey || nomeKey.endsWith(' '+cognKey)) return nome;
    return `${nome} ${cognome}`.trim();
  }
  return nome || cognome;
}
function splitClientNameForCloud(cli){
  const full=normalizeClientDisplayName(cli) || 'Cliente';
  const explicitSurname=normalizeSpaceText(cli?.cognome||'');
  if(explicitSurname){
    let rawName=normalizeSpaceText(cli?.nome||'');
    const tailKey=normalizeTextKey(rawName.split(' ').slice(-explicitSurname.split(' ').length).join(' '));
    if(tailKey && tailKey===normalizeTextKey(explicitSurname)) rawName=normalizeSpaceText(rawName.slice(0, Math.max(0, rawName.length-explicitSurname.length)));
    return { nome: rawName || full, cognome: explicitSurname };
  }
  const parts=full.split(' ').filter(Boolean);
  if(parts.length>=2) return { nome: parts.slice(0,-1).join(' '), cognome: parts.slice(-1).join(' ') };
  return { nome: full, cognome: '' };
}

function normalizeClientDedupKey(x){
  const full=normalizeTextKey(normalizeClientDisplayName(x));
  const telefono=normalizePhone(x?.telefono||x?.tel||x?.phone||'');
  const email=normalizeEmail(x?.email||'');
  const citta=normalizeTextKey(x?.citta||x?.city||'');
  const cap=normalizeTextKey(x?.cap||'');
  const indirizzo=normalizeTextKey(x?.indirizzo||x?.address||'');
  if(email) return `email|${email}`;
  if(telefono && telefono.replace(/\D/g,'').length>=6) return `tel|${telefono}`;
  if(full) return `name|${full}|${citta}|${cap}|${indirizzo}`;
  return '';
}
function mergeClientRecords(prev,item){
  if(!prev) return {
    ...item,
    id:choosePreferredId(item?.id),
    nome:normalizeClientDisplayName(item),
    cognome:normalizeSpaceText(item?.cognome||''),
    telefono:normalizePhone(item?.telefono||item?.tel||item?.phone||''),
    email:normalizeEmail(item?.email||''),
    indirizzo:normalizeSpaceText(item?.indirizzo||item?.address||''),
    cap:normalizeSpaceText(item?.cap||''),
    citta:normalizeSpaceText(item?.citta||item?.city||''),
    provincia:normalizeSpaceText(item?.provincia||item?.province||'')
  };
  const nextWins=recordRichnessScore(item) >= recordRichnessScore(prev);
  const merged=nextWins ? {...prev, ...item} : {...item, ...prev};
  merged.id=choosePreferredId(prev?.id, item?.id) || merged.id;
  merged.nome=normalizeClientDisplayName(merged);
  merged.cognome=normalizeSpaceText(merged?.cognome||'');
  merged.telefono=normalizePhone(merged?.telefono||merged?.tel||merged?.phone||'');
  merged.email=normalizeEmail(merged?.email||'');
  merged.indirizzo=normalizeSpaceText(merged?.indirizzo||merged?.address||'');
  merged.cap=normalizeSpaceText(merged?.cap||'');
  merged.citta=normalizeSpaceText(merged?.citta||merged?.city||'');
  merged.provincia=normalizeSpaceText(merged?.provincia||merged?.province||'');
  return merged;
}
function dedupeSemanticList(list, keyFn, mergeFn){
  const items=[];
  const idToIndex=new Map();
  const keyToIndex=new Map();
  const idMap=new Map();
  for(const raw of (Array.isArray(list)?list:[])){
    if(!raw) continue;
    const item={...raw};
    const rawId=normalizeSpaceText(item?.id||'');
    const rawKey=keyFn(item);
    let idx=(rawId && idToIndex.has(rawId)) ? idToIndex.get(rawId) : null;
    if(idx==null && rawKey && keyToIndex.has(rawKey)) idx=keyToIndex.get(rawKey);
    if(idx==null){
      const merged=mergeFn(null,item);
      items.push(merged);
      idx=items.length-1;
    }else{
      const prev=items[idx];
      const merged=mergeFn(prev,item);
      const prevId=normalizeSpaceText(prev?.id||'');
      const nextId=normalizeSpaceText(merged?.id||'');
      if(prevId && nextId && prevId!==nextId) idMap.set(prevId,nextId);
      items[idx]=merged;
    }
    const final=items[idx];
    const finalId=normalizeSpaceText(final?.id||'');
    if(rawId && finalId && rawId!==finalId) idMap.set(rawId, finalId);
    if(rawId) idToIndex.set(rawId, idx);
    if(finalId) idToIndex.set(finalId, idx);
    if(rawKey) keyToIndex.set(rawKey, idx);
    const finalKey=keyFn(final);
    if(finalKey) keyToIndex.set(finalKey, idx);
  }
  return {items,idMap};
}
function dedupeClientiWithMap(list=[]){ return dedupeSemanticList(list, normalizeClientDedupKey, mergeClientRecords); }
function dedupeClienti(list=[]){ return dedupeClientiWithMap(list).items; }

function normalizeArticleDedupKey(x){
  const code=normalizeTextKey(x?.codice||x?.sku||'');
  return code ? `code|${code}` : '';
}
function mergeArticleRecords(prev,item){
  if(!prev) return {
    ...item,
    id:choosePreferredId(item?.id),
    codice:normalizeSpaceText(item?.codice||item?.sku||''),
    brand:normalizeSpaceText(item?.brand||item?.marca||''),
    categoria:normalizeSpaceText(item?.categoria||''),
    foto:Array.isArray(item?.foto)?item.foto.filter(Boolean).slice(0,6):[],
    photoIds:Array.isArray(item?.photoIds)?item.photoIds.filter(Boolean).slice(0,6):[]
  };
  const nextWins=recordRichnessScore(item) >= recordRichnessScore(prev);
  const merged=nextWins ? {...prev, ...item} : {...item, ...prev};
  merged.id=choosePreferredId(prev?.id, item?.id) || merged.id;
  merged.codice=normalizeSpaceText(merged?.codice||merged?.sku||'');
  merged.brand=normalizeSpaceText(merged?.brand||merged?.marca||'');
  merged.categoria=normalizeSpaceText(merged?.categoria||'');
  merged.costoUsd=firstFiniteNumber(merged?.costoUsd, merged?.costoUSD, item?.costoUsd, item?.costoUSD, prev?.costoUsd, prev?.costoUSD, 0);
  merged.costoEur=firstFiniteNumber(merged?.costoEur, merged?.costoEUR, item?.costoEur, item?.costoEUR, item?.prezzo_acquisto, item?.costo, item?.costo_eur, prev?.costoEur, prev?.costoEUR, prev?.prezzo_acquisto, prev?.costo, prev?.costo_eur, 0);
  merged.prezzoVendita=firstFiniteNumber(merged?.prezzoVendita, merged?.prezzo_vendita, item?.prezzoVendita, item?.prezzo_vendita, item?.prezzo, item?.prezzo_vendita_iva, prev?.prezzoVendita, prev?.prezzo_vendita, prev?.prezzo, prev?.prezzo_vendita_iva, 0);
  merged.promoAttiva=(typeof merged?.promoAttiva==='boolean') ? merged.promoAttiva : ((typeof item?.promoAttiva==='boolean') ? item.promoAttiva : ((typeof prev?.promoAttiva==='boolean') ? prev.promoAttiva : false));
  merged.prezzoPromo=firstFiniteNumber(merged?.prezzoPromo, merged?.promoPrezzo, item?.prezzoPromo, item?.promoPrezzo, prev?.prezzoPromo, prev?.promoPrezzo, 0);
  merged.scadenzaPromo=normalizeSpaceText(merged?.scadenzaPromo||merged?.promoScadenza||item?.scadenzaPromo||item?.promoScadenza||prev?.scadenzaPromo||prev?.promoScadenza||'');
  merged.foto=mergeUniquePics(prev?.foto||[], item?.foto||[]).slice(0,6);
  merged.photoIds=[...new Set([...(prev?.photoIds||[]), ...(item?.photoIds||[])].filter(Boolean).map(String))].slice(0,6);
  return merged;
}
function dedupeArticoliWithMap(list=[]){ return dedupeSemanticList(list, normalizeArticleDedupKey, mergeArticleRecords); }

function ensureOrderNumber(order){
  const explicit=normalizeSpaceText(order?.numeroOrdine||order?.numero_ordine||'');
  if(explicit) return explicit;
  const id=normalizeSpaceText(order?.id||'');
  if(!id) return '';
  const clean=id.replace(/[^a-z0-9]+/gi,'').toUpperCase();
  return clean ? `VGAPP-${clean.slice(0,24)}` : '';
}
function normalizeOrderRowKey(r){
  const code=normalizeTextKey(r?.codice||r?.sku||r?.articoloId||'');
  const price=Number(r?.prezzo||r?.prezzo_unitario||0).toFixed(2);
  return `${code}|${price}`;
}
function normalizeOrderFingerprint(o){
  const num=normalizeTextKey(ensureOrderNumber(o));
  if(num) return `num|${num}`;
  const data=normalizeTextKey(o?.data||o?.data_ordine||'');
  const tracking=normalizeTextKey(o?.tracking||o?.tracking_code||'');
  const totale=Number(o?.totale||0).toFixed(2);
  const note=normalizeTextKey(o?.note||'');
  const righe=(Array.isArray(o?.righe)?o.righe:[]).map(normalizeOrderRowKey).sort().join('~');
  return [data,tracking,totale,righe,note].some(Boolean) ? `fp|${data}|${tracking}|${totale}|${righe}|${note}` : '';
}
function mergeOrderRecords(prev,item){
  if(!prev){
    const righe=Array.isArray(item?.righe)?item.righe:[];
    const scontoCliente=calcOrderDiscount(item);
    const subTotale=calcOrderSubtotal(righe);
    const totalValue=Number(item?.totale);
    return {
      ...item,
      id:choosePreferredId(item?.id),
      numeroOrdine:ensureOrderNumber(item),
      righe,
      foto:Array.isArray(item?.foto)?item.foto.filter(Boolean).slice(0,12):[],
      fotoManuali:Array.isArray(item?.fotoManuali)?item.fotoManuali.filter(Boolean).slice(0,12):[],
      fotoArticoli:Array.isArray(item?.fotoArticoli)?item.fotoArticoli.filter(Boolean).slice(0,12):[],
      orderPhotoIds:Array.isArray(item?.orderPhotoIds)?item.orderPhotoIds.filter(Boolean).slice(0,12):[],
      scontoCliente,
      subTotale,
      totale:(totalValue>0 || subTotale===0) ? totalValue : calcOrderNetTotal(righe, scontoCliente),
      incassato:Number(item?.incassato||0)
    };
  }
  const nextWins=recordRichnessScore(item) >= recordRichnessScore(prev);
  const primary=nextWins ? item : prev;
  const secondary=nextWins ? prev : item;
  const merged=nextWins ? {...prev, ...item} : {...item, ...prev};
  merged.id=choosePreferredId(prev?.id, item?.id) || merged.id;
  merged.numeroOrdine=ensureOrderNumber(merged);
  merged.righe=(Array.isArray(primary?.righe) && primary.righe.length) ? primary.righe : (Array.isArray(secondary?.righe) ? secondary.righe : []);
  merged.foto=mergeUniquePics(prev?.foto||[], item?.foto||[]).slice(0,12);
  merged.fotoManuali=mergeUniquePics(prev?.fotoManuali||[], item?.fotoManuali||[]).slice(0,12);
  merged.fotoArticoli=mergeUniquePics(prev?.fotoArticoli||[], item?.fotoArticoli||[]).slice(0,12);
  merged.orderPhotoIds=[...new Set([...(prev?.orderPhotoIds||[]), ...(item?.orderPhotoIds||[])].filter(Boolean).map(String))].slice(0,12);
  merged.scontoCliente=calcOrderDiscount(primary) || calcOrderDiscount(secondary) || 0;
  merged.subTotale=calcOrderSubtotal(merged.righe);
  const totalValue=Number(merged?.totale);
  merged.totale=(totalValue>0 || merged.subTotale===0) ? totalValue : calcOrderNetTotal(merged.righe, merged.scontoCliente);
  merged.incassato=Number(merged?.incassato||0);
  return merged;
}
function dedupeOrdiniWithMap(list=[]){ return dedupeSemanticList(list, normalizeOrderFingerprint, mergeOrderRecords); }

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
        version:'v6.1',
        createdAt: merged.createdAt||db.createdAt||new Date().toISOString(),
        articoli:[...(merged.articoli||[]), ...(db.articoli||[])],
        clienti:[...(merged.clienti||[]), ...(db.clienti||[])],
        ordini:[...(merged.ordini||[]), ...(db.ordini||[])],
        categorie: [...new Set([...(merged.categorie||[]), ...(db.categorie||[])])].sort((a,b)=>a.localeCompare(b,'it',{sensitivity:'base'})),
        brands: [...new Set([...(merged.brands||[]), ...(db.brands||[])])].sort((a,b)=>a.localeCompare(b,'it',{sensitivity:'base'}))
      };
    });

    merged=normalizeDBShape(merged);

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
    const cleanDb=normalizeDBShape(db||defDB());
    const raw=JSON.stringify(cleanDb);
    localStorage.setItem(KEY, raw);
    try{ localStorage.setItem(KEY+'_backup_latest', raw); }catch(_e){}
    const legacyKeys = (typeof LEGACY_KEYS!=='undefined' ? LEGACY_KEYS : []);
    legacyKeys.forEach(k=>{ try{ localStorage.removeItem(k); }catch(_e){} });
  }catch(err){
    const msg=String(err?.message||err||'');
    if(/quota|storage/i.test(msg)) toast('Salvataggio fallito: archivio locale pieno o sporco');
    else toast('Salvataggio fallito');
    return false;
  }
  try{ renderAll(); }catch(err){ console.error('Render post-salvataggio fallito', err); }
  refreshArticleBrandSelects();
  return true;
}
function safeLower(v){ return String(v==null?'':v).trim().toLowerCase(); }

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
async function getPublicFotoUrl(path){
  const src=String(path||'').trim();
  if(!src) return '';
  if(/^data:|^https?:\/\//i.test(src)) return src;
  if(isTemporaryLocalPhotoRef(src)) return '';
  const sb=await ensureCloud();
  if(!sb) return src;
  const clean=src.replace(/^\/+/, '').replace(new RegExp('^'+SUPABASE_BUCKET+'\/'), '');
  const { data } = sb.storage.from(SUPABASE_BUCKET).getPublicUrl(clean);
  return data?.publicUrl || src;
}

async function listCloudFotoPathsByCode(codice){
  const code=String(codice||'').trim();
  if(!code) return [];
  const sb=await ensureCloud();
  if(!sb) return [];
  try{
    const { data, error } = await sb.storage.from(SUPABASE_BUCKET).list(code, { limit: 20, sortBy: { column: 'name', order: 'asc' } });
    if(error || !Array.isArray(data)) return [];
    return data
      .filter(f=>f && f.name && !String(f.name).endsWith('/'))
      .map(f=> `${code}/${f.name}`)
      .filter(Boolean)
      .slice(0,6);
  }catch(_e){
    return [];
  }
}

async function getArticlePics(a){
  if(!a) return [];
  const out=[];
  const pushPic=(src)=>{
    const clean=String(src||'').trim();
    if(!clean || out.includes(clean)) return;
    out.push(clean);
  };
  if(Array.isArray(a.foto) && a.foto.length){
    for(const path of a.foto.slice(0,6)){
      const url=await getPublicFotoUrl(path);
      if(url) pushPic(url);
      if(out.length>=6) return out.slice(0,6);
    }
  }
  if(Array.isArray(a.photoIds) && a.photoIds.length){
    for(const id of a.photoIds){
      const x=await idbGet(id);
      if(!x) continue;
      if(typeof x==='string') pushPic(x);
      else if(x instanceof Blob) pushPic(URL.createObjectURL(x));
      if(out.length>=6) break;
    }
  }
  return out.slice(0,6);
}
async function getArticleCloudSyncSources(a){
  if(!a) return [];
  const out=[];
  const pushRef=(src)=>{
    const clean=String(src||'').trim();
    if(!clean || out.includes(clean)) return;
    out.push(clean);
  };
  if(Array.isArray(a.foto) && a.foto.length){
    for(const src of a.foto.slice(0,6)){
      const clean=String(src||'').trim();
      if(!clean) continue;
      if(/^data:|^https?:\/\//i.test(clean)) pushRef(clean);
      else pushRef(clean.replace(/^\/+/, '').replace(new RegExp('^'+SUPABASE_BUCKET+'\/'), ''));
      if(out.length>=6) return out.slice(0,6);
    }
  }
  if(Array.isArray(a.photoIds) && a.photoIds.length){
    for(const id of a.photoIds){
      const x=await idbGet(id);
      if(!x) continue;
      if(typeof x==='string') pushRef(x);
      else if(x instanceof Blob) pushRef(URL.createObjectURL(x));
      if(out.length>=6) break;
    }
  }
  return out.slice(0,6);
}
async function getStoredPhotoSources(ids=[]){
  const out=[];
  for(const id of (ids||[])){
    try{
      const x=await idbGet(id);
      if(!x) continue;
      if(typeof x==='string') out.push(x);
      else if(x instanceof Blob) out.push(URL.createObjectURL(x));
    }catch(_e){}
  }
  return out;
}
async function getOrderManualPics(ord){
  const legacy=Array.isArray(ord?.fotoManuali)?ord.fotoManuali.filter(Boolean).slice(0,12):[];
  const stored=await getStoredPhotoSources(Array.isArray(ord?.orderPhotoIds)?ord.orderPhotoIds.filter(Boolean).slice(0,12):[]);
  return mergeUniquePics(legacy, stored).slice(0,12);
}
async function getOrderPics(ord, db){
  const articlePics=await getOrderArticleSnapshotPhotos(ord?.righe||[], db||loadDB());
  const manualPics=await getOrderManualPics(ord||{});
  return mergeUniquePics(articlePics, manualPics).slice(0,12);
}
async function blobToDataUrl(blob){
  return await new Promise((res,rej)=>{
    const fr=new FileReader();
    fr.onload=()=>res(String(fr.result||''));
    fr.onerror=()=>rej(fr.error||new Error('Lettura file fallita'));
    fr.readAsDataURL(blob);
  });
}
async function requestPersistentStorage(){
  try{
    if(navigator.storage?.persist) await navigator.storage.persist();
  }catch(_e){}
}
async function blobFromPhotoSrc(src){
  const val=String(src||'').trim();
  if(!val) throw new Error('Sorgente foto vuota');
  if(/^data:/i.test(val)){
    const res=await fetch(val);
    return await res.blob();
  }
  const res=await fetch(val, { mode:'cors', cache:'no-store' });
  if(!res.ok) throw new Error('Download foto fallito');
  return await res.blob();
}
function guessPhotoExtension(src, blob){
  const clean=String(src||'').split('?')[0].split('#')[0];
  const match=clean.match(/\.([a-z0-9]{2,5})$/i);
  if(match) return match[1].toLowerCase();
  const mime=String(blob?.type||'').toLowerCase();
  if(mime.includes('png')) return 'png';
  if(mime.includes('webp')) return 'webp';
  if(mime.includes('gif')) return 'gif';
  return 'jpg';
}
let __articlePhotoShareCache = null;
function canNativeShareFiles(files){
  try{
    if(typeof navigator==='undefined' || typeof navigator.share!=='function') return false;
    if(!files?.length) return false;
    if(typeof navigator.canShare!=='function') return true;
    if(navigator.canShare({ files })) return true;
    if(files.length===1 && navigator.canShare({ files:[files[0]] })) return 'single';
    return false;
  }catch(_e){
    return false;
  }
}
async function tryNativeShareArticleFiles(files, baseName){
  const mode = canNativeShareFiles(files);
  if(!mode) return false;
  if(mode==='single'){
    await navigator.share({
      files:[files[0]],
      title:`Foto ${baseName}`,
      text:`Salva la foto dell'articolo ${baseName}`
    });
    return 'single';
  }
  await navigator.share({
    files,
    title:`Foto ${baseName}`,
    text:`Salva ${files.length} foto dell'articolo ${baseName}`
  });
  return 'multi';
}
async function buildArticlePhotoFiles(art, pics, baseName){
  const files=[];
  for(let i=0;i<pics.length;i++){
    try{
      const rawSrc=String(pics[i]||'').trim();
      const fetchSrc = (/^data:|^https?:\/\/|^blob:/i.test(rawSrc)) ? rawSrc : (await getPublicFotoUrl(rawSrc));
      if(!fetchSrc) throw new Error('URL foto non disponibile');
      const blob=await blobFromPhotoSrc(fetchSrc);
      const ext=guessPhotoExtension(fetchSrc || rawSrc, blob);
      const type=blob?.type || (ext==='png' ? 'image/png' : ext==='webp' ? 'image/webp' : ext==='gif' ? 'image/gif' : 'image/jpeg');
      const name=`${baseName}_${String(i+1).padStart(2,'0')}.${ext}`;
      files.push(new File([blob], name, { type, lastModified: Date.now() }));
    }catch(err){
      console.warn('Preparazione foto articolo fallita', err);
    }
  }
  return files;
}
async function tryNativeShareArticleLinks(pics, baseName){
  try{
    if(typeof navigator==='undefined' || typeof navigator.share!=='function' || !pics?.length) return false;
    const urls=[];
    for(const raw of pics){
      const clean=String(raw||'').trim();
      if(!clean) continue;
      const url = (/^https?:\/\//i.test(clean)) ? clean : await getPublicFotoUrl(clean);
      if(url && /^https?:\/\//i.test(url) && !urls.includes(url)) urls.push(url);
      if(urls.length>=10) break;
    }
    if(!urls.length) return false;
    const payload = {
      title:`Foto ${baseName}`,
      text:`Foto articolo ${baseName}\n\n${urls.join('\n')}`
    };
    if(urls.length===1) payload.url = urls[0];
    await navigator.share(payload);
    return true;
  }catch(err){
    if(err && err.name==='AbortError') return 'abort';
    console.warn('Condivisione link foto fallita', err);
    return false;
  }
}
async function downloadCurrentArticlePhotos(){
  const db=loadDB();
  const art=db.articoli.find(x=>x.id===currentArtId);
  if(!art){ toast('Articolo non trovato'); return; }
  const pics=await getArticleCloudSyncSources(art);
  if(!pics.length){ toast('Nessuna foto da scaricare'); return; }
  const baseName=(art.codice||art.brand||art.modello||'articolo').toString().trim().replace(/[^a-z0-9_-]+/gi,'_').replace(/^_+|_+$/g,'')||'articolo';
  const cacheKey=`${art.id||''}::${pics.join('|')}`;

  if(__articlePhotoShareCache && __articlePhotoShareCache.key===cacheKey && Array.isArray(__articlePhotoShareCache.files) && __articlePhotoShareCache.files.length){
    try{
      const shared = await tryNativeShareArticleFiles(__articlePhotoShareCache.files, baseName);
      if(shared){
        toast(shared==='single'
          ? 'Condivisione aperta. Il browser supporta una foto per volta.'
          : `Seleziona Galleria, Foto o File per salvare ${__articlePhotoShareCache.files.length} foto.`);
        return;
      }
      const sharedLinks = await tryNativeShareArticleLinks(pics, baseName);
      if(sharedLinks===true){
        toast('Condivisione aperta. Il browser sta inviando i link delle foto.');
        return;
      }
      if(sharedLinks==='abort') return;
    }catch(err){
      if(err && err.name==='AbortError') return;
      console.warn('Condivisione nativa foto da cache fallita', err);
    }
  }

  toast(`Preparo ${pics.length} foto...`);
  const files=await buildArticlePhotoFiles(art, pics, baseName);
  if(!files.length){
    const sharedLinks = await tryNativeShareArticleLinks(pics, baseName);
    if(sharedLinks===true){
      toast('Condivisione aperta. Il browser sta inviando i link delle foto.');
      return;
    }
    if(sharedLinks==='abort') return;
    toast('Condivisione foto fallita');
    return;
  }
  __articlePhotoShareCache = { key: cacheKey, files, at: Date.now() };

  try{
    const shared = await tryNativeShareArticleFiles(files, baseName);
    if(shared){
      toast(shared==='single'
        ? 'Condivisione aperta. Il browser supporta una foto per volta.'
        : `Seleziona Galleria, Foto o File per salvare ${files.length} foto.`);
      return;
    }
  }catch(err){
    if(err && err.name==='AbortError') return;
    console.warn('Condivisione nativa foto fallita', err);
    const activationErr = /activation|user gesture|notallowed/i.test(String(err && (err.message||err.name)||''));
    if(activationErr){
      toast('Foto pronte. Premi di nuovo “Scarica foto” per aprire la condivisione.');
      return;
    }
  }

  const sharedLinks = await tryNativeShareArticleLinks(pics, baseName);
  if(sharedLinks===true){
    toast('Condivisione aperta. Il browser sta inviando i link delle foto.');
    return;
  }
  if(sharedLinks==='abort') return;

  let ok=0;
  for(let i=0;i<files.length;i++){
    try{
      const file=files[i];
      const url=URL.createObjectURL(file);
      const a=document.createElement('a');
      a.href=url;
      a.download=file.name;
      a.rel='noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(()=>URL.revokeObjectURL(url), 12000);
      ok++;
      await new Promise(r=>setTimeout(r, 1400));
    }catch(err){
      console.warn('Download foto articolo fallito', err);
    }
  }
  toast(ok===files.length
    ? `Avviate ${ok} foto. Le trovi nei Download e poi in Galleria.`
    : (ok
      ? `Avviate ${ok} foto su ${files.length}. Se il browser ne blocca qualcuna, premi di nuovo Scarica foto per condividere.`
      : 'Download foto fallito'));
}
async function uploadArticlePhotoToSupabase(file, codice, slot){
  const sb=await ensureCloud();
  if(!sb) throw new Error('Supabase non disponibile');
  const ext=((file?.name||'').split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'') || 'jpg';
  const cleanCode=String(codice||'').trim();
  if(!cleanCode) throw new Error('Codice articolo mancante');
  const path=`${cleanCode}/${slot}.${ext}`;
  const { error } = await sb.storage.from(SUPABASE_BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: true,
    contentType: file?.type || 'image/jpeg'
  });
  if(error) throw error;
  return path;
}
async function syncArticlePhotosToCloud(artId, codice, pics){
  const sb=await ensureCloud();
  if(!sb||!cloudSession||!artId) return [];
  const cleanCode=String(codice||artId||'art').trim() || String(artId);
  const normalized=(pics||[]).filter(Boolean).slice(0,6);
  const { data:existingRows } = await sb.from('prodotti_foto').select('path,ordine').eq('prodotto_id', artId).order('ordine',{ascending:true});
  const existingPaths=(existingRows||[]).map(r=>String(r?.path||'').trim()).filter(Boolean);
  const savedPaths=[];
  const uploadErrors=[];
  for(let i=0;i<normalized.length;i++){
    const src=String(normalized[i]||'').trim();
    if(!src) continue;

    if(isLikelyCloudPhotoPath(src)){
      const cleanPath = src.replace(/^\/+/, '').replace(new RegExp('^'+SUPABASE_BUCKET+'\/'), '');
      if(cleanPath){
        savedPaths.push(cleanPath);
        continue;
      }
    }

    try{
      const res=await fetch(src);
      if(!res.ok) throw new Error('Download foto cloud fallito');
      const blob=await res.blob();
      const ext=((blob.type||'image/jpeg').split('/').pop()||'jpg').replace(/[^a-z0-9]/gi,'').toLowerCase() || 'jpg';
      const fileObj=new File([blob], `${cleanCode}-${i+1}.${ext}`, {type: blob.type || 'image/jpeg'});
      const path=await uploadArticlePhotoToSupabase(fileObj, cleanCode, i+1);
      savedPaths.push(path);
    }catch(err){
      const fallback=existingPaths[i];
      if(fallback && !savedPaths.includes(fallback)) savedPaths.push(fallback);
      uploadErrors.push(err);
    }
  }
  const finalPaths=normalized.length===0 ? [] : normalizeCloudPhotoPathList(savedPaths.length ? savedPaths : existingPaths);
  let deleted=false;
  try{
    await sb.from('prodotti_foto').delete().eq('prodotto_id', artId);
    deleted=true;
    if(finalPaths.length){
      const rows=finalPaths.map((path,idx)=>({prodotto_id: artId, path, ordine: idx}));
      const { error } = await sb.from('prodotti_foto').insert(rows);
      if(error) throw error;
    }
  }catch(err){
    if(deleted && existingPaths.length){
      try{
        const restoreRows=existingPaths.map((path,idx)=>({prodotto_id: artId, path, ordine: idx}));
        await sb.from('prodotti_foto').insert(restoreRows);
      }catch(_restoreErr){}
    }
    throw err;
  }
  if(uploadErrors.length) console.warn('Sync foto cloud parziale', uploadErrors);
  return finalPaths;
}
async function getCloudArticlePhotoUrls(artId){
  const sb=await ensureCloud();
  if(!sb||!cloudSession||!artId) return [];
  const { data, error } = await sb.from('prodotti_foto').select('path,ordine').eq('prodotto_id', artId).order('ordine',{ascending:true});
  if(error) throw error;
  return (data||[]).map(r=>{
    const { data:urlData } = sb.storage.from(SUPABASE_BUCKET).getPublicUrl(r.path);
    return urlData?.publicUrl || '';
  }).filter(Boolean);
}

async function deleteArticlePhotosFromSupabase(paths=[]){
  const sb=await ensureCloud();
  if(!sb) return;
  const clean=(paths||[]).map(x=>String(x||'').trim()).filter(Boolean).map(x=>x.replace(/^\/+/, '').replace(new RegExp('^'+SUPABASE_BUCKET+'\/'), ''));
  if(!clean.length) return;
  const { error } = await sb.storage.from(SUPABASE_BUCKET).remove(clean);
  if(error) console.warn('Eliminazione foto Supabase fallita', error);
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
function isTemporaryLocalPhotoRef(src){
  return /^(?:blob:|data:|file:|filesystem:)/i.test(String(src||'').trim());
}
function isLikelyCloudPhotoPath(src){
  const clean=String(src||'').trim().replace(/^\/+/, '').replace(new RegExp('^'+SUPABASE_BUCKET+'\/'), '');
  if(!clean || isTemporaryLocalPhotoRef(clean) || /^https?:\/\//i.test(clean)) return false;
  if(clean.includes('://')) return false;
  return /.+\/.+/.test(clean);
}
function normalizeCloudPhotoPathList(list){
  const out=[];
  for(const raw of (Array.isArray(list)?list:[])){
    const clean=String(raw||'').trim().replace(/^\/+/, '').replace(new RegExp('^'+SUPABASE_BUCKET+'\/'), '');
    if(!clean || !isLikelyCloudPhotoPath(clean) || out.includes(clean)) continue;
    out.push(clean);
    if(out.length>=6) break;
  }
  return out;
}
function firstFiniteNumber(){
  for(const value of arguments){
    const n=Number(value);
    if(Number.isFinite(n)) return n;
  }
  return 0;
}
function parseFlexibleAmount(value){
  if(typeof value==='number') return Number.isFinite(value) ? Math.max(0, value) : 0;
  const raw=String(value==null?'':value).trim().replace(/\s+/g,'').replace(',', '.');
  const n=Number(raw);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}
function calcOrderSubtotal(rows){
  return (Array.isArray(rows)?rows:[]).reduce((sum,row)=>sum+Math.max(0, Number(row?.prezzo||0)),0);
}
function calcOrderDiscount(orderLike){
  return parseFlexibleAmount(orderLike?.scontoCliente ?? orderLike?.sconto ?? 0);
}
function calcOrderNetTotal(rows, discount){
  return Math.max(0, calcOrderSubtotal(rows) - calcOrderDiscount({scontoCliente:discount}));
}
function updateOrderTotalsPreview(){
  const subtotal=calcOrderSubtotal(ordRows);
  const discount=Math.min(parseFlexibleAmount(document.getElementById('o_discount')?.value||0), subtotal);
  const total=Math.max(0, subtotal-discount);
  const totalEl=document.getElementById('o_tot');
  if(totalEl) totalEl.textContent=money(total);
  const metaEl=document.getElementById('o_tot_meta');
  if(metaEl) metaEl.textContent=`Subtotale ${money(subtotal)} • Sconto ${money(discount)}`;
  return {subtotal, discount, total};
}
function buildOrderCloudNote(ord){
  const parts=[];
  const base=String(ord?.note||'').trim();
  if(base) parts.push(base);
  if(ord?.mis) parts.push(`[MIS:${ord.mis}]`);
  const discount=calcOrderDiscount(ord);
  if(discount>0) parts.push(`[SCONTO:${discount.toFixed(2)}]`);
  return parts.join(' ') || null;
}
function extractOrderNoteMeta(rawNote){
  const raw=String(rawNote||'');
  const misMatch=raw.match(/\[MIS:([^\]]+)\]/i);
  const discountMatch=raw.match(/\[SCONTO:([^\]]+)\]/i);
  const cleanNote=raw.replace(/\s*\[MIS:[^\]]+\]\s*/gi,' ').replace(/\s*\[SCONTO:[^\]]+\]\s*/gi,' ').trim();
  return { cleanNote, mis: misMatch ? misMatch[1].trim() : '', scontoCliente: parseFlexibleAmount(discountMatch ? discountMatch[1] : 0) };
}

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
function supplierRuleFromCode(code){
  const c=String(code||'').trim();
  if(!c) return {mode:'free', options:['Jessica','Daniel'], value:''};
  const first=c[0];
  if(first==='2' || first==='3') return {mode:'fixed', options:['Jayden'], value:'Jayden'};
  if(first==='1' || /[A-Za-z]/.test(first)) return {mode:'choice', options:['Jessica','Daniel'], value:''};
  return {mode:'choice', options:['Jessica','Daniel'], value:''};
}
function getArticleBrandValue(){
  const sel=document.getElementById('a_brand');
  const custom=document.getElementById('a_brand_custom');
  if(!sel) return "";
  if(sel.value==='__ALTRO__') return String(custom?.value||'').trim();
  return String(sel.value||'').trim();
}
function syncBrandField(value=''){
  const sel=document.getElementById('a_brand');
  const custom=document.getElementById('a_brand_custom');
  if(!sel || !custom) return;
  const clean=String(value||'').trim();
  const known=getBrandPresetList().includes(clean);
  if(clean && !known){
    sel.value='__ALTRO__';
    custom.style.display='block';
    custom.value=clean;
  }else{
    sel.value=clean||'';
    custom.style.display=sel.value==='__ALTRO__' ? 'block' : 'none';
    if(sel.value!=='__ALTRO__') custom.value='';
  }
}
function handleBrandSelectionChange(){
  const sel=document.getElementById('a_brand');
  const custom=document.getElementById('a_brand_custom');
  if(!sel || !custom) return;
  const show=sel.value==='__ALTRO__';
  custom.style.display=show ? 'block' : 'none';
  if(!show) custom.value='';
  renderArtAutoFields();
  if(show) setTimeout(()=>custom.focus(),0);
}

function updateSupplierField(preferredValue=''){
  const sel=document.getElementById('a_forn');
  const hint=document.getElementById('a_forn_hint');
  if(!sel) return;
  const rule=supplierRuleFromCode(document.getElementById('a_cod')?.value||'');
  const current=String(preferredValue || sel.value || '').trim();
  sel.innerHTML='';
  if(rule.mode==='fixed'){
    sel.innerHTML='<option value="Jayden">Jayden</option>';
    sel.value='Jayden';
    sel.disabled=true;
    if(hint) hint.textContent='Codice che inizia per 2 o 3: fornitore fisso Jayden.';
    return;
  }
  sel.disabled=false;
  const ph=document.createElement('option');
  ph.value='';
  ph.textContent='Seleziona fornitore';
  sel.appendChild(ph);
  rule.options.forEach(name=>{
    const opt=document.createElement('option');
    opt.value=name;
    opt.textContent=name;
    sel.appendChild(opt);
  });
  sel.value=rule.options.includes(current)?current:'';
  if(hint) hint.textContent='Codice standard: scegli Jessica oppure Daniel.';
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
function escapeRegExp(str){
  return String(str||'').replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
}
function brandVariants(brand){
  const clean=String(brand||'').trim();
  if(!clean) return [];
  const words=clean.split(/\s+/).map(x=>x.trim()).filter(Boolean);
  const variants=[clean, ...words];
  const acronym=words.map(w=>w[0]||'').join('').toUpperCase();
  if(acronym && acronym.length>=2) variants.push(acronym);
  const compact=clean.replace(/[^a-z0-9]/gi,'');
  if(compact && compact.length<=5) variants.push(compact);
  const uniq=[];
  for(const part of variants){
    const key=String(part||'').trim().toLowerCase();
    if(!key || uniq.some(x=>x.toLowerCase()===key)) continue;
    uniq.push(String(part).trim());
  }
  return uniq.sort((a,b)=>b.length-a.length);
}
function stripBrandFromText(text, brand){
  let out=String(text||'').replace(/\s+/g,' ').trim();
  const variants=brandVariants(brand);
  if(!out || !variants.length) return out;
  variants.forEach(part=>{
    const rx=/[a-z0-9]/i.test(part)
      ? new RegExp(`\\b${escapeRegExp(part)}\\b`,'gi')
      : new RegExp(escapeRegExp(part),'gi');
    out=out.replace(rx,' ');
  });
  return out.replace(/\s{2,}/g,' ').replace(/^[-–—:;,\.\s]+|[-–—:;,\.\s]+$/g,'').trim();
}
function normalizePostLine(text, brand){
  return stripBrandFromText(text, brand).replace(/\s+/g,' ').trim();
}
function uniquePostLines(lines=[]){
  const out=[];
  const seen=new Set();
  for(const raw of lines){
    const line=String(raw||'').replace(/\s+/g,' ').trim();
    if(!line) continue;
    const key=line.toLowerCase();
    if(seen.has(key)) continue;
    seen.add(key);
    out.push(line);
  }
  return out;
}
function buildPost(a){
  if(!a.codice) return '';
  const brand=(a.brand||'').trim();
  const modello=normalizePostLine(a.modello||'', brand);
  const descrizione=normalizePostLine(a.descrizione||'', brand);
  const variante=normalizePostLine(a.variante||'', brand);
  const colore=normalizePostLine(a.colore||'', brand);
  const materiale=normalizePostLine(a.materiale||'', brand);
  const colori=normalizePostLine(a.colori||'', brand);
  const tracolla=normalizePostLine(a.tracolla||'', brand);
  const misura=normalizePostLine(a.misura||'', brand);
  const taglia=normalizePostLine(a.taglia||'', brand);
  const qemoji=emojiQualityForPost(a);
  const lines=[];
  if(a.promoAttiva){
    const scadenzaRaw=String(a.scadenzaPromo||'').trim();
    let scadenzaLabel=scadenzaRaw;
    if(/^\d{4}-\d{2}-\d{2}$/.test(scadenzaRaw)){
      const [yyyy,mm,dd]=scadenzaRaw.split('-');
      scadenzaLabel=`${dd}/${mm}/${yyyy}`;
    }
    const tipoMateriale=materiale || variante;
    lines.push('⭕️ PROMOZIONE ⭕️');
    if(scadenzaLabel) lines.push(`(fino al ${scadenzaLabel})`);
    if(modello || qemoji) lines.push([modello,qemoji].filter(Boolean).join(' ').trim());
    if(tipoMateriale) lines.push(tipoMateriale);
    if(colore) lines.push(colore);
    if(misura) lines.push(`Mis. ${misura}`);
    lines.push(`cod. ${a.codice}`);
    return uniquePostLines(lines).join('\n');
  }
  if(modello || qemoji) lines.push([modello,qemoji].filter(Boolean).join(' ').trim());
  if(descrizione) lines.push(descrizione);
  if(taglia) lines.push(`Taglia ${taglia}`);
  if(variante) lines.push(variante);
  if(colore) lines.push(colore);
  if(misura) lines.push(`Mis. ${misura}`);
  if(a.scatola) lines.push('Con scatola 🎁');
  if(materiale) lines.push(`🧵 ${materiale}`);
  if(colori) lines.push(colori);
  if(tracolla) lines.push(tracolla);
  lines.push(`cod. ${a.codice}`);
  return uniquePostLines(lines).join('\n');
}
function buildCloudArticleMeta(art){
  return {
    brand: art?.brand||'',
    modello: art?.modello||'',
    categoria: art?.categoria||'',
    descrizione: art?.descrizione||'',
    fornitore: art?.fornitore||'',
    fornitoreLink: art?.fornitoreLink||'',
    taglia: art?.taglia||'',
    variante: art?.variante||'',
    colore: art?.colore||'',
    misura: art?.misura||'',
    costoUsd: Number(art?.costoUsd||0),
    costoEur: Number(art?.costoEur||0),
    prezzoVendita: Number(art?.prezzoVendita||0),
    promoAttiva: !!art?.promoAttiva,
    prezzoPromo: Number(art?.prezzoPromo||0),
    scadenzaPromo: art?.scadenzaPromo||'',
    post: art?.post||'',
    note: art?.note||'',
    foto: normalizeCloudPhotoPathList(art?.foto||[])
  };
}
function packCloudArticleDescription(art){
  const plain=[String(art?.descrizione||'').trim(), String(art?.note||'').trim()].filter(Boolean).join('\n\n');
  let meta='';
  try{ meta=`\n\n[VGMETA]${JSON.stringify(buildCloudArticleMeta(art))}[/VGMETA]`; }catch(_e){}
  return (plain + meta).trim() || null;
}
function unpackCloudArticleDescription(text){
  const raw=String(text||'');
  const match=raw.match(/\[VGMETA\]([\s\S]*?)\[\/VGMETA\]/i);
  let meta={};
  if(match?.[1]){
    try{ meta=JSON.parse(match[1]); }catch(_e){}
  }
  const plain=raw.replace(/\s*\[VGMETA\][\s\S]*?\[\/VGMETA\]\s*/gi,' ').replace(/\s{3,}/g,'\n\n').trim();
  return { plain, meta: (meta && typeof meta==='object') ? meta : {} };
}
function parseLegacyCloudDescription(text){
  const raw=String(text||'').trim();
  if(!raw) return { descrizione:'', note:'', post:'' };
  const noteMatch=raw.match(/(?:^|\n\n)Note:\s*([\s\S]*?)(?=(?:\n\nPost:)|$)/i);
  const postMatch=raw.match(/(?:^|\n\n)Post:\s*([\s\S]*?)$/i);
  const descrizione=raw
    .replace(/(?:^|\n\n)Note:\s*[\s\S]*?(?=(?:\n\nPost:)|$)/i,' ')
    .replace(/(?:^|\n\n)Post:\s*[\s\S]*$/i,' ')
    .replace(/\s{3,}/g,'\n\n')
    .trim();
  return { descrizione, note:(noteMatch?.[1]||'').trim(), post:(postMatch?.[1]||'').trim() };
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
function currentHistoryPage(){
  return (history.state&&history.state.page) || location.hash.replace('#','') || 'home';
}
function go(name, push=true){
  renderPageState(name);
  const state={page:name};
  if(name==='articoli') state.artBrowse={...artBrowseState};
  if(push) history.pushState(state,'', '#'+name);
  else history.replaceState({...history.state, ...state},'', '#'+name);
}
window.addEventListener('popstate',(e)=>{
  if(activeModalId){ const mid=activeModalId; activeModalId=null; document.getElementById(mid).style.display='none'; return; }
  const state=e.state||{};
  const page=state.page || location.hash.replace('#','') || 'home';
  renderPageState(page);
  if(page==='articoli'){
    const b=state.artBrowse||{level:'categorie',categoria:'',brand:''};
    setArtBrowse(b.level||'categorie', b.categoria||'', b.brand||'', false);
    renderArt();
  }
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
function toggleCloudSyncMini(){ return; }
function copyTextFrom(el){
  const t=el.value||el.textContent||'';
  if(!t) return toast('Niente da copiare');
  navigator.clipboard?.writeText(t).then(()=>toast('Copiato')).catch(()=>{ try{ el.select(); document.execCommand('copy'); toast('Copiato'); }catch(e){ toast('Copia non disponibile'); } });
}

const UI_KEY='vg_ui_prefs_v1';
function defaultUiPrefs(){
  return {
    title:'Vanity & Glamour',
    cloud:'Cloud',
    tabs:{home:'Dashboard',articoli:'Articoli',clienti:'Clienti',ordini:'Ordini',finanze:'Finanze',impostazioni:'Impost.'},
    buttons:{save:'Salva',cancel:'Annulla',delete:'Elimina'},
    css:''
  };
}
function normalizeUiPrefs(v){
  const d=defaultUiPrefs();
  const o=v&&typeof v==='object'?v:{};
  return {
    title:String(o.title||d.title),
    cloud:String(o.cloud||d.cloud),
    tabs:{...d.tabs,...(o.tabs||{})},
    buttons:{...d.buttons,...(o.buttons||{})},
    css:String(o.css||'')
  };
}
function loadUiPrefs(){ try{ return normalizeUiPrefs(JSON.parse(localStorage.getItem(UI_KEY)||'{}')); }catch(e){ return defaultUiPrefs(); } }
function saveUiPrefsData(prefs){ localStorage.setItem(UI_KEY, JSON.stringify(normalizeUiPrefs(prefs))); }
function fillUiEditor(){
  const p=loadUiPrefs();
  const set=(id,val)=>{ const el=document.getElementById(id); if(el) el.value=val||''; };
  set('e_title',p.title); set('e_cloud',p.cloud);
  set('e_tab_home',p.tabs.home); set('e_tab_articoli',p.tabs.articoli); set('e_tab_clienti',p.tabs.clienti);
  set('e_tab_ordini',p.tabs.ordini); set('e_tab_finanze',p.tabs.finanze); set('e_tab_impostazioni',p.tabs.impostazioni);
  set('e_btn_save',p.buttons.save); set('e_btn_cancel',p.buttons.cancel); set('e_btn_delete',p.buttons.delete);
  set('e_css',p.css);
}
function readUiEditor(){
  const get=id=>document.getElementById(id)?.value?.trim()||'';
  return normalizeUiPrefs({
    title:get('e_title'), cloud:get('e_cloud'),
    tabs:{home:get('e_tab_home'),articoli:get('e_tab_articoli'),clienti:get('e_tab_clienti'),ordini:get('e_tab_ordini'),finanze:get('e_tab_finanze'),impostazioni:get('e_tab_impostazioni')},
    buttons:{save:get('e_btn_save'),cancel:get('e_btn_cancel'),delete:get('e_btn_delete')},
    css:document.getElementById('e_css')?.value||''
  });
}
function applyUiPrefs(){
  const p=loadUiPrefs();
  const titleEl=document.getElementById('appTitle'); if(titleEl) titleEl.textContent=p.title;
  document.title=p.title;
  document.querySelectorAll('[data-tab]').forEach(el=>{ const k=el.dataset.tab; if(p.tabs[k]) el.textContent=p.tabs[k]; });
  document.querySelectorAll('[data-nav]').forEach(el=>{ const k=el.dataset.nav; if(p.tabs[k]) el.textContent=p.tabs[k]; });
  document.querySelectorAll('[data-action="saveArt"],[data-action="saveCli"],[data-action="saveOrd"]').forEach(el=>el.textContent=p.buttons.save);
  document.querySelectorAll('[data-action="closeEdit"],[data-action="closeCli"],[data-action="closeOrd"],[data-action="closeCloudLogin"],[data-action="confirmNo"]').forEach(el=>el.textContent=p.buttons.cancel);
  document.querySelectorAll('[data-action="deleteArt"],[data-action="deleteCli"],[data-action="deleteOrd"],[data-action="confirmYes"]').forEach(el=>el.textContent=p.buttons.delete);
  if(!cloudBusy && !cloudSession){ const cloudEl=document.getElementById('cloudState'); if(cloudEl) cloudEl.textContent=p.cloud; }
  let styleEl=document.getElementById('uiCustomStyle');
  if(!styleEl){ styleEl=document.createElement('style'); styleEl.id='uiCustomStyle'; document.head.appendChild(styleEl); }
  styleEl.textContent=p.css||'';
}

/* ====== RENDER ====== */
const SHIP_ALERTS_KEY='vg_ship_alerts_v1';
const SHIP_SNAPSHOT_KEY='vg_ship_snapshot_v1';
function getOrderSnapshotMap(ordini=[]){
  const map={};
  (ordini||[]).forEach(o=>{
    const key=String(o.id||o.numeroOrdine||'').trim();
    if(!key) return;
    map[key]={numeroOrdine:o.numeroOrdine||'',stato:o.stato||'',tracking:o.tracking||'',data:o.data||''};
  });
  return map;
}
function loadShipAlerts(){
  try{ return JSON.parse(localStorage.getItem(SHIP_ALERTS_KEY)||'[]'); }catch{ return []; }
}
function saveShipAlerts(items){
  try{ localStorage.setItem(SHIP_ALERTS_KEY, JSON.stringify((items||[]).slice(0,20))); }catch{}
}
function renderShipAlerts(){
  const box=document.getElementById('shipAlerts');
  if(!box) return;
  const items=loadShipAlerts();
  if(!items.length){
    box.innerHTML='<div class="shipAlertEmpty">Nessun aggiornamento spedizioni.</div>';
    return;
  }
  box.innerHTML=items.map(a=>`<div class="shipAlert"><div class="t">${esc(a.title||'Aggiornamento spedizione')}</div><div class="s">${esc(a.text||'')}</div><div class="meta">${esc(a.when||'')}</div></div>`).join('');
}
function updateShippingNotifications(db, source='app'){
  const curr=getOrderSnapshotMap(db?.ordini||[]);
  let prev={};
  try{ prev=JSON.parse(localStorage.getItem(SHIP_SNAPSHOT_KEY)||'{}'); }catch{}
  const alerts=loadShipAlerts();
  const fresh=[];
  Object.keys(curr).forEach(key=>{
    const now=curr[key], old=prev[key];
    if(!old) return;
    if((now.stato||'') !== (old.stato||'')){
      fresh.push({title:`Ordine ${now.numeroOrdine||key}: stato aggiornato`, text:`Da ${old.stato||'-'} a ${now.stato||'-'}.`, when:new Date().toLocaleString('it-IT')});
    }
    if((now.tracking||'') !== (old.tracking||'')){
      const t=now.tracking?`Nuovo tracking ${now.tracking}.`:'Tracking rimosso o svuotato.';
      fresh.push({title:`Ordine ${now.numeroOrdine||key}: tracking aggiornato`, text:t, when:new Date().toLocaleString('it-IT')});
    }
  });
  if(fresh.length){
    const merged=[...fresh,...alerts].slice(0,20);
    saveShipAlerts(merged);
    toast(fresh.length===1 ? '1 aggiornamento spedizione' : `${fresh.length} aggiornamenti spedizione`);
  }
  try{ localStorage.setItem(SHIP_SNAPSHOT_KEY, JSON.stringify(curr)); }catch{}
  renderShipAlerts();
}

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
  renderShipAlerts();
}

function normalizeCategoryName(v){
  return String(v||'').trim().replace(/\s+/g,' ').toLowerCase();
}
function articleCategoryOptions(db){
  const saved=Array.isArray(db?.categorie)?db.categorie:[];
  const found=(db?.articoli||[]).map(a=>String(a?.categoria||'').trim()).filter(Boolean);
  const out=[];
  const seen=new Set();
  for(const name of [...saved, ...found]){
    const clean=String(name||'').trim().replace(/\s+/g,' ');
    const key=normalizeCategoryName(clean);
    if(!clean || seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out.sort((a,b)=>a.localeCompare(b,'it',{sensitivity:'base'}));
}
function renderCategorySettings(){
  const db=loadDB();
  const box=document.getElementById('catList');
  const hint=document.getElementById('catHint');
  if(!box) return;
  const cats=articleCategoryOptions(db);
  const savedSet=new Set((Array.isArray(db?.categorie)?db.categorie:[]).map(normalizeCategoryName));
  box.innerHTML=cats.length?cats.map(c=>`<div class="row" style="grid-template-columns:1fr auto auto;gap:8px"><div class="main"><div class="t">${esc(c)}</div><div class="small">${savedSet.has(normalizeCategoryName(c))?'Categoria salvata nelle impostazioni':'Categoria rilevata da articoli già esistenti'}</div></div><div><button class="btn smallish" type="button" data-action="renameCategory" data-name="${esc(c)}">Modifica</button></div><div><button class="btn danger smallish" type="button" data-action="deleteCategory" data-name="${esc(c)}">Elimina</button></div></div>`).join(''):'<div class="small">Nessuna categoria salvata.</div>';
  if(hint) hint.textContent='Puoi aggiungere, rinominare o eliminare le categorie. Se elimini una categoria, viene tolta anche dagli articoli che la usavano e gli articoli restano in Senza categoria.';
}
function addCategory(){
  const input=document.getElementById('catName');
  const nome=String(input?.value||'').trim().replace(/\s+/g,' ');
  if(!nome){ toast('Scrivi il nome categoria'); return; }
  const db=loadDB();
  const key=normalizeCategoryName(nome);
  const exists=(db.categorie||[]).some(c=>normalizeCategoryName(c)===key) || (db.articoli||[]).some(a=>normalizeCategoryName(a?.categoria)===key);
  if(exists){ toast('Categoria già presente'); return; }
  const next=[...new Set([...(db.categorie||[]), nome])].sort((a,b)=>a.localeCompare(b,'it',{sensitivity:'base'}));
  db.categorie=next;
  if(!saveDB(db)) return;
  if(input) input.value='';
  renderCategorySettings();
  renderBrandSettings();
  refreshArticleCategorySelects();
  refreshArticleBrandSelects();
  toast('Categoria salvata');
}
function renameCategory(oldName){
  const cleanOld=String(oldName||'').trim().replace(/\s+/g,' ');
  if(!cleanOld) return;
  const nuovo=window.prompt('Nuovo nome categoria', cleanOld);
  if(nuovo===null) return;
  const cleanNew=String(nuovo||'').trim().replace(/\s+/g,' ');
  if(!cleanNew){ toast('Nome categoria vuoto'); return; }
  const oldKey=normalizeCategoryName(cleanOld);
  const newKey=normalizeCategoryName(cleanNew);
  const db=loadDB();
  if(oldKey!==newKey){
    const exists=(db.categorie||[]).some(c=>normalizeCategoryName(c)===newKey) || (db.articoli||[]).some(a=>normalizeCategoryName(a?.categoria)===newKey);
    if(exists){ toast('Esiste già una categoria con questo nome'); return; }
  }
  db.categorie=(db.categorie||[]).map(c=>normalizeCategoryName(c)===oldKey ? cleanNew : c);
  if(!(db.categorie||[]).some(c=>normalizeCategoryName(c)===newKey)) db.categorie.push(cleanNew);
  db.categorie=[...new Set((db.categorie||[]).map(c=>String(c||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'it',{sensitivity:'base'}));
  db.articoli=(db.articoli||[]).map(a=> normalizeCategoryName(a?.categoria)===oldKey ? {...a, categoria: cleanNew, _ts: Date.now()} : a);
  if(artBrowseState.categoria && normalizeCategoryName(artBrowseState.categoria)===oldKey){
    setArtBrowse(artBrowseState.level, cleanNew, artBrowseState.brand||'', false);
  }
  if(!saveDB(db)) return;
  renderCategorySettings();
  refreshArticleCategorySelects(cleanNew);
  renderArt();
  toast('Categoria aggiornata');
}
function deleteCategory(nome){
  const clean=String(nome||'').trim().replace(/\s+/g,' ');
  if(!clean) return;
  askConfirm(`Elimino la categoria "${clean}"? Gli articoli restano salvati ma finiscono in "Senza categoria".`,()=>{
    const db=loadDB();
    const key=normalizeCategoryName(clean);
    db.categorie=(db.categorie||[]).filter(c=>normalizeCategoryName(c)!==key);
    db.articoli=(db.articoli||[]).map(a=>{
      if(normalizeCategoryName(a?.categoria)!==key) return a;
      return {...a, categoria:'', _ts: Date.now()};
    });
    if(!saveDB(db)) return;
    if(artBrowseState.categoria && normalizeCategoryName(artBrowseState.categoria)===key){
      setArtBrowse('categorie','','',false);
    }
    renderCategorySettings();
    refreshArticleCategorySelects();
    renderArt();
    toast('Categoria eliminata');
  },'Elimina categoria');
}
function refreshArticleCategorySelects(selectedEdit=''){
  const db=loadDB();
  const options=articleCategoryOptions(db);
  const qSel=document.getElementById('qArtCat');
  const editSel=document.getElementById('a_cat');
  if(qSel){
    const prev=String(qSel.value||'').trim();
    qSel.innerHTML='<option value="">Tutte le categorie</option>'+options.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('');
    qSel.value=options.includes(prev)?prev:'';
  }
  if(editSel){
    const wanted=String(selectedEdit||editSel.value||'').trim();
    editSel.innerHTML='<option value="">Seleziona categoria</option>'+options.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('');
    if(wanted && !options.includes(wanted)) editSel.innerHTML += `<option value="${esc(wanted)}">${esc(wanted)}</option>`;
    editSel.value=wanted||'';
  }
}

const DEFAULT_BRANDS=['Louis Vuitton','Gucci','Chanel','Dior','Alexander McQueen','Balenciaga','Versace'];
function normalizeBrandName(v){
  return String(v||'').trim().replace(/\s+/g,' ').toLowerCase();
}
function articleBrandOptions(db){
  const seen=new Set();
  const out=[];
  const push=(v)=>{
    const clean=String(v||'').trim().replace(/\s+/g,' ');
    if(!clean || /^senza\s+brand$/i.test(clean)) return;
    const key=normalizeBrandName(clean);
    if(!key || seen.has(key)) return;
    seen.add(key);
    out.push(clean);
  };
  DEFAULT_BRANDS.forEach(push);
  (Array.isArray(db?.brands)?db.brands:[]).forEach(push);
  (Array.isArray(db?.articoli)?db.articoli:[]).forEach(a=>push(a?.brand));
  return out.sort((a,b)=>a.localeCompare(b,'it',{sensitivity:'base'}));
}
function renderBrandSettings(){
  const db=loadDB();
  const box=document.getElementById('brandList');
  const hint=document.getElementById('brandHint');
  if(!box) return;
  const brands=articleBrandOptions(db);
  const savedSet=new Set((Array.isArray(db?.brands)?db.brands:[]).map(normalizeBrandName));
  box.innerHTML=brands.length?brands.map(b=>`<div class="row" style="grid-template-columns:1fr auto auto;gap:8px"><div class="main"><div class="t">${esc(b)}</div><div class="small">${savedSet.has(normalizeBrandName(b))?'Brand salvato nelle impostazioni':'Brand rilevato da articoli già esistenti'}</div></div><div><button class="btn smallish" type="button" data-action="renameBrand" data-name="${esc(b)}">Modifica</button></div><div><button class="btn danger smallish" type="button" data-action="deleteBrand" data-name="${esc(b)}">Elimina</button></div></div>`).join(''):'<div class="small">Nessun brand salvato.</div>';
  if(hint) hint.textContent='Puoi aggiungere, rinominare o eliminare i brand. Se elimini un brand, gli articoli restano ma finiscono in Senza brand.';
}
function refreshArticleBrandSelects(selected=''){
  const sel=document.getElementById('a_brand');
  if(!sel) return;
  const options=articleBrandOptions(loadDB());
  const wanted=String(selected||getArticleBrandValue()||'').trim();
  sel.innerHTML='<option value="">Seleziona brand</option>' + options.map(b=>`<option value="${esc(b)}">${esc(b)}</option>`).join('') + '<option value="__ALTRO__">Altro</option>';
  if(wanted && options.includes(wanted)){
    sel.value=wanted;
  }else if(wanted){
    sel.value='__ALTRO__';
  }else{
    sel.value='';
  }
  handleBrandSelectionChange();
}
function addBrand(){
  const input=document.getElementById('brandName');
  const nome=String(input?.value||'').trim().replace(/\s+/g,' ');
  if(!nome){ toast('Scrivi il nome brand'); return; }
  const db=loadDB();
  const key=normalizeBrandName(nome);
  const exists=articleBrandOptions(db).some(b=>normalizeBrandName(b)===key);
  if(exists){ toast('Brand già presente'); return; }
  db.brands=[...(Array.isArray(db.brands)?db.brands:[]), nome].sort((a,b)=>a.localeCompare(b,'it',{sensitivity:'base'}));
  if(!saveDB(db)) return;
  if(input) input.value='';
  renderBrandSettings();
  refreshArticleBrandSelects(nome);
  toast('Brand salvato');
}
function renameBrand(oldName){
  const cleanOld=String(oldName||'').trim().replace(/\s+/g,' ');
  if(!cleanOld) return;
  const nuovo=window.prompt('Nuovo nome brand', cleanOld);
  if(nuovo===null) return;
  const cleanNew=String(nuovo||'').trim().replace(/\s+/g,' ');
  if(!cleanNew){ toast('Nome brand vuoto'); return; }
  const oldKey=normalizeBrandName(cleanOld);
  const newKey=normalizeBrandName(cleanNew);
  const db=loadDB();
  if(oldKey!==newKey && articleBrandOptions(db).some(b=>normalizeBrandName(b)===newKey)){
    toast('Esiste già un brand con questo nome'); return;
  }
  db.brands=(Array.isArray(db.brands)?db.brands:[]).map(b=>normalizeBrandName(b)===oldKey ? cleanNew : b);
  if(!(Array.isArray(db.brands)?db.brands:[]).some(b=>normalizeBrandName(b)===newKey)) db.brands.push(cleanNew);
  db.brands=[...new Set((db.brands||[]).map(b=>String(b||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'it',{sensitivity:'base'}));
  db.articoli=(db.articoli||[]).map(a=> normalizeBrandName(a?.brand)===oldKey ? {...a, brand: cleanNew, _ts: Date.now()} : a);
  if(artBrowseState.brand && normalizeBrandName(artBrowseState.brand)===oldKey){
    setArtBrowse(artBrowseState.level, artBrowseState.categoria||'', cleanNew, false);
  }
  if(!saveDB(db)) return;
  renderBrandSettings();
  refreshArticleBrandSelects(cleanNew);
  renderArt();
  toast('Brand aggiornato');
}
function deleteBrand(nome){
  const clean=String(nome||'').trim().replace(/\s+/g,' ');
  if(!clean) return;
  askConfirm(`Elimino il brand "${clean}"? Gli articoli restano salvati ma finiscono in "Senza brand".`,()=>{
    const db=loadDB();
    const key=normalizeBrandName(clean);
    db.brands=(db.brands||[]).filter(b=>normalizeBrandName(b)!==key);
    db.articoli=(db.articoli||[]).map(a=> normalizeBrandName(a?.brand)===key ? {...a, brand:'', _ts: Date.now()} : a);
    if(artBrowseState.brand && normalizeBrandName(artBrowseState.brand)===key){
      setArtBrowse('brands', artBrowseState.categoria||'', '', false);
    }
    if(!saveDB(db)) return;
    renderBrandSettings();
    refreshArticleBrandSelects();
    renderArt();
    toast('Brand eliminato');
  },'Elimina brand');
}
function getBrandPresetList(){
  return articleBrandOptions(loadDB());
}


const ART_ICONS={
  'borse':'👜','borsa':'👜','portafogli':'👛','portafoglio':'👛','cinture':'👔','cintura':'👔','scarpe':'👠','scarpa':'👠',
  'gioielli':'💍','orologi':'⌚','occhiali':'🕶️','accessori':'✨'
};
const artBrowseState={level:'categorie',categoria:'',brand:''};
function normalizeCategoryValue(raw){
  const v=String(raw??'').trim();
  return (!v || /^senza\s+categoria$/i.test(v)) ? '' : v;
}
function displayCategoryValue(raw){
  return normalizeCategoryValue(raw) || 'Senza categoria';
}
function normalizeBrandValue(raw){
  const v=String(raw??'').trim();
  return (!v || /^senza\s+brand$/i.test(v)) ? '' : v;
}
function displayBrandValue(raw){
  return normalizeBrandValue(raw) || 'Senza brand';
}
function matchesBrowseCategory(articleValue, browseValue){
  return displayCategoryValue(articleValue)===displayCategoryValue(browseValue);
}
function matchesBrowseBrand(articleValue, browseValue){
  return displayBrandValue(articleValue)===displayBrandValue(browseValue);
}
function artIconForCategory(cat){
  const key=normalizeCategoryValue(cat).toLowerCase();
  return ART_ICONS[key] || '🛍️';
}
function setArtBrowse(level,categoria='',brand='',pushHistory=true){
  artBrowseState.level=level;
  artBrowseState.categoria=categoria||'';
  artBrowseState.brand=brand||'';
  if(pushHistory && currentHistoryPage()==='articoli'){
    history.pushState({page:'articoli', artBrowse:{...artBrowseState}},'', '#articoli');
  }
}
function renderArtBreadcrumbs(){
  const box=document.getElementById('artBreadcrumbs');
  if(!box) return;
  const parts=[`<button class="artCrumb ${artBrowseState.level==='categorie'?'active':''}" type="button" data-action="artBackToCategories">Categorie</button>`];
  if(artBrowseState.categoria){
    parts.push(`<button class="artCrumb ${artBrowseState.level==='brands'?'active':''}" type="button" data-action="artBackToBrands">${esc(artBrowseState.categoria)}</button>`);
  }
  if(artBrowseState.brand){
    parts.push(`<span class="artCrumb active">${esc(artBrowseState.brand)}</span>`);
  }
  box.innerHTML=parts.join('');
  box.style.display=(artBrowseState.categoria||artBrowseState.brand)?'flex':'none';
}
function renderArt(){
  const db=loadDB();
  refreshArticleCategorySelects();
  const q=document.getElementById('qArt').value.trim().toLowerCase();
  const catFilter=String(document.getElementById('qArtCat')?.value||'').trim();
  const items=db.articoli.filter(a=>{
    const catLabel=displayCategoryValue(a.categoria);
    const brandLabel=displayBrandValue(a.brand);
    const hay=((a.codice||'')+' '+brandLabel+' '+(a.modello||'')+' '+catLabel+' '+(a.descrizione||'')+' '+(a.colore||'')+' '+(a.taglia||'')+' '+(a.variante||'')).toLowerCase();
    const okText=!q || hay.includes(q);
    const okCat=!catFilter || displayCategoryValue(a.categoria)===displayCategoryValue(catFilter);
    return okText && okCat;
  }).sort((a,b)=>Number(b._ts||0)-Number(a._ts||0));
  const el=document.getElementById('listArt');
  renderArtBreadcrumbs();
  if(q){
    const cards=items.map(a=>{
      const promo=pseudoPromoBadge(a);
      return `<div class="artCard tight" data-open="art" data-id="${a.id}">
        <img class="artThumbLarge" data-photo-for="${a.id}"/>
        <div class="artPlaceholder" data-placeholder-for="${a.id}">${artIconForCategory(a.categoria)}</div>
        <div class="artMeta"><div class="t">${esc(a.modello||a.codice||'-')}</div><div class="s">${esc(displayBrandValue(a.brand))} • ${esc(displayCategoryValue(a.categoria))}</div>${promo}</div>
        <div class="artPrice">${money(currentPrice(a))}</div>
        <div class="artActions"><button class="btn orderAdd small" type="button" data-action="addArtToOrder" data-id="${a.id}">Aggiungi a ordine</button><button class="btn smallish" type="button" data-action="duplicateArt" data-id="${a.id}">Duplica</button></div>
      </div>`;
    }).join('');
    el.innerHTML=cards || `<div class="card" style="grid-column:1/-1"><div class="small">Nessun articolo trovato.</div></div>`;
    hydrateArticleThumbs(items);
    return;
  }

  if(artBrowseState.level==='articoli' && artBrowseState.categoria && artBrowseState.brand){
    const scoped=items.filter(a=>matchesBrowseCategory(a.categoria, artBrowseState.categoria) && matchesBrowseBrand(a.brand, artBrowseState.brand));
    const cards=scoped.map(a=>{
      const promo=pseudoPromoBadge(a);
      return `<div class="artCard tight" data-open="art" data-id="${a.id}">
        <img class="artThumbLarge" data-photo-for="${a.id}"/>
        <div class="artPlaceholder" data-placeholder-for="${a.id}">${artIconForCategory(a.categoria)}</div>
        <div class="artMeta"><div class="t">${esc(a.modello||a.codice||'-')}</div><div class="s">${esc(a.codice||'Senza codice')} • ${esc(qualityFromCode(a.codice)||'')}</div>${promo}</div>
        <div class="artPrice">${money(currentPrice(a))}</div>
        <div class="artActions"><button class="btn orderAdd small" type="button" data-action="addArtToOrder" data-id="${a.id}">Aggiungi a ordine</button><button class="btn smallish" type="button" data-action="duplicateArt" data-id="${a.id}">Duplica</button></div>
      </div>`;
    }).join('');
    el.innerHTML=cards || `<div class="card" style="grid-column:1/-1"><div class="small">Nessun articolo in questo brand.</div></div>`;
    hydrateArticleThumbs(scoped);
    return;
  }

  if(artBrowseState.level==='brands' && artBrowseState.categoria){
    const scoped=items.filter(a=>matchesBrowseCategory(a.categoria, artBrowseState.categoria));
    const groups=new Map();
    scoped.forEach(a=>{
      const brand=displayBrandValue(a.brand);
      if(!groups.has(brand)) groups.set(brand,{brand,count:0,latest:0});
      const g=groups.get(brand); g.count+=1; g.latest=Math.max(g.latest,Number(a._ts||0));
    });
    const brands=[...groups.values()].sort((a,b)=>b.count-a.count || b.latest-a.latest || a.brand.localeCompare(b.brand));
    el.innerHTML=brands.map(g=>`<div class="artCard" data-action="openArtBrand" data-category="${esc(artBrowseState.categoria)}" data-brand="${esc(g.brand)}"><div class="artCardHead"><div class="artMeta"><div class="t">${esc(g.brand)}</div><div class="s">Brand</div></div><div class="artIcon">🏷️</div></div><div class="artCount">${g.count} articol${g.count===1?'o':'i'}</div></div>`).join('') || `<div class="card" style="grid-column:1/-1"><div class="small">Nessun brand in questa categoria.</div></div>`;
    return;
  }

  const groups=new Map();
  items.forEach(a=>{
    const categoria=displayCategoryValue(a.categoria);
    if(!groups.has(categoria)) groups.set(categoria,{categoria,count:0,latest:0,brands:new Set()});
    const g=groups.get(categoria); g.count+=1; g.latest=Math.max(g.latest,Number(a._ts||0)); if(normalizeBrandValue(a.brand)) g.brands.add(normalizeBrandValue(a.brand));
  });
  const cats=[...groups.values()].sort((a,b)=>b.count-a.count || b.latest-a.latest || a.categoria.localeCompare(b.categoria));
  el.innerHTML=cats.map(g=>`<div class="artCard" data-action="openArtCategory" data-category="${esc(g.categoria)}"><div class="artCardHead"><div class="artMeta"><div class="t">${esc(g.categoria)}</div><div class="s">Categorie articoli</div></div><div class="artIcon">${artIconForCategory(g.categoria)}</div></div><div class="artCount">${g.count} articol${g.count===1?'o':'i'} • ${g.brands.size} brand</div></div>`).join('') || `<div class="card" style="grid-column:1/-1"><div class="small">Nessun articolo</div></div>`;
}
async function hydrateArticleThumbs(items){
  for(const a of items){
    const pics=await getArticlePics(a);
    const el=document.querySelector('[data-photo-for="'+a.id+'"]');
    const ph=document.querySelector('[data-placeholder-for="'+a.id+'"]');
    if(el && pics[0]){ el.src=pics[0]; el.style.display='block'; if(ph) ph.style.display='none'; }
    else if(ph){ ph.style.display='flex'; }
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
    const totalCls=orderPaidStatus(o)?'pricePaid':'priceHot';
    const profitVal=orderMargin(o, db);
    return `<div class="row" data-open="ord" data-id="${o.id}" style="grid-template-columns:1fr auto">
      <div>
        <div class="t">${esc(c?c.nome:'-')} • <span class="${totalCls}">${money(o.totale||0)}</span></div>
        <div class="s">${esc(o.stato||'-')} • ${esc(o.data||'')}${o.mis?` • Mis. ${esc(o.mis)}`:''}${o.tracking?` • Track ${esc(o.tracking)}`:''}</div>
        <div class="s">Guadagno <span class="pricePaid">${money(profitVal)}</span></div>
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

function renderAll(){ renderHome(); renderArt(); renderCli(); renderOrd(); renderFinanze(); renderCategorySettings(); renderBrandSettings(); refreshArticleCategorySelects(); refreshArticleBrandSelects(); }

/* ====== ART view/edit ====== */
let currentArtId=null;
let currentArtExistingPics=[];
let currentArtPhotosCleared=false;
let currentArtDuplicateData=null;
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
  document.getElementById('vArtBrand').textContent=a.brand||'-';
  document.getElementById('vArtForn').textContent=a.fornitore||'-';
  document.getElementById('vArtPrezzo').textContent=money(a.prezzoVendita||0);
  document.getElementById('vArtPrezzoUse').textContent=money(currentPrice(a));
  const pill=document.getElementById('vArtPromoPill');
  pill.innerHTML = promoValid(a)?`<div class="pill promo" style="margin-top:6px"><span class="dot"></span>PROMO attiva</div>`:(a.promoAttiva?`<div class="pill" style="margin-top:6px">PROMO impostata</div>`:'');
  document.getElementById('vArtPost').value=buildPost(a);
  fitTextarea(document.getElementById('vArtPost'));
  const vArtSupplierLink=document.getElementById('vArtSupplierLink');
  if(vArtSupplierLink) vArtSupplierLink.value=(a.fornitoreLink||'').trim();
  show('mArtView');
}
async function openArtEdit(id){
  const db=loadDB();
  const a=id?db.articoli.find(x=>x.id===id):null;
  currentArtId=id||null;
  currentArtDuplicateData=null;
  currentArtPhotosCleared=false;
  document.getElementById('artEditTitle').textContent = a?'Modifica articolo':'Nuovo articolo';
  const set=(k,v)=>document.getElementById(k).value=(v===0?0:(v||''));

  if(!a){
    ['a_cod','a_mod','a_desc','a_forn','a_taglia','a_variante','a_colore','a_mis','a_usd','a_promo_price','a_promo_date','a_note','a_post','a_qual','a_eur','a_sell','a_final','a_margin','a_margin_pct']
    .forEach(fid => document.getElementById(fid).value='');
    syncBrandField('');
    refreshArticleCategorySelects('');
    document.getElementById('a_promo_on').checked=false;
    document.getElementById('a_photo').value='';
    currentArtExistingPics=[];
    renderArtPhotoPrev([]);
    show('mArtEdit');
    return;
  }
  set('a_cod', a?.codice); syncBrandField(a?.brand); set('a_mod', a?.modello);
  refreshArticleCategorySelects(a?.categoria||'');
  set('a_desc', a?.descrizione); set('a_forn', a?.fornitore); set('a_forn_link', a?.fornitoreLink||'');
  set('a_taglia', a?.taglia); set('a_variante', a?.variante); set('a_colore', a?.colore);
  set('a_mis', a?.misura); set('a_usd', a?.costoUsd||'');
  document.getElementById('a_promo_on').checked = !!a?.promoAttiva;
  set('a_promo_date', a?.scadenzaPromo); set('a_promo_price', a?.prezzoPromo||'');
  document.getElementById('a_note').value=a?.note||'';
  document.getElementById('a_post').value=a?.post||'';
  fitTextarea(document.getElementById('a_post'));
  document.getElementById('a_photo').value='';
  renderArtAutoFields();
  currentArtExistingPics=await getArticlePics(a);
  renderArtPhotoPrev(currentArtExistingPics);
  show('mArtEdit');
}
function renderArtPhotoPrev(pics){
  const box=document.getElementById('a_photo_prev');
  box.innerHTML=(pics||[]).map(src=>`<img src="${src}"/>`).join('') || `<div class="small">Nessuna foto articolo</div>`;
}
function mergePreviewPics(existingPics,newPics){
  const out=[];
  for(const src of [...(existingPics||[]), ...(newPics||[])]){
    if(src && !out.includes(src)) out.push(src);
    if(out.length>=6) break;
  }
  return out;
}
async function filesToObjectUrls(fileList,maxCount){
  const files=Array.from(fileList||[]).filter(f=>f && String(f.type||'').startsWith('image/')).slice(0,Math.max(0,maxCount||0));
  return files.map(f=>URL.createObjectURL(f));
}
function revokeObjectUrls(urls){
  (urls||[]).forEach(src=>{ if(typeof src==='string' && src.startsWith('blob:')){ try{ URL.revokeObjectURL(src); }catch(_e){} } });
}
async function refreshArtPhotoPreviewFromInput(){
  const input=document.getElementById('a_photo');
  if(!input) return;
  const maxNew=Math.max(0, 6 - (Array.isArray(currentArtExistingPics)?currentArtExistingPics.length:0));
  const files=Array.from(input.files||[]).filter(f=>f && String(f.type||'').startsWith('image/'));
  if(files.length>maxNew){
    toast(`Puoi aggiungere ancora ${maxNew} foto`);
    const dt=new DataTransfer();
    files.slice(0,maxNew).forEach(f=>dt.items.add(f));
    input.files=dt.files;
  }
  const selected=Array.from(input.files||[]);
  const blobUrls=await filesToObjectUrls(selected,maxNew);
  renderArtPhotoPrev(mergePreviewPics(currentArtExistingPics, blobUrls));
  setTimeout(()=>revokeObjectUrls(blobUrls), 1200);
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
  updateSupplierField(document.getElementById('a_forn')?.value||'');

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
      brand:getArticleBrandValue(),
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
    codice:code, brand:getArticleBrandValue(),
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
async function compressImageBlob(file,maxSide=1600,quality=0.78){
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
      canvas.toBlob((blob)=>{
        if(blob) return res(blob);
        try{
          const fallback=canvas.toDataURL('image/jpeg',quality);
          fetch(fallback).then(r=>r.blob()).then(res).catch(()=>rej(new Error('Compressione foto fallita')));
        }catch(err){ rej(err); }
      }, 'image/jpeg', quality);
    };
    img.onerror=()=>rej(new Error('Impossibile leggere la foto selezionata'));
    img.src=src;
  });
}

async function duplicateCurrentArticle(sourceId=null){
  const articleId=sourceId || currentArtId;
  if(!articleId){ toast('Apri prima un articolo'); return; }
  const db=loadDB();
  const a=db.articoli.find(x=>x.id===articleId);
  if(!a){ toast('Articolo non trovato'); return; }
  const clone=JSON.parse(JSON.stringify(a));
  currentArtId=null;
  currentArtPhotosCleared=false;
  currentArtDuplicateData={
    foto: Array.isArray(clone?.foto) ? clone.foto.filter(Boolean).slice(0,6) : [],
    photoIds: Array.isArray(clone?.photoIds) ? clone.photoIds.filter(Boolean).slice(0,6) : []
  };
  hide('mArtView', true);
  document.getElementById('artEditTitle').textContent='Duplica articolo';
  document.getElementById('a_cod').value='';
  syncBrandField(clone.brand||'');
  document.getElementById('a_mod').value=clone.modello||'';
  refreshArticleCategorySelects(clone.categoria||'');
  document.getElementById('a_desc').value=clone.descrizione||'';
  updateSupplierField(clone.fornitore||'');
  document.getElementById('a_forn_link').value=clone.fornitoreLink||'';
  document.getElementById('a_taglia').value=clone.taglia||'';
  document.getElementById('a_variante').value=clone.variante||'';
  document.getElementById('a_colore').value=clone.colore||'';
  document.getElementById('a_mis').value=clone.misura||'';
  document.getElementById('a_usd').value=clone.costoUsd||'';
  document.getElementById('a_promo_on').checked=!!clone.promoAttiva;
  document.getElementById('a_promo_date').value=clone.scadenzaPromo||'';
  document.getElementById('a_promo_price').value=clone.prezzoPromo||'';
  document.getElementById('a_note').value=clone.note||'';
  document.getElementById('a_post').value=clone.post||'';
  fitTextarea(document.getElementById('a_post'));
  document.getElementById('a_photo').value='';
  currentArtExistingPics=await getArticlePics(a);
  renderArtPhotoPrev(currentArtExistingPics);
  renderArtAutoFields();
  show('mArtEdit');
  toast('Articolo duplicato: cambia il codice e salva');
}

async function saveArt(){
  try{
    const db=loadDB();
    const code=document.getElementById('a_cod').value.trim();
    if(!code){ toast('Codice articolo obbligatorio'); return; }

    const codeLower=safeLower(code);
    const exists = db.articoli.find(a => 
      safeLower(a?.codice) === codeLower
      && a.id !== currentArtId
    );
    if(exists){
      toast('Codice articolo già esistente');
      return;
    }
    const qual=qualityFromCode(code);
    const usd=Number(document.getElementById('a_usd').value||0);
    const r=calcFromUsd(usd, qual);
    const old=currentArtId?db.articoli.find(x=>x.id===currentArtId):(currentArtDuplicateData||null);
    const keptFoto=currentArtPhotosCleared ? [] : (Array.isArray(old?.foto) ? old.foto.filter(x=>typeof x==='string' && !String(x).startsWith('data:')).slice() : []);
    const keptPhotoIds=currentArtPhotosCleared ? [] : (Array.isArray(old?.photoIds) ? old.photoIds.filter(Boolean).slice() : []);
    const obj={
      id: currentArtId||uid(),
      codice: code,
      brand: getArticleBrandValue(),
      modello: document.getElementById('a_mod').value.trim(),
      categoria: document.getElementById('a_cat').value.trim(),
      descrizione: document.getElementById('a_desc').value.trim(),
      fornitore: document.getElementById('a_forn').value.trim(),
      fornitoreLink: document.getElementById('a_forn_link').value.trim(),
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
      foto: keptFoto,
      photoIds: keptPhotoIds
    };
    const photoInput=document.getElementById('a_photo');
    const selectedFiles=Array.from(photoInput?.files||[]).filter(f=>f && String(f.type||'').startsWith('image/'));
    let photoUploadWarning='';
    if(selectedFiles.length){
      obj.foto = Array.isArray(obj.foto) ? obj.foto.filter(x=>typeof x==='string' && !String(x).startsWith('data:')) : [];
      obj.photoIds = Array.isArray(obj.photoIds) ? obj.photoIds.filter(Boolean) : [];
      const existingCount=Math.max((obj.foto||[]).length, (obj.photoIds||[]).length);
      const maxNew=Math.max(0, 6 - existingCount);
      const filesToSave=selectedFiles.slice(0,maxNew);
      if(selectedFiles.length>maxNew) photoUploadWarning=`Caricate ${maxNew} foto, limite massimo raggiunto`;

      if(filesToSave.length){
        const localPhotoIds=[];
        for(const file of filesToSave){
          try{
            const blob=await compressImageBlob(file);
            const pid='ph_'+uid();
            await idbSet(pid, blob);
            localPhotoIds.push(pid);
          }catch(localErr){
            console.warn('Salvataggio foto locale fallito', localErr);
            try{
              const dataUrl=await compressImageFile(file);
              const pid='ph_'+uid();
              await idbSet(pid, dataUrl);
              localPhotoIds.push(pid);
              photoUploadWarning='Una o più foto salvate in modalità compatibile';
            }catch(fallbackErr){
              console.warn('Fallback foto fallito', fallbackErr);
              photoUploadWarning='Una o più foto non salvate';
            }
          }
        }
        obj.photoIds=[...new Set([...(obj.photoIds||[]), ...localPhotoIds])].slice(0,6);
      }
    }
    obj._ts=Date.now();
    const i=db.articoli.findIndex(x=>x.id===obj.id);
    if(i>=0) db.articoli[i]=obj; else db.articoli.unshift(obj);
    if(!saveDB(db)){
      const oldFoto=Array.isArray(old?.foto)?old.foto.filter(Boolean):[];
      const newlyUploaded=(Array.isArray(obj.foto)?obj.foto.filter(Boolean):[]).filter(path=>!oldFoto.includes(path));
      if(newlyUploaded.length){ try{ await deleteArticlePhotosFromSupabase(newlyUploaded); }catch(_e){} }
      return;
    }
    currentArtDuplicateData=null;
    currentArtPhotosCleared=false;
    hide('mArtEdit');
    if(photoUploadWarning) toast('Articolo salvato. '+photoUploadWarning);
    else toast('Articolo salvato');
    if(cloudEnabled()){
      try{
        const saved=await cloudSaveOne('art', obj, db);
        const idx=db.articoli.findIndex(x=>x.id===obj.id || x.codice===obj.codice);
        if(idx>=0) db.articoli[idx]={...db.articoli[idx], ...saved, _ts: Date.now()};
        saveDBLocal(db);
      }catch(cloudErr){
        console.error('Sync cloud articolo fallita', cloudErr);
        toast('Articolo salvato, ma cloud non aggiornato');
      }
    }
  }catch(err){
    toast('Errore salvataggio articolo'); console.error(err);
  }
}
async function deleteArt(){
  if(!currentArtId) return hide('mArtEdit');
  const artId=currentArtId;
  askConfirm('Elimino questo articolo?', async ()=>{
    const db=loadDB();
    const old=db.articoli.find(a=>a.id===artId);
    if(!old){ hide('mArtEdit'); hide('mArtView'); currentArtId=null; renderArt(); return; }
    for(const pid of (old?.photoIds||[])){
      try{ await idbDelete(pid); }catch(_e){}
    }
    try{ await deleteArticlePhotosFromSupabase(old?.foto||[]); }catch(_e){}
    db.articoli=db.articoli.filter(a=>a.id!==artId);
    currentArtId=null;
    if(!saveDB(db)) return;
    hide('mArtEdit');
    hide('mArtView');
    renderAll();
    if(old && cloudEnabled()){
      try{
        await cloudDeleteOne('art', old);
        toast('Articolo eliminato');
      }catch(err){
        console.error('Eliminazione cloud articolo fallita', err);
        toast('Articolo eliminato, ma cloud non aggiornato');
      }
    }else{
      toast('Articolo eliminato');
    }
  },'Elimina articolo');
}

function openCliView(id){
  const db=loadDB(); const c=db.clienti.find(x=>x.id===id);
  if(!c) return;
  currentCliId=id;
  document.getElementById('vCliNome').textContent=c.nome||'-';
  document.getElementById('vCliTel').textContent=withIntlPrefix(c.telefono||'')||'-';
  document.getElementById('vCliInd').textContent=c.indirizzo||'-';
  document.getElementById('vCliCap').textContent=c.cap||'-';
  document.getElementById('vCliCity').textContent=c.citta||'-';
  document.getElementById('vCliProv').textContent=c.provincia||'-';
  document.getElementById('vCliNote').textContent=c.note||'-';
  const ship=document.getElementById('vCliShip');
  ship.value=buildShippingAddress(c);
  fitTextarea(ship);
  show('mCliView');
}

let currentOrdExistingManualPhotos=[];

function mergeUniquePics(){
  const out=[];
  Array.from(arguments).flat().forEach(src=>{
    if(src && !out.includes(src)) out.push(src);
  });
  return out.slice(0,12);
}
async function getOrderArticleSnapshotPhotos(rows, db){
  const pics=[];
  for(const r of (rows||[])) {
    const art=(db.articoli||[]).find(a=>a.id===r.articoloId || a.codice===r.codice);
    if(!art) continue;
    try{
      const artPics=await getArticlePics(art);
      for(const src of (artPics||[])) {
        if(src && !pics.includes(src)) pics.push(src);
        if(pics.length>=12) return pics;
      }
    }catch(err){ console.warn('Lettura foto articolo per ordine fallita', err); }
  }
  return pics.slice(0,12);
}
async function refreshOrdPhotoPreviewFromState(){
  const input=document.getElementById('o_photo');
  const box=document.getElementById('o_photo_prev');
  if(!box) return;
  const db=loadDB();
  const articlePics=await getOrderArticleSnapshotPhotos(ordRows, db);
  const maxNew=Math.max(0, 12 - mergeUniquePics(articlePics, currentOrdExistingManualPhotos).length);
  const files=Array.from(input?.files||[]).filter(f=>f && String(f.type||'').startsWith('image/'));
  if(input && files.length>maxNew){
    toast(`Puoi aggiungere ancora ${maxNew} foto`);
    const dt=new DataTransfer();
    files.slice(0,maxNew).forEach(f=>dt.items.add(f));
    input.files=dt.files;
  }
  const selected=Array.from(input?.files||[]);
  const blobUrls=await filesToObjectUrls(selected, maxNew);
  const pics=mergeUniquePics(articlePics, currentOrdExistingManualPhotos, blobUrls);
  box.innerHTML=pics.map(src=>`<img src="${src}"/>`).join('') || `<div class="small">Nessuna foto ordine</div>`;
  setTimeout(()=>revokeObjectUrls(blobUrls), 1200);
}

async function openOrdView(id){
  const db=loadDB(); const o=db.ordini.find(x=>x.id===id);
  if(!o) return;
  currentOrdId=id;
  const c=db.clienti.find(x=>x.id===o.clienteId);
  const subTotale=calcOrderSubtotal(o.righe||[]);
  const scontoCliente=calcOrderDiscount(o);
  const totale=(Number(o?.totale)>0 || subTotale===0) ? Number(o?.totale||0) : calcOrderNetTotal(o.righe||[], scontoCliente);
  const paid=orderPaidStatus(o);
  const profit=orderMargin(o, db);
  const totalEl=document.getElementById('vOrdTot');
  const profitEl=document.getElementById('vOrdProfit');
  const cumEl=document.getElementById('vOrdCumMeta');
  document.getElementById('vOrdCli').textContent=c?.nome||'-';
  document.getElementById('vOrdStato').textContent=o.stato||'-';
  document.getElementById('vOrdData').textContent=o.data||'-';
  document.getElementById('vOrdMis').textContent=o.mis||'-';
  document.getElementById('vOrdTrack').textContent=o.tracking||'-';
  document.getElementById('vOrdNote').textContent=o.note||'-';
  document.getElementById('vOrdSub').textContent=money(subTotale);
  document.getElementById('vOrdDiscount').textContent=money(scontoCliente);
  totalEl.textContent=money(totale);
  totalEl.className='t '+(paid?'pricePaid':'priceHot');
  profitEl.textContent=money(profit);
  profitEl.className='t pricePaid';
  const righeOrd=Array.isArray(o.righe)?o.righe:[];
  if(righeOrd.length>1){
    cumEl.style.display='block';
    cumEl.innerHTML=`Totale pagato <span class="${paid?'pricePaid':'priceHot'}">${money(orderIncassato(o))}</span> • Guadagno cumulativo <span class="pricePaid">${money(profit)}</span>`;
  }else{
    cumEl.style.display='none';
    cumEl.textContent='';
  }
  const rows=document.getElementById('vOrdRows');
  rows.innerHTML=righeOrd.map(r=>`<div class="row" style="grid-template-columns:1fr auto"><div><div class="t">${esc(r.codice||'')} • ${esc(r.modello||'')}</div><div class="s">Prezzo ${money(r.prezzo||0)}</div></div><div class="pill">Riga</div></div>`).join('') || `<div class="small">Nessuna riga</div>`;
  const ordPics=await getOrderPics(o, db);
  document.getElementById('vOrdPhotos').innerHTML=ordPics.map(src=>`<img src="${src}" onclick="window.open('${src}','_blank','noopener')"/>`).join('');
  document.getElementById('vOrdPhotosEmpty').style.display=ordPics.length?'none':'block';
  show('mOrdView');
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

  const old=currentCliId?db.clienti.find(c=>c.id===currentCliId):null;
  const candidate={
    ...old,
    id: currentCliId||uid(),
    nome,
    cognome: old?.cognome||'',
    email: old?.email||'',
    telefono: document.getElementById('c_tel').value.trim(),
    indirizzo: document.getElementById('c_ind').value.trim(),
    cap: document.getElementById('c_cap').value.trim(),
    citta: document.getElementById('c_citta').value.trim(),
    provincia: document.getElementById('c_prov').value,
    note: document.getElementById('c_note').value,
    _ts: Date.now()
  };
  const candidateKey=normalizeClientDedupKey(candidate) || normalizeTextKey(candidate.nome);
  const exists = db.clienti.find(c => c.id !== currentCliId && (normalizeClientDedupKey(c) || normalizeTextKey(c?.nome)) === candidateKey);
  if(exists){
    toast('Cliente già esistente');
    return;
  }
  const obj={
    ...candidate,
    nome: normalizeClientDisplayName(candidate),
    telefono: normalizePhone(candidate.telefono),
    email: normalizeEmail(candidate.email),
    indirizzo: normalizeSpaceText(candidate.indirizzo),
    cap: normalizeSpaceText(candidate.cap),
    citta: normalizeSpaceText(candidate.citta),
    provincia: normalizeSpaceText(candidate.provincia)
  };
  const i=db.clienti.findIndex(x=>x.id===obj.id);
  if(i>=0) db.clienti[i]=obj; else db.clienti.unshift(obj);
  if(!saveDB(db)) return;
  hide('mCliEdit');
  toast('Cliente salvato');
  if(cloudEnabled()){
    try{
      const saved=await cloudSaveOne('cli', obj, db);
      const savedKey=normalizeClientDedupKey(saved) || normalizeClientDedupKey(obj) || normalizeTextKey(saved?.nome||obj?.nome);
      const idx=db.clienti.findIndex(x=>x.id===obj.id || x.id===saved?.id || (normalizeClientDedupKey(x) || normalizeTextKey(x?.nome))===savedKey);
      if(idx>=0) db.clienti[idx]={...db.clienti[idx], ...saved, nome:normalizeClientDisplayName({...db.clienti[idx], ...saved}), _ts: Date.now()};
      saveDBLocal(db);
    }catch(cloudErr){
      console.error('Sync cloud cliente fallita', cloudErr);
      toast('Cliente salvato, ma cloud non aggiornato');
    }
  }
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
const ORDER_SHOE_SIZES=['34','35','36','37','38','39','40','41','42','43','44','45'];
function orderRowNeedsShoeSize(row, db){
  const art=(db?.articoli||[]).find(a=>a.id===row?.articoloId || (row?.codice && a.codice===row.codice));
  const cat=normalizeTextKey(art?.categoria||row?.categoria||'');
  return ['scarpa','scarpe','shoe','shoes'].some(token=>cat===token || cat.includes(token));
}
function orderNeedsShoeSize(rows, db){
  return (Array.isArray(rows)?rows:[]).some(row=>orderRowNeedsShoeSize(row, db||loadDB()));
}
function ensureOrderSizeOption(value){
  const sel=document.getElementById('o_mis');
  if(!sel) return;
  const clean=String(value||'').trim();
  Array.from(sel.querySelectorAll('option[data-temp-size="1"]')).forEach(opt=>opt.remove());
  if(clean && !ORDER_SHOE_SIZES.includes(clean) && !Array.from(sel.options).some(opt=>opt.value===clean)){
    const opt=document.createElement('option');
    opt.value=clean;
    opt.textContent=clean;
    opt.dataset.tempSize='1';
    sel.insertBefore(opt, sel.firstElementChild?.nextElementSibling || null);
  }
}
function updateOrderShoeSizeState(){
  const sel=document.getElementById('o_mis');
  const hint=document.getElementById('o_mis_hint');
  if(!sel) return false;
  const needed=orderNeedsShoeSize(ordRows, loadDB());
  sel.required=needed;
  const firstOpt=sel.querySelector('option[value=""]');
  if(firstOpt) firstOpt.textContent=needed ? 'Seleziona misura' : 'Non necessaria';
  if(!needed && !ORDER_SHOE_SIZES.includes(String(sel.value||''))) sel.value='';
  if(hint) hint.textContent=needed ? 'Per le scarpe la misura è obbligatoria.' : 'Obbligatoria solo per ordini con scarpe.';
  return needed;
}
async function openOrdEdit(id, prefillArticleId=null){
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
  ensureOrderSizeOption(o?.mis||'');
  document.getElementById('o_mis').value=o?.mis||'';
  document.getElementById('o_tracking').value=o?.tracking||'';
  document.getElementById('o_discount').value=calcOrderDiscount(o) ? String(calcOrderDiscount(o)).replace('.', ',') : '';
  document.getElementById('o_art').value='';
  document.getElementById('o_price').value='';
  document.getElementById('o_photo').value='';
  currentOrdExistingManualPhotos=o ? await getOrderManualPics(o) : [];
  ordRows=(o?.righe||[]).slice();
  if(prefillArticleId){
    const a=db.articoli.find(x=>x.id===prefillArticleId);
    if(a && !ordRows.some(r=>r.articoloId===prefillArticleId)){
      ordRows.push({articoloId:a.id, codice:a?.codice||'', modello:a?.modello||'', prezzo:Number(currentPrice(a)||0)});
    }
  }
  renderOrdRows();
  updateOrderPriceFromSelection();
  updateOrderTotalsPreview();
  updateOrderShoeSizeState();
  await refreshOrdPhotoPreviewFromState();
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
  updateOrderShoeSizeState();
}
function getTrackingValue(){
  const editVal=String(document.getElementById('o_tracking')?.value||'').trim();
  if(editVal) return editVal;
  const viewVal=String(document.getElementById('vOrdTrack')?.textContent||'').trim();
  return viewVal==='-' ? '' : viewVal;
}
function openTrack17(){
  const code=getTrackingValue();
  if(!code){ toast('Inserisci il tracking'); return; }
  window.open(`https://17track.net/en/track?nums=${encodeURIComponent(code)}`,'_blank','noopener');
}
function openTrackParcel(){
  const code=getTrackingValue();
  if(!code){ toast('Inserisci il tracking'); return; }
  const fallback=`https://parcelapp.net/track/${encodeURIComponent(code)}`;
  const now=Date.now();
  window.location.href=`parcel://track/${encodeURIComponent(code)}`;
  setTimeout(()=>{ if(Date.now()-now < 1800) window.open(fallback,'_blank','noopener'); }, 900);
}
function renderOrdRows(){
  const box=document.getElementById('o_rows');
  box.innerHTML=ordRows.map((r,i)=>`<div class="row" style="grid-template-columns:1fr auto">
    <div><div class="t">${esc(r.codice)} • ${esc(r.modello)}</div><div class="s">${money(r.prezzo||0)}</div></div>
    <button class="btn danger" data-action="delRow" data-i="${i}">X</button>
  </div>`).join('') || `<div class="small">Nessuna riga</div>`;
  updateOrderTotalsPreview();
  updateOrderShoeSizeState();
  refreshOrdPhotoPreviewFromState().catch(err=>console.warn('Preview foto ordine fallita', err));
}
async function saveOrd(){
  const db=loadDB();
  const cli=document.getElementById('o_cli').value;
  if(!cli){ toast('Seleziona un cliente'); return; }
  if(!ordRows.length){ toast('Aggiungi almeno una riga'); return; }
  const totals=updateOrderTotalsPreview();
  const subtotal=totals.subtotal;
  const scontoCliente=totals.discount;
  const tot=totals.total;
  const misuraSel=document.getElementById('o_mis');
  const misuraValue=String(misuraSel?.value||'').trim();
  if(updateOrderShoeSizeState() && !ORDER_SHOE_SIZES.includes(misuraValue)){
    toast('Per le scarpe devi scegliere una misura da 34 a 45');
    misuraSel?.focus();
    return;
  }
  const old=currentOrdId?db.ordini.find(x=>x.id===currentOrdId):null;
  const articlePics=await getOrderArticleSnapshotPhotos(ordRows, db);
  const photoInput=document.getElementById('o_photo');
  const selectedFiles=Array.from(photoInput?.files||[]).filter(f=>f && String(f.type||'').startsWith('image/'));
  const existingManualIds=Array.isArray(old?.orderPhotoIds)?old.orderPhotoIds.filter(Boolean).slice(0,12):[];
  const existingManualLegacy=Array.isArray(old?.fotoManuali)?old.fotoManuali.filter(Boolean).slice(0,12):[];
  const existingManualCount=Math.max(existingManualIds.length, existingManualLegacy.length, Array.isArray(currentOrdExistingManualPhotos)?currentOrdExistingManualPhotos.length:0);
  const maxNew=Math.max(0, 12 - mergeUniquePics(articlePics, currentOrdExistingManualPhotos).length);
  const newManualIds=[];
  const newManualLegacy=[];
  for(const file of selectedFiles.slice(0,maxNew)){
    try{
      const blob=await compressImageBlob(file);
      const pid='oph_'+uid();
      await idbSet(pid, blob);
      newManualIds.push(pid);
    }catch(err){
      console.warn('Compressione foto ordine fallita', err);
      try{
        const dataUrl=await compressImageFile(file, 1400, 0.76);
        const pid='oph_'+uid();
        await idbSet(pid, dataUrl);
        newManualIds.push(pid);
        newManualLegacy.push(dataUrl);
      }catch(_e){}
    }
  }
  const manualCount=existingManualCount + newManualIds.length;
  const allOrderPics=mergeUniquePics(articlePics, currentOrdExistingManualPhotos);
  const newOrderId=currentOrdId||('ORD-'+uid().slice(0,6).toUpperCase());
  const obj={
    id: newOrderId,
    numeroOrdine: ensureOrderNumber({ id:newOrderId, numeroOrdine: old?.numeroOrdine }),
    clienteId: cli,
    stato: document.getElementById('o_stato').value,
    data: document.getElementById('o_data').value.trim()||todayStr(),
    note: document.getElementById('o_note').value.trim(),
    mis: misuraValue,
    tracking: document.getElementById('o_tracking').value.trim(),
    righe: ordRows.slice(),
    fotoArticoli: [],
    fotoManuali: [...existingManualLegacy, ...newManualLegacy].slice(0,12),
    orderPhotoIds: [...new Set([...existingManualIds, ...newManualIds])].slice(0,12),
    foto: [],
    subTotale: subtotal,
    scontoCliente,
    totale: tot,
    _ts: Date.now()
  };
  const i=db.ordini.findIndex(x=>x.id===obj.id);
  if(i>=0) db.ordini[i]=obj; else db.ordini.unshift(obj);
  if(!saveDB(db)) return;
  hide('mOrdEdit');
  toast(manualCount || articlePics.length ? 'Ordine salvato con foto' : 'Ordine salvato');
  if(cloudEnabled()){
    try{
      const saved=await cloudSaveOne('ord', obj, db);
      const idx=db.ordini.findIndex(x=>x.id===obj.id || x.id===saved?.id);
      if(idx>=0) db.ordini[idx]={...db.ordini[idx], ...saved, _ts: Date.now()};
      saveDBLocal(db);
    }catch(cloudErr){
      console.error('Sync cloud ordine fallita', cloudErr);
      toast('Ordine salvato, ma cloud non aggiornato');
    }
  }
}
async function deleteOrd(){
  if(!currentOrdId) return hide('mOrdEdit');
  
  const db=loadDB();
  const old=db.ordini.find(o=>o.id===currentOrdId);
  for(const pid of (old?.orderPhotoIds||[])){
    try{ await idbDelete(pid); }catch(_e){}
  }
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
  const mode=(document.getElementById('importMode')?.value||'replace');
  const r=new FileReader();
  r.onload=async()=>{
    try{
      const parsed=JSON.parse(r.result);
      const incoming=normalizeDBShape(parsed);
      if(!incoming || !Array.isArray(incoming.articoli)||!Array.isArray(incoming.clienti)||!Array.isArray(incoming.ordini)) throw new Error('JSON non compatibile');
      for(const art of incoming.articoli){
        art.photoIds=Array.isArray(art.photoIds)?art.photoIds.filter(Boolean).slice(0,6):[];
        if(Array.isArray(art.foto) && art.foto.length){
          for(const src of art.foto.slice(0,6)){
            const pid='ph_'+uid();
            await idbSet(pid,src);
            art.photoIds.push(pid);
          }
        }
        art.foto=[];
      }
      let nextDb=incoming;
      if(mode==='merge'){
        const curr=loadDB();
        nextDb=normalizeDBShape({
          version: incoming.version || curr.version || 'v6.2',
          createdAt: curr.createdAt || incoming.createdAt || new Date().toISOString(),
          articoli: [...(curr.articoli||[]), ...(incoming.articoli||[])],
          clienti: [...(curr.clienti||[]), ...(incoming.clienti||[])],
          ordini: [...(curr.ordini||[]), ...(incoming.ordini||[])],
          categorie: [...new Set([...(curr.categorie||[]), ...(incoming.categorie||[])])],
          brands: [...new Set([...(curr.brands||[]), ...(incoming.brands||[])])]
        });
      }
      updateShippingNotifications(nextDb,'json-import');
      if(!saveDB(nextDb)) throw new Error('Salvataggio locale fallito');
      renderAll();
      document.getElementById('importHint').textContent = mode==='merge' ? 'Import OK. JSON unito ai dati già presenti.' : 'Import OK. Database sostituito con il JSON.';
      toast(mode==='merge' ? 'Import unito ai dati attuali' : 'Import sostitutivo completato');
    }catch(e){
      toast('Import fallito'); console.error(e);
    }
  };
  r.readAsText(file);
}


function searchStartsWith(candidate, query){
  const value=normalizeTextKey(candidate);
  const q=normalizeTextKey(query);
  if(!q || !value) return false;
  if(value.startsWith(q)) return true;
  return value.split(/[^a-z0-9àèéìòóù]+/i).some(part=>part && part.startsWith(q));
}
function getSearchSuggestions(kind, query){
  const q=String(query||'').trim();
  if(!q) return [];
  const db=loadDB();
  const out=[];
  const add=(value)=>{
    const clean=normalizeSpaceText(value);
    if(!clean) return;
    if(!searchStartsWith(clean, q)) return;
    if(out.some(v=>normalizeTextKey(v)===normalizeTextKey(clean))) return;
    out.push(clean);
  };
  if(kind==='art' || kind==='orderArt'){
    (db.articoli||[]).forEach(a=>{
      add(a.codice);
      add(a.modello);
      add(a.brand);
    });
  }
  if(kind==='cli' || kind==='orderCli'){
    (db.clienti||[]).forEach(c=>{
      add(c.nome);
      add(c.telefono);
      add(c.citta);
    });
  }
  if(kind==='ord'){
    (db.ordini||[]).forEach(o=>{
      add(o.numeroOrdine||o.id);
      add(o.id);
      add(o.stato);
      const cli=(db.clienti||[]).find(c=>c.id===o.clienteId);
      add(cli?.nome||'');
    });
  }
  return out.slice(0,8);
}
function hideSearchSuggest(boxId){
  const box=document.getElementById(boxId);
  if(!box) return;
  box.innerHTML='';
  box.classList.remove('show');
}
function renderSearchSuggest(boxId, items, onPick){
  const box=document.getElementById(boxId);
  if(!box) return;
  if(!items.length){ hideSearchSuggest(boxId); return; }
  box.innerHTML=items.map(item=>`<button type="button">${esc(item)}</button>`).join('');
  box.classList.add('show');
  Array.from(box.querySelectorAll('button')).forEach((btn,idx)=>btn.addEventListener('click',()=>onPick(items[idx])));
}
function bindSearchSuggest(inputId, boxId, kind, onApply){
  const input=document.getElementById(inputId);
  const box=document.getElementById(boxId);
  if(!input || !box) return;
  const apply=(value)=>{
    input.value=value;
    hideSearchSuggest(boxId);
    onApply(value);
  };
  input.addEventListener('input',()=>{
    const value=input.value||'';
    onApply(value);
    const items=getSearchSuggestions(kind, value);
    renderSearchSuggest(boxId, items, apply);
  });
  input.addEventListener('blur',()=>setTimeout(()=>hideSearchSuggest(boxId), 180));
  input.addEventListener('focus',()=>{
    const items=getSearchSuggestions(kind, input.value||'');
    renderSearchSuggest(boxId, items, apply);
  });
}

/* ====== EVENTS ====== */
document.addEventListener('click',(ev)=>{
  const el=ev.target.closest('[data-action],[data-go],[data-open]');
  if(!el) return;
  if(el.dataset.go){ ev.preventDefault(); go(el.dataset.go); return; }
  if(el.dataset.open){
    const id=el.dataset.id;
    if(el.dataset.open==='art') openArtView(id);
    if(el.dataset.open==='cli') openCliView(id);
    if(el.dataset.open==='ord') openOrdView(id);
    return;
  }
  const a=el.dataset.action;
  if(a==='newArt') return openArtEdit(null);
  if(a==='openArtCategory'){ setArtBrowse('brands', el.dataset.category||''); return renderArt(); }
  if(a==='openArtBrand'){ setArtBrowse('articoli', el.dataset.category||'', el.dataset.brand||''); return renderArt(); }
  if(a==='artBackToCategories'){ setArtBrowse('categorie'); return renderArt(); }
  if(a==='artBackToBrands'){ setArtBrowse('brands', artBrowseState.categoria||''); return renderArt(); }
  if(a==='newCli') return openCliEdit(null);
  if(a==='newOrd') return openOrdEdit(null);
  if(a==='exportFull') return exportDB('full');
  if(a==='exportLite') return exportDB('lite');
  if(a==='refreshDiag'){ renderDiagnostics(); toast('Diagnostica aggiornata'); return; }
  if(a==='saveUiPrefs'){ saveUiPrefsData(readUiEditor()); applyUiPrefs(); toast('Interfaccia aggiornata'); return; }
  if(a==='loadUiPrefs'){ fillUiEditor(); applyUiPrefs(); toast('Editor ricaricato'); return; }
  if(a==='resetUiPrefs'){ localStorage.removeItem(UI_KEY); fillUiEditor(); applyUiPrefs(); toast('Editor ripristinato'); return; }
  if(a==='repairArchive'){
    askConfirm('Riparo archivio foto e pulizia riferimenti sporchi?', ()=>repairArchive().then(()=>toast('Archivio riparato')).catch(err=>{toast('Riparazione fallita'); console.error(err);}),'Ripara archivio');
    return;
  }
  if(a==='hardReset'){
    askConfirm('Azzero tutti i dati locali di questa app? Cancello archivio locale, foto, cache e login cloud locale.', async ()=>{
      try{
        const keep=[];
        try{
          for(let i=0;i<localStorage.length;i++){
            const k=localStorage.key(i);
            if(k) keep.push(k);
          }
        }catch(_e){}
        const appKeys=[KEY, UI_KEY, SHIP_ALERTS_KEY, SHIP_SNAPSHOT_KEY, ...(typeof LEGACY_KEYS!=='undefined'?LEGACY_KEYS:[])];
        [...new Set([...keep, ...appKeys])].forEach(k=>{ try{ localStorage.removeItem(k); }catch(_e){} });
        try{ sessionStorage.clear(); }catch(_e){}
        try{
          if(typeof indexedDB!=='undefined'){
            await new Promise(res=>{
              const req=indexedDB.deleteDatabase(PHOTO_DB);
              req.onsuccess=req.onerror=req.onblocked=()=>res(true);
            });
          }
        }catch(_e){}
        try{
          if('serviceWorker' in navigator){
            const regs=await navigator.serviceWorker.getRegistrations();
            await Promise.all(regs.map(r=>r.unregister()));
          }
        }catch(_e){}
        try{
          if(window.caches){
            const ks=await caches.keys();
            await Promise.all(ks.map(k=>caches.delete(k)));
          }
        }catch(_e){}
        try{ cloudSession=null; cloudClient=null; }catch(_e){}
      }catch(err){ console.error('Hard reset fallito', err); }
      location.href='reset.html?ts='+Date.now();
    }, 'Reset totale');
    return;
  }
  if(a==='addCategory') return addCategory();
  if(a==='renameCategory') return renameCategory(el.dataset.name||'');
  if(a==='deleteCategory') return deleteCategory(el.dataset.name||'');
  if(a==='addBrand') return addBrand();
  if(a==='renameBrand') return renameBrand(el.dataset.name||'');
  if(a==='deleteBrand') return deleteBrand(el.dataset.name||'');
  if(a==='copyPost') return copyTextFrom(document.getElementById('vArtPost'));
  if(a==='downloadArtPhotos') return downloadCurrentArticlePhotos();
  if(a==='openSupplierLink'){ const link=String(document.getElementById('vArtSupplierLink')?.value||'').trim(); if(!link){ toast('Nessun link fornitore'); return; } const safe=/^https?:\/\//i.test(link)?link:'https://'+link; window.open(safe,'_blank'); return; }
  if(a==='copyCliShip') return copyTextFrom(document.getElementById('c_ship'));
  if(a==='copyCliShipView') return copyTextFrom(document.getElementById('vCliShip'));
  if(a==='editCliFromView'){ hide('mCliView', true); return openCliEdit(currentCliId); }
  if(a==='closeCliView') return hide('mCliView');
  if(a==='editOrdFromView'){ hide('mOrdView', true); return openOrdEdit(currentOrdId); }
  if(a==='closeOrdView') return hide('mOrdView');
  if(a==='track17View') return openTrack17();
  if(a==='openParcelView') return openTrackParcel();
  if(a==='addArtToOrder'){ const id=el.dataset.id; if(id) return openOrdEdit(null, id); return; }
  if(a==='addArtToOrderFromView'){
    if(!currentArtId){ toast('Articolo non trovato'); return; }
    hide('mArtView');
    requestAnimationFrame(()=>openOrdEdit(null, currentArtId));
    return;
  }
  if(a==='duplicateArt') return duplicateCurrentArticle(el.dataset.id || null);
  if(a==='editFromView'){ hide('mArtView', true); return openArtEdit(currentArtId); }
  if(a==='closeView') return hide('mArtView');
  if(a==='closeEdit') return hide('mArtEdit');
  if(a==='clearArtPhotos'){ currentArtExistingPics=[]; currentArtPhotosCleared=true; document.getElementById('a_photo').value=''; renderArtPhotoPrev([]); toast('Foto attuali rimosse'); return; }
  if(a==='saveArt') return saveArt();
  if(a==='deleteArt') return deleteArt();
  if(a==='saveCli') return saveCli();
  if(a==='closeCli') return hide('mCliEdit');
  if(a==='deleteCli') return deleteCli();
  if(a==='saveOrd') return saveOrd();
  if(a==='closeOrd') return hide('mOrdEdit');
  if(a==='deleteOrd') return deleteOrd();
  if(a==='addRow') return addRow();
  if(a==='track17') return openTrack17();
  if(a==='openParcel') return openTrackParcel();
  if(a==='cloudPull'){ document.getElementById('cloudSyncMini')?.classList.remove('show'); return pullCloudToLocal().catch(err=>{toast(err?.message||'Carica cloud fallita'); console.error(err);}); }
  if(a==='cloudPush'){ document.getElementById('cloudSyncMini')?.classList.remove('show'); return pushLocalToCloud().catch(err=>{toast(err?.message||'Invia cloud fallita'); console.error(err);}); }
  if(a==='doCloudLogin') return cloudLogin();
  if(a==='closeCloudLogin') return hide('mCloudLogin');
  if(a==='confirmYes') return closeConfirm(true);
  if(a==='confirmNo') return closeConfirm(false);
  if(a==='delRow'){ const i=Number(el.dataset.i); ordRows.splice(i,1); renderOrdRows(); updateOrderShoeSizeState(); return; }
});

bindSearchSuggest('qArt','qArtSuggest','art', ()=>renderArt());
document.getElementById('qArtCat')?.addEventListener('change', renderArt);
bindSearchSuggest('qCli','qCliSuggest','cli', ()=>renderCli());
['c_nome','c_tel','c_ind','c_cap','c_citta','c_prov'].forEach(id=>{ const el=document.getElementById(id); if(el) el.addEventListener('input', refreshClientShipping); if(el) el.addEventListener('change', refreshClientShipping); });
bindSearchSuggest('qOrd','qOrdSuggest','ord', ()=>renderOrd());
document.getElementById('catName')?.addEventListener('keydown',(ev)=>{ if(ev.key==='Enter'){ ev.preventDefault(); addCategory(); } });
document.getElementById('brandName')?.addEventListener('keydown',(ev)=>{ if(ev.key==='Enter'){ ev.preventDefault(); addBrand(); } });

['a_cod','a_brand','a_brand_custom','a_mod','a_mis','a_usd','a_promo_on','a_promo_price','a_promo_date','a_forn','a_desc','a_taglia','a_variante','a_colore'].forEach(id=>{
  const el=document.getElementById(id);
  const evt=(id==='a_promo_on' || id==='a_forn' || id==='a_brand') ? 'change' : 'input';
  el.addEventListener(evt, renderArtAutoFields);
  if(id==='a_cod') el.addEventListener('change', renderArtAutoFields);
});

bindSearchSuggest('o_cli_q','oCliSuggest','orderCli', value=>fillClientSelect(loadDB(), value));
bindSearchSuggest('o_art_q','oArtSuggest','orderArt', value=>{
  fillArtSelect(loadDB(), value);
  updateOrderPriceFromSelection();
});
document.getElementById('o_art').addEventListener('change', updateOrderPriceFromSelection);
document.getElementById('o_discount').addEventListener('input', updateOrderTotalsPreview);

document.getElementById('importFile').addEventListener('change',(e)=>{
  const f=e.target.files[0];
  if(f) importDB(f);
  e.target.value='';
});
document.getElementById('a_brand')?.addEventListener('change', handleBrandSelectionChange);
document.getElementById('a_photo')?.addEventListener('change', refreshArtPhotoPreviewFromInput);
document.getElementById('btnCloudLogin')?.addEventListener('click', ()=>show('mCloudLogin'));
document.getElementById('btnCloudLogout')?.addEventListener('click', cloudLogout);
document.addEventListener('visibilitychange', ()=>{ if(!document.hidden) autoCloudPullNow('visible'); });
window.addEventListener('focus', ()=>autoCloudPullNow('focus'));

// Province select
const provSel=document.getElementById('c_prov');
provSel.innerHTML='<option value="">Seleziona</option>'+PROVINCE.map(p=>`<option value="${p}">${p}</option>`).join('');

/* ====== CLOUD / SUPABASE ====== */
let cloudClient=null;
let cloudSession=null;
let cloudBusy=false;

const VG_BUILD='2026-03-18-cloudfix-r2';
const AUTO_CLOUD_PULL_MS=180000;
let autoCloudPullTimer=null;
let autoCloudPullRunning=false;
let autoCloudPullLastAt=0;
function refreshAutoCloudPull(){
  if(autoCloudPullTimer){ clearInterval(autoCloudPullTimer); autoCloudPullTimer=null; }
  if(!cloudEnabled()) return;
  autoCloudPullTimer=setInterval(()=>{ autoCloudPullNow('timer'); }, AUTO_CLOUD_PULL_MS);
}
async function autoCloudPullNow(reason='manual'){
  if(!cloudEnabled() || autoCloudPullRunning || cloudBusy || document.hidden) return;
  const now=Date.now();
  if(reason!=='focus' && reason!=='visible' && (now-autoCloudPullLastAt)<60000) return;
  autoCloudPullRunning=true;
  autoCloudPullLastAt=now;
  try{
    await pullCloudToLocal({silent:true, background:true});
    console.log('Auto cloud pull ok', reason);
  }catch(err){
    console.warn('Auto cloud pull fallita', reason, err);
  }finally{
    autoCloudPullRunning=false;
  }
}
const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SUPABASE_BUCKET='articoli';
const isUuid=v=>UUID_RE.test(String(v||''));
function cloudUi(){
  const uiPrefs=loadUiPrefs();
  const s=document.getElementById('cloudState');
  const bIn=document.getElementById('btnCloudLogin');
  const bPull=document.getElementById('btnCloudPull');
  const bPush=document.getElementById('btnCloudPush');
  const bOut=document.getElementById('btnCloudLogout');
  if(!s||!bIn||!bPull||!bPush||!bOut) return;
  const logged=!!cloudSession;
  const hide=(el,on)=>{ el.hidden=!!on; el.style.display=on?'none':''; };
  const setDisabled=(el,on)=>{ el.disabled=!!on; el.style.opacity=on?'.65':''; };
  if(!window.VG_SUPABASE_READY){
    s.textContent=uiPrefs.cloud||'Cloud';
    hide(bIn,true); hide(bPull,true); hide(bPush,true); hide(bOut,true);
    return;
  }
  if(cloudBusy){ s.textContent=(uiPrefs.cloud||'Cloud')+': lavoro in corso…'; }
  else if(cloudSession?.user?.email){ s.textContent=`${uiPrefs.cloud||'Cloud'}: ${cloudSession.user.email}`; }
  else { s.textContent=uiPrefs.cloud||'Cloud'; }
  hide(bIn,logged);
  hide(bPull,!logged);
  hide(bPush,!logged);
  hide(bOut,!logged);
  setDisabled(bIn,cloudBusy);
  setDisabled(bPull,cloudBusy||!logged);
  setDisabled(bPush,cloudBusy||!logged);
  setDisabled(bOut,cloudBusy||!logged);
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
  cloudClient.auth.onAuthStateChange((_e,session)=>{ cloudSession=session||null; cloudUi(); refreshAutoCloudPull(); if(cloudSession) setTimeout(()=>autoCloudPullNow('login'), 1500); });
  cloudUi();
  return cloudClient;
}
function saveDBLocal(db){
  try{
    const cleanDb=normalizeDBShape(db||defDB());
    const raw=JSON.stringify(cleanDb);
    localStorage.setItem(KEY, raw);
    try{ localStorage.setItem(KEY+'_backup_latest', raw); }catch(_e){}
  }catch(err){ console.error(err); }
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
    nome: art.modello || art.codice || [art.brand, art.modello].filter(Boolean).join(' ').trim() || 'Articolo',
    descrizione: packCloudArticleDescription(art),
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
  const pics=await getArticleCloudSyncSources(art);
  let cloudFoto=[];
  try{
    cloudFoto=await syncArticlePhotosToCloud(data.id, art.codice||data.sku||data.id, pics);
  }catch(err){
    console.warn('Sync foto cloud fallita', err);
  }
  const finalFoto=normalizeCloudPhotoPathList(cloudFoto.length?cloudFoto:(art.foto||[]));
  try{
    await sb.from('prodotti').update({ descrizione: packCloudArticleDescription({...art, foto: finalFoto}) }).eq('id', data.id);
  }catch(metaErr){
    console.warn('Aggiornamento meta cloud articolo fallito', metaErr);
  }
  return {...art, id:data.id, foto: finalFoto, _cloud:true};
}
async function deleteCloudArticle(art){
  const sb=await ensureCloud();
  if(!sb||!cloudSession) return;
  try{
    if(isUuid(art?.id)){
      const { data:rows } = await sb.from('prodotti_foto').select('path').eq('prodotto_id', art.id);
      const paths=(rows||[]).map(r=>r.path).filter(Boolean);
      if(paths.length) await deleteArticlePhotosFromSupabase(paths);
      await sb.from('prodotti_foto').delete().eq('prodotto_id', art.id);
      const {error}=await sb.from('prodotti').delete().eq('id', art.id);
      if(error) throw error;
    }else if(art?.codice){
      const {error}=await sb.from('prodotti').delete().eq('sku', art.codice);
      if(error) throw error;
    }
  }catch(err){ throw err; }
}
async function upsertCloudClient(cli){
  const sb=await ensureCloud();
  if(!sb||!cloudSession) return cli;
  const nameParts=splitClientNameForCloud(cli);
  const payload={
    nome: nameParts.nome || 'Cliente',
    cognome: nameParts.cognome || null,
    telefono: normalizePhone(cli.telefono || null) || null,
    email: normalizeEmail(cli.email || null) || null,
    indirizzo: cli.indirizzo || null,
    citta: cli.citta || null,
    cap: cli.cap || null,
    provincia: cli.provincia || null,
    paese: 'Italia',
    note: cli.note || null
  };
  let data=null, error=null;
  let matchedId=isUuid(cli.id) ? cli.id : null;

  if(!matchedId && payload.email){
    const existing=await sb.from('clienti').select('*').eq('email', payload.email).maybeSingle();
    if(existing.data && !existing.error) matchedId=existing.data.id;
  }
  if(!matchedId && payload.telefono){
    const existing=await sb.from('clienti').select('*').eq('telefono', payload.telefono).maybeSingle();
    if(existing.data && !existing.error) matchedId=existing.data.id;
  }
  if(!matchedId && payload.nome){
    const probeKey=normalizeClientDedupKey({...cli, nome:normalizeClientDisplayName(cli), cognome:nameParts.cognome, email:payload.email, telefono:payload.telefono});
    const existing=await sb.from('clienti').select('*').eq('nome', payload.nome).limit(20);
    const rows=Array.isArray(existing.data) ? existing.data : [];
    const match=rows.find(row=>normalizeClientDedupKey({nome:[row.nome,row.cognome].filter(Boolean).join(' ').trim(), cognome:row.cognome, telefono:row.telefono, email:row.email, indirizzo:row.indirizzo, citta:row.citta, cap:row.cap})===probeKey);
    if(match) matchedId=match.id;
  }

  if(matchedId){
    ({data,error}=await sb.from('clienti').upsert({...payload,id:matchedId}).select('*').single());
  }else{
    ({data,error}=await sb.from('clienti').insert(payload).select('*').single());
  }
  if(error) throw error;
  return {...cli, id:data.id, nome:normalizeClientDisplayName({nome:data.nome, cognome:data.cognome}), cognome:data.cognome||cli.cognome||'', telefono:data.telefono||cli.telefono||'', email:data.email||cli.email||'', _cloud:true};
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
    note: buildOrderCloudNote(ord),
    tracking_code: ord.tracking || null,
    tracking_url: ord.tracking ? `https://17track.net/en/track?nums=${encodeURIComponent(ord.tracking)}` : null
  };
  if(isUuid(ord.id)) payload.id=ord.id;
  const {data,error}=await sb.from('ordini').upsert(payload,{onConflict:'numero_ordine'}).select('*').single();
  if(error) throw error;
  const ordineId=data.id;
  const {error:delErr}=await sb.from('righe_ordine').delete().eq('ordine_id', ordineId);
  if(delErr) throw delErr;
  const righe=[];
  let remainingDiscount=calcOrderDiscount(ord);
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
    const prezzoUnitario=Math.max(0, Number(r.prezzo||0));
    const lineDiscount=Math.min(remainingDiscount, prezzoUnitario);
    remainingDiscount=Math.max(0, remainingDiscount-lineDiscount);
    righe.push({ordine_id:ordineId, prodotto_id:prodottoId, quantita:1, prezzo_unitario:prezzoUnitario, sconto:Number(lineDiscount.toFixed(2))});
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
async function pullCloudToLocal(opts={}){
  const sb=await ensureCloud();
  if(!sb||!cloudSession) throw new Error('Login cloud mancante');
  const bg=!!opts.background;
  if(!bg){
    try{ localStorage.setItem(KEY+'_backup_before_cloud_pull', localStorage.getItem(KEY)||''); }catch(_){ }
    cloudBusy=true; cloudUi();
  }
  try{
    const [{data:cats,error:catsErr},{data:prod,error:prodErr},{data:cli,error:cliErr},{data:ord,error:ordErr},{data:righe,error:righeErr},{data:fotos,error:fotosErr}] = await Promise.all([
      sb.from('categorie').select('id,nome'),
      sb.from('prodotti').select('*').order('created_at',{ascending:false}),
      sb.from('clienti').select('*').order('created_at',{ascending:false}),
      sb.from('ordini').select('*').order('data_ordine',{ascending:false}),
      sb.from('righe_ordine').select('ordine_id,prodotto_id,prezzo_unitario,sconto,prodotti(id,sku,nome)'),
      sb.from('prodotti_foto').select('prodotto_id,path,ordine').order('ordine',{ascending:true})
    ]);
    if(catsErr||prodErr||cliErr||ordErr||righeErr||fotosErr) throw (catsErr||prodErr||cliErr||ordErr||righeErr||fotosErr);
    const catMap=new Map((cats||[]).map(c=>[c.id,c.nome]));
    const prodMap=new Map((prod||[]).map(p=>[p.id,p]));
    const fotoByProd=new Map();
    (fotos||[]).forEach(r=>{
      const arr=fotoByProd.get(r.prodotto_id)||[];
      const rawPath=String(r?.path||'').trim();
      if(rawPath && !/^(blob:|data:|https?:\/\/)/i.test(rawPath)) arr.push(rawPath);
      fotoByProd.set(r.prodotto_id, arr);
    });
    for (const p of (prod||[])) {
      const validRows = normalizeCloudPhotoPathList(fotoByProd.get(p.id) || []);
      if (validRows.length) {
        fotoByProd.set(p.id, validRows);
        continue;
      }
      const packed=unpackCloudArticleDescription(p.descrizione||'');
      const meta=(packed.meta&&typeof packed.meta==='object')?packed.meta:{};
      const metaPaths=normalizeCloudPhotoPathList(meta.foto || meta.fotoCloud || []);
      if (metaPaths.length) {
        fotoByProd.set(p.id, metaPaths);
        continue;
      }
      const fallbackPaths = normalizeCloudPhotoPathList(await listCloudFotoPathsByCode(p.sku||''));
      if (fallbackPaths.length) fotoByProd.set(p.id, fallbackPaths);
    }
    const righeByOrd=new Map();
    (righe||[]).forEach(r=>{
      const arr=righeByOrd.get(r.ordine_id)||[];
      arr.push({articoloId:r.prodotto_id,codice:r.prodotti?.sku||prodMap.get(r.prodotto_id)?.sku||'',modello:r.prodotti?.nome||prodMap.get(r.prodotto_id)?.nome||'',prezzo:Number(r.prezzo_unitario||0),sconto:Number(r.sconto||0)});
      righeByOrd.set(r.ordine_id,arr);
    });
    const localDb=loadDB();
    const localArtById=new Map((localDb.articoli||[]).map(a=>[a.id,a]));
    const localArtByCode=new Map((localDb.articoli||[]).map(a=>[safeLower(a.codice),a]));
    const localOrdById=new Map((localDb.ordini||[]).map(o=>[o.id,o]));
    const localOrdByNumero=new Map((localDb.ordini||[]).map(o=>[normalizeTextKey(ensureOrderNumber(o)),o]).filter(([k])=>k));
    const localOrdByFingerprint=new Map((localDb.ordini||[]).map(o=>[normalizeOrderFingerprint(o),o]).filter(([k])=>k));
    const db={version:'v6',createdAt:new Date().toISOString(),
      articoli:(prod||[]).map(p=>{
        const local=localArtById.get(p.id)||localArtByCode.get(safeLower(p.sku));
        const packed=unpackCloudArticleDescription(p.descrizione||'');
        const legacy=parseLegacyCloudDescription(packed.plain);
        const meta=(packed.meta&&typeof packed.meta==='object')?packed.meta:{};
        const cleanBrand=p.marca||meta.brand||local?.brand||'';
        const pulledModel=stripBrandFromText(meta.modello||p.nome||'', cleanBrand) || stripBrandFromText(p.nome||'', cleanBrand) || local?.modello || '';
        const pulledDescr=(meta.descrizione||legacy.descrizione||local?.descrizione||'').trim();
        const pulledNote=(meta.note||legacy.note||local?.note||'').trim();
        const pulledPost=(meta.post||local?.post||'').trim();
        const finalFoto=normalizeCloudPhotoPathList(fotoByProd.get(p.id) || meta.foto || meta.fotoCloud || local?.foto || []);
        const pulledCostoUsd=firstFiniteNumber(meta.costoUsd, local?.costoUsd, 0);
        const pulledCostoEur=firstFiniteNumber(p.prezzo_acquisto, p.costo, p.costo_eur, meta.costoEur, local?.costoEur, 0);
        const pulledPrezzoVendita=firstFiniteNumber(p.prezzo_vendita, p.prezzo, p.prezzo_vendita_iva, meta.prezzoVendita, meta.prezzo, local?.prezzoVendita, 0);
        return {id:p.id,codice:p.sku||'',brand:cleanBrand,modello:pulledModel,categoria:meta.categoria||catMap.get(p.categoria_id)||local?.categoria||'',descrizione:pulledDescr,fornitore:meta.fornitore||local?.fornitore||'',fornitoreLink:meta.fornitoreLink||local?.fornitoreLink||'',taglia:meta.taglia||p.taglia||local?.taglia||'',variante:meta.variante||p.materiale||local?.variante||'',colore:meta.colore||p.colore||local?.colore||'',misura:meta.misura||local?.misura||'',costoUsd:pulledCostoUsd,costoEur:pulledCostoEur,prezzoVendita:pulledPrezzoVendita,promoAttiva:(typeof meta.promoAttiva==='boolean') ? meta.promoAttiva : !!local?.promoAttiva,prezzoPromo:firstFiniteNumber(meta.prezzoPromo, local?.prezzoPromo, 0),scadenzaPromo:meta.scadenzaPromo||local?.scadenzaPromo||'',post:pulledPost,note:pulledNote,foto:finalFoto,photoIds:Array.isArray(local?.photoIds)?local.photoIds.filter(Boolean).slice(0,6):[],_ts:Date.now(),_cloud:true};
      }),
      clienti:(cli||[]).map(c=>({id:c.id,nome:normalizeClientDisplayName({nome:c.nome,cognome:c.cognome}),cognome:c.cognome||'',telefono:normalizePhone(c.telefono||''),email:normalizeEmail(c.email||''),indirizzo:c.indirizzo||'',cap:c.cap||'',citta:c.citta||'',provincia:c.provincia||'',note:c.note||'',_ts:Date.now(),_cloud:true})),
      ordini:(ord||[]).map(o=>{ const noteRaw=o.note||''; const noteMeta=extractOrderNoteMeta(noteRaw); const righeOrd=righeByOrd.get(o.id)||[]; const righeDiscount=righeOrd.reduce((sum,row)=>sum+Number(row?.sconto||0),0); const shadow={id:o.id,numeroOrdine:o.numero_ordine,data:o.data_ordine||todayStr(),tracking:o.tracking_code||'',totale:Number(o.totale||0),note:noteMeta.cleanNote,righe:righeOrd}; const local=localOrdById.get(o.id)||localOrdByNumero.get(normalizeTextKey(o.numero_ordine||''))||localOrdByFingerprint.get(normalizeOrderFingerprint(shadow)); const scontoCliente=firstFiniteNumber(noteMeta.scontoCliente, righeDiscount, local?.scontoCliente, 0); const subTotale=calcOrderSubtotal(righeOrd); return {id:o.id,numeroOrdine:ensureOrderNumber({id:o.id,numeroOrdine:o.numero_ordine}),clienteId:o.cliente_id,stato:o.stato==='in_lavorazione'?'Richiesto':(o.stato==='spedito'?'Spedito':(o.stato==='consegnato'?'Consegnato':'Annullato')),data:o.data_ordine||todayStr(),note:noteMeta.cleanNote,mis:noteMeta.mis||'',tracking:o.tracking_code||'',righe:righeOrd,fotoArticoli:[],fotoManuali:Array.isArray(local?.fotoManuali)?local.fotoManuali.filter(Boolean).slice(0,12):[],orderPhotoIds:Array.isArray(local?.orderPhotoIds)?local.orderPhotoIds.filter(Boolean).slice(0,12):[],foto:[],subTotale,scontoCliente,totale:(Number(o.totale)>0 || subTotale===0) ? Number(o.totale||0) : calcOrderNetTotal(righeOrd, scontoCliente),_ts:Date.now(),_cloud:true}; })
    };
    updateShippingNotifications(db, bg?'cloud-auto':'cloud');
    saveDBLocal(db);
    renderAll();
    renderDiagnostics();
    if(!opts.silent) toast('Dati cloud caricati');
  } finally { if(!bg){ cloudBusy=false; cloudUi(); } }
}
async function pushLocalToCloud(){
  const sb=await ensureCloud();
  if(!sb||!cloudSession) throw new Error('Login cloud mancante');
  cloudBusy=true; cloudUi();
  try{
    const db=loadDB();
    if(!db.articoli.length && !db.clienti.length && !db.ordini.length){
      toast('Niente da inviare al cloud');
      return;
    }
    const artIdMap=new Map();
    const cliIdMap=new Map();
    for(let i=0;i<db.articoli.length;i++){
      const oldId=db.articoli[i]?.id;
      const saved=await upsertCloudArticle(db.articoli[i]);
      db.articoli[i]=saved;
      if(oldId && saved?.id && oldId!==saved.id) artIdMap.set(oldId, saved.id);
    }
    for(let i=0;i<db.clienti.length;i++){
      const oldId=db.clienti[i]?.id;
      const saved=await upsertCloudClient(db.clienti[i]);
      db.clienti[i]=saved;
      if(oldId && saved?.id && oldId!==saved.id) cliIdMap.set(oldId, saved.id);
    }
    if(cliIdMap.size || artIdMap.size){
      db.ordini=(db.ordini||[]).map(o=>({
        ...o,
        clienteId: cliIdMap.get(o.clienteId) || o.clienteId,
        righe: (o.righe||[]).map(r=>({ ...r, articoloId: artIdMap.get(r.articoloId) || r.articoloId }))
      }));
    }
    const failed=[];
    for(let i=0;i<db.ordini.length;i++){
      try{
        db.ordini[i]=await upsertCloudOrder(db.ordini[i], db);
      }catch(err){
        console.error('Ordine cloud fallito', db.ordini[i], err);
        failed.push(db.ordini[i]?.numeroOrdine || db.ordini[i]?.id || ('ordine-'+(i+1)));
      }
    }
    saveDBLocal(db);
    renderAll();
    renderDiagnostics();
    if(failed.length){
      toast('Cloud parziale: '+failed.length+' ordini non inviati');
    }else{
      toast('Dati locali mandati nel cloud');
    }
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
fillUiEditor();
applyUiPrefs();
const initial=location.hash.replace('#','')||'home';
history.replaceState({page:initial, artBrowse:{...artBrowseState}},'', '#'+initial);
go(initial,false);
cloudUi();
refreshAutoCloudPull();
requestPersistentStorage();
ensureCloud().catch(err=>console.warn('Cloud init fallita', err));
