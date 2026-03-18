# Correzioni applicate alla PWA

## Immagini / Supabase
- La sync foto cloud ora usa prima i path Supabase già esistenti, senza rifare il giro URL pubblico -> fetch -> upload quando non serve.
- La tabella `prodotti_foto` non viene più svuotata "alla cieca" prima di avere un set finale valido.
- In caso di errore parziale durante la sync, i path già presenti vengono riusati come fallback.
- Se il reinserimento righe fallisce, il codice prova a ripristinare i riferimenti precedenti.

## Deduplica clienti
- Normalizzazione coerente di nome, cognome, telefono, email, città, CAP e indirizzo.
- Merge semantico locale e durante import/restore, non solo per `id`.
- Preservazione del `cognome` e dell'`email` quando il cliente esiste già.
- Salvataggio cloud con ricerca preventiva di duplicati per email, telefono e chiave anagrafica.

## Deduplica ordini
- Ogni ordine locale riceve un `numeroOrdine` stabile anche prima del push cloud.
- Merge/deduplica ordini per `numeroOrdine` e fingerprint dei contenuti, non solo per `id`.
- Riconciliazione degli `articoloId` e `clienteId` dopo il merge dei record.

## Import / merge locale
- `loadDB`, `saveDB`, `saveDBLocal` e `importDB` normalizzano sempre il database finale.
- Il merge da import non si basa più solo su `id` ma concatena e poi deduplica con regole business.

## Pull cloud
- Il pull da cloud prova a riagganciare gli ordini locali anche per `numeroOrdine` e fingerprint, così non perde foto/manuali o riferimenti utili.
- I clienti scaricati dal cloud mantengono meglio nome/cognome/email.

## PWA / cache
- Versione service worker aggiornata a `v9_5` per facilitare il refresh dopo il deploy.

## SQL Supabase
- `SUPABASE_prodotti_foto.sql` aggiornato con indice e unique index su `(prodotto_id, ordine)`.
- Aggiunto `SUPABASE_storage_articoli.sql` per creare/configurare il bucket `articoli` e le policy storage.
