// RunIt Service Worker — handles Web Push notifications

self.addEventListener('push', function (event) {
  const data = event.data?.json?.() || {};
  const title = data.title || '🏍️ RunIt';
  const options = {
    body: data.body || '',
    icon: '/assets/adaptive-icon.png',
    badge: '/assets/favicon.png',
    // Use a unique tag per notification type so they don't clobber each other
    tag: data.tag || ('runit-' + Date.now()),
    requireInteraction: true,
    vibrate: [200, 100, 200],
    data: { url: data.url || '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(function (windowClients) {
        for (const client of windowClients) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) return clients.openWindow(url);
      })
  );
});
