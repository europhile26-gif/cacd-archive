/**
 * Admin user management functionality
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

  // Load users
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
