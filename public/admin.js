document.getElementById('send').addEventListener('click', async () => {
  const title = document.getElementById('title').value.trim();
  const message = document.getElementById('message').value.trim();
  const secret = document.getElementById('secret').value.trim();
  const status = document.getElementById('status');

  if (!title || !message || !secret) {
    status.textContent = 'Please fill all fields';
    return;
  }
  status.textContent = 'Sending...';

  try {
    const res = await fetch('/send-notification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, message, secret })
    });
    const body = await res.json();
    if (res.ok && body.success) {
      status.textContent = 'Notification sent ✅';
      document.getElementById('title').value = '';
      document.getElementById('message').value = '';
    } else {
      status.textContent = 'Error: ' + (body.error || 'Failed to send');
    }
  } catch (err) {
    status.textContent = 'Network error';
    console.error(err);
  }
});
