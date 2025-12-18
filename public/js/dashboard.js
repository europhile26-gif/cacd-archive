/**
 * Dashboard page functionality
 */

/* global bootstrap */

let currentUser = null;
let searchModal = null;

document.addEventListener('DOMContentLoaded', () => {
  // Initialize Bootstrap modal
  const modalElement = document.getElementById('searchModal');
  if (modalElement) {
    searchModal = new bootstrap.Modal(modalElement);
  }

  // Load user data
  loadUserData();

  // Event listeners
  document.getElementById('changePasswordForm').addEventListener('submit', handlePasswordChange);
  document.getElementById('addSearchBtn').addEventListener('click', () => {
    document.getElementById('searchForm').reset();
    document.getElementById('searchModalTitle').textContent = 'Create Saved Search';
    searchModal.show();
  });
  document.getElementById('saveSearchBtn').addEventListener('click', handleSaveSearch);
});

/**
 * Load user data from API
 */
async function loadUserData() {
  try {
    const response = await fetch('/api/v1/auth/me', {
      credentials: 'include'
    });

    if (!response.ok) {
      // Not authenticated - redirect to login
      window.location.href = '/login?redirect=' + encodeURIComponent(window.location.pathname);
      return;
    }

    const data = await response.json();
    currentUser = data.user;
    const roles = data.roles || [];
    const navigation = data.navigation || [];

    // Update UI
    displayUserInfo(currentUser, roles);
    displayNavigation(navigation);

    // Load saved searches
    await loadSavedSearches();

    // Show admin section if administrator
    if (roles.some((role) => role.slug === 'administrator')) {
      document.getElementById('adminSection').classList.remove('d-none');
    }

    // Hide loading, show content
    document.getElementById('loadingState').classList.add('d-none');
    document.getElementById('dashboardContent').classList.remove('d-none');
  } catch (error) {
    console.error('Error loading user data:', error);
    showAlert('passwordAlert', 'danger', 'Error loading user data. Please try again.');
  }
}

/**
 * Display user information
 */
function displayUserInfo(user, roles) {
  // Avatar
  document.getElementById('userAvatar').textContent = getInitials(user.name);

  // Name and role
  document.getElementById('userName').textContent = user.name;
  document.getElementById('welcomeName').textContent = user.name.split(' ')[0];

  const roleNames = roles.map((r) => r.name).join(', ') || 'User';
  document.getElementById('userRole').textContent = roleNames;
}

/**
 * Display navigation menu
 */
function displayNavigation(navigation) {
  const navContainer = document.getElementById('dashboardNav');

  navContainer.innerHTML = navigation
    .map((item) => {
      if (item.action === 'logout') {
        return `<button class="btn btn-outline-light btn-sm" data-nav-action="logout">
        ${escapeHtml(item.label)}
      </button>`;
      } else if (item.url === '/dashboard') {
        // Don't show Dashboard link on dashboard page
        return '';
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
      const action = e.target.getAttribute('data-nav-action');
      if (action === 'logout') {
        handleLogout();
      }
    });
  });
}

/**
 * Get user initials for avatar
 */
function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(' ');
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

/**
 * Handle password change
 */
async function handlePasswordChange(e) {
  e.preventDefault();

  const currentPassword = document.getElementById('currentPassword').value;
  const newPassword = document.getElementById('newPassword').value;
  const confirmPassword = document.getElementById('confirmPassword').value;

  // Validate passwords match
  if (newPassword !== confirmPassword) {
    showAlert('passwordAlert', 'danger', 'New passwords do not match');
    return;
  }

  // Validate password strength
  if (newPassword.length < 12) {
    showAlert('passwordAlert', 'danger', 'Password must be at least 12 characters');
    return;
  }

  setPasswordLoading(true);

  try {
    const response = await fetch('/api/v1/auth/change-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({
        currentPassword,
        newPassword
      })
    });

    const data = await response.json();

    if (!response.ok) {
      showAlert('passwordAlert', 'danger', data.error || 'Failed to change password');
      return;
    }

    showAlert('passwordAlert', 'success', 'Password changed successfully');
    document.getElementById('changePasswordForm').reset();
  } catch (error) {
    console.error('Error changing password:', error);
    showAlert('passwordAlert', 'danger', 'Error changing password. Please try again.');
  } finally {
    setPasswordLoading(false);
  }
}

/**
 * Set password form loading state
 */
function setPasswordLoading(loading) {
  const btn = document.getElementById('changePasswordBtn');
  const spinner = document.getElementById('passwordSpinner');

  if (loading) {
    btn.disabled = true;
    spinner.classList.remove('d-none');
  } else {
    btn.disabled = false;
    spinner.classList.add('d-none');
  }
}

/**
 * Load saved searches
 */
async function loadSavedSearches() {
  try {
    const response = await fetch('/api/v1/searches', {
      credentials: 'include'
    });

    if (!response.ok) {
      console.warn('Could not load saved searches');
      return;
    }

    const data = await response.json();
    const searches = data.searches || [];

    displaySavedSearches(searches);
  } catch (error) {
    console.error('Error loading saved searches:', error);
  }
}

/**
 * Display saved searches
 */
function displaySavedSearches(searches) {
  const container = document.getElementById('savedSearchesList');

  if (searches.length === 0) {
    container.innerHTML = `
      <p class="text-muted text-center py-3">
        No saved searches yet. Create one to get notified of new hearings matching your criteria.
      </p>
    `;
    return;
  }

  container.innerHTML = searches
    .map(
      (search) => `
    <div class="saved-search-item">
      <div>
        <div class="search-name">${escapeHtml(search.name)}</div>
        <div class="search-criteria">
          ${formatSearchCriteria(search)}
        </div>
      </div>
      <div>
        <button class="btn btn-sm btn-outline-primary" onclick="editSearch(${search.id})">Edit</button>
        <button class="btn btn-sm btn-outline-danger" onclick="deleteSearch(${search.id})">Delete</button>
      </div>
    </div>
  `
    )
    .join('');
}

/**
 * Format search criteria for display
 */
function formatSearchCriteria(search) {
  const parts = [];
  if (search.county) parts.push(`County: ${search.county}`);
  if (search.hearing_type) parts.push(`Type: ${search.hearing_type}`);
  if (search.keywords) parts.push(`Keywords: ${search.keywords}`);
  return parts.join(' • ') || 'All hearings';
}

/**
 * Handle save search
 */
async function handleSaveSearch() {
  const name = document.getElementById('searchName').value.trim();
  if (!name) {
    alert('Please enter a search name');
    return;
  }

  const searchData = {
    name,
    county: document.getElementById('searchCounty').value || null,
    hearing_type: document.getElementById('searchHearingType').value || null,
    keywords: document.getElementById('searchKeywords').value || null,
    notifications_enabled: document.getElementById('searchNotifications').checked
  };

  try {
    const response = await fetch('/api/v1/searches', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify(searchData)
    });

    if (!response.ok) {
      const data = await response.json();
      alert(data.error || 'Failed to save search');
      return;
    }

    // Reload searches
    await loadSavedSearches();
    searchModal.hide();
  } catch (error) {
    console.error('Error saving search:', error);
    alert('Error saving search. Please try again.');
  }
}

/**
 * Delete a saved search
 * @global - Called from inline HTML (future implementation)
 */
// eslint-disable-next-line no-unused-vars
async function deleteSearch(id) {
  if (!confirm('Are you sure you want to delete this saved search?')) {
    return;
  }

  try {
    const response = await fetch(`/api/v1/searches/${id}`, {
      method: 'DELETE',
      credentials: 'include'
    });

    if (!response.ok) {
      alert('Failed to delete search');
      return;
    }

    // Reload searches
    await loadSavedSearches();
  } catch (error) {
    console.error('Error deleting search:', error);
    alert('Error deleting search. Please try again.');
  }
}

/**
 * Handle logout
 */
async function handleLogout() {
  try {
    await fetch('/api/v1/auth/logout', {
      method: 'POST',
      credentials: 'include'
    });

    sessionStorage.removeItem('user');
    window.location.href = '/login';
  } catch (error) {
    console.error('Error logging out:', error);
    window.location.href = '/login';
  }
}

/**
 * Show alert message
 */
function showAlert(elementId, type, message) {
  const alert = document.getElementById(elementId);
  alert.className = `alert alert-${type}`;
  alert.textContent = message;
  alert.classList.remove('d-none');

  // Auto-hide success messages
  if (type === 'success') {
    setTimeout(() => {
      alert.classList.add('d-none');
    }, 5000);
  }
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
