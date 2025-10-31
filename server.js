require('dotenv').config();
// server.js
const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);
const webpush = require("web-push");
const basicAuth = require("express-basic-auth");

app.use(express.static("public"));

/* ---------- Web Push (VAPID) setup ---------- */
let VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || null;
let VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || null;

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  try {
    const keys = require('web-push').generateVAPIDKeys();
    VAPID_PUBLIC_KEY = keys.publicKey;
    VAPID_PRIVATE_KEY = keys.privateKey;
    console.log("Generated temporary VAPID keys. For persistent keys, set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in your environment.");
    console.log("VAPID_PUBLIC_KEY=" + VAPID_PUBLIC_KEY);
    console.log("VAPID_PRIVATE_KEY=" + VAPID_PRIVATE_KEY);
  } catch (e) {
    console.error("Failed to generate VAPID keys:", e);
  }
}

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:' + (process.env.ADMIN_EMAIL || 'admin@example.com'),
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );
}

// expose public key to clients
app.get('/vapidPublicKey', (req, res) => {
  res.send(VAPID_PUBLIC_KEY || '');
});

// store subscriptions in memory (replace with DB for production)
const subscriptions = [];

app.post('/subscribe', express.json(), (req, res) => {
  const sub = req.body;
  if (!sub || !sub.endpoint) return res.status(400).json({ error: 'Invalid subscription' });
  if (!subscriptions.find(s => s.endpoint === sub.endpoint)) {
    subscriptions.push(sub);
  }
  res.status(201).json({ success: true });
});

// basic auth middleware if ADMIN_USER & ADMIN_PASS set
let adminAuth = (req, res, next) => next();
if (process.env.ADMIN_USER && process.env.ADMIN_PASS) {
  adminAuth = basicAuth({
    users: { [process.env.ADMIN_USER]: process.env.ADMIN_PASS },
    challenge: true
  });
}

// admin send-notification endpoint (protected)
app.post('/send-notification', adminAuth, express.json(), async (req, res) => {
  const { title, message } = req.body || {};
  const payload = JSON.stringify({ title: title || 'Update', message: message || '' });

  const failed = [];
  const promises = subscriptions.map(sub => 
    webpush.sendNotification(sub, payload).catch(err => {
      console.warn('Push send error', err && err.statusCode);
      if (err && (err.statusCode === 410 || err.statusCode === 404)) {
        failed.push(sub.endpoint);
      }
    })
  );

  try {
    await Promise.all(promises);
    // remove failed subscriptions
    for (const ep of failed) {
      const i = subscriptions.findIndex(s => s.endpoint === ep);
      if (i !== -1) subscriptions.splice(i,1);
    }
    res.json({ success: true, remaining: subscriptions.length });
  } catch (e) {
    console.error('Error sending notifications', e);
    res.status(500).json({ success: false, error: 'Failed to send' });
  }
});

// serve dashboard (admin page) at /dashboard (protected)
app.get('/dashboard', adminAuth, (req, res) => {
  res.sendFile(require('path').join(__dirname, 'public', 'admin.html'));
});


// rooms structure:
// {
//   roomName: {
//     password: "pass",
//     users: [ { username, socketId } ]
//   }
// }
const rooms = {};

io.on("connection", socket => {
  // Send current room list to newcomer
  socket.emit("room list", Object.keys(rooms));

  // Create room
  socket.on("create room", (roomName, password, username) => {
    if (!roomName || !password || !username) return;
    if (!rooms[roomName]) {
      rooms[roomName] = { password, users: [] };
    }
    // Save user's room on socket
    socket.currentRoom = roomName;
    rooms[roomName].users.push({ username, socketId: socket.id });
    socket.join(roomName);

    // Notify creator
    socket.emit("room joined", roomName);

    // Notify others in room
    socket.to(roomName).emit("chat message", {
      user: "System",
      text: `${username} has joined the chat`
    });

    // Broadcast updated room list
    io.emit("room list", Object.keys(rooms));
  });

  // Join room (with password)
  socket.on("join room request", (roomName, password, username) => {
    if (!roomName || !username) return;
    const room = rooms[roomName];
    if (!room) {
      socket.emit("no such room");
      return;
    }
    if (room.password !== password) {
      socket.emit("wrong password");
      return;
    }

    socket.currentRoom = roomName;
    room.users.push({ username, socketId: socket.id });
    socket.join(roomName);

    socket.emit("room joined", roomName);

    socket.to(roomName).emit("chat message", {
      user: "System",
      text: `${username} has joined the chat`
    });
  });

  // Chat message
  socket.on("chat message", msg => {
    const roomName = socket.currentRoom;
    if (!roomName) return;
    // find username for this socket
    const r = rooms[roomName];
    const userObj = r ? r.users.find(u => u.socketId === socket.id) : null;
    const username = userObj ? userObj.username : "Unknown";

    io.to(roomName).emit("chat message", { user: username, text: msg });
  });

  // File upload
  socket.on("file upload", data => {
    const roomName = socket.currentRoom;
    if (!roomName || !data) return;
    const r = rooms[roomName];
    const userObj = r ? r.users.find(u => u.socketId === socket.id) : null;
    const username = userObj ? userObj.username : "Unknown";

    io.to(roomName).emit("file message", { user: username, ...data });
  });

  // Typing indicators
  socket.on("typing", username => {
    const roomName = socket.currentRoom;
    if (!roomName) return;
    socket.to(roomName).emit("typing", username);
  });
  socket.on("stop typing", username => {
    const roomName = socket.currentRoom;
    if (!roomName) return;
    socket.to(roomName).emit("stop typing", username);
  });

  // Disconnect - remove user from rooms; if room empty, remove it
  socket.on("disconnect", () => {
    for (const rName of Object.keys(rooms)) {
      const room = rooms[rName];
      const before = room.users.length;
      room.users = room.users.filter(u => u.socketId !== socket.id);
      const after = room.users.length;
      if (before !== after) {
        // someone removed, notify remaining users
        io.to(rName).emit("chat message", {
          user: "System",
          text: `A user has left the chat`
        });
      }
      if (room.users.length === 0) {
        delete rooms[rName];
        io.emit("room list", Object.keys(rooms));
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Server running on ${PORT}`));
//ping render server
app.get("/ping", (req, res) => res.send("pong"));
