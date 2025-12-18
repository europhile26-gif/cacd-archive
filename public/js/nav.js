/**
 * Navigation menu loader
 * Checks authentication status and renders appropriate menu
 */

(async function initNavigation() {
  const navContainer = document.getElementById('mainNav');
  if (!navContainer) return; // Not on a page with main nav

  try {
    // Check if user is authenticated
    const response = await fetch('/api/v1/auth/me', {
      credentials: 'include'
    });

    if (response.ok) {
      // User is authenticated - use server-provided navigation
      const data = await response.json();
      renderAuthenticatedNav(data.navigation || []);
    } else {
      // User is not authenticated - show guest navigation
      renderGuestNav();
    }
  } catch {
    // Error or not authenticated - show guest navigation
    renderGuestNav();
  }
})();

/**
 * Render navigation for authenticated users
 */
function renderAuthenticatedNav(navigation) {
  const navContainer = document.getElementById('mainNav');

  navContainer.innerHTML = navigation
    .map((item) => {
      if (item.action === 'logout') {
        return `<a href="#" class="btn btn-outline-light btn-sm" data-nav-action="logout">
        ${escapeHtml(item.label)}
      </a>`;
      } else {
        return `<a href="${escapeHtml(item.url)}" class="btn btn-outline-light btn-sm">
        ${escapeHtml(item.label)}
      </a>`;
      }
    })
    .join('');

  // Attach event listeners to action buttons
  navContainer.querySelectorAll('[data-nav-action]').forEach((button) => {
    button.addEventListener('click', (e) => {
      e.preventDefault();
      const action = e.currentTarget.getAttribute('data-nav-action');
      if (action === 'logout') {
        handleLogout(e);
      }
    });
  });
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Render navigation for guest users
 */
function renderGuestNav() {
  const navContainer = document.getElementById('mainNav');
  const allowRegistration = true; // Could fetch from config endpoint

  const links = ['<a href="/login" class="btn btn-outline-light btn-sm">Login</a>'];

  if (allowRegistration) {
    links.push('<a href="/register" class="btn btn-outline-light btn-sm">Register</a>');
  }

  navContainer.innerHTML = links.join('');
}

/**
 * Handle logout action
 */
async function handleLogout(event) {
  event.preventDefault();

  try {
    await fetch('/api/v1/auth/logout', {
      method: 'POST',
      credentials: 'include'
    });

    sessionStorage.clear();
    window.location.href = '/login';
  } catch (error) {
    console.error('Logout error:', error);
    window.location.href = '/login';
  }
}
