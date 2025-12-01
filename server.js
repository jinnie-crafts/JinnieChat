// server.js - Express + Socket.IO + Web Push integrated
require('dotenv').config();
const express = require('express');
const path = require('path');
const webpush = require('web-push');
const http = require('http');
const app = express();
const server = http.createServer(app);
const io = require('socket.io')(server);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ----- Web Push (VAPID) setup -----
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.warn('⚠️ VAPID keys not set. Push notifications will NOT work until VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are set.');
} else {
  webpush.setVapidDetails(
    'mailto:' + (process.env.ADMIN_EMAIL || 'admin@example.com'),
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );
}

// In-memory subscription store. Replace with DB for persistence.
const subscriptions = [];

// Endpoint: return public VAPID key
app.get('/vapidPublicKey', (req, res) => {
  res.json({ publicKey: VAPID_PUBLIC_KEY });
});

// Endpoint: client posts a subscription
app.post('/subscribe', (req, res) => {
  const sub = req.body;
  if (!sub || !sub.endpoint) return res.status(400).json({ error: 'Invalid subscription' });

  // dedupe by endpoint
  if (!subscriptions.find(s => s.endpoint === sub.endpoint)) {
    subscriptions.push(sub);
    console.log('✅ Added subscription - total:', subscriptions.length);
  }
  res.status(201).json({ success: true });
});

// Admin endpoint to send a custom notification to all subscriptions
app.post('/send-notification', async (req, res) => {
  const { title, message, secret } = req.body || {};

  // basic server-side check using ADMIN_SECRET
  if (process.env.ADMIN_SECRET && secret !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ success: false, error: 'Unauthorized' });
  }

  const payload = JSON.stringify({ title: title || 'Update', message: message || '' });

  const promises = subscriptions.map((sub, idx) =>
    webpush.sendNotification(sub, payload).catch(err => {
      // If subscription is invalid, remove it
      console.warn('Push send error for subscription', idx, err && err.statusCode);
      // If 410 (gone) or 404, we should remove the subscription
      if (err && (err.statusCode === 410 || err.statusCode === 404)) {
        const i = subscriptions.findIndex(s => s.endpoint === sub.endpoint);
        if (i !== -1) subscriptions.splice(i, 1);
      }
    })
  );

  try {
    await Promise.all(promises);
    res.json({ success: true, sent: subscriptions.length });
  } catch (err) {
    console.error('Error sending notifications', err);
    res.status(500).json({ success: false, error: 'Failed to send' });
  }
});

// ---------------- Chat logic (rooms, messages) ----------------
// rooms structure:
// rooms = {
//   roomName: {
//     password: 'secret',
//     users: [ { username, socketId } ],
//     history: [ {user, text, time, type: 'text'|'file'} ]
//   }
// }
const rooms = {};

function createRoomIfNotExists(roomName, password = '') {
  if (!rooms[roomName]) {
    rooms[roomName] = { password, users: [], history: [] };
    broadcastRoomList();
  }
}

function broadcastRoomList() {
  io.emit('room list', Object.keys(rooms));
}

// Serve index by default
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Socket.IO handlers
io.on('connection', socket => {
  console.log('Socket connected:', socket.id);

  // request current room list
  socket.on('get rooms', () => {
    socket.emit('room list', Object.keys(rooms));
  });

  socket.on('create room', (roomName, password, username) => {
    if (!roomName || !password || !username) {
      socket.emit('error', 'Room name, password and username required');
      return;
    }
    if (rooms[roomName]) {
      socket.emit('error', 'Room already exists');
      return;
    }
    rooms[roomName] = { password, users: [], history: [] };
    // add user and join socket room
    rooms[roomName].users.push({ username, socketId: socket.id });
    socket.join(roomName);
    socket.data.username = username;
    socket.data.room = roomName;
    broadcastRoomList();
    // send success
    socket.emit('room joined', roomName);
    // notify others
    socket.to(roomName).emit('chat message', { user: 'System', text: `${username} joined the room.` });
  });

  socket.on('join room request', (roomName, passwordAttempt, username) => {
    const room = rooms[roomName];
    if (!room) {
      socket.emit('no such room');
      return;
    }
    if (room.password !== passwordAttempt) {
      socket.emit('wrong password');
      return;
    }
    // Add user
    room.users.push({ username, socketId: socket.id });
    socket.join(roomName);
    socket.data.username = username;
    socket.data.room = roomName;

    // Send room joined with history
    socket.emit('room joined', roomName);
    // send history
    if (room.history && room.history.length) {
      socket.emit('chat history', room.history);
    }
    // notify others
    socket.to(roomName).emit('chat message', { user: 'System', text: `${username} joined the room.` });
    // update room list
    broadcastRoomList();
  });

  // Chat message
  socket.on('chat message', msg => {
    const username = socket.data.username || 'Unknown';
    const room = socket.data.room;
    if (!room) return;
    const entry = { user: username, text: msg, time: new Date().toISOString(), type: 'text' };
    // save to history
    rooms[room].history.push(entry);
    // emit to room
    io.to(room).emit('chat message', entry);
  });

  // File upload (client sends base64 data)
  socket.on('file upload', data => {
    const username = socket.data.username || 'Unknown';
    const room = socket.data.room;
    if (!room) return;
    const entry = { user: username, fileName: data.fileName, fileType: data.fileType, fileData: data.fileData, time: new Date().toISOString(), type: 'file' };
    rooms[room].history.push(entry);
    io.to(room).emit('file message', entry);
  });

  // typing
  socket.on('typing', user => {
    const room = socket.data.room;
    if (!room) return;
    socket.to(room).emit('typing', user);
  });
  socket.on('stop typing', user => {
    const room = socket.data.room;
    if (!room) return;
    socket.to(room).emit('stop typing', user);
  });

  // disconnect
  socket.on('disconnect', () => {
    // remove user from any room
    const roomName = socket.data.room;
    const username = socket.data.username;
    if (roomName && rooms[roomName]) {
      const room = rooms[roomName];
      room.users = room.users.filter(u => u.socketId !== socket.id);
      socket.to(roomName).emit('chat message', { user: 'System', text: `${username || 'A user'} left the room.` });
      if (room.users.length === 0) {
        delete rooms[roomName];
        broadcastRoomList();
      }
    }
    console.log('Socket disconnected:', socket.id);
  });
});

// ping route
app.get('/ping', (req, res) => res.send('pong'));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on ${PORT}`));
