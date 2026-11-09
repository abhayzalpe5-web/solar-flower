// Authentication JavaScript for Solar Flower Login

function togglePasswordVisibility() {
  const passwordInput = document.getElementById('password');
  const eyeIcon = document.getElementById('eyeIcon');
  if (passwordInput.type === 'password') {
    passwordInput.type = 'text';
    eyeIcon.classList.remove('fa-eye');
    eyeIcon.classList.add('fa-eye-slash');
  } else {
    passwordInput.type = 'password';
    eyeIcon.classList.remove('fa-eye-slash');
    eyeIcon.classList.add('fa-eye');
  }
}

function showAlert(message, isError = true) {
  const alertBox = document.getElementById('alertBox');
  const alertMessage = document.getElementById('alertMessage');
  const alertIcon = document.getElementById('alertIcon');

  alertBox.classList.remove('hidden', 'bg-red-50', 'text-red-700', 'border', 'border-red-200', 'bg-emerald-50', 'text-emerald-700', 'border-emerald-200');

  if (isError) {
    alertBox.classList.add('bg-red-50', 'text-red-700', 'border', 'border-red-200');
    alertIcon.className = 'fa-solid fa-circle-exclamation text-red-500';
  } else {
    alertBox.classList.add('bg-emerald-50', 'text-emerald-700', 'border', 'border-emerald-200');
    alertIcon.className = 'fa-solid fa-circle-check text-emerald-500';
  }

  alertMessage.textContent = message;
}

async function handleLogin(event) {
  event.preventDefault();
  const passwordInput = document.getElementById('password');
  const loginBtn = document.getElementById('loginBtn');
  const password = passwordInput.value;

  if (!password) {
    showAlert('Please enter the password.');
    return;
  }

  // Set loading state
  const originalBtnHtml = loginBtn.innerHTML;
  loginBtn.disabled = true;
  loginBtn.innerHTML = `
    <i class="fa-solid fa-circle-notch fa-spin text-sm"></i>
    <span>Verifying...</span>
  `;

  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ password })
    });

    const data = await response.json();

    if (response.ok && data.success) {
      showAlert('Access granted. Redirecting to dashboard...', false);
      // Store token in localStorage for backup authentication headers
      if (data.token) {
        localStorage.setItem('solar_token', data.token);
      }
      setTimeout(() => {
        window.location.href = '/dashboard';
      }, 600);
    } else {
      showAlert(data.error || 'Incorrect password. Access denied.');
      passwordInput.value = '';
      passwordInput.focus();
    }
  } catch (error) {
    console.error('Login error:', error);
    showAlert('Server communication error. Please try again.');
  } finally {
    loginBtn.disabled = false;
    loginBtn.innerHTML = originalBtnHtml;
  }
}

// Auto-check if already logged in
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const res = await fetch('/api/auth/check');
    if (res.ok) {
      const data = await res.json();
      if (data.authenticated) {
        window.location.href = '/dashboard';
      }
    }
  } catch (e) {
    // Ignore network error during pre-check
  }
});
