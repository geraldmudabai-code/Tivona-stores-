// ===== Tivona Stores - Authentication (server API) =====

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const data = await API.me();
    if (data.user) {
      setCurrentUser(data.user);
      if (window.location.pathname.endsWith('login.html') ||
          window.location.pathname.endsWith('register.html') ||
          window.location.pathname.endsWith('forgot-password.html')) {
        window.location.href = 'admin.html';
        return;
      }
    }
  } catch (_) {}

  const loginForm = document.getElementById('login-form');
  if (loginForm) loginForm.addEventListener('submit', handleLogin);

  const registerForm = document.getElementById('register-form');
  if (registerForm) {
    registerForm.addEventListener('submit', handleRegister);
    document.getElementById('reg-password')?.addEventListener('input', updatePasswordStrength);
  }

  const forgotForm = document.getElementById('forgot-form');
  if (forgotForm) {
    forgotForm.addEventListener('submit', handleForgotPassword);
    document.getElementById('new-password')?.addEventListener('input', updateForgotPasswordStrength);
  }
});

function isValidEmail(email) {
  return /^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/i.test(email);
}

const DISPOSABLE_DOMAINS = [
  'mailinator.com','guerrillamail.com','10minutemail.com','tempmail.com',
  'temp-mail.org','yopmail.com','trashmail.com','getnada.com','maildrop.cc',
  'example.com','example.org','test.com','fake.com'
];

function isLikelyFakeEmail(email) {
  const parts = email.toLowerCase().split('@');
  if (parts.length !== 2) return true;
  const [local, domain] = parts;
  if (DISPOSABLE_DOMAINS.includes(domain)) return true;
  if (['test','testing','fake','asdf','qwerty','user','username'].includes(local)) return true;
  return false;
}

function getPasswordStrength(password) {
  let score = 0;
  if (password.length >= 6) score++;
  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  if (score <= 1) return { level: 'weak', text: 'Weak', class: 'weak' };
  if (score <= 3) return { level: 'medium', text: 'Medium', class: 'medium' };
  return { level: 'strong', text: 'Strong', class: 'strong' };
}

async function handleLogin(e) {
  e.preventDefault();
  clearMessages();
  const email = document.getElementById('email').value.trim().toLowerCase();
  const password = document.getElementById('password').value;

  if (!isValidEmail(email)) {
    showAuthError('Please enter a valid email address.');
    return;
  }
  if (!password) {
    showAuthError('Please enter your password.');
    return;
  }

  try {
    const data = await API.login(email, password);
    setCurrentUser(data.user);
    window.location.href = 'admin.html';
  } catch (err) {
    showAuthError(err.message || 'Invalid email or password.');
    if (err.data && err.data.code === 'email_not_verified') {
      showResendVerification(email);
    }
  }
}

function showResendVerification(email) {
  const el = document.getElementById('auth-message');
  if (!el) return;
  const wrap = document.createElement('div');
  wrap.style.marginTop = '12px';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn-outline btn-block';
  btn.innerHTML = '<i class="fas fa-envelope"></i> Resend verification email';
  btn.onclick = async () => {
    btn.disabled = true;
    try {
      const data = await API.resendVerification(email);
      showAuthSuccess(data.message || 'Verification link resent. Check inbox or server console.');
    } catch (e) {
      showAuthError(e.message || 'Could not resend.');
    }
  };
  wrap.appendChild(btn);
  el.appendChild(wrap);
}

async function handleRegister(e) {
  e.preventDefault();
  clearMessages();
  const name = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim().toLowerCase();
  const password = document.getElementById('reg-password').value;
  const confirm = document.getElementById('reg-confirm').value;
  const role = document.getElementById('reg-role')?.value || 'worker';

  if (!name || name.length < 2) {
    showAuthError('Please enter your full name (at least 2 characters).');
    return;
  }
  if (!isValidEmail(email)) {
    showAuthError('Please enter a valid email address (e.g. name@gmail.com).');
    return;
  }
  if (isLikelyFakeEmail(email)) {
    showAuthError('Temporary or fake email addresses are not allowed. Use a real inbox.');
    return;
  }
  if (password.length < 6) {
    showAuthError('Password must be at least 6 characters long.');
    return;
  }
  if (getPasswordStrength(password).level === 'weak') {
    showAuthError('Password is too weak. Add uppercase letters, numbers, or symbols.');
    return;
  }
  if (password !== confirm) {
    showAuthError('Passwords do not match.');
    return;
  }

  try {
    const data = await API.register({ name, email, password, role });
    const msg = data.message || 'Account created. Please verify your email before logging in.';
    showAuthSuccess(msg + (data.demo_mode ? ' (Demo: open the link printed in the server console.)' : ''));
    setTimeout(() => { window.location.href = 'login.html'; }, 3500);
  } catch (err) {
    showAuthError(err.message || 'Registration failed.');
  }
}

async function handleForgotPassword(e) {
  e.preventDefault();
  clearMessages();
  const email = document.getElementById('forgot-email').value.trim().toLowerCase();
  const newPassword = document.getElementById('new-password').value;
  const confirm = document.getElementById('new-confirm').value;

  if (!isValidEmail(email)) {
    showAuthError('Please enter a valid email address.');
    return;
  }
  if (newPassword.length < 6) {
    showAuthError('New password must be at least 6 characters long.');
    return;
  }
  if (getPasswordStrength(newPassword).level === 'weak') {
    showAuthError('Password is too weak. Add uppercase letters, numbers, or symbols.');
    return;
  }
  if (newPassword !== confirm) {
    showAuthError('Passwords do not match.');
    return;
  }

  try {
    await API.forgotPassword(email, newPassword);
    showAuthSuccess('Password reset successfully! You can now login.');
    setTimeout(() => { window.location.href = 'login.html'; }, 1800);
  } catch (err) {
    showAuthError(err.message || 'Password reset failed.');
  }
}

function updatePasswordStrength() {
  const password = document.getElementById('reg-password')?.value || '';
  const meter = document.getElementById('password-strength');
  const text = document.getElementById('password-strength-text');
  if (!meter || !text) return;
  if (!password) {
    meter.className = 'strength-meter';
    text.textContent = '';
    return;
  }
  const strength = getPasswordStrength(password);
  meter.className = 'strength-meter ' + strength.class;
  text.textContent = 'Strength: ' + strength.text;
  text.className = 'strength-text ' + strength.class;
}

function updateForgotPasswordStrength() {
  const password = document.getElementById('new-password')?.value || '';
  const meter = document.getElementById('forgot-strength');
  const text = document.getElementById('forgot-strength-text');
  if (!meter || !text) return;
  if (!password) {
    meter.className = 'strength-meter';
    text.textContent = '';
    return;
  }
  const strength = getPasswordStrength(password);
  meter.className = 'strength-meter ' + strength.class;
  text.textContent = 'Strength: ' + strength.text;
  text.className = 'strength-text ' + strength.class;
}

function showAuthError(msg) {
  const el = document.getElementById('auth-message');
  if (el) {
    el.textContent = msg;
    el.className = 'auth-message error';
    el.style.display = 'block';
  } else alert(msg);
}

function showAuthSuccess(msg) {
  const el = document.getElementById('auth-message');
  if (el) {
    el.textContent = msg;
    el.className = 'auth-message success';
    el.style.display = 'block';
  } else alert(msg);
}

function clearMessages() {
  const el = document.getElementById('auth-message');
  if (el) {
    el.style.display = 'none';
    el.textContent = '';
  }
}
