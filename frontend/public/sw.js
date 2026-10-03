// Đổi tên cache mỗi khi thay đổi cách cache: bước 'activate' bên dưới sẽ xoá mọi
// cache cũ (kể cả cache của Workbox/vite-plugin-pwa từ các bản build trước).
const CACHE = 'ops-hub-shell-v3';
const SHELL = ['/', '/m/', '/index.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Không đụng vào request không phải GET, khác origin, hoặc API
  if (req.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  // Điều hướng trang: ưu tiên mạng, lỗi mạng thì dùng bản đã lưu
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() =>
        caches.match(url.pathname.startsWith('/m') ? '/m/' : '/').then((r) => r || caches.match('/index.html'))
      )
    );
    return;
  }

  // File tĩnh: ưu tiên mạng, lưu lại để dùng khi offline
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req))
  );
});

// ---------------- WEB PUSH (Vướng mắc) ----------------
self.addEventListener('push', (event) => {
  let d = {};
  try {
    d = event.data ? event.data.json() : {};
  } catch {
    d = { title: 'Vướng mắc', body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(Promise.all([
    self.registration.showNotification(d.title || 'Vướng mắc', {
      body: d.body || '',
      tag: d.tag,
      renotify: !!d.tag,
      data: d.target || {},
      icon: '/icons/192.png',
      badge: '/icons/192.png',
    }),
    // Báo cho app đang mở để cập nhật số trên chuông thông báo ngay
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((list) => list.forEach((c) => c.postMessage({ type: 'notif-new' }))),
  ]));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const t = event.notification.data || {};
  const url = `/m/?id=${t.id ?? ''}${t.hex ? `&hex=${encodeURIComponent(t.hex)}` : ''}`;
  event.waitUntil((async () => {
    const list = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    // CHỈ dùng tab đang ở trang mobile (/m). Không có thì mở cửa sổ mới,
    // tránh chỉ đưa tab dashboard lên trước mà không mở vướng mắc nào.
    const target = list.find((c) => /^\/m(\/|$)/.test(new URL(c.url).pathname));
    if (target) {
      await target.focus();
      target.postMessage({ type: 'open-vuong-mac', id: t.id, hex: t.hex });
      return;
    }
    await clients.openWindow(url);
  })());
});