// ====== Simple Config ======
const ADMIN_PASSWORD = "jinnie"; // <-- change this!

const loginContainer = document.getElementById("login-container");
const adminContainer = document.getElementById("admin-container");
const loginBtn = document.getElementById("login-btn");
const loginStatus = document.getElementById("login-status");

loginBtn.addEventListener("click", () => {
  const entered = document.getElementById("admin-password").value.trim();
  if (!entered) {
    loginStatus.textContent = "⚠️ Please enter password";
    loginStatus.className = "status error";
    return;
  }

  if (entered === ADMIN_PASSWORD) {
    // Save session locally so user doesn't log in again until refresh
    localStorage.setItem("adminLoggedIn", "true");

    loginContainer.classList.add("hidden");
    adminContainer.classList.remove("hidden");
  } else {
    loginStatus.textContent = "❌ Incorrect password";
    loginStatus.className = "status error";
  }
});

// Auto-login if already logged in
window.addEventListener("load", () => {
  if (localStorage.getItem("adminLoggedIn") === "true") {
    loginContainer.classList.add("hidden");
    adminContainer.classList.remove("hidden");
  }
});

// ====== Notification Sender ======
document.getElementById("send-btn").addEventListener("click", async () => {
  const title = document.getElementById("title").value.trim();
  const message = document.getElementById("message").value.trim();
  const status = document.getElementById("status");

  if (!title || !message) {
    status.textContent = "⚠️ Please enter both title and message.";
    status.className = "status error";
    return;
  }

  try {
    status.textContent = "⏳ Sending...";
    status.className = "status";

    const response = await fetch("/send-notification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, message })
    });

    if (response.ok) {
      status.textContent = "✅ Notification sent successfully!";
      status.className = "status success";
      document.getElementById("title").value = "";
      document.getElementById("message").value = "";
    } else {
      status.textContent = "❌ Failed to send notification.";
      status.className = "status error";
    }
  } catch (error) {
    status.textContent = "❌ Error sending notification.";
    status.className = "status error";
  }
});
