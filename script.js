const STORAGE_KEY="vanity_glamour_v9_db";
const DEFAULT_DB={version:9,exportedAt:null,articoli:[],clienti:[],ordini:[]};
let db=structuredClone(DEFAULT_DB);
const euro=v=>"€ "+Number(v||0).toLocaleString("it-IT",{minimumFractionDigits:0,maximumFractionDigits:2});
const todayIso=()=>new Date().toISOString().slice(0,10);
const uid=p=>p+"_"+Math.random().toString(16).slice(2,10);

function ensureDbShape(){db.version=db.version||9;db.articoli=Array.isArray(db.articoli)?db.articoli:[];db.clienti=Array.isArray(db.clienti)?db.clienti:[];db.ordini=Array.isArray(db.ordini)?db.ordini:[]}
function saveDb(refresh=true){db.exportedAt=new Date().toISOString();localStorage.setItem(STORAGE_KEY,JSON.stringify(db));if(refresh)renderAll()}
function loadDb(){const local=localStorage.getItem(STORAGE_KEY);if(local){try{db=JSON.parse(local);ensureDbShape();return renderAll()}catch(e){}}fetch("database.json").then(r=>r.json()).then(data=>{db=data;ensureDbShape();saveDb(false)}).catch(()=>{db=structuredClone(DEFAULT_DB);saveDb(false)})}
function escapeHtml(v){return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;")}
function firstPhoto(item){return Array.isArray(item.foto)&&item.foto.length?item.foto[0]:""}
function parseFotoTextarea(text){return (text||"").split("\n").map(x=>x.trim()).filter(Boolean)}
function setSection(id){document.querySelectorAll(".section").forEach(s=>s.classList.remove("active"));document.getElementById(id).classList.add("active");document.querySelectorAll(".navbtn").forEach(b=>b.classList.toggle("active",b.dataset.section===id))}
function openModal(id){document.getElementById(id).classList.remove("hidden")}
function closeModal(id){document.getElementById(id).classList.add("hidden")}
function roundToNearest5(value){return Math.round(Number(value||0)/5)*5}
function calculatePrice(costoUSD, qualita){const usd=Number(costoUSD||0);const costoEUR=Number(((usd*0.90)+5).toFixed(2));let margine=0;if(qualita==="🔝💯"){margine=costoEUR*0.55;if(margine<50)margine=50;if(margine>60)margine=60}else if(qualita==="🥇"){margine=costoEUR*0.30;if(margine<60)margine=60;if(margine>75)margine=75}margine=Number(margine.toFixed(2));const prezzoFinale=roundToNearest5(costoEUR+margine);return{costoEUR,margine,prezzoFinale}}
function updatePriceCalculation(){const usd=document.getElementById("articleCostoUSD").value;const qualita=document.getElementById("articleQualita").value;const r=calculatePrice(usd,qualita);document.getElementById("articleCostoEUR").value=r.costoEUR||"";document.getElementById("articleMargine").value=r.margine||"";document.getElementById("articlePrezzoVendita").value=r.prezzoFinale||"";document.getElementById("calcCostoTotale").textContent=euro(r.costoEUR);document.getElementById("calcMargine").textContent=euro(r.margine);document.getElementById("calcPrezzoFinale").textContent=euro(r.prezzoFinale)}
function copyPostFb(){const text=document.getElementById("articlePost").value||"";if(!text.trim()){alert("Non c'è nessun post da copiare.");return}navigator.clipboard.writeText(text).then(()=>alert("Post Facebook copiato.")).catch(()=>alert("Impossibile copiare il post."))}
function isPromoSoon(dateStr){if(!dateStr)return false;const today=new Date();today.setHours(0,0,0,0);const d=new Date(dateStr);d.setHours(0,0,0,0);const diff=(d-today)/(1000*60*60*24);return diff>=0 && diff<=3}
function isOrderLate(order){if(!order.scadenza)return false; if((order.stato||"").toLowerCase()==="consegnato") return false; const today=new Date();today.setHours(0,0,0,0); const d=new Date(order.scadenza);d.setHours(0,0,0,0); return d<today}

function renderDashboard(){
 const totalArticles=db.articoli.length,totalClients=db.clienti.length,totalOrders=db.ordini.length,totalProfit=db.ordini.reduce((s,o)=>s+Number(o.guadagno||0),0);
 const monthKey=new Date().toISOString().slice(0,7);
 const monthProfit=db.ordini.filter(o=>(o.data||"").slice(0,7)===monthKey).reduce((s,o)=>s+Number(o.guadagno||0),0);
 const totalOrderValue=db.ordini.reduce((s,o)=>s+Number(o.totale||0),0);
 const avgOrder=totalOrders?(totalOrderValue/totalOrders):0;
 const promoActive=db.articoli.filter(a=>a.promoAttiva).length;
 const promoSoon=db.articoli.filter(a=>a.promoAttiva && isPromoSoon(a.promoScadenza)).length;
 const orderLate=db.ordini.filter(isOrderLate).length;
 const activeClients=new Set(db.ordini.map(o=>(o.cliente||"").trim()).filter(Boolean)).size;
 document.getElementById("statArticoli").textContent=totalArticles;
 document.getElementById("statClienti").textContent=totalClients;
 document.getElementById("statOrdini").textContent=totalOrders;
 document.getElementById("statGuadagnoTotale").textContent=euro(totalProfit);
 document.getElementById("statGuadagnoMese").textContent=euro(monthProfit);
 document.getElementById("statMediaOrdine").textContent=euro(avgOrder);
 document.getElementById("spotPromo").textContent=promoActive;
 document.getElementById("spotPromoScadenza").textContent=promoSoon;
 document.getElementById("spotOrdiniRitardo").textContent=orderLate;
 document.getElementById("spotClientiAttivi").textContent=activeClients;

 const album=document.getElementById("albumArticoli"); album.innerHTML="";
 const articoli=[...db.articoli].slice(-8).reverse();
 if(!articoli.length){album.innerHTML="<div class='muted'>Ancora vuoto. Appena carichi gli articoli qui compare l'album interno.</div>";return}
 articoli.forEach(a=>{
   const div=document.createElement("div");div.className="album-card";
   const bg=firstPhoto(a)?`style="background-image:url('${firstPhoto(a)}')"`:"";
   div.innerHTML=`<div class="album-thumb" ${bg}>${firstPhoto(a)?"":"nessuna foto"}</div><div class="album-body"><div class="album-title">${escapeHtml(a.brand||"")} ${escapeHtml(a.modello||"")}</div><div class="album-sub">cod. ${escapeHtml(a.codice||"-")}</div><div class="album-price">${euro(a.prezzoVendita||0)}</div></div>`;
   div.addEventListener("click",()=>editArticle(a.id)); album.appendChild(div);
 })
}
function renderArticoli(){
 const q=(document.getElementById("searchArticoli").value||"").toLowerCase().trim();
 const tbody=document.getElementById("articoliTable"); tbody.innerHTML="";
 const items=db.articoli.filter(a=>`${a.codice||""} ${a.brand||""} ${a.modello||""}`.toLowerCase().includes(q));
 if(!items.length){tbody.innerHTML='<tr><td colspan="7" class="muted">Nessun articolo trovato.</td></tr>';return}
 items.forEach(a=>{
   const tr=document.createElement("tr"); const bg=firstPhoto(a)?`style="background-image:url('${firstPhoto(a)}')"`:"";
   tr.innerHTML=`<td><div class="table-thumb" ${bg}>${firstPhoto(a)?"":"foto"}</div></td><td>${escapeHtml(a.codice||"")}</td><td>${escapeHtml(a.brand||"")}</td><td>${escapeHtml(a.modello||"")}</td><td>${euro(a.prezzoVendita||0)}</td><td>${a.promoScadenza?escapeHtml(a.promoScadenza):"-"}</td><td><div class="table-actions"><button class="secondary" data-action="edit">Apri</button><button class="secondary" data-action="delete">Elimina</button></div></td>`;
   tr.querySelector('[data-action="edit"]').addEventListener("click",()=>editArticle(a.id));
   tr.querySelector('[data-action="delete"]').addEventListener("click",()=>deleteArticle(a.id));
   tbody.appendChild(tr);
 })
}
function renderClienti(){
 const q=(document.getElementById("searchClienti").value||"").toLowerCase().trim();
 const tbody=document.getElementById("clientiTable"); tbody.innerHTML="";
 const items=db.clienti.filter(c=>`${c.nome||""} ${c.cognome||""} ${c.telefono||""} ${c.citta||""} ${c.email||""}`.toLowerCase().includes(q));
 if(!items.length){tbody.innerHTML='<tr><td colspan="5" class="muted">Nessun cliente trovato.</td></tr>';return}
 items.forEach(c=>{
   const tr=document.createElement("tr");
   tr.innerHTML=`<td>${escapeHtml((c.nome||"")+" "+(c.cognome||""))}</td><td>${escapeHtml(c.telefono||"")}</td><td>${escapeHtml(c.citta||"")}</td><td>${escapeHtml(c.email||"")}</td><td><div class="table-actions"><button class="secondary" data-action="edit">Apri</button><button class="secondary" data-action="delete">Elimina</button></div></td>`;
   tr.querySelector('[data-action="edit"]').addEventListener("click",()=>editClient(c.id));
   tr.querySelector('[data-action="delete"]').addEventListener("click",()=>deleteClient(c.id));
   tbody.appendChild(tr);
 })
}
function renderOrdini(){
 const q=(document.getElementById("searchOrdini").value||"").toLowerCase().trim();
 const tbody=document.getElementById("ordiniTable"); tbody.innerHTML="";
 const items=db.ordini.filter(o=>{const articleText=Array.isArray(o.articoli)?o.articoli.join(", "):(o.articoli||""); return `${o.cliente||""} ${articleText} ${o.stato||""}`.toLowerCase().includes(q)});
 if(!items.length){tbody.innerHTML='<tr><td colspan="7" class="muted">Nessun ordine trovato.</td></tr>';return}
 items.slice().reverse().forEach(o=>{
   const articleText=Array.isArray(o.articoli)?o.articoli.join(", "):(o.articoli||"");
   const tr=document.createElement("tr");
   tr.innerHTML=`<td>${escapeHtml(o.data||"")}</td><td>${escapeHtml(o.cliente||"")}</td><td>${escapeHtml(articleText)}</td><td>${escapeHtml(o.stato||"")}</td><td>${escapeHtml(o.scadenza||"-")}</td><td>${euro(o.totale||0)}</td><td><div class="table-actions"><button class="secondary" data-action="edit">Apri</button><button class="secondary" data-action="delete">Elimina</button></div></td>`;
   tr.querySelector('[data-action="edit"]').addEventListener("click",()=>editOrder(o.id));
   tr.querySelector('[data-action="delete"]').addEventListener("click",()=>deleteOrder(o.id));
   tbody.appendChild(tr);
 })
}
function renderAll(){renderDashboard();renderArticoli();renderClienti();renderOrdini()}
function resetArticleForm(){document.getElementById("articleModalTitle").textContent="Nuovo articolo";document.getElementById("articleForm").reset();document.getElementById("articleId").value="";updatePriceCalculation()}
function resetClientForm(){document.getElementById("clientModalTitle").textContent="Nuovo cliente";document.getElementById("clientForm").reset();document.getElementById("clientId").value=""}
function resetOrderForm(){document.getElementById("orderModalTitle").textContent="Nuovo ordine";document.getElementById("orderForm").reset();document.getElementById("orderId").value="";document.getElementById("orderData").value=todayIso();document.getElementById("orderStato").value="in lavorazione"}
function editArticle(id){const a=db.articoli.find(x=>x.id===id); if(!a)return; document.getElementById("articleModalTitle").textContent="Modifica articolo";document.getElementById("articleId").value=a.id||"";document.getElementById("articleCodice").value=a.codice||"";document.getElementById("articleBrand").value=a.brand||"";document.getElementById("articleModello").value=a.modello||"";document.getElementById("articleCategoria").value=a.categoria||"";document.getElementById("articleQualita").value=a.qualita||"";document.getElementById("articleCostoUSD").value=a.costoUSD||"";document.getElementById("articleCostoEUR").value=a.costoEUR||"";document.getElementById("articleMargine").value=a.margine||"";document.getElementById("articlePrezzoVendita").value=a.prezzoVendita||"";document.getElementById("articleMateriale").value=a.materiale||"";document.getElementById("articleMisure").value=a.misure||"";document.getElementById("articleColori").value=a.colori||"";document.getElementById("articlePromoAttiva").checked=!!a.promoAttiva;document.getElementById("articlePromoPrezzo").value=a.promoPrezzo||"";document.getElementById("articlePromoScadenza").value=a.promoScadenza||"";document.getElementById("articleFoto").value=Array.isArray(a.foto)?a.foto.join("\n"):"";document.getElementById("articlePost").value=a.post||"";document.getElementById("articleNote").value=a.note||"";updatePriceCalculation();openModal("articleModal")}
function editClient(id){const c=db.clienti.find(x=>x.id===id); if(!c)return; document.getElementById("clientModalTitle").textContent="Modifica cliente";document.getElementById("clientId").value=c.id||"";document.getElementById("clientNome").value=c.nome||"";document.getElementById("clientCognome").value=c.cognome||"";document.getElementById("clientTelefono").value=c.telefono||"";document.getElementById("clientEmail").value=c.email||"";document.getElementById("clientCitta").value=c.citta||"";document.getElementById("clientProvincia").value=c.provincia||"";document.getElementById("clientCap").value=c.cap||"";document.getElementById("clientCanale").value=c.canale||"";document.getElementById("clientIndirizzo").value=c.indirizzo||"";document.getElementById("clientNote").value=c.note||"";openModal("clientModal")}
function editOrder(id){const o=db.ordini.find(x=>x.id===id); if(!o)return; document.getElementById("orderModalTitle").textContent="Modifica ordine";document.getElementById("orderId").value=o.id||"";document.getElementById("orderData").value=o.data||todayIso();document.getElementById("orderCliente").value=o.cliente||"";document.getElementById("orderStato").value=o.stato||"in lavorazione";document.getElementById("orderScadenza").value=o.scadenza||"";document.getElementById("orderTotale").value=o.totale||"";document.getElementById("orderGuadagno").value=o.guadagno||"";document.getElementById("orderArticoli").value=Array.isArray(o.articoli)?o.articoli.join(", "):(o.articoli||"");document.getElementById("orderNote").value=o.note||"";openModal("orderModal")}
function deleteArticle(id){if(!confirm("Eliminare questo articolo?"))return; db.articoli=db.articoli.filter(x=>x.id!==id); saveDb()}
function deleteClient(id){if(!confirm("Eliminare questo cliente?"))return; db.clienti=db.clienti.filter(x=>x.id!==id); saveDb()}
function deleteOrder(id){if(!confirm("Eliminare questo ordine?"))return; db.ordini=db.ordini.filter(x=>x.id!==id); saveDb()}
function handleArticleSubmit(e){e.preventDefault();updatePriceCalculation();const id=document.getElementById("articleId").value||uid("a");const articolo={id,codice:document.getElementById("articleCodice").value.trim(),brand:document.getElementById("articleBrand").value.trim(),modello:document.getElementById("articleModello").value.trim(),categoria:document.getElementById("articleCategoria").value.trim(),qualita:document.getElementById("articleQualita").value,costoUSD:Number(document.getElementById("articleCostoUSD").value||0),costoEUR:Number(document.getElementById("articleCostoEUR").value||0),margine:Number(document.getElementById("articleMargine").value||0),prezzoVendita:Number(document.getElementById("articlePrezzoVendita").value||0),materiale:document.getElementById("articleMateriale").value.trim(),misure:document.getElementById("articleMisure").value.trim(),colori:document.getElementById("articleColori").value.trim(),promoAttiva:document.getElementById("articlePromoAttiva").checked,promoPrezzo:Number(document.getElementById("articlePromoPrezzo").value||0),promoScadenza:document.getElementById("articlePromoScadenza").value,foto:parseFotoTextarea(document.getElementById("articleFoto").value),post:document.getElementById("articlePost").value,note:document.getElementById("articleNote").value};const idx=db.articoli.findIndex(x=>x.id===id);if(idx>=0)db.articoli[idx]=articolo;else db.articoli.push(articolo);saveDb();closeModal("articleModal")}
function handleClientSubmit(e){e.preventDefault();const id=document.getElementById("clientId").value||uid("c");const cliente={id,nome:document.getElementById("clientNome").value.trim(),cognome:document.getElementById("clientCognome").value.trim(),telefono:document.getElementById("clientTelefono").value.trim(),email:document.getElementById("clientEmail").value.trim(),citta:document.getElementById("clientCitta").value.trim(),provincia:document.getElementById("clientProvincia").value.trim(),cap:document.getElementById("clientCap").value.trim(),canale:document.getElementById("clientCanale").value,indirizzo:document.getElementById("clientIndirizzo").value.trim(),note:document.getElementById("clientNote").value};const idx=db.clienti.findIndex(x=>x.id===id);if(idx>=0)db.clienti[idx]=cliente;else db.clienti.push(cliente);saveDb();closeModal("clientModal")}
function handleOrderSubmit(e){e.preventDefault();const id=document.getElementById("orderId").value||uid("o");const ordine={id,data:document.getElementById("orderData").value||todayIso(),cliente:document.getElementById("orderCliente").value.trim(),stato:document.getElementById("orderStato").value,scadenza:document.getElementById("orderScadenza").value,totale:Number(document.getElementById("orderTotale").value||0),guadagno:Number(document.getElementById("orderGuadagno").value||0),articoli:document.getElementById("orderArticoli").value.split(",").map(x=>x.trim()).filter(Boolean),note:document.getElementById("orderNote").value};const idx=db.ordini.findIndex(x=>x.id===id);if(idx>=0)db.ordini[idx]=ordine;else db.ordini.push(ordine);saveDb();closeModal("orderModal")}
function exportJson(){const payload=JSON.stringify({...db,exportedAt:new Date().toISOString()},null,2);const blob=new Blob([payload],{type:"application/json"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="vanity_glamour_backup_v9.json";a.click();URL.revokeObjectURL(url)}
function importJson(file){const reader=new FileReader();reader.onload=()=>{try{const data=JSON.parse(reader.result);if(!data||!Array.isArray(data.articoli)||!Array.isArray(data.clienti)||!Array.isArray(data.ordini)){alert("File JSON non valido per questo gestionale.");return}db=data;ensureDbShape();saveDb();alert("Import completato.")}catch(e){alert("Impossibile leggere il file JSON.")}};reader.readAsText(file)}
document.addEventListener("DOMContentLoaded",()=>{document.querySelectorAll(".navbtn").forEach(btn=>btn.addEventListener("click",()=>setSection(btn.dataset.section)));document.getElementById("btnExport").addEventListener("click",exportJson);document.getElementById("btnImport").addEventListener("click",()=>document.getElementById("jsonFileInput").click());document.getElementById("jsonFileInput").addEventListener("change",e=>{if(e.target.files?.[0])importJson(e.target.files[0]);e.target.value=""});document.getElementById("openArticleModal").addEventListener("click",()=>{resetArticleForm();openModal("articleModal")});document.getElementById("openClientModal").addEventListener("click",()=>{resetClientForm();openModal("clientModal")});document.getElementById("openOrderModal").addEventListener("click",()=>{resetOrderForm();openModal("orderModal")});document.getElementById("quickNewArticle").addEventListener("click",()=>{setSection("articoli");resetArticleForm();openModal("articleModal")});document.getElementById("quickNewClient").addEventListener("click",()=>{setSection("clienti");resetClientForm();openModal("clientModal")});document.getElementById("quickNewOrder").addEventListener("click",()=>{setSection("ordini");resetOrderForm();openModal("orderModal")});document.getElementById("btnNuovoArticolo").addEventListener("click",()=>{setSection("articoli");resetArticleForm();openModal("articleModal")});document.getElementById("btnNuovoCliente").addEventListener("click",()=>{setSection("clienti");resetClientForm();openModal("clientModal")});document.getElementById("btnNuovoOrdine").addEventListener("click",()=>{setSection("ordini");resetOrderForm();openModal("orderModal")});document.querySelectorAll(".close-modal").forEach(btn=>btn.addEventListener("click",()=>closeModal(btn.dataset.close)));document.querySelectorAll(".modal").forEach(m=>m.addEventListener("click",e=>{if(e.target===m)m.classList.add("hidden")}));document.getElementById("articleForm").addEventListener("submit",handleArticleSubmit);document.getElementById("clientForm").addEventListener("submit",handleClientSubmit);document.getElementById("orderForm").addEventListener("submit",handleOrderSubmit);document.getElementById("searchArticoli").addEventListener("input",renderArticoli);document.getElementById("searchClienti").addEventListener("input",renderClienti);document.getElementById("searchOrdini").addEventListener("input",renderOrdini);document.getElementById("articleCostoUSD").addEventListener("input",updatePriceCalculation);document.getElementById("articleQualita").addEventListener("change",updatePriceCalculation);document.getElementById("btnCalcolaPrezzo").addEventListener("click",updatePriceCalculation);document.getElementById("btnCopiaPost").addEventListener("click",copyPostFb);resetOrderForm();resetArticleForm();loadDb()});