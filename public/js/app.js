(function() {
    'use strict';

    const API_BASE = '/api/v1';
    let currentPage = 0;
    let currentFilters = {};

    // Initialize
    $(document).ready(function() {
        loadHearings();
        attachEventHandlers();
    });

    function attachEventHandlers() {
        $('#searchBtn').on('click', handleSearch);
        $('#clearBtn').on('click', handleClear);
        $('#searchInput').on('keypress', function(e) {
            if (e.which === 13) handleSearch();
        });
        
        $('.quick-date').on('click', handleQuickDate);
        $('#dateFilter').on('change', handleDateFilter);
        $('#sortBy, #sortOrder').on('change', loadHearings);
        $('#prevPage').on('click', () => changePage(-1));
        $('#nextPage').on('click', () => changePage(1));
    }

    function handleSearch() {
        const searchValue = $('#searchInput').val().trim();
        if (searchValue) {
            currentFilters.search = searchValue;
        } else {
            delete currentFilters.search;
        }
        currentPage = 0;
        loadHearings();
    }

    function handleClear() {
        $('#searchInput').val('');
        $('#dateFilter').val('');
        $('.quick-date').removeClass('active');
        currentFilters = {};
        currentPage = 0;
        loadHearings();
    }

    function handleQuickDate(e) {
        const offset = parseInt($(e.target).data('offset'));
        const date = new Date();
        date.setDate(date.getDate() + offset);
        currentFilters.date = date.toISOString().split('T')[0];
        
        $('.quick-date').removeClass('active');
        $(e.target).addClass('active');
        $('#dateFilter').val('');
        
        currentPage = 0;
        loadHearings();
    }

    function handleDateFilter(e) {
        const dateValue = $(e.target).val();
        if (dateValue) {
            currentFilters.date = dateValue;
        } else {
            delete currentFilters.date;
        }
        $('.quick-date').removeClass('active');
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
            sortBy: $('#sortBy').val(),
            sortOrder: $('#sortOrder').val(),
            ...currentFilters
        });

        $('#loadingIndicator').show();
        $('#errorMessage').hide();
        $('#hearingsTable').addClass('loading');

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
            $('#loadingIndicator').hide();
            $('#hearingsTable').removeClass('loading');
        }
    }

    function renderHearings(hearings) {
        const tbody = $('#hearingsBody');
        tbody.empty();

        if (hearings.length === 0) {
            tbody.append('<tr><td colspan="6" class="no-results">No hearings found</td></tr>');
            $('#resultCount').text('0');
            return;
        }

        hearings.forEach(hearing => {
            const row = $('<tr>').append(
                $('<td>').text(formatDateTime(hearing.hearingDateTime)),
                $('<td>').text(hearing.venue || '-'),
                $('<td>').text(hearing.caseNumber),
                $('<td>').text(hearing.caseDetails || '-'),
                $('<td>').text(hearing.hearingType || '-'),
                $('<td>').text(truncate(hearing.judge, 60))
            );
            tbody.append(row);
        });

        $('#resultCount').text(hearings.length);
    }

    function updatePagination(pagination) {
        const totalPages = Math.ceil(pagination.total / pagination.limit);
        const currentPageNum = Math.floor(pagination.offset / pagination.limit) + 1;

        $('#pageInfo').text(`Page ${currentPageNum} of ${totalPages || 1} (${pagination.total} total)`);
        $('#prevPage').prop('disabled', currentPageNum === 1);
        $('#nextPage').prop('disabled', currentPageNum >= totalPages || totalPages === 0);
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

    function truncate(str, length) {
        if (!str) return '-';
        return str.length > length ? str.substring(0, length) + '...' : str;
    }

    function showError(message) {
        $('#errorMessage').text(message).show();
    }
})();
