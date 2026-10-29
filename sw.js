// Service worker do app: abre rápido e funciona com internet fraca.
// - Página: rede primeiro (sempre a versão mais nova), cache se estiver offline.
// - Fontes e biblioteca do Supabase (CDN): cache primeiro.
// - API do Supabase: nunca passa pelo cache.
const VERSAO = 'bellisa-v62';
const BASICO = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSAO).then(c => c.addAll(BASICO)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== VERSAO).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// push do servidor (chega mesmo com o app fechado): mostra a notificação
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { texto: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.titulo || 'Bellisa', {
    body: d.texto || 'Você tem uma novidade na agenda', icon: './icons/icon-192.png', badge: './icons/favicon-32.png',
    tag: d.tag || 'bellisa', renotify: true, vibrate: [120, 60, 120], data: { agendamento_id: d.agendamento_id || null },
  }));
});
// tocou na notificação de "Novo agendamento": abre o app (ou traz para frente) já no horário
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const id = e.notification.data && e.notification.data.agendamento_id;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(lista => {
    const aberto = lista.find(c => new URL(c.url).origin === location.origin);
    if (aberto) { if (id) aberto.postMessage({ abrir: id }); return aberto.focus(); }
    return self.clients.openWindow('./' + (id ? '?abrir=' + id : ''));
  }));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname.endsWith('supabase.co')) return;

  if (req.mode === 'navigate' || url.origin === location.origin) {
    // internet fraca: espera a rede no máximo 4s; depois abre a cópia guardada (a rede segue atualizando o cache)
    const rede = fetch(req).then(r => {
      if (r.ok) { const copia = r.clone(); caches.open(VERSAO).then(c => c.put(req, copia)); }
      return r;
    });
    rede.catch(() => {});
    const guardada = () => caches.match(req, { ignoreSearch: req.mode === 'navigate' });
    const prazo = new Promise((_, falha) => setTimeout(() => falha(new Error('lento')), 4000));
    e.respondWith(Promise.race([rede, prazo])
      .catch(() => guardada().then(r => r || rede))
      .catch(() => guardada().then(r => r || caches.match('./index.html'))));
    return;
  }
  if (/fonts\.(googleapis|gstatic)\.com|cdn\.jsdelivr\.net/.test(url.hostname)) {
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => {
      const copia = res.clone(); caches.open(VERSAO).then(c => c.put(req, copia)); return res;
    })));
  }
});
