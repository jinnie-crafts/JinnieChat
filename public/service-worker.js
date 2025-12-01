self.addEventListener("push", event => {
  const data = event.data.json();
  console.log("Push received:", data);

  const options = {
    body: data.message,
    icon: "jinnie-chats.png",
    badge: "jinnie-chats.png",
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  event.waitUntil(clients.openWindow("/"));
});
