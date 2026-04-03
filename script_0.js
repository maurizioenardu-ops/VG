
window.addEventListener('error',e=>{
  const x=document.getElementById('dateLine');
  if(x) x.textContent='ERRORE JS: '+(e.message||e);
});
