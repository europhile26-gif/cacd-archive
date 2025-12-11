(function() {
  'use strict';

  const API_BASE = '/api/v1';
  let currentPage = 0;
  let currentFilters = {};

  // Initialize
  document.addEventListener('DOMContentLoaded', function() {
    loadHearings();
    attachEventHandlers();
  });

  function attachEventHandlers() {
    document.getElementById('searchBtn').addEventListener('click', handleSearch);
    document.getElementById('clearBtn').addEventListener('click', handleClear);
    document.getElementById('clearDateBtn').addEventListener('click', handleClearDate);
    document.getElementById('searchInput').addEventListener('keypress', function(e) {
      if (e.key === 'Enter') handleSearch();
    });

    document.querySelectorAll('.quick-date').forEach((btn) => {
      btn.addEventListener('click', handleQuickDate);
    });
    document.getElementById('dateFilter').addEventListener('change', handleDateFilter);
    document.getElementById('sortBy').addEventListener('change', loadHearings);
    document.getElementById('sortOrder').addEventListener('change', loadHearings);
    document.getElementById('prevPage').addEventListener('click', () => changePage(-1));
    document.getElementById('nextPage').addEventListener('click', () => changePage(1));
  }

  function handleSearch() {
    const searchValue = document.getElementById('searchInput').value.trim();
    if (searchValue) {
      currentFilters.search = searchValue;
    } else {
      delete currentFilters.search;
    }
    currentPage = 0;
    loadHearings();
  }

  function handleClear() {
    document.getElementById('searchInput').value = '';
    handleClearDate();
    currentFilters = {};
    currentPage = 0;
    loadHearings();
  }

  function handleClearDate() {
    document.getElementById('dateFilter').value = '';
    document.querySelectorAll('.quick-date').forEach((btn) => {
      btn.classList.remove('active');
    });
    delete currentFilters.date;
    currentPage = 0;
    loadHearings();
  }

  function handleQuickDate(e) {
    const offset = parseInt(e.target.dataset.offset);
    const date = new Date();
    date.setDate(date.getDate() + offset);
    currentFilters.date = date.toISOString().split('T')[0];

    document.querySelectorAll('.quick-date').forEach((btn) => {
      btn.classList.remove('active');
    });
    e.target.classList.add('active');
    document.getElementById('dateFilter').value = '';

    currentPage = 0;
    loadHearings();
  }

  function handleDateFilter(e) {
    const dateValue = e.target.value;
    if (dateValue) {
      currentFilters.date = dateValue;
    } else {
      delete currentFilters.date;
    }
    document.querySelectorAll('.quick-date').forEach((btn) => {
      btn.classList.remove('active');
    });
    currentPage = 0;
    loadHearings();
  }

  function changePage(delta) {
    currentPage += delta;
    if (currentPage < 0) currentPage = 0;
    loadHearings();
  }

  async function loadHearings() {
    const limit = 50;
    const offset = currentPage * limit;

    const params = new URLSearchParams({
      limit,
      offset,
      sortBy: document.getElementById('sortBy').value,
      sortOrder: document.getElementById('sortOrder').value,
      ...currentFilters
    });

    document.getElementById('loadingIndicator').style.display = 'block';
    document.getElementById('errorMessage').style.display = 'none';

    try {
      const response = await fetch(`${API_BASE}/hearings?${params}`);
      const result = await response.json();

      if (result.success) {
        renderHearings(result.data);
        updatePagination(result.pagination);
      } else {
        showError('Failed to load hearings: ' + result.error);
      }
    } catch (error) {
      showError('Network error: ' + error.message);
    } finally {
      document.getElementById('loadingIndicator').style.display = 'none';
    }
  }

  function renderHearings(hearings) {
    const tbody = document.getElementById('hearingsBody');
    const cardsContainer = document.getElementById('hearingsCards');
    
    tbody.innerHTML = '';
    cardsContainer.innerHTML = '';

    if (hearings.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">No hearings found</td></tr>';
      cardsContainer.innerHTML = '<div class="alert alert-info">No hearings found</div>';
      document.getElementById('resultCount').textContent = '0';
      return;
    }

    hearings.forEach((hearing) => {
      // Desktop table row
      const row = document.createElement('tr');
      row.innerHTML = `
        <td class="hearing-datetime">${formatDateTime(hearing.hearingDateTime)}</td>
        <td class="venue">${hearing.venue || '-'}</td>
        <td class="case-number">${hearing.caseNumber}</td>
        <td class="case-details">${hearing.caseDetails || '-'}</td>
        <td class="hearing-type">${hearing.hearingType || '-'}</td>
        <td class="judge">${hearing.judge || '-'}</td>
      `;
      tbody.appendChild(row);

      // Mobile card
      const card = document.createElement('div');
      card.className = 'card mb-3';
      card.innerHTML = `
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-start mb-2">
            <h5 class="card-title h6 mb-0">${hearing.caseNumber}</h5>
            <span class="badge bg-primary">${formatTime(hearing.hearingDateTime)}</span>
          </div>
          <p class="card-text text-muted small mb-2">${formatDate(hearing.hearingDateTime)}</p>
          ${hearing.caseDetails ? `<p class="card-text">${hearing.caseDetails}</p>` : ''}
          <div class="row g-2 small text-muted">
            ${hearing.venue ? `<div class="col-6"><strong>Venue:</strong> ${hearing.venue}</div>` : ''}
            ${hearing.hearingType ? `<div class="col-6"><strong>Type:</strong> ${hearing.hearingType}</div>` : ''}
            ${hearing.judge ? `<div class="col-12"><strong>Judge:</strong> ${hearing.judge}</div>` : ''}
          </div>
        </div>
      `;
      cardsContainer.appendChild(card);
    });

    document.getElementById('resultCount').textContent = hearings.length;
  }

  function updatePagination(pagination) {
    const totalPages = Math.ceil(pagination.total / pagination.limit);
    const currentPageNum = Math.floor(pagination.offset / pagination.limit) + 1;

    document.getElementById('pageInfo').textContent = `Page ${currentPageNum} of ${totalPages || 1} (${pagination.total} total)`;
    
    const prevPageItem = document.getElementById('prevPageItem');
    const nextPageItem = document.getElementById('nextPageItem');
    
    if (currentPageNum === 1) {
      prevPageItem.classList.add('disabled');
    } else {
      prevPageItem.classList.remove('disabled');
    }
    
    if (currentPageNum >= totalPages || totalPages === 0) {
      nextPageItem.classList.add('disabled');
    } else {
      nextPageItem.classList.remove('disabled');
    }
  }

  function formatDateTime(isoString) {
    const date = new Date(isoString);
    return date.toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function formatDate(isoString) {
    const date = new Date(isoString);
    return date.toLocaleDateString('en-GB', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });
  }

  function formatTime(isoString) {
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function showError(message) {
    const errorEl = document.getElementById('errorMessage');
    errorEl.textContent = message;
    errorEl.style.display = 'block';
  }
})();
