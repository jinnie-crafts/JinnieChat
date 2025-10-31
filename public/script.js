// script.js - client side
const socket = io({ reconnection: true, reconnectionAttempts: Infinity, reconnectionDelay: 1000 });

/* ----------------------
   Elements
   ---------------------- */
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

/* ----------------------
   Splash
   ---------------------- */
window.addEventListener("load", () => {
  setTimeout(() => {
    splash.classList.add("fade-out");
    setTimeout(() => { splash.style.display = "none"; }, 650);
  }, 1000);
});

/* ----------------------
   Utility helpers
   ---------------------- */
function showToast(msg, time = 1400) {
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
  // Place typing indicator above footer
  typingIndicator.style.bottom = (h + 16) + "px";
}

/* ----------------------
   Toggle password visibility
   ---------------------- */
window.togglePassword = function (id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.type = el.type === "password" ? "text" : "password";
};

/* ----------------------
   Room list / URL handling
   ---------------------- */
function showRoomModal() {
  roomModal.classList.remove("hidden");
  joinPasswordContainer.classList.add("hidden");
  createSection.style.display = "";
  newRoomBtn.style.display = "";
  passwordAlert.classList.add("hidden");
}

function showChatInterface() {
  roomModal.classList.add("hidden");
  usernameModal.classList.add("hidden");
  chatWrapper.classList.remove("hidden");
  adjustChatPadding();
  setTimeout(() => { messageInput.focus(); }, 200);
}

socket.on("room list", rooms => {
  roomList.innerHTML = "";
  rooms.forEach(r => {
    const li = document.createElement("li");
    li.textContent = r;
    roomList.appendChild(li);
  });
});

// When page has ?room=roomName, handle differently
function handleUrlRoomFlow() {
  const params = new URLSearchParams(window.location.search);
  const r = params.get("room");
  if (r) {
    // display username first, then show join password only
    usernameModal.classList.remove("hidden");
    usernameBtn.onclick = () => {
      const name = usernameInput.value.trim();
      if (!name) return;
      username = name;
      usernameModal.classList.add("hidden");
      roomModal.classList.remove("hidden");
      // auto-fill and show join-only
      newRoomInput.value = r;
      createSection.style.display = "none";
      newRoomBtn.style.display = "none";
      joinPasswordContainer.classList.remove("hidden");
      passwordAlert.classList.add("hidden");
      joinRoomBtn.onclick = () => {
        const pwd = joinRoomPassword.value.trim();
        if (!pwd) return;
        socket.emit("join room request", r, pwd, username);
      };
    };
    return true;
  }
  return false;
}

/* ----------------------
   Username flow
   ---------------------- */
(function initUsernameFlow() {
  const urlHandled = handleUrlRoomFlow();
  if (!urlHandled) {
    usernameModal.classList.remove("hidden");
    usernameBtn.onclick = () => {
      const name = usernameInput.value.trim();
      if (!name) return;
      username = name;
      usernameModal.classList.add("hidden");
      // show room modal (create/join)
      showRoomModal();
      roomModal.classList.remove("hidden");
    };
  }
})();

/* ----------------------
   Create room
   ---------------------- */
newRoomBtn.addEventListener("click", () => {
  const r = newRoomInput.value.trim();
  const p = newRoomPassword.value.trim();
  if (!r || !p) {
    showToast("Room name and password required");
    return;
  }
  socket.emit("create room", r, p, username);
});

/* ----------------------
   Click room from list -> join flow
   ---------------------- */
roomList.addEventListener("click", e => {
  if (e.target && e.target.tagName === "LI") {
    const selected = e.target.textContent;
    // show join-only UI
    newRoomInput.value = selected;
    createSection.style.display = "none";
    newRoomBtn.style.display = "none";
    joinPasswordContainer.classList.remove("hidden");
    passwordAlert.classList.add("hidden");
    joinRoomBtn.onclick = () => {
      const pwd = joinRoomPassword.value.trim();
      if (!pwd) return;
      socket.emit("join room request", selected, pwd, username);
    };
  }
});

/* ----------------------
   Socket responses for room events
   ---------------------- */
socket.on("no such room", () => {
  showToast("Room does not exist");
});

socket.on("wrong password", () => {
  passwordAlert.textContent = "Incorrect password";
  passwordAlert.classList.remove("hidden");
});

socket.on("room joined", roomName => {
  room = roomName;
  chatSubtitle.textContent = `Room: ${room} (${username})`;
  showChatInterface();
  addSystemMessage(`You joined "${room}"`);
});

/* ----------------------
   Chat message rendering
   ---------------------- */
function addSystemMessage(text) {
  const el = document.createElement("div");
  el.className = "message system";
  el.innerHTML = `<em>${text}</em>`;
  chatBody.appendChild(el);
  chatBody.scrollTop = chatBody.scrollHeight;
}

function addMessage(user, text, timeStamp) {
  const el = document.createElement("div");
  el.className = "message " + (user === username ? "user" : "other");
  const time = timeStamp ? formatTime(timeStamp) : formatTime(new Date());
  el.innerHTML = `<strong>${user}</strong><div>${escapeHtml(text)}</div><div class="timestamp">${time}</div>`;
  chatBody.appendChild(el);
  chatBody.scrollTop = chatBody.scrollHeight;
}

function addFileMessage(user, data) {
  const el = document.createElement("div");
  el.className = "message " + (user === username ? "user" : "other");
  let content = "";
  if (data.fileType && data.fileType.startsWith("image/")) {
    content = `<img src="${data.fileData}" class="chat-image" alt="${escapeHtml(data.fileName)}">`;
  } else {
    content = `<a href="${data.fileData}" download="${encodeURIComponent(data.fileName)}">${escapeHtml(data.fileName)}</a>`;
  }
  const time = formatTime(new Date());
  el.innerHTML = `<strong>${escapeHtml(user)}</strong><div>${content}</div><div class="timestamp">${time}</div>`;
  chatBody.appendChild(el);
  chatBody.scrollTop = chatBody.scrollHeight;
}

/* simple escaping */
function escapeHtml(s) {
  if (!s) return "";
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ----------------------
   Socket chat/file/typing handlers
   ---------------------- */
socket.on("file message", data => {
  addFileMessage(data.user || "Unknown", data);
});

socket.on("typing", user => {
  if (user === username) return;
  typingIndicator.textContent = `${user} is typing...`;
  typingIndicator.classList.remove("hidden");
});
socket.on("stop typing", user => {
  if (user === username) return;
  typingIndicator.classList.add("hidden");
});

/* ----------------------
   Send message & input
   ---------------------- */
sendBtn.addEventListener("click", () => {
  const msg = messageInput.value.trim();
  if (!msg) return;
  socket.emit("chat message", msg);  // only send
  messageInput.value = ""; // clear input
  socket.emit("stop typing", username);
  //keep keyboard open on mobile
    if (/Mobi|Android/i.test(navigator.userAgent)) {
    setTimeout(() => messageInput.focus(), 50); // refocus input
  }
});

messageInput.addEventListener("keypress", e => {
  if (e.key === "Enter") sendBtn.click();
  else {
    socket.emit("typing", username);
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => socket.emit("stop typing", username), 900);
  }
});

/* ----------------------
   Receive chat message
   ---------------------- */
socket.on("chat message", data => {
  if (!data) return;

  if (typeof data === "string") {
    addMessage("System", data);
  } else if (data.user && data.text) {
    addMessage(data.user, data.text);

    // play sound if tab inactive
    if (!isTabActive) {
      const audio = new Audio("notification.mp3");
      audio.play();
    }

    // show desktop notification
    if (!isTabActive && Notification.permission === "granted") {
      const notification = new Notification(`${data.user} sent a message`, {
        body: data.text,
        icon: "logo.png"
      });
      notification.onclick = () => window.focus();
    }
  }
});

/* ----------------------
   File upload
   ---------------------- */
fileBtn.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const data = { fileName: file.name, fileType: file.type, fileData: reader.result };
    // show locally immediately
    addFileMessage(username, data);
    socket.emit("file upload", data);
  };
  reader.readAsDataURL(file);
});

/* ----------------------
   Invite modal & copy
   ---------------------- */
function setInviteUrl() {
  if (!room) return;
  inviteUrlInput.value = `${window.location.origin}?room=${encodeURIComponent(room)}`;
}

inviteBtn.addEventListener("click", () => {
  setInviteUrl();
  inviteModal.classList.remove("hidden");
});
closeInvite.addEventListener("click", () => inviteModal.classList.add("hidden"));
copyBtn.addEventListener("click", async () => {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(inviteUrlInput.value);
    } else {
      inviteUrlInput.select();
      inviteUrlInput.setSelectionRange(0, 99999);
      document.execCommand("copy");
    }
    inviteModal.classList.add("hidden");
    showToast("Link copied!");
  } catch (err) {
    showToast("Copy failed");
  }
});

/* ----------------------
   Window resize / padding
   ---------------------- */
window.addEventListener("resize", adjustChatPadding);
window.addEventListener("load", adjustChatPadding);

/* ----------------------
   Status updates (connection)
   ---------------------- */
socket.on("connect_error", () => {
  statusBar.textContent = "⚠️ Server unreachable — reconnecting...";
  statusBar.classList.add("show");
});
socket.on("disconnect", () => {
  statusBar.textContent = "⚠️ Disconnected — trying to reconnect...";
  statusBar.classList.add("show");
});
socket.on("connect", () => {
  statusBar.classList.remove("show");
});

/* ----------------------
   initial padding call
   ---------------------- */
setTimeout(adjustChatPadding, 300);

//notification
if ("Notification" in window) {
  Notification.requestPermission().then(permission => {
    console.log("Notification permission:", permission);
  });
}

//page visibility that check tab is open or not
let isTabActive = true;

document.addEventListener("visibilitychange", () => {
  isTabActive = !document.hidden;
});



/* ----------------------
   Push notifications: register service worker & subscribe
---------------------- */
async function registerForPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.log('Push not supported in this browser.');
    return;
  }
  try {
    const reg = await navigator.serviceWorker.register('/sw.js');
    console.log('Service worker registered for push:', reg);

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.log('Notification permission not granted');
      return;
    }

    // fetch public key from server
    const res = await fetch('/vapidPublicKey');
    const publicKey = await res.text();
    if (!publicKey) {
      console.warn('No public VAPID key available from server');
      return;
    }

    const convertedKey = urlBase64ToUint8Array(publicKey);
    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: convertedKey
    });

    // send subscription to server
    await fetch('/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscription)
    });
    console.log('Push subscription sent to server');
  } catch (err) {
    console.error('Failed to register for push', err);
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Call registerForPush when user joins a room
socket.on('room joined', () => {
  // small delay to ensure modal closed
  setTimeout(() => { registerForPush(); }, 300);
});
