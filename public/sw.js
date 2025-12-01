// sw.js - service worker to show notifications
self.addEventListener('push', function(event) {
  let data = { title: 'Notification', message: 'You have a new message' };
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.message = event.data.text();
    }
  }
  const options = {
    body: data.message,
    icon: '/jinnie-chats.png',
    badge: '/jinnie-chats.png',
    vibrate: [100, 50, 100],
    data: { url: data.url || '/' }
  };
  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(clients.matchAll({ type: 'window' }).then(windowClients => {
    for (let i = 0; i < windowClients.length; i++) {
      const client = windowClients[i];
      if ('focus' in client) return client.focus();
    }
    if (clients.openWindow) return clients.openWindow('/');
  }));
});
