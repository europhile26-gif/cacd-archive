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
    <div class="saved-search-item" data-search-id="${search.id}">
      <div class="d-flex justify-content-between align-items-start">
        <div class="flex-grow-1">
          <div class="search-text fw-semibold">"${escapeHtml(search.search_text)}"</div>
          <div class="search-meta text-muted small mt-1">
            <span class="badge ${search.enabled ? 'bg-success' : 'bg-secondary'} me-2">
              ${search.enabled ? 'Enabled' : 'Disabled'}
            </span>
            <span>Created: ${new Date(search.created_at).toLocaleDateString()}</span>
          </div>
        </div>
        <div class="btn-group btn-group-sm" role="group">
          <button class="btn btn-outline-secondary" data-search-action="toggle" data-search-id="${search.id}" data-enabled="${search.enabled}">
            <i class="bi bi-${search.enabled ? 'pause' : 'play'}-fill"></i>
          </button>
          <button class="btn btn-outline-primary" data-search-action="edit" data-search-id="${search.id}">
            <i class="bi bi-pencil"></i>
          </button>
          <button class="btn btn-outline-danger" data-search-action="delete" data-search-id="${search.id}">
            <i class="bi bi-trash"></i>
          </button>
        </div>
      </div>
    </div>
  `
    )
    .join('');

  // Add event listeners
  document.querySelectorAll('[data-search-action]').forEach((btn) => {
    btn.addEventListener('click', handleSearchAction);
  });
}

/**
 * Handle search action buttons
 */
async function handleSearchAction(event) {
  const action = event.currentTarget.dataset.searchAction;
  const searchId = parseInt(event.currentTarget.dataset.searchId, 10);

  if (action === 'delete') {
    await deleteSearch(searchId);
  } else if (action === 'toggle') {
    const enabled = event.currentTarget.dataset.enabled === '1';
    await toggleSearch(searchId, !enabled);
  } else if (action === 'edit') {
    await editSearch(searchId);
  }
}

/**
 * Handle save search
 */
async function handleSaveSearch() {
  const searchText = document.getElementById('searchText').value.trim();
  const enabled = document.getElementById('searchEnabled').checked;
  const searchId = document.getElementById('searchId').value;

  if (!searchText) {
    showAlert('searchAlert', 'danger', 'Please enter search text');
    return;
  }

  const searchData = {
    search_text: searchText,
    enabled
  };

  try {
    let response;

    if (searchId) {
      // Update existing search
      response = await fetch(`/api/v1/searches/${searchId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify(searchData)
      });
    } else {
      // Create new search
      response = await fetch('/api/v1/searches', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify(searchData)
      });
    }

    if (!response.ok) {
      const data = await response.json();
      showAlert('searchAlert', 'danger', data.error || 'Failed to save search');
      return;
    }

    // Reload searches
    await loadSavedSearches();
    searchModal.hide();
    document.getElementById('searchForm').reset();
  } catch (error) {
    console.error('Error saving search:', error);
    showAlert('searchAlert', 'danger', 'Error saving search. Please try again.');
  }
}

/**
 * Edit a saved search
 */
async function editSearch(id) {
  try {
    const response = await fetch(`/api/v1/searches/${id}`, {
      credentials: 'include'
    });

    if (!response.ok) {
      showAlert('searchesAlert', 'danger', 'Failed to load search');
      return;
    }

    const data = await response.json();
    const search = data.search;

    // Populate form
    document.getElementById('searchId').value = search.id;
    document.getElementById('searchText').value = search.search_text;
    document.getElementById('searchEnabled').checked = search.enabled;
    document.getElementById('searchModalTitle').textContent = 'Edit Saved Search';

    searchModal.show();
  } catch (error) {
    console.error('Error loading search:', error);
    showAlert('searchesAlert', 'danger', 'Error loading search. Please try again.');
  }
}

/**
 * Toggle search enabled/disabled
 */
async function toggleSearch(id, enabled) {
  try {
    const response = await fetch(`/api/v1/searches/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({ enabled })
    });

    if (!response.ok) {
      showAlert('searchesAlert', 'danger', 'Failed to update search');
      return;
    }

    // Reload searches
    await loadSavedSearches();
  } catch (error) {
    console.error('Error toggling search:', error);
    showAlert('searchesAlert', 'danger', 'Error updating search. Please try again.');
  }
}

/**
 * Delete a saved search
 */
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
      showAlert('searchesAlert', 'danger', 'Failed to delete search');
      return;
    }

    // Reload searches
    await loadSavedSearches();
  } catch (error) {
    console.error('Error deleting search:', error);
    showAlert('searchesAlert', 'danger', 'Error deleting search. Please try again.');
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
