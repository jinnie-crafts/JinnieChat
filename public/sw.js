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
    icon: '/jinnie-chats.png',    // change to your icon path in public
    badge: '/jinnie-chats.png'
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

// Optional: click behavior
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(clients.matchAll({ type: "window" }).then(clientList => {
    if (clientList.length > 0) {
      return clientList[0].focus();
    }
    return clients.openWindow('/');
  }));
});
