(function(){
  'use strict';
  const PROJECT_URL='https://qfjwtawsqfwmsmrrgqfi.supabase.co';
  const STORAGE_KEY='sb-qfjwtawsqfwmsmrrgqfi-auth-token';
  function readStoredSessionToken(){
    try{
      const raw=localStorage.getItem(STORAGE_KEY);
      if(!raw) return '';
      const data=JSON.parse(raw);
      return String(data?.access_token || data?.currentSession?.access_token || '').trim();
    }catch(_e){ return ''; }
  }
  function readPublicKey(){
    const candidates=[
      window.VG_SUPABASE_PUBLIC_KEY,
      window.VG_SUPABASE_ANON_KEY,
      window.SUPABASE_ANON_KEY,
      document.querySelector('meta[name="vg-supabase-key"]')?.content,
      (()=>{ try{return localStorage.getItem('vg_supabase_public_key')}catch(_e){return ''} })(),
      (()=>{ try{return localStorage.getItem('supabase_anon_key')}catch(_e){return ''} })(),
      readStoredSessionToken()
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
  const publicKey=readPublicKey();
  window.VG_SUPABASE_CONFIG_MISSING=!publicKey;
  if(!publicKey){
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
