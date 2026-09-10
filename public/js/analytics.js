/**
 * Analytics page
 * Renders the request-analytics summary, breakdown tables and raw log.
 * Charts are hand-rolled inline SVG rather than a charting dependency.
 */

(function () {
  'use strict';

  const SUMMARY_URL = '/api/v1/admin/analytics/summary';
  const REQUESTS_URL = '/api/v1/admin/analytics/requests';
  const SESSIONS_URL = '/api/v1/admin/analytics/sessions';
  const PAGE_SIZE = 50;

  const state = {
    rangeDays: 7,
    offset: 0,
    filters: {}
  };

  /**
   * Escapes text for interpolation into HTML.
   * Route paths and user agents come from unmatched requests, so probe attempts
   * put attacker-chosen strings in this table - they must never reach innerHTML raw.
   */
  function escapeHtml(value) {
    if (value === null || value === undefined) {
      return '';
    }

    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatNumber(value) {
    return Number(value || 0).toLocaleString('en-GB');
  }

  function formatDateTime(value) {
    if (!value) {
      return '';
    }

    return new Date(value).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  function formatDayLabel(isoDay) {
    return new Date(`${isoDay}T00:00:00Z`).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      timeZone: 'UTC'
    });
  }

  function statusClass(statusCode) {
    return `status-${Math.floor(statusCode / 100)}xx`;
  }

  async function fetchJson(url) {
    const response = await fetch(url, { credentials: 'same-origin' });

    if (response.status === 401) {
      window.location.href = '/login';
      throw new Error('Not authenticated');
    }

    if (!response.ok) {
      throw new Error(`Request failed: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Draws a bar chart into an existing <svg>.
   * Sized in viewBox units so the SVG scales with its container.
   */
  function renderBarChart(svgElement, points, valueKey) {
    const WIDTH = 720;
    const HEIGHT = 240;
    const PADDING = { top: 16, right: 8, bottom: 34, left: 44 };
    const plotWidth = WIDTH - PADDING.left - PADDING.right;
    const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;

    const values = points.map((point) => Number(point[valueKey]) || 0);
    const maxValue = Math.max(...values, 0);

    if (points.length === 0 || maxValue === 0) {
      svgElement.innerHTML =
        `<text x="${WIDTH / 2}" y="${HEIGHT / 2}" text-anchor="middle" class="empty-label">` +
        'No requests recorded in this period</text>';
      return;
    }

    // Round the axis up to something readable rather than the raw maximum.
    const magnitude = Math.pow(10, Math.floor(Math.log10(maxValue)));
    const axisMax = Math.ceil(maxValue / magnitude) * magnitude;

    const slotWidth = plotWidth / points.length;
    const barWidth = Math.max(Math.min(slotWidth * 0.7, 48), 2);

    const parts = [];

    // Horizontal gridlines at 0, half and full.
    for (const fraction of [0, 0.5, 1]) {
      const y = PADDING.top + plotHeight - plotHeight * fraction;
      const label = Math.round(axisMax * fraction);

      parts.push(
        `<line class="axis-line" x1="${PADDING.left}" y1="${y}" x2="${WIDTH - PADDING.right}" y2="${y}" />`,
        `<text class="axis-label" x="${PADDING.left - 6}" y="${y + 4}" text-anchor="end">${formatNumber(label)}</text>`
      );
    }

    // Label roughly six ticks regardless of range length.
    const labelEvery = Math.max(1, Math.round(points.length / 6));

    points.forEach((point, index) => {
      const value = Number(point[valueKey]) || 0;
      const barHeight = axisMax === 0 ? 0 : (value / axisMax) * plotHeight;
      const x = PADDING.left + index * slotWidth + (slotWidth - barWidth) / 2;
      const y = PADDING.top + plotHeight - barHeight;

      parts.push(
        `<rect class="bar" x="${x.toFixed(1)}" y="${y.toFixed(1)}" ` +
          `width="${barWidth.toFixed(1)}" height="${Math.max(barHeight, value > 0 ? 1 : 0).toFixed(1)}">` +
          `<title>${escapeHtml(formatDayLabel(point.day))}: ${formatNumber(value)}</title>` +
          '</rect>'
      );

      if (index % labelEvery === 0 || index === points.length - 1) {
        parts.push(
          `<text class="axis-label" x="${(PADDING.left + index * slotWidth + slotWidth / 2).toFixed(1)}" ` +
            `y="${HEIGHT - PADDING.bottom + 18}" text-anchor="middle">` +
            `${escapeHtml(formatDayLabel(point.day))}</text>`
        );
      }
    });

    svgElement.innerHTML = parts.join('');
  }

  function renderStatTiles(summary, retentionDays) {
    const { totals } = summary;
    const errorRate =
      totals.requests > 0
        ? Math.round(((totals.clientErrors + totals.serverErrors) / totals.requests) * 100)
        : 0;

    const tiles = [
      {
        label: 'Requests',
        value: formatNumber(totals.requests),
        note: `last ${summary.rangeDays}d`
      },
      {
        label: 'Visitors',
        value: formatNumber(totals.visitors),
        note: 'distinct fingerprints'
      },
      { label: 'Addresses', value: formatNumber(totals.addresses), note: 'distinct IPs' },
      {
        label: 'Errors',
        value: `${errorRate}%`,
        note: `${formatNumber(totals.clientErrors)} 4xx / ${formatNumber(totals.serverErrors)} 5xx`
      },
      {
        label: 'Avg response',
        value: `${formatNumber(totals.averageDurationMs)}ms`,
        note: `retained ${retentionDays}d`
      }
    ];

    document.getElementById('statTiles').innerHTML = tiles
      .map(
        (tile) =>
          '<div class="col-6 col-lg">' +
          '<div class="stat-tile">' +
          `<div class="stat-label">${escapeHtml(tile.label)}</div>` +
          `<div class="stat-value">${escapeHtml(tile.value)}</div>` +
          `<div class="stat-note">${escapeHtml(tile.note)}</div>` +
          '</div></div>'
      )
      .join('');
  }

  function renderEmptyRow(columns, message) {
    return `<tr><td colspan="${columns}" class="text-muted text-center py-3">${escapeHtml(message)}</td></tr>`;
  }

  function renderTopRoutes(rows) {
    document.getElementById('topRoutes').innerHTML = rows.length
      ? rows
          .map(
            (row) =>
              '<tr>' +
              `<td class="route-cell">${escapeHtml(row.value)}</td>` +
              `<td class="text-end">${formatNumber(row.requests)}</td>` +
              `<td class="text-end">${formatNumber(row.visitors)}</td>` +
              `<td class="text-end">${formatNumber(row.averageDurationMs)}ms</td>` +
              '</tr>'
          )
          .join('')
      : renderEmptyRow(4, 'No requests recorded');
  }

  function renderStatusBands(bands) {
    const total = bands.reduce((sum, band) => sum + band.requests, 0);

    document.getElementById('statusBands').innerHTML = bands.length
      ? bands
          .map((band) => {
            const share = total > 0 ? Math.round((band.requests / total) * 100) : 0;
            return (
              '<tr>' +
              `<td class="${escapeHtml(`status-${band.band}`)} fw-semibold">${escapeHtml(band.band)}</td>` +
              `<td class="text-end">${formatNumber(band.requests)}</td>` +
              `<td class="text-end">${share}%</td>` +
              '</tr>'
            );
          })
          .join('')
      : renderEmptyRow(3, 'No requests recorded');
  }

  function renderTopAsns(rows) {
    document.getElementById('topAsns').innerHTML = rows.length
      ? rows
          .map(
            (row) =>
              '<tr>' +
              `<td>AS${escapeHtml(row.value)}</td>` +
              `<td>${escapeHtml(row.organisation || '—')}</td>` +
              `<td class="text-end">${formatNumber(row.requests)}</td>` +
              `<td class="text-end">${formatNumber(row.visitors)}</td>` +
              '</tr>'
          )
          .join('')
      : renderEmptyRow(4, 'No network data — local traffic has no ASN');
  }

  function renderTopCountries(rows) {
    document.getElementById('topCountries').innerHTML = rows.length
      ? rows
          .map(
            (row) =>
              '<tr>' +
              `<td>${escapeHtml(row.value)}</td>` +
              `<td class="text-end">${formatNumber(row.requests)}</td>` +
              `<td class="text-end">${formatNumber(row.visitors)}</td>` +
              '</tr>'
          )
          .join('')
      : renderEmptyRow(3, 'No country data — local traffic has no country');
  }

  function renderTopAddresses(rows) {
    document.getElementById('topAddresses').innerHTML = rows.length
      ? rows
          .map(
            (row) =>
              '<tr>' +
              `<td class="route-cell">${escapeHtml(row.value)}</td>` +
              `<td>${escapeHtml(row.country || '—')}</td>` +
              `<td class="text-end">${formatNumber(row.requests)}</td>` +
              `<td class="text-end">${formatNumber(row.visitors)}</td>` +
              `<td>${escapeHtml(formatDateTime(row.lastSeen))}</td>` +
              '<td class="text-end">' +
              `<button class="btn btn-sm btn-outline-secondary py-0" data-filter-ip="${escapeHtml(row.value)}">Filter</button>` +
              '</td>' +
              '</tr>'
          )
          .join('')
      : renderEmptyRow(6, 'No requests recorded');
  }

  function renderRequestLog(payload) {
    const body = document.getElementById('requestLog');

    body.innerHTML = payload.requests.length
      ? payload.requests
          .map(
            (row) =>
              '<tr>' +
              `<td>${escapeHtml(formatDateTime(row.created_at))}</td>` +
              `<td>${escapeHtml(row.method)}</td>` +
              `<td class="route-cell">${escapeHtml(row.route)}</td>` +
              `<td class="text-end ${escapeHtml(statusClass(row.status_code))} fw-semibold">${escapeHtml(row.status_code)}</td>` +
              `<td class="text-end">${formatNumber(row.duration_ms)}ms</td>` +
              `<td class="route-cell">${escapeHtml(row.ip || '—')}</td>` +
              `<td>${row.asn ? `AS${escapeHtml(row.asn)}` : '—'}</td>` +
              '<td>' +
              (row.fingerprint
                ? `<a class="fingerprint-link" data-fingerprint="${escapeHtml(row.fingerprint)}">${escapeHtml(row.fingerprint.slice(0, 8))}</a>`
                : '—') +
              '</td>' +
              '</tr>'
          )
          .join('')
      : renderEmptyRow(8, 'No requests match these filters');

    const from = payload.total === 0 ? 0 : payload.offset + 1;
    const to = Math.min(payload.offset + payload.limit, payload.total);

    document.getElementById('logCount').textContent =
      `Showing ${formatNumber(from)}–${formatNumber(to)} of ${formatNumber(payload.total)}`;
    document.getElementById('prevPage').disabled = payload.offset === 0;
    document.getElementById('nextPage').disabled = to >= payload.total;
  }

  function buildRequestsUrl() {
    const params = new URLSearchParams({
      days: String(state.rangeDays),
      limit: String(PAGE_SIZE),
      offset: String(state.offset)
    });

    for (const [key, value] of Object.entries(state.filters)) {
      if (value !== '' && value !== undefined && value !== null) {
        params.set(key, value);
      }
    }

    return `${REQUESTS_URL}?${params.toString()}`;
  }

  async function loadSummary() {
    const payload = await fetchJson(`${SUMMARY_URL}?days=${state.rangeDays}`);
    const summary = payload.data;

    document.getElementById('collectionWarning').classList.toggle('d-none', payload.collecting);
    document.getElementById('retentionNote').textContent =
      `Records are kept for ${payload.retentionDays} days, then deleted automatically.`;

    renderStatTiles(summary, payload.retentionDays);
    renderBarChart(document.getElementById('requestsChart'), summary.daily, 'requests');
    renderBarChart(document.getElementById('visitorsChart'), summary.daily, 'visitors');
    renderTopRoutes(summary.topRoutes);
    renderStatusBands(summary.statusBands);
    renderTopAsns(summary.topAsns);
    renderTopCountries(summary.topCountries);
    renderTopAddresses(summary.topAddresses);
  }

  async function loadRequests() {
    renderRequestLog(await fetchJson(buildRequestsUrl()));
  }

  async function refresh() {
    try {
      await Promise.all([loadSummary(), loadRequests()]);
    } catch (error) {
      console.error('Failed to load analytics', error);
    }
  }

  async function showSession(fingerprint) {
    try {
      const payload = await fetchJson(
        `${SESSIONS_URL}/${encodeURIComponent(fingerprint)}?days=${state.rangeDays}`
      );

      document.getElementById('sessionFingerprint').textContent =
        `${fingerprint} — ${payload.requests.length} request(s). Fingerprints rotate daily, so this covers one day at most.`;

      document.getElementById('sessionRequests').innerHTML = payload.requests.length
        ? payload.requests
            .map(
              (row) =>
                '<tr>' +
                `<td>${escapeHtml(formatDateTime(row.created_at))}</td>` +
                `<td>${escapeHtml(row.method)}</td>` +
                `<td class="route-cell">${escapeHtml(row.route)}</td>` +
                `<td class="text-end ${escapeHtml(statusClass(row.status_code))}">${escapeHtml(row.status_code)}</td>` +
                `<td class="text-end">${formatNumber(row.duration_ms)}ms</td>` +
                '</tr>'
            )
            .join('')
        : renderEmptyRow(5, 'No requests in this session');

      // eslint-disable-next-line no-undef
      new bootstrap.Modal(document.getElementById('sessionModal')).show();
    } catch (error) {
      console.error('Failed to load session', error);
    }
  }

  function readFilters() {
    state.filters = {
      ip: document.getElementById('filterIp').value.trim(),
      route: document.getElementById('filterRoute').value.trim(),
      country: document.getElementById('filterCountry').value.trim().toUpperCase(),
      status: document.getElementById('filterStatus').value.trim(),
      asn: document.getElementById('filterAsn').value.trim()
    };
    state.offset = 0;
  }

  function attachEvents() {
    document.querySelectorAll('[data-range]').forEach((button) => {
      button.addEventListener('click', () => {
        document.querySelectorAll('[data-range]').forEach((other) => {
          other.classList.remove('active');
        });
        button.classList.add('active');
        state.rangeDays = Number(button.dataset.range);
        state.offset = 0;
        refresh();
      });
    });

    let filterTimer = null;
    document.getElementById('logFilters').addEventListener('input', () => {
      clearTimeout(filterTimer);
      filterTimer = setTimeout(() => {
        readFilters();
        loadRequests();
      }, 300);
    });

    document.getElementById('clearFilters').addEventListener('click', () => {
      ['filterIp', 'filterRoute', 'filterCountry', 'filterStatus', 'filterAsn'].forEach((id) => {
        document.getElementById(id).value = '';
      });
      readFilters();
      loadRequests();
    });

    document.getElementById('prevPage').addEventListener('click', () => {
      state.offset = Math.max(0, state.offset - PAGE_SIZE);
      loadRequests();
    });

    document.getElementById('nextPage').addEventListener('click', () => {
      state.offset += PAGE_SIZE;
      loadRequests();
    });

    // Delegated: rows are re-rendered on every load.
    document.addEventListener('click', (event) => {
      const fingerprintLink = event.target.closest('[data-fingerprint]');
      if (fingerprintLink) {
        showSession(fingerprintLink.dataset.fingerprint);
        return;
      }

      const filterButton = event.target.closest('[data-filter-ip]');
      if (filterButton) {
        document.getElementById('filterIp').value = filterButton.dataset.filterIp;
        readFilters();
        loadRequests();
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    attachEvents();
    refresh();
  });
})();
