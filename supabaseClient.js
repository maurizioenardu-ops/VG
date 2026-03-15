(function(){
  const url = 'https://qfjwtawsqfwmsmrrgqfi.supabase.co';
  const key = 'sb_publishable_-EUVjwsk3txKk2Opqrc7Kw_xFNa9Hw1';

  function initClient(){
    try {
      const sb = window.supabase;
      if (!sb || typeof sb.createClient !== 'function') throw new Error('SDK Supabase non caricata');
      const client = sb.createClient(url, key);
      window.VG_SUPABASE = client;
      return client;
    } catch (err) {
      console.error('Supabase init fallita', err);
      return null;
    }
  }

  window.VG_SUPABASE_READY = new Promise((resolve) => {
    if (window.supabase && typeof window.supabase.createClient === 'function') {
      resolve(initClient());
      return;
    }
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
    s.async = true;
    s.onload = () => resolve(initClient());
    s.onerror = (err) => {
      console.error('Caricamento SDK Supabase fallito', err);
      resolve(null);
    };
    document.head.appendChild(s);
  });
})();
