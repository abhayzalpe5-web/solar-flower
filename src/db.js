const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const config = require('./config');

// Ensure database directory exists
const dbDir = path.dirname(config.DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new sqlite3.Database(config.DB_PATH, (err) => {
  if (err) {
    console.error('❌ Failed to connect to SQLite database:', err.message);
  } else {
    console.log('✅ Connected to SQLite database at:', config.DB_PATH);
  }
});

// Promisified helpers
const run = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
};

const get = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

const all = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

// Initialize schema
const initDB = async () => {
  await run(`
    CREATE TABLE IF NOT EXISTS readings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      voltage REAL NOT NULL,
      current_ma REAL NOT NULL,
      power_w REAL NOT NULL,
      energy_wh REAL NOT NULL,
      energy_kwh REAL NOT NULL,
      cost_inr REAL NOT NULL,
      timestamp TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);

  await run(`
    CREATE INDEX IF NOT EXISTS idx_readings_created_at ON readings(created_at DESC)
  `);

  console.log('✅ SQLite Schema initialized successfully.');
};

// Insert a new reading
const addReading = async ({ voltage, current_ma, power_w, energy_wh, energy_kwh, cost_inr, timestamp }) => {
  const now = Date.now();
  const ts = timestamp || new Date().toISOString();

  // If energy or cost not provided, calculate them from previous reading
  let finalWh = energy_wh;
  let finalKwh = energy_kwh;
  let finalCost = cost_inr;

  if (finalWh === undefined || finalWh === null || isNaN(finalWh)) {
    const latest = await getLatestReading();
    if (latest) {
      // Calculate delta time
      const dtHours = Math.max(0.0001, (now - latest.created_at) / (1000 * 3600));
      const deltaWh = power_w * dtHours;
      finalWh = parseFloat((latest.energy_wh + deltaWh).toFixed(5));
      finalKwh = parseFloat((finalWh / 1000).toFixed(6));
    } else {
      finalWh = 0;
      finalKwh = 0;
    }
  } else {
    finalWh = parseFloat(finalWh);
    finalKwh = parseFloat((finalWh / 1000).toFixed(6));
  }

  if (finalCost === undefined || finalCost === null || isNaN(finalCost)) {
    finalCost = parseFloat((finalKwh * config.RATE_PER_UNIT).toFixed(4));
  } else {
    finalCost = parseFloat(finalCost);
  }

  const result = await run(
    `INSERT INTO readings (voltage, current_ma, power_w, energy_wh, energy_kwh, cost_inr, timestamp, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      parseFloat(voltage) || 0,
      parseFloat(current_ma) || 0,
      parseFloat(power_w) || 0,
      finalWh,
      finalKwh,
      finalCost,
      ts,
      now
    ]
  );

  return {
    id: result.lastID,
    voltage: parseFloat(voltage) || 0,
    current_ma: parseFloat(current_ma) || 0,
    power_w: parseFloat(power_w) || 0,
    energy_wh: finalWh,
    energy_kwh: finalKwh,
    cost_inr: finalCost,
    timestamp: ts,
    created_at: now
  };
};

// Fetch latest reading
const getLatestReading = async () => {
  return await get(`SELECT * FROM readings ORDER BY created_at DESC LIMIT 1`);
};

// Fetch summary metrics
const getSummary = async () => {
  const latest = await getLatestReading();
  const agg = await get(`
    SELECT 
      COUNT(*) AS total_records,
      MAX(voltage) AS max_voltage,
      MAX(current_ma) AS max_current,
      MAX(power_w) AS max_power,
      MAX(energy_kwh) AS cumulative_kwh,
      MAX(cost_inr) AS cumulative_cost
    FROM readings
  `);

  const totalCost = latest ? latest.cost_inr : 0;
  const totalKwh = latest ? latest.energy_kwh : 0;

  return {
    latest: latest || {
      voltage: 0,
      current_ma: 0,
      power_w: 0,
      energy_wh: 0,
      energy_kwh: 0,
      cost_inr: 0,
      timestamp: new Date().toISOString(),
      created_at: Date.now()
    },
    totalRecords: agg?.total_records || 0,
    totalEnergyKwh: totalKwh,
    totalCostInr: totalCost,
    ratePerUnit: config.RATE_PER_UNIT,
    maxVoltage: agg?.max_voltage || 0,
    maxCurrent: agg?.max_current || 0,
    maxPower: agg?.max_power || 0
  };
};

// Fetch paginated records (latest first, 20 per page)
const getReadingsPaginated = async (page = 1, limit = 20) => {
  const p = Math.max(1, parseInt(page, 10) || 1);
  const l = Math.max(1, parseInt(limit, 10) || 20);
  const offset = (p - 1) * l;

  const countRow = await get(`SELECT COUNT(*) AS total FROM readings`);
  const total = countRow ? countRow.total : 0;
  const totalPages = Math.ceil(total / l) || 1;

  const rows = await all(
    `SELECT * FROM readings ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [l, offset]
  );

  return {
    records: rows,
    pagination: {
      page: p,
      limit: l,
      total,
      totalPages,
      hasNext: p < totalPages,
      hasPrev: p > 1
    }
  };
};

// Fetch historical records for charts (e.g. latest 30-50, returned oldest-first)
const getReadingsForGraph = async (limit = 30) => {
  const l = Math.min(100, Math.max(10, parseInt(limit, 10) || 30));
  const rows = await all(
    `SELECT * FROM (
       SELECT * FROM readings ORDER BY created_at DESC LIMIT ?
     ) ORDER BY created_at ASC`,
    [l]
  );
  return rows;
};

// Delete a single record
const deleteReading = async (id) => {
  const result = await run(`DELETE FROM readings WHERE id = ?`, [id]);
  return result.changes > 0;
};

// Clear all readings (utility)
const clearAllReadings = async () => {
  await run(`DELETE FROM readings`);
  await run(`VACUUM`);
  return true;
};

module.exports = {
  db,
  initDB,
  addReading,
  getLatestReading,
  getSummary,
  getReadingsPaginated,
  getReadingsForGraph,
  deleteReading,
  clearAllReadings
};

