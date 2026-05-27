// RunIt Service Worker — handles Web Push notifications for riders

self.addEventListener('push', function (event) {
  const data = event.data?.json?.() || {};
  const title = data.title || '🏍️ RunIt';
  const options = {
    body: data.body || 'New delivery available near you',
    icon: '/assets/adaptive-icon.png',
    badge: '/assets/favicon.png',
    tag: 'new-order',
    requireInteraction: true,
    vibrate: [200, 100, 200],
    data: { url: '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(function (windowClients) {
        for (const client of windowClients) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) return clients.openWindow('/');
      })
  );
});
