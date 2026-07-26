(function(){
  'use strict';
  const PROJECT_URL='https://qfjwtawsqfwmsmrrgqfi.supabase.co';
  const STORAGE_KEY='sb-qfjwtawsqfwmsmrrgqfi-auth-token';

  function decodeJwtPayload(token){
    try{
      const parts=String(token||'').split('.');
      if(parts.length!==3) return null;
      const raw=parts[1].replace(/-/g,'+').replace(/_/g,'/');
      const padded=raw+'='.repeat((4-raw.length%4)%4);
      return JSON.parse(decodeURIComponent(Array.prototype.map.call(atob(padded),c=>'%'+('00'+c.charCodeAt(0).toString(16)).slice(-2)).join('')));
    }catch(_e){ return null; }
  }

  function validatePublicKey(value){
    const key=String(value||'').trim();
    if(!key) return {ok:false,reason:'missing'};
    if(/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return {ok:true,type:'publishable'};
    if(key.split('.').length===3){
      const payload=decodeJwtPayload(key);
      if(payload && String(payload.role||'').toLowerCase()==='anon') return {ok:true,type:'anon'};
      return {ok:false,reason:'jwt_not_anon'};
    }
    return {ok:false,reason:'format'};
  }

  function readPublicKey(){
    const candidates=[
      window.VG_SUPABASE_PUBLIC_KEY,
      window.VG_SUPABASE_ANON_KEY,
      window.SUPABASE_ANON_KEY,
      document.querySelector('meta[name="vg-supabase-key"]')?.content,
      (()=>{ try{return localStorage.getItem('vg_supabase_public_key')}catch(_e){return ''} })(),
      (()=>{ try{return localStorage.getItem('supabase_anon_key')}catch(_e){return ''} })()
    ];
    return String(candidates.find(v=>String(v||'').trim())||'').trim();
  }

  function loadSupabaseLibrary(){
    if(window.supabase?.createClient) return Promise.resolve(window.supabase);
    return new Promise((resolve,reject)=>{
      const existing=document.querySelector('script[data-vg-supabase-lib]');
      if(existing){
        existing.addEventListener('load',()=>window.supabase?.createClient?resolve(window.supabase):reject(new Error('Libreria Supabase non disponibile')),{once:true});
        existing.addEventListener('error',()=>reject(new Error('Caricamento Supabase fallito')),{once:true});
        return;
      }
      const script=document.createElement('script');
      script.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
      script.async=true;
      script.dataset.vgSupabaseLib='1';
      script.onload=()=>window.supabase?.createClient?resolve(window.supabase):reject(new Error('Libreria Supabase non disponibile'));
      script.onerror=()=>reject(new Error('Caricamento Supabase fallito'));
      document.head.appendChild(script);
    });
  }

  window.VG_VALIDATE_SUPABASE_PUBLIC_KEY=validatePublicKey;
  const publicKey=readPublicKey();
  const validation=validatePublicKey(publicKey);
  window.VG_SUPABASE_KEY_ERROR=validation.ok?'':validation.reason;
  window.VG_SUPABASE_CONFIG_MISSING=!validation.ok;
  if(!validation.ok){
    window.VG_SUPABASE_READY=null;
    return;
  }
  window.VG_SUPABASE_READY=(async()=>{
    const lib=await loadSupabaseLibrary();
    return lib.createClient(PROJECT_URL,publicKey,{
      auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storageKey:STORAGE_KEY}
    });
  })();
})();
