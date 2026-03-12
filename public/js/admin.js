/**
 * Admin functionality: data source management + user management
 */

/* global bootstrap */

let currentPage = 1;
const pageSize = 20;
let totalUsers = 0;
let currentUserId = null;
let userModal = null;

document.addEventListener('DOMContentLoaded', () => {
  // Initialize Bootstrap modal
  const modalElement = document.getElementById('userModal');
  if (modalElement) {
    userModal = new bootstrap.Modal(modalElement);
  }

  // Load data sources and users
  loadDataSources();
  loadUsers();

  // Event listeners
  document.getElementById('applyFiltersBtn').addEventListener('click', () => {
    currentPage = 1;
    loadUsers();
  });

  document.getElementById('prevPageBtn').addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      loadUsers();
    }
  });

  document.getElementById('nextPageBtn').addEventListener('click', () => {
    const maxPage = Math.ceil(totalUsers / pageSize);
    if (currentPage < maxPage) {
      currentPage++;
      loadUsers();
    }
  });

  document.getElementById('saveUserBtn').addEventListener('click', handleSaveUser);
  document.getElementById('deleteUserBtn').addEventListener('click', handleDeleteUser);
});

// ─── Data Sources ───────────────────────────────────────────────────

/**
 * Load data sources from API
 */
async function loadDataSources() {
  try {
    const response = await fetch('/api/v1/admin/data-sources', {
      credentials: 'include'
    });

    if (!response.ok) {
      if (response.status === 403) {
        document.getElementById('dataSourcesLoading').classList.add('d-none');
        document.getElementById('dataSourcesError').textContent =
          'Access denied. Missing scraper:configure capability.';
        document.getElementById('dataSourcesError').classList.remove('d-none');
        return;
      }
      throw new Error('Failed to load data sources');
    }

    const data = await response.json();
    renderDataSources(data.sources || []);

    document.getElementById('dataSourcesLoading').classList.add('d-none');
    document.getElementById('dataSourcesContent').classList.remove('d-none');
  } catch (error) {
    console.error('Error loading data sources:', error);
    document.getElementById('dataSourcesLoading').classList.add('d-none');
    document.getElementById('dataSourcesError').textContent =
      'Error loading data sources. Please try again.';
    document.getElementById('dataSourcesError').classList.remove('d-none');
  }
}

/**
 * Render data source cards
 */
function renderDataSources(sources) {
  const container = document.getElementById('dataSourcesList');

  if (sources.length === 0) {
    container.innerHTML = '<p class="text-muted">No data sources configured.</p>';
    return;
  }

  container.innerHTML = sources
    .map((source) => {
      const enabled = source.enabled === 1;
      const showByDefault = source.show_by_default === 1;
      const statusBadge = enabled
        ? '<span class="badge bg-success">Enabled</span>'
        : '<span class="badge bg-secondary">Disabled</span>';

      const scrapeStatusBadge = getScrapeBadge(source.last_scrape_status);
      const lastScrapeTime = source.last_scrape_at
        ? formatDateTime(source.last_scrape_at)
        : 'Never';
      const lastScrapeDuration = source.last_scrape_duration_ms
        ? `${(source.last_scrape_duration_ms / 1000).toFixed(1)}s`
        : '-';

      const window =
        source.scrape_window_start_hour === 0 && source.scrape_window_end_hour === 24
          ? 'No restriction'
          : `${String(source.scrape_window_start_hour).padStart(2, '0')}:00 – ${String(source.scrape_window_end_hour).padStart(2, '0')}:00`;

      const intervalHours = source.scrape_interval_minutes / 60;
      const intervalText =
        intervalHours >= 1 ? `${intervalHours}h` : `${source.scrape_interval_minutes}m`;

      const lastScrapeStats = source.last_scrape_status
        ? `+${source.last_scrape_added || 0} / ~${source.last_scrape_updated || 0} / -${source.last_scrape_deleted || 0}`
        : '-';

      const errorRow = source.last_scrape_error
        ? `<dl><dt>Last Error</dt><dd class="text-danger">${escapeHtml(source.last_scrape_error)}</dd></dl>`
        : '';

      return `
      <div class="source-card" data-source-id="${source.id}">
        <div class="source-header">
          <div>
            <h5>${escapeHtml(source.display_name)}</h5>
            <small class="text-muted">${escapeHtml(source.slug)}</small>
          </div>
          <div class="d-flex align-items-center gap-2">
            <button class="btn btn-sm btn-outline-primary source-scrape-btn"
              data-source-id="${source.id}">Scrape Now</button>
            ${statusBadge}
            <div class="form-check form-switch mb-0">
              <input class="form-check-input source-enable-switch" type="checkbox" role="switch"
                data-source-id="${source.id}"
                ${enabled ? 'checked' : ''}>
            </div>
          </div>
        </div>
        <div class="source-meta">
          <dl>
            <dt>Last Scrape</dt>
            <dd>${lastScrapeTime} ${scrapeStatusBadge}</dd>
          </dl>
          <dl>
            <dt>Last Result (add / update / delete)</dt>
            <dd>${lastScrapeStats}</dd>
          </dl>
          <dl>
            <dt>Duration</dt>
            <dd>${lastScrapeDuration}</dd>
          </dl>
          <dl>
            <dt>Interval</dt>
            <dd>Every ${intervalText}</dd>
          </dl>
          <dl>
            <dt>Scrape Window</dt>
            <dd>${window}</dd>
          </dl>
          <dl>
            <dt>Visible by default</dt>
            <dd>
              <div class="form-check form-switch mb-0">
                <input class="form-check-input source-default-switch" type="checkbox" role="switch"
                  data-source-id="${source.id}"
                  ${showByDefault ? 'checked' : ''}>
              </div>
            </dd>
          </dl>
        </div>
        ${errorRow}
      </div>
    `;
    })
    .join('');

  // Attach event listeners
  container.querySelectorAll('.source-scrape-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      triggerScrape(parseInt(btn.getAttribute('data-source-id')));
    });
  });

  container.querySelectorAll('.source-enable-switch').forEach((toggle) => {
    toggle.addEventListener('change', () => {
      toggleDataSource(parseInt(toggle.getAttribute('data-source-id')), toggle.checked);
    });
  });

  container.querySelectorAll('.source-default-switch').forEach((toggle) => {
    toggle.addEventListener('change', () => {
      toggleShowByDefault(parseInt(toggle.getAttribute('data-source-id')), toggle.checked);
    });
  });
}

/**
 * Get Bootstrap badge for scrape status
 */
function getScrapeBadge(status) {
  if (!status) return '';
  switch (status) {
    case 'success':
      return '<span class="badge bg-success">Success</span>';
    case 'partial':
      return '<span class="badge bg-warning">Partial</span>';
    case 'failed':
      return '<span class="badge bg-danger">Failed</span>';
    default:
      return `<span class="badge bg-secondary">${escapeHtml(status)}</span>`;
  }
}

/**
 * Toggle data source enabled/disabled
 */
async function toggleDataSource(sourceId, enabled) {
  try {
    const response = await fetch(`/api/v1/admin/data-sources/${sourceId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ enabled })
    });

    if (!response.ok) {
      const data = await response.json();
      alert(data.error || 'Failed to update data source');
      // Revert the switch
      document.querySelector(`.source-enable-switch[data-source-id="${sourceId}"]`).checked =
        !enabled;
      return;
    }

    // Reload to show updated state
    loadDataSources();
  } catch (error) {
    console.error('Error toggling data source:', error);
    alert('Error updating data source. Please try again.');
    document.querySelector(`.source-enable-switch[data-source-id="${sourceId}"]`).checked =
      !enabled;
  }
}

/**
 * Toggle data source show_by_default
 */
async function toggleShowByDefault(sourceId, showByDefault) {
  try {
    const response = await fetch(`/api/v1/admin/data-sources/${sourceId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ show_by_default: showByDefault })
    });

    if (!response.ok) {
      const data = await response.json();
      alert(data.error || 'Failed to update data source');
      document.querySelector(`.source-default-switch[data-source-id="${sourceId}"]`).checked =
        !showByDefault;
      return;
    }

    loadDataSources();
  } catch (error) {
    console.error('Error toggling show by default:', error);
    alert('Error updating data source. Please try again.');
    document.querySelector(`.source-default-switch[data-source-id="${sourceId}"]`).checked =
      !showByDefault;
  }
}

/**
 * Trigger a manual scrape for a data source
 */
async function triggerScrape(sourceId) {
  const btn = document.querySelector(`.source-scrape-btn[data-source-id="${sourceId}"]`);
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Scraping...';

  try {
    const response = await fetch(`/api/v1/admin/data-sources/${sourceId}/scrape`, {
      method: 'POST',
      credentials: 'include'
    });

    const data = await response.json();

    if (!response.ok) {
      alert(data.message || data.error || 'Failed to trigger scrape');
      return;
    }

    // Wait a moment for the scrape to complete, then reload
    setTimeout(() => loadDataSources(), 3000);
  } catch (error) {
    console.error('Error triggering scrape:', error);
    alert('Error triggering scrape. Please try again.');
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

/**
 * Format datetime for display
 */
function formatDateTime(dateString) {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// ─── User Management ────────────────────────────────────────────────

/**
 * Load users from API
 */
async function loadUsers() {
  try {
    const status = document.getElementById('filterStatus').value;
    const search = document.getElementById('filterSearch').value;

    const params = new URLSearchParams({
      limit: pageSize,
      offset: (currentPage - 1) * pageSize
    });

    if (status) params.append('status', status);
    if (search) params.append('search', search);

    const response = await fetch(`/api/v1/admin/users?${params}`, {
      credentials: 'include'
    });

    if (!response.ok) {
      if (response.status === 403) {
        alert('Access denied. Administrator role required.');
        window.location.href = '/dashboard';
        return;
      }
      throw new Error('Failed to load users');
    }

    const data = await response.json();
    totalUsers = data.total || 0;

    displayUsers(data.users || []);
    updatePagination();

    // Hide loading, show content
    document.getElementById('loadingState').classList.add('d-none');
    document.getElementById('adminContent').classList.remove('d-none');
  } catch (error) {
    console.error('Error loading users:', error);
    alert('Error loading users. Please try again.');
  }
}

/**
 * Display users in table
 */
function displayUsers(users) {
  const tbody = document.getElementById('usersTableBody');

  if (users.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center">No users found</td></tr>';
    return;
  }

  tbody.innerHTML = users
    .map(
      (user) => `
    <tr class="user-table-row" data-user-id="${user.id}">
      <td>${escapeHtml(user.name)}</td>
      <td>${escapeHtml(user.email)}</td>
      <td><span class="badge ${getStatusBadgeClass(user.status)}">${escapeHtml(user.status.name)}</span></td>
      <td>${user.roles ? user.roles.map((r) => `<span class="badge bg-primary me-1">${escapeHtml(r.name)}</span>`).join('') : '-'}</td>
      <td>${formatDate(user.created_at)}</td>
    </tr>
  `
    )
    .join('');

  // Attach click handlers to rows
  tbody.querySelectorAll('.user-table-row').forEach((row) => {
    row.addEventListener('click', () => {
      const userId = parseInt(row.getAttribute('data-user-id'));
      showUserModal(userId);
    });
  });
}

/**
 * Get Bootstrap badge class for status
 */
function getStatusBadgeClass(status) {
  if (!status) return 'bg-secondary';
  switch (status.slug) {
    case 'active':
      return 'bg-success';
    case 'pending':
      return 'bg-warning';
    case 'inactive':
      return 'bg-secondary';
    case 'suspended':
      return 'bg-danger';
    default:
      return 'bg-secondary';
  }
}

/**
 * Update pagination controls
 */
function updatePagination() {
  const maxPage = Math.ceil(totalUsers / pageSize);
  const showing = Math.min(currentPage * pageSize, totalUsers);
  const from = (currentPage - 1) * pageSize + 1;

  document.getElementById('showingCount').textContent = totalUsers > 0 ? `${from}-${showing}` : '0';
  document.getElementById('totalCount').textContent = totalUsers;
  document.getElementById('currentPage').textContent = currentPage;

  document.getElementById('prevPageBtn').disabled = currentPage === 1;
  document.getElementById('nextPageBtn').disabled = currentPage >= maxPage || totalUsers === 0;
}

/**
 * Show user edit modal
 */
async function showUserModal(userId) {
  currentUserId = userId;

  try {
    const response = await fetch(`/api/v1/admin/users/${userId}`, {
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error('Failed to load user details');
    }

    const data = await response.json();
    const user = data.user;

    // Populate form
    document.getElementById('userName').value = user.name;
    document.getElementById('userEmail').value = user.email;
    document.getElementById('userStatus').value = user.status_id;
    document.getElementById('memberSince').textContent = formatDate(user.created_at);

    // Display roles
    const rolesContainer = document.getElementById('userRoles');
    if (user.roles && user.roles.length > 0) {
      rolesContainer.innerHTML = user.roles
        .map((role) => `<span class="badge bg-primary me-2">${escapeHtml(role.name)}</span>`)
        .join('');
    } else {
      rolesContainer.innerHTML = '<span class="text-muted">No roles assigned</span>';
    }

    // Hide alert
    document.getElementById('modalAlert').classList.add('d-none');

    // Show modal
    userModal.show();
  } catch (error) {
    console.error('Error loading user:', error);
    alert('Error loading user details. Please try again.');
  }
}

/**
 * Make showUserModal globally accessible
 */
window.showUserModal = showUserModal;

/**
 * Handle save user
 */
async function handleSaveUser() {
  const name = document.getElementById('userName').value.trim();
  const email = document.getElementById('userEmail').value.trim();
  const statusId = parseInt(document.getElementById('userStatus').value);

  if (!name || !email) {
    showModalAlert('danger', 'Name and email are required');
    return;
  }

  try {
    // Update user details
    const response = await fetch(`/api/v1/admin/users/${currentUserId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({ name, email, status_id: statusId })
    });

    if (!response.ok) {
      const data = await response.json();
      showModalAlert('danger', data.error || 'Failed to update user');
      return;
    }

    showModalAlert('success', 'User updated successfully');

    // Reload users list
    setTimeout(() => {
      userModal.hide();
      loadUsers();
    }, 1000);
  } catch (error) {
    console.error('Error saving user:', error);
    showModalAlert('danger', 'Error saving user. Please try again.');
  }
}

/**
 * Handle delete user
 */
async function handleDeleteUser() {
  if (
    !confirm(
      'Are you sure you want to permanently delete this user account? This action cannot be undone.'
    )
  ) {
    return;
  }

  try {
    const response = await fetch(`/api/v1/admin/users/${currentUserId}`, {
      method: 'DELETE',
      credentials: 'include'
    });

    if (!response.ok) {
      const data = await response.json();
      showModalAlert('danger', data.error || 'Failed to delete user');
      return;
    }

    showModalAlert('success', 'User deleted successfully');

    // Reload users list
    setTimeout(() => {
      userModal.hide();
      loadUsers();
    }, 1000);
  } catch (error) {
    console.error('Error deleting user:', error);
    showModalAlert('danger', 'Error deleting user. Please try again.');
  }
}

/**
 * Show modal alert
 */
function showModalAlert(type, message) {
  const alert = document.getElementById('modalAlert');
  alert.className = `alert alert-${type}`;
  alert.textContent = message;
  alert.classList.remove('d-none');

  if (type === 'success') {
    setTimeout(() => {
      alert.classList.add('d-none');
    }, 3000);
  }
}

/**
 * Format date
 */
function formatDate(dateString) {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
