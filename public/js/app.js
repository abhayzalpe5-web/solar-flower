// Solar Flower Dashboard Application JavaScript
// Timezone: Asia/Kolkata (+05:30)

const TARIFF_PER_UNIT = 4.32; // INR per kWh
const CIRCUMFERENCE = 251.2; // 2 * PI * 40 for SVG gauge circles
let currentPage = 1;
const recordsPerPage = 20;
let totalPages = 1;
let deleteCandidateId = null;
let telemetryChart = null;
let currentMetricFilter = 'all';
let pollingTimer = null;
let clockTimer = null;

// Gauge max thresholds for scaling
const MAX_VOLTAGE = 26.0;   // INA219 max bus voltage ~26V
const MAX_CURRENT = 3200.0; // INA219 standard shunt max ~3.2A (3200mA)
const MAX_POWER = 80.0;     // 26V * 3.2A approx ~83W max
const TARGET_ENERGY_WH = 1000.0; // 1 kWh

// Initialize application on DOM loaded
document.addEventListener('DOMContentLoaded', () => {
  initClock();
  initChart();
  fetchLatestTelemetry();
  fetchSavedRecords(1);
  fetchGraphData();

  // Polling every 5 seconds as requested
  pollingTimer = setInterval(() => {
    fetchLatestTelemetry();
    fetchGraphData();
    // Refresh table silently if on page 1
    if (currentPage === 1) {
      fetchSavedRecords(1, false);
    }
  }, 5000);
});

// Update Clock in Asia/Kolkata (+05:30)
function initClock() {
  const clockEl = document.getElementById('kolkataClock');
  const update = () => {
    const now = new Date();
    try {
      const formatted = new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      }).format(now);
      clockEl.textContent = `${formatted} IST (+05:30)`;
    } catch (e) {
      clockEl.textContent = now.toLocaleTimeString();
    }
  };
  update();
  clockTimer = setInterval(update, 1000);
}

// Set Radial Gauge Value
function setGauge(circleId, percentage, color) {
  const circle = document.getElementById(circleId);
  if (!circle) return;
  const clamped = Math.max(0, Math.min(100, percentage));
  const offset = CIRCUMFERENCE - (clamped / 100) * CIRCUMFERENCE;
  circle.style.strokeDashoffset = offset;
  if (color) circle.style.stroke = color;
}

// Set Seek Bar Value
function setSeekBar(barId, percentage) {
  const bar = document.getElementById(barId);
  if (!bar) return;
  const clamped = Math.max(0, Math.min(100, percentage));
  bar.style.width = `${clamped}%`;
}

// Fetch Latest Telemetry (Section 1)
async function fetchLatestTelemetry() {
  try {
    const res = await fetch('/api/readings/latest');
    if (res.status === 401) {
      window.location.href = '/login';
      return;
    }
    const data = await res.json();
    const latest = data.latest || {};

    const voltage = parseFloat(latest.voltage || 0);
    const currentMa = parseFloat(latest.current_ma || 0);
    const power = parseFloat(latest.power_w || 0);
    const energyWh = parseFloat(latest.energy_wh || 0);
    const energyKwh = parseFloat(latest.energy_kwh || (energyWh / 1000));
    const totalCost = parseFloat(data.totalCostInr !== undefined ? data.totalCostInr : latest.cost_inr || 0);

    // Update Numerical Values
    document.getElementById('valVoltage').textContent = voltage.toFixed(2);
    document.getElementById('valCurrent').textContent = currentMa.toFixed(1);
    document.getElementById('valCurrentAmps').textContent = `${(currentMa / 1000).toFixed(3)} A`;
    document.getElementById('valPower').textContent = power.toFixed(2);
    document.getElementById('valEnergyKwh').textContent = energyKwh.toFixed(4);
    document.getElementById('valEnergyWh').textContent = `${energyWh.toFixed(2)} Wh`;
    document.getElementById('valTotalCost').textContent = totalCost.toFixed(2);

    // Calculate Percentages for Gauges & Seek Bars
    const vPct = Math.min(100, (voltage / MAX_VOLTAGE) * 100);
    const iPct = Math.min(100, (currentMa / MAX_CURRENT) * 100);
    const pPct = Math.min(100, (power / MAX_POWER) * 100);
    const ePct = Math.min(100, (energyWh / TARGET_ENERGY_WH) * 100);

    // Update Percentages Text
    document.getElementById('voltagePct').textContent = `${vPct.toFixed(0)}%`;
    document.getElementById('currentPct').textContent = `${iPct.toFixed(0)}%`;
    document.getElementById('powerPct').textContent = `${pPct.toFixed(0)}%`;
    document.getElementById('energyPct').textContent = `${ePct.toFixed(1)}%`;

    // Update SVG Gauges
    setGauge('voltageGaugeCircle', vPct);
    setGauge('currentGaugeCircle', iPct);
    setGauge('powerGaugeCircle', pPct);
    setGauge('energyGaugeCircle', ePct);

    // Update Seek Bars
    setSeekBar('voltageSeekBar', vPct);
    setSeekBar('currentSeekBar', iPct);
    setSeekBar('powerSeekBar', pPct);
    setSeekBar('energySeekBar', ePct);

    // Update Online / Offline Status
    const statusText = document.getElementById('statusText');
    const pingPulse = document.getElementById('pingPulse');
    const pingDot = document.getElementById('pingDot');
    const lastUpdatedBadge = document.getElementById('lastUpdatedBadge');

    const lastTime = latest.created_at || 0;
    const isRecent = (Date.now() - lastTime) < 20000; // within 20s

    if (isRecent) {
      statusText.textContent = 'ESP8266 Live';
      pingDot.className = 'relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500';
      pingPulse.className = 'animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75';
    } else {
      statusText.textContent = 'Standby / Waiting';
      pingDot.className = 'relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500';
      pingPulse.className = 'hidden';
    }

    if (latest.formattedTime) {
      lastUpdatedBadge.textContent = `Last: ${latest.formattedTime}`;
    }

  } catch (err) {
    console.error('Error fetching telemetry:', err);
  }
}

// Fetch Paginated Saved Records (Section 2)
async function fetchSavedRecords(page = 1, showLoading = true) {
  currentPage = page;
  const tbody = document.getElementById('recordsTableBody');

  if (showLoading && tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="text-center py-8 text-slate-400">
          <i class="fa-solid fa-circle-notch fa-spin text-xl text-emerald-600 mb-2"></i>
          <p>Loading page ${page} records...</p>
        </td>
      </tr>
    `;
  }

  try {
    const res = await fetch(`/api/readings?page=${page}&limit=${recordsPerPage}`);
    if (res.status === 401) {
      window.location.href = '/login';
      return;
    }
    const data = await res.json();
    const records = data.records || [];
    const pagination = data.pagination || { total: 0, totalPages: 1 };
    totalPages = pagination.totalPages;

    // Update Record Badges
    document.getElementById('recordCountBadge').textContent = `${pagination.total} Records Saved`;
    document.getElementById('pageTotalRecords').textContent = pagination.total;
    const startIdx = pagination.total === 0 ? 0 : (page - 1) * recordsPerPage + 1;
    const endIdx = Math.min(page * recordsPerPage, pagination.total);
    document.getElementById('pageRangeStart').textContent = startIdx;
    document.getElementById('pageRangeEnd').textContent = endIdx;

    // Render Table Rows
    if (records.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="text-center py-10 text-slate-400">
            <i class="fa-solid fa-inbox text-3xl mb-2 text-slate-300"></i>
            <p class="font-medium text-slate-500">No records saved yet.</p>
            <p class="text-[11px] text-slate-400 mt-1">Telemetry received from ESP8266 or via "Simulate Data" will appear here.</p>
          </td>
        </tr>
      `;
    } else {
      tbody.innerHTML = records.map((r) => {
        const costVal = parseFloat(r.cost_inr || 0);
        return `
          <tr class="hover:bg-slate-50/80 transition-colors">
            <td class="py-3 px-4 font-mono font-medium text-slate-500">#${r.id}</td>
            <td class="py-3 px-4 text-slate-700 whitespace-nowrap">
              <span class="font-medium">${r.formattedTime || formatKolkataFallback(r.created_at)}</span>
            </td>
            <td class="py-3 px-4 text-right font-mono font-semibold text-amber-700">
              ${parseFloat(r.voltage).toFixed(2)} V
            </td>
            <td class="py-3 px-4 text-right font-mono font-semibold text-sky-700">
              ${parseFloat(r.current_ma).toFixed(1)} mA
              <span class="block text-[10px] text-slate-400 font-normal">(${(parseFloat(r.current_ma)/1000).toFixed(3)} A)</span>
            </td>
            <td class="py-3 px-4 text-right font-mono font-semibold text-emerald-700">
              ${parseFloat(r.power_w).toFixed(2)} W
            </td>
            <td class="py-3 px-4 text-right font-mono text-purple-700">
              <span class="font-semibold">${parseFloat(r.energy_wh).toFixed(2)} Wh</span>
              <span class="block text-[10px] text-slate-400">(${parseFloat(r.energy_kwh).toFixed(4)} kWh)</span>
            </td>
            <td class="py-3 px-4 text-right font-mono font-bold text-slate-800">
              ₹${costVal.toFixed(3)}
            </td>
            <td class="py-3 px-4 text-center">
              <button 
                onclick="openDeleteModal(${r.id})" 
                title="Delete Record #${r.id}"
                class="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
              >
                <i class="fa-solid fa-trash-can text-xs"></i>
              </button>
            </td>
          </tr>
        `;
      }).join('');
    }

    // Update Pagination Buttons
    updatePaginationControls(pagination);

  } catch (err) {
    console.error('Error fetching records:', err);
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="text-center py-6 text-rose-500">
          Failed to load records. Check server connection.
        </td>
      </tr>
    `;
  }
}

// Fallback date formatter for Asia/Kolkata
function formatKolkataFallback(epochMs) {
  try {
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    }).format(new Date(epochMs));
  } catch (e) {
    return new Date(epochMs).toLocaleString();
  }
}

// Render pagination pills and toggle prev/next
function updatePaginationControls(pagination) {
  const btnPrev = document.getElementById('btnPrevPage');
  const btnNext = document.getElementById('btnNextPage');
  const pillsContainer = document.getElementById('pageNumberPills');

  btnPrev.disabled = !pagination.hasPrev;
  btnNext.disabled = !pagination.hasNext;

  let pillsHtml = '';
  const total = pagination.totalPages;
  const current = pagination.page;

  let start = Math.max(1, current - 2);
  let end = Math.min(total, current + 2);

  if (start > 1) {
    pillsHtml += `<button onclick="fetchSavedRecords(1)" class="w-7 h-7 text-xs rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">1</button>`;
    if (start > 2) pillsHtml += `<span class="px-1 text-slate-400 text-xs">...</span>`;
  }

  for (let i = start; i <= end; i++) {
    if (i === current) {
      pillsHtml += `<button class="w-7 h-7 text-xs rounded-lg bg-emerald-600 text-white font-bold shadow-xs">${i}</button>`;
    } else {
      pillsHtml += `<button onclick="fetchSavedRecords(${i})" class="w-7 h-7 text-xs rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">${i}</button>`;
    }
  }

  if (end < total) {
    if (end < total - 1) pillsHtml += `<span class="px-1 text-slate-400 text-xs">...</span>`;
    pillsHtml += `<button onclick="fetchSavedRecords(${total})" class="w-7 h-7 text-xs rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">${total}</button>`;
  }

  pillsContainer.innerHTML = pillsHtml;
}

function changePage(delta) {
  const target = currentPage + delta;
  if (target >= 1 && target <= totalPages) {
    fetchSavedRecords(target);
  }
}

// Delete Record Handlers
function openDeleteModal(id) {
  deleteCandidateId = id;
  document.getElementById('deleteTargetId').textContent = id;
  document.getElementById('deleteModal').classList.remove('hidden');
}

function closeDeleteModal() {
  deleteCandidateId = null;
  document.getElementById('deleteModal').classList.add('hidden');
}

async function executeDelete() {
  if (!deleteCandidateId) return;
  const btn = document.getElementById('confirmDeleteBtn');
  btn.disabled = true;
  btn.textContent = 'Deleting...';

  try {
    const res = await fetch(`/api/readings/${deleteCandidateId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('solar_token') || '2702'}`
      }
    });

    if (res.ok) {
      closeDeleteModal();
      fetchSavedRecords(currentPage, false);
      fetchLatestTelemetry();
      fetchGraphData();
    } else {
      const err = await res.json();
      alert(err.error || 'Failed to delete record');
    }
  } catch (error) {
    console.error('Delete error:', error);
    alert('Communication error deleting record');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Yes, Delete';
  }
}

// Initialize Chart.js
function initChart() {
  const ctx = document.getElementById('telemetryChart').getContext('2d');
  
  telemetryChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: 'Voltage (V)',
          data: [],
          borderColor: '#f59e0b',
          backgroundColor: 'rgba(245, 158, 11, 0.08)',
          borderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 5,
          tension: 0.35,
          fill: true,
          yAxisID: 'yVoltage'
        },
        {
          label: 'Current (mA)',
          data: [],
          borderColor: '#0284c7',
          backgroundColor: 'rgba(2, 132, 199, 0.08)',
          borderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 5,
          tension: 0.35,
          fill: true,
          yAxisID: 'yCurrent'
        },
        {
          label: 'Power (W)',
          data: [],
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.08)',
          borderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 5,
          tension: 0.35,
          fill: true,
          yAxisID: 'yPower'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.9)',
          titleFont: { size: 12 },
          bodyFont: { size: 12 },
          padding: 10,
          cornerRadius: 8
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(226, 232, 240, 0.6)' },
          ticks: { font: { size: 10 }, maxRotation: 45, color: '#64748b' }
        },
        yVoltage: {
          type: 'linear',
          display: true,
          position: 'left',
          title: { display: true, text: 'Voltage (V)', color: '#f59e0b', font: { weight: 'bold', size: 11 } },
          grid: { color: 'rgba(241, 245, 249, 1)' },
          suggestedMin: 0,
          suggestedMax: 20
        },
        yCurrent: {
          type: 'linear',
          display: false,
          position: 'right',
          title: { display: true, text: 'Current (mA)', color: '#0284c7', font: { weight: 'bold', size: 11 } },
          grid: { drawOnChartArea: false },
          suggestedMin: 0
        },
        yPower: {
          type: 'linear',
          display: false,
          position: 'right',
          title: { display: true, text: 'Power (W)', color: '#10b981', font: { weight: 'bold', size: 11 } },
          grid: { drawOnChartArea: false },
          suggestedMin: 0
        }
      }
    }
  });
}

// Fetch Graph Data
async function fetchGraphData() {
  try {
    const res = await fetch('/api/readings/graph?limit=25');
    if (!res.ok) return;
    const data = await res.json();
    if (!telemetryChart || !Array.isArray(data)) return;

    const labels = data.map(item => {
      // Extract time part e.g. 03:15:20 PM
      const full = item.formattedTime || formatKolkataFallback(item.created_at);
      const parts = full.split(',');
      return parts.length > 1 ? parts[1].trim() : full;
    });

    const voltages = data.map(item => parseFloat(item.voltage || 0));
    const currents = data.map(item => parseFloat(item.current_ma || 0));
    const powers = data.map(item => parseFloat(item.power_w || 0));

    telemetryChart.data.labels = labels;
    telemetryChart.data.datasets[0].data = voltages;
    telemetryChart.data.datasets[1].data = currents;
    telemetryChart.data.datasets[2].data = powers;

    telemetryChart.update('none'); // Update smoothly without full animation reset
  } catch (err) {
    console.error('Error fetching graph data:', err);
  }
}

// Switch Active Metric in Chart
function switchChartMetric(metric) {
  currentMetricFilter = metric;
  const buttons = {
    all: document.getElementById('tabMetricAll'),
    voltage: document.getElementById('tabMetricV'),
    current: document.getElementById('tabMetricI'),
    power: document.getElementById('tabMetricP')
  };

  // Reset styles
  Object.values(buttons).forEach(btn => {
    if (btn) {
      btn.className = 'px-3 py-1 rounded-lg text-slate-600 hover:text-slate-900 transition-all';
    }
  });

  if (buttons[metric]) {
    buttons[metric].className = 'px-3 py-1 rounded-lg bg-white text-emerald-700 shadow-xs font-bold transition-all';
  }

  if (!telemetryChart) return;

  if (metric === 'all') {
    telemetryChart.data.datasets[0].hidden = false;
    telemetryChart.data.datasets[1].hidden = false;
    telemetryChart.data.datasets[2].hidden = false;
    telemetryChart.options.scales.yVoltage.display = true;
    telemetryChart.options.scales.yCurrent.display = true;
    telemetryChart.options.scales.yPower.display = false; // keep clean dual-axis
  } else if (metric === 'voltage') {
    telemetryChart.data.datasets[0].hidden = false;
    telemetryChart.data.datasets[1].hidden = true;
    telemetryChart.data.datasets[2].hidden = true;
    telemetryChart.options.scales.yVoltage.display = true;
    telemetryChart.options.scales.yCurrent.display = false;
    telemetryChart.options.scales.yPower.display = false;
  } else if (metric === 'current') {
    telemetryChart.data.datasets[0].hidden = true;
    telemetryChart.data.datasets[1].hidden = false;
    telemetryChart.data.datasets[2].hidden = true;
    telemetryChart.options.scales.yVoltage.display = false;
    telemetryChart.options.scales.yCurrent.display = true;
    telemetryChart.options.scales.yPower.display = false;
  } else if (metric === 'power') {
    telemetryChart.data.datasets[0].hidden = true;
    telemetryChart.data.datasets[1].hidden = true;
    telemetryChart.data.datasets[2].hidden = false;
    telemetryChart.options.scales.yVoltage.display = false;
    telemetryChart.options.scales.yCurrent.display = false;
    telemetryChart.options.scales.yPower.display = true;
  }

  telemetryChart.update();
}

// Simulate Test Reading
async function simulateReading() {
  try {
    const res = await fetch('/api/readings/simulate', { method: 'POST' });
    if (res.ok) {
      fetchLatestTelemetry();
      fetchGraphData();
      fetchSavedRecords(currentPage, false);
    }
  } catch (err) {
    console.error('Error simulating reading:', err);
  }
}

// Manual Refresh
function manualRefresh() {
  const icon = document.getElementById('refreshIcon');
  if (icon) icon.classList.add('fa-spin');
  Promise.all([
    fetchLatestTelemetry(),
    fetchGraphData(),
    fetchSavedRecords(currentPage, false)
  ]).finally(() => {
    if (icon) setTimeout(() => icon.classList.remove('fa-spin'), 600);
  });
}

// Logout
async function handleLogout() {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch (e) {}
  localStorage.removeItem('solar_token');
  window.location.href = '/login';
}

