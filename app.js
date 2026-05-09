
const DB_KEY="vg_v7_web";

function loadDB(){
  return JSON.parse(localStorage.getItem(DB_KEY)||'{"articoli":[],"clienti":[]}');
}
function saveDB(db){localStorage.setItem(DB_KEY,JSON.stringify(db));}

function todayStr(){
  return new Date().toISOString().split("T")[0];
}

function qualityFromCode(code){
  if(!code) return "STANDARD";
  if(code.startsWith("2")||code.startsWith("3")) return "ORIGINALE";
  return "STANDARD";
}

function buildPost(a){
  const q=qualityFromCode(a.codice);
  if(q==="ORIGINALE"){
    return a.modello+" 🥇\nQUALITÀ ORIGINALE";
  }
  return a.modello+" 🔝💯";
}

function saveArt(){
  const db=loadDB();
  const codice=document.getElementById("codice").value.trim();
  const modello=document.getElementById("modello").value.trim();
  const usd=Number(document.getElementById("usd").value||0);
  const promoOn=document.getElementById("promoOn").checked;
  const promoPrice=Number(document.getElementById("promoPrice").value||0);
  const promoDate=document.getElementById("promoDate").value;

  if(!codice){alert("Codice obbligatorio");return;}
  if(db.articoli.some(a=>a.codice===codice)){
    alert("Codice articolo già esistente.");
    return;
  }
  if(!modello){alert("Modello obbligatorio");return;}
  if(!usd){alert("Inserisci costo USD");return;}

  const prezzoNormale=Math.round(((usd*0.90)+5)*1.55/5)*5;

  if(promoOn){
    if(!promoDate){alert("Scadenza obbligatoria.");return;}
    if(promoDate<todayStr()){alert("Scadenza già passata.");return;}
    if(!(promoPrice>0)){alert("Prezzo promo non valido.");return;}
    if(promoPrice>=prezzoNormale){
      alert("Promo deve essere inferiore al prezzo normale.");
      return;
    }
  }

  const art={codice,modello,usd,prezzoNormale,promoOn,promoPrice,promoDate};
  db.articoli.push(art);
  saveDB(db);

  document.getElementById("postOut").innerText=buildPost(art);
  alert("Articolo salvato");
}

function saveCli(){
  const db=loadDB();
  const nome=document.getElementById("nome").value.trim();
  const tel=document.getElementById("tel").value.trim();

  if(!nome){alert("Nome obbligatorio");return;}
  if(db.clienti.some(c=>c.nome===nome || (tel && c.tel===tel))){
    alert("Cliente già esistente.");
    return;
  }

  db.clienti.push({nome,tel});
  saveDB(db);
  alert("Cliente salvato");
}
