// script.js - client (chat + push)
const socket = io({ reconnection: true, reconnectionAttempts: Infinity, reconnectionDelay: 1000 });

// Elements (assuming your HTML uses the same ids)
const splash = document.getElementById("splash-screen");
const usernameModal = document.getElementById("username-modal");
const usernameInput = document.getElementById("username-input");
const usernameBtn = document.getElementById("username-btn");

const roomModal = document.getElementById("room-modal");
const createSection = document.getElementById("create-section");
const newRoomInput = document.getElementById("new-room-input");
const newRoomPassword = document.getElementById("new-room-password");
const newRoomBtn = document.getElementById("new-room-btn");

const roomList = document.getElementById("room-list");
const joinPasswordContainer = document.getElementById("join-password-container");
const joinRoomPassword = document.getElementById("join-room-password");
const joinRoomBtn = document.getElementById("join-room-btn");
const passwordAlert = document.getElementById("password-alert");

const chatWrapper = document.querySelector(".chat-wrapper");
const chatBody = document.getElementById("chat-body");
const chatSubtitle = document.getElementById("chat-subtitle");
const statusBar = document.getElementById("status-bar");

const typingIndicator = document.getElementById("typing-indicator");
const messageInput = document.getElementById("message-input");
const sendBtn = document.getElementById("send-btn");
const fileBtn = document.getElementById("file-btn");
const fileInput = document.getElementById("file-input");

const inviteBtn = document.getElementById("invite-btn");
const inviteModal = document.getElementById("inviteModal");
const closeInvite = document.getElementById("close-invite");
const inviteUrlInput = document.getElementById("invite-url");
const copyBtn = document.getElementById("copy-btn");

const toast = document.getElementById("toast");

let username = null, room = null;
let typingTimeout = null;
let hasSubscribedForPush = false;

/* Splash */
window.addEventListener("load", () => {
  setTimeout(() => {
    if (splash) {
      splash.classList.add("fade-out");
      setTimeout(() => { splash.style.display = "none"; }, 650);
    }
  }, 700);
});

/* Utilities */
function showToast(msg, time = 1400) {
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add("show", "visible");
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => { toast.classList.remove("visible"); }, 350);
  }, time);
}

function formatTime(date) {
  const d = new Date(date);
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}

function adjustChatPadding() {
  const footer = document.querySelector(".chat-footer");
  if (!footer || !chatBody) return;
  const h = footer.offsetHeight;
  chatBody.style.paddingBottom = (h + 12) + "px";
  typingIndicator.style.bottom = (h + 16) + "px";
}

/* Toggle password visibility (if used) */
window.togglePassword = function(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.type = el.type === "password" ? "text" : "password";
};

/* Room list */
socket.on('room list', rooms => {
  if (!roomList) return;
  roomList.innerHTML = '';
  rooms.forEach(r => {
    const li = document.createElement('li');
    li.textContent = r;
    roomList.appendChild(li);
  });
});

function showRoomModal() {
  if (!roomModal) return;
  roomModal.classList.remove("hidden");
  joinPasswordContainer.classList.add("hidden");
  createSection.style.display = "";
  newRoomBtn.style.display = "";
  passwordAlert.classList.add("hidden");
}

function showChatInterface() {
  if (!chatWrapper) return;
  roomModal.classList.add("hidden");
  usernameModal.classList.add("hidden");
  chatWrapper.classList.remove("hidden");
  adjustChatPadding();
  setTimeout(() => { messageInput.focus(); }, 200);
}

/* Username flow */
(function initUsernameFlow() {
  // handle ?room= param: show username then join-only flow
  const params = new URLSearchParams(window.location.search);
  const r = params.get('room');
  if (r) {
    usernameModal.classList.remove("hidden");
    usernameBtn.onclick = () => {
      const name = usernameInput.value.trim();
      if (!name) { showToast('Enter name'); return; }
      username = name;
      usernameModal.classList.add("hidden");
      roomModal.classList.remove("hidden");
      newRoomInput.value = r;
      createSection.style.display = 'none';
      newRoomBtn.style.display = 'none';
      joinPasswordContainer.classList.remove('hidden');
      passwordAlert.classList.add('hidden');
      joinRoomBtn.onclick = () => {
        const pwd = joinRoomPassword.value.trim();
        if (!pwd) { showToast('Enter password'); return; }
        socket.emit('join room request', r, pwd, username);
      };
    };
    return;
  }

  // no URL room
  usernameModal.classList.remove("hidden");
  usernameBtn.onclick = () => {
    const name = usernameInput.value.trim();
    if (!name) { showToast('Enter name'); return; }
    username = name;
    usernameModal.classList.add("hidden");
    showRoomModal();
    roomModal.classList.remove("hidden");
  };
})();

/* Create room */
newRoomBtn.addEventListener('click', () => {
  const r = newRoomInput.value.trim();
  const p = newRoomPassword.value.trim();
  if (!r || !p) { showToast('Room name and password required'); return; }
  socket.emit('create room', r, p, username);
});

/* Click room list join */
roomList.addEventListener('click', e => {
  if (e.target && e.target.tagName === 'LI') {
    const selected = e.target.textContent;
    newRoomInput.value = selected;
    createSection.style.display = 'none';
    newRoomBtn.style.display = 'none';
    joinPasswordContainer.classList.remove('hidden');
    passwordAlert.classList.add('hidden');
    joinRoomBtn.onclick = () => {
      const pwd = joinRoomPassword.value.trim();
      if (!pwd) { showToast('Enter password'); return; }
      socket.emit('join room request', selected, pwd, username);
    };
  }
});

/* Room socket responses */
socket.on('no such room', () => showToast('Room does not exist'));
socket.on('wrong password', () => {
  passwordAlert.textContent = 'Incorrect password';
  passwordAlert.classList.remove('hidden');
});
socket.on('room joined', roomName => {
  room = roomName;
  chatSubtitle.textContent = `Room: ${room} (${username})`;
  showChatInterface();
  addSystemMessage(`You joined "${room}"`);
});

/* Chat rendering */
function addSystemMessage(text) {
  const el = document.createElement('div');
  el.className = 'message system';
  el.innerHTML = `<em>${escapeHtml(text)}</em>`;
  chatBody.appendChild(el);
  scrollToBottom();
}

function addMessage(user, text, timeStamp) {
  const el = document.createElement('div');
  el.className = 'message ' + (user === username ? 'user' : 'other');
  const time = timeStamp ? formatTime(timeStamp) : formatTime(new Date());
  el.innerHTML = `<strong>${escapeHtml(user)}</strong><div>${escapeHtml(text)}</div><div class="timestamp">${time}</div>`;
  chatBody.appendChild(el);
  scrollToBottom();
}

function addFileMessage(user, data) {
  const el = document.createElement('div');
  el.className = 'message ' + (user === username ? 'user' : 'other');
  let content = '';
  if (data.fileType && data.fileType.startsWith('image/')) {
    content = `<img src="${data.fileData}" class="chat-image" alt="${escapeHtml(data.fileName)}">`;
  } else {
    content = `<a href="${data.fileData}" download="${encodeURIComponent(data.fileName)}">${escapeHtml(data.fileName)}</a>`;
  }
  const time = formatTime(new Date());
  el.innerHTML = `<strong>${escapeHtml(user)}</strong><div>${content}</div><div class="timestamp">${time}</div>`;
  chatBody.appendChild(el);
  scrollToBottom();
}

function escapeHtml(s) {
  if (!s) return '';
  return s.replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function scrollToBottom() {
  // ensure newest message is visible and not hidden behind footer
  if (!chatBody) return;
  chatBody.scrollTop = chatBody.scrollHeight - 6;
}

/* Socket handlers for chat & files */
socket.on('chat message', data => {
  if (!data) return;
  if (data.type === 'text') addMessage(data.user, data.text, data.time);
  else addMessage(data.user, data.text || '');
});
socket.on('file message', data => addFileMessage(data.user || 'Unknown', data));

socket.on('chat history', history => {
  if (!history || !history.length) return;
  history.forEach(h => {
    if (h.type === 'text') addMessage(h.user, h.text, h.time);
    else addFileMessage(h.user, h);
  });
});

/* Typing indicator */
socket.on('typing', user => {
  if (user === username) return;
  typingIndicator.textContent = `${user} is typing...`;
  typingIndicator.classList.remove('hidden');
});
socket.on('stop typing', user => {
  if (user === username) return;
  typingIndicator.classList.add('hidden');
});

/* Send message and input */
sendBtn.addEventListener('click', () => {
  const msg = messageInput.value.trim();
  if (!msg) return;
  // send to server (server will broadcast and store)
  socket.emit('chat message', msg);
  // clear input but keep focus to keep keyboard open on mobile
  messageInput.value = '';
  messageInput.focus();
  socket.emit('stop typing', username);
});
messageInput.addEventListener('keypress', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    sendBtn.click();
  } else {
    socket.emit('typing', username);
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => socket.emit('stop typing', username), 900);
  }
});

/* File upload */
fileBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const data = { fileName: file.name, fileType: file.type, fileData: reader.result };
    // show locally
    addFileMessage(username, data);
    socket.emit('file upload', data);
  };
  reader.readAsDataURL(file);
});

/* Invite modal copy */
function setInviteUrl() {
  if (!room) return;
  inviteUrlInput.value = `${window.location.origin}?room=${encodeURIComponent(room)}`;
}
inviteBtn.addEventListener('click', () => {
  setInviteUrl();
  inviteModal.classList.remove('hidden');
});
closeInvite.addEventListener('click', () => inviteModal.classList.add('hidden'));
copyBtn.addEventListener('click', async () => {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(inviteUrlInput.value);
    } else {
      inviteUrlInput.select();
      inviteUrlInput.setSelectionRange(0, 99999);
      document.execCommand('copy');
    }
    inviteModal.classList.add('hidden');
    showToast('Link copied!');
  } catch {
    showToast('Copy failed');
  }
});

/* Connection status */
socket.on('connect_error', () => {
  statusBar.textContent = '⚠️ Server unreachable — reconnecting...';
  statusBar.classList.add('show');
});
socket.on('disconnect', () => {
  statusBar.textContent = '⚠️ Disconnected — trying to reconnect...';
  statusBar.classList.add('show');
});
socket.on('connect', () => {
  statusBar.classList.remove('show');
});

/* initial adjustments */
window.addEventListener('resize', adjustChatPadding);
window.addEventListener('load', adjustChatPadding);
setTimeout(adjustChatPadding, 300);

/* Notifications (browser) - register service worker & subscribe */
async function registerForPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.log('Push not supported');
    return;
  }

  try {
    const reg = await navigator.serviceWorker.register('/sw.js');
    console.log('Service Worker registered', reg);

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.log('Notification permission not granted');
      return;
    }

    // get vapid public key from server
    const res = await fetch('/vapidPublicKey');
    const data = await res.json();
    if (!data.publicKey) {
      console.warn('No public key from server');
      return;
    }
    const convertedKey = urlBase64ToUint8Array(data.publicKey);

    // subscribe
    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: convertedKey
    });

    // send to server
    await fetch('/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscription)
    });

    hasSubscribedForPush = true;
    console.log('Subscribed for push');
  } catch (err) {
    console.error('Push registration failed', err);
  }
}
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

// call push registration after user has entered a username and joined a room
// so we can ask permission at right time
// We'll call registerForPush when user joins a room successfully:
socket.on('room joined', () => {
  if (!hasSubscribedForPush) registerForPush();
});

/* Notifications when receiving chat message (in-app)
   Browser system notifications are handled by the service worker.
   We still show audio/visual hints here if tab hidden.
*/
let isTabActive = true;
document.addEventListener('visibilitychange', () => { isTabActive = !document.hidden; });

socket.on('chat message', data => {
  // If message arrived when tab not active and push not delivered (or user didn't subscribe),
  // the service worker push will handle. For redundancy, play sound or show small toast.
  if (!isTabActive) {
    // optionally play a sound or show toast
  }
});

/* End of script.js */
/* --- Invite via SMS (append only) --- */
/* --- Invite via SMS (updated: sends custom message, not just link) --- */
(function () {
  const inviteSmsBtn = document.getElementById("invite-sms-btn");

  if (!inviteSmsBtn) return;

  inviteSmsBtn.addEventListener("click", () => {
    /* ⭐ CUSTOMIZE YOUR URL HERE ⭐ */
    const smsCustomUrl = "https://jinnie-chats.com";

    /* ⭐ CUSTOMIZE YOUR MESSAGE HERE ⭐ */
    const customMessage = 
      `Hey! I’m using Jinnie Chat — a simple, private realtime chat.\n` +
      `Join now using this link:\n${smsCustomUrl}\nSee you there!`;

    /* ===============================
       1. Try Web Share API first
       =============================== */
    if (navigator.share) {
      navigator
        .share({
          title: "Join Jinnie Chat",
          text: customMessage,
        })
        .catch(() => {
          // If user cancels or fails → fallback to SMS
          const body = encodeURIComponent(customMessage);
          window.location.href = `sms:?body=${body}`;
          setTimeout(() => {
            window.location.href = `sms:&body=${body}`;
          }, 400);
        });

      return;
    }

    /* ===============================
       2. Fallback: Open SMS composer
       =============================== */
    const body = encodeURIComponent(customMessage);

    // Try 1st format
    window.location.href = `sms:?body=${body}`;

    // Try alternative format (for Samsung, Xiaomi, etc.)
    setTimeout(() => {
      window.location.href = `sms:&body=${body}`;
    }, 400);
  });
})();

//share popup 
/* ================================
   SHARE OPTIONS - ALL INVITES
================================= */

const sharePopup = document.getElementById("shareOptionsPopup");
const shareBtn = document.getElementById("share-options-btn");

const popupWA = document.getElementById("popup-whatsapp");
const popupTG = document.getElementById("popup-telegram");
const popupSMS = document.getElementById("popup-sms");
const popupCOPY = document.getElementById("popup-copy");

function getInviteLink() {
  const urlInput = document.getElementById("invite-url");
  return urlInput?.value || window.location.href;
}

/* --- OPEN SHARE POPUP --- */
shareBtn.addEventListener("click", () => {
  sharePopup.classList.add("show");
  sharePopup.classList.remove("hidden");
});

/* --- CLOSE POPUP WHEN CLICK CANCEL --- */
sharePopup.querySelector(".share-cancel").addEventListener("click", () => {
  sharePopup.classList.remove("show");
  setTimeout(() => sharePopup.classList.add("hidden"), 300);
});

/* --- WhatsApp share --- */
function shareWhatsApp() {
  const link = getInviteLink();
  const msg = encodeURIComponent(`Join me on Jinnie Chat:\n${link}`);
  window.location.href = `https://wa.me/?text=${msg}`;
}
popupWA.addEventListener("click", shareWhatsApp);
document.getElementById("invite-wa-btn").addEventListener("click", shareWhatsApp);

/* --- Telegram share --- */
function shareTelegram() {
  const link = getInviteLink();
  const msg = encodeURIComponent(`Join me on Jinnie Chat:\n${link}`);
  window.location.href = `https://t.me/share/url?url=${link}&text=${msg}`;
}
popupTG.addEventListener("click", shareTelegram);
document.getElementById("invite-tg-btn").addEventListener("click", shareTelegram);

/* --- SMS share --- */
function shareSMS() {
  const link = getInviteLink();
  const msg = encodeURIComponent(`Hey! Join me on Jinnie Chat:\n${link}`);

  window.location.href = `sms:?body=${msg}`;
  setTimeout(() => {
    window.location.href = `sms:&body=${msg}`;
  }, 300);
}
popupSMS.addEventListener("click", shareSMS);

/* --- Copy link --- */
popupCOPY.addEventListener("click", () => {
  const link = getInviteLink();
  navigator.clipboard.writeText(link);
  alert("Link copied to clipboard!");
});
