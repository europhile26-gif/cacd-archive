/**
 * Login Page JavaScript
 * Handles user authentication
 */

(function () {
  'use strict';

  // DOM elements
  const loginForm = document.getElementById('loginForm');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const rememberMeCheckbox = document.getElementById('rememberMe');
  const loginBtn = document.getElementById('loginBtn');
  const loginBtnText = document.getElementById('loginBtnText');
  const loginSpinner = document.getElementById('loginSpinner');
  const errorAlert = document.getElementById('errorAlert');
  const errorMessage = document.getElementById('errorMessage');
  const successAlert = document.getElementById('successAlert');
  const successMessage = document.getElementById('successMessage');

  /**
   * Show error message
   */
  function showError(message) {
    errorMessage.textContent = message;
    errorAlert.classList.remove('d-none');
    successAlert.classList.add('d-none');
  }

  /**
   * Show success message
   */
  function showSuccess(message) {
    successMessage.textContent = message;
    successAlert.classList.remove('d-none');
    errorAlert.classList.add('d-none');
  }

  /**
   * Hide all alerts
   */
  function hideAlerts() {
    errorAlert.classList.add('d-none');
    successAlert.classList.add('d-none');
  }

  /**
   * Set loading state
   */
  function setLoading(isLoading) {
    if (isLoading) {
      loginBtn.disabled = true;
      loginBtnText.textContent = 'Signing in...';
      loginSpinner.classList.remove('d-none');
    } else {
      loginBtn.disabled = false;
      loginBtnText.textContent = 'Sign In';
      loginSpinner.classList.add('d-none');
    }
  }

  /**
   * Validate form
   */
  function validateForm() {
    let isValid = true;

    // Email validation
    if (!emailInput.value || !emailInput.value.includes('@')) {
      emailInput.classList.add('is-invalid');
      isValid = false;
    } else {
      emailInput.classList.remove('is-invalid');
      emailInput.classList.add('is-valid');
    }

    // Password validation
    if (!passwordInput.value) {
      passwordInput.classList.add('is-invalid');
      isValid = false;
    } else {
      passwordInput.classList.remove('is-invalid');
      passwordInput.classList.add('is-valid');
    }

    return isValid;
  }

  /**
   * Handle login
   */
  async function handleLogin(e) {
    e.preventDefault();

    hideAlerts();

    // Validate form
    if (!validateForm()) {
      showError('Please fill in all required fields.');
      return;
    }

    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const rememberMe = rememberMeCheckbox.checked;

    setLoading(true);

    try {
      const response = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email,
          password,
          rememberMe
        }),
        credentials: 'include' // Important: include cookies
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Login failed');
      }

      // Success
      showSuccess('Login successful! Redirecting...');

      // Store user info in sessionStorage for quick access
      if (data.user) {
        sessionStorage.setItem('user', JSON.stringify(data.user));
      }

      // Redirect after short delay
      setTimeout(() => {
        // Check if there's a redirect parameter in URL
        const urlParams = new URLSearchParams(window.location.search);
        const redirect = urlParams.get('redirect') || '/dashboard';
        window.location.href = redirect;
      }, 1000);
    } catch (error) {
      console.error('Login error:', error);
      showError(error.message || 'An error occurred during login. Please try again.');
      setLoading(false);
    }
  }

  /**
   * Remove validation classes on input
   */
  function handleInput(e) {
    e.target.classList.remove('is-invalid', 'is-valid');
    hideAlerts();
  }

  // Event listeners
  loginForm.addEventListener('submit', handleLogin);
  emailInput.addEventListener('input', handleInput);
  passwordInput.addEventListener('input', handleInput);

  // Check if already logged in
  (async function checkAuth() {
    try {
      const response = await fetch('/api/v1/auth/me', {
        credentials: 'include'
      });

      if (response.ok) {
        // Already logged in, redirect
        window.location.href = '/dashboard';
      }
    } catch {
      // Not logged in, stay on login page
    }
  })();
})();
