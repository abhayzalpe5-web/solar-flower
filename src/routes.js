const express = require('express');
const router = express.Router();
const config = require('./config');
const db = require('./db');

// Helper to format date in Asia/Kolkata (+05:30)
const formatKolkataTime = (epochMs) => {
  try {
    const date = new Date(epochMs);
    const formatter = new Intl.DateTimeFormat('en-IN', {
      timeZone: config.TIMEZONE,
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
    return formatter.format(date);
  } catch (e) {
    return new Date(epochMs).toLocaleString();
  }
};

// Middleware: Authenticate admin session or token
const requireAuth = (req, res, next) => {
  const token = req.cookies?.solar_session || req.headers['authorization']?.replace('Bearer ', '');
  if (token === config.SESSION_SECRET || token === config.PASSWORD) {
    return next();
  }
  return res.status(401).json({ error: 'Unauthorized: Please log in with the correct password.' });
};

// --- AUTH ROUTES ---

// POST /api/auth/login
router.post('/auth/login', (req, res) => {
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ success: false, error: 'Password is required' });
  }

  if (String(password).trim() === String(config.PASSWORD).trim()) {
    // Set 7-day cookie
    res.cookie('solar_session', config.SESSION_SECRET, {
      httpOnly: false, // Accessible by frontend JS for quick auth verification
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production'
    });

    return res.json({
      success: true,
      message: 'Login successful',
      token: config.SESSION_SECRET
    });
  }

  return res.status(401).json({
    success: false,
    error: 'Incorrect password. Please try again.'
  });
});

// POST /api/auth/logout
router.post('/auth/logout', (req, res) => {
  res.clearCookie('solar_session');
  return res.json({ success: true, message: 'Logged out successfully' });
});

// GET /api/auth/check
router.get('/auth/check', (req, res) => {
  const token = req.cookies?.solar_session || req.headers['authorization']?.replace('Bearer ', '');
  const isAuthenticated = (token === config.SESSION_SECRET || token === config.PASSWORD);
  res.json({ authenticated: isAuthenticated });
});

// --- SENSOR DATA INGESTION (From ESP8266 or simulator) ---

// POST /api/sensor-data or /api/readings
const handleSensorIngest = async (req, res) => {
  try {
    const body = req.body || {};

    // Support both standard and abbreviated keys from ESP8266
    const rawVoltage = body.voltage !== undefined ? body.voltage : body.v;
    const rawCurrent = body.current !== undefined ? body.current : (body.current_ma !== undefined ? body.current_ma : body.i);
    const rawPower = body.power !== undefined ? body.power : (body.power_w !== undefined ? body.power_w : body.p);
    const rawEnergyWh = body.energy !== undefined ? body.energy : (body.energy_wh !== undefined ? body.energy_wh : body.e);
    const rawEnergyKwh = body.energy_kwh !== undefined ? body.energy_kwh : (rawEnergyWh !== undefined ? rawEnergyWh / 1000 : undefined);
    const rawCost = body.cost !== undefined ? body.cost : body.cost_inr;

    if (rawVoltage === undefined && rawCurrent === undefined && rawPower === undefined) {
      return res.status(400).json({ error: 'Missing sensor readings in payload' });
    }

    const voltage = parseFloat(rawVoltage) || 0;
    const current_ma = parseFloat(rawCurrent) || 0;
    const power_w = parseFloat(rawPower) || (voltage * (current_ma / 1000));

    const saved = await db.addReading({
      voltage,
      current_ma,
      power_w,
      energy_wh: rawEnergyWh !== undefined ? parseFloat(rawEnergyWh) : undefined,
      energy_kwh: rawEnergyKwh !== undefined ? parseFloat(rawEnergyKwh) : undefined,
      cost_inr: rawCost !== undefined ? parseFloat(rawCost) : undefined,
      timestamp: body.timestamp || new Date().toISOString()
    });

    return res.status(201).json({
      success: true,
      message: 'Reading recorded successfully',
      data: saved
    });
  } catch (error) {
    console.error('Error inserting reading:', error);
    return res.status(500).json({ success: false, error: 'Internal server error saving reading' });
  }
};

router.post('/sensor-data', handleSensorIngest);
router.post('/readings', handleSensorIngest);

// --- READINGS RETRIEVAL & METRICS ---

// GET /api/readings/latest - Real-time metrics
router.get('/readings/latest', async (req, res) => {
  try {
    const summary = await db.getSummary();
    if (summary.latest) {
      summary.latest.formattedTime = formatKolkataTime(summary.latest.created_at);
    }
    return res.json(summary);
  } catch (error) {
    console.error('Error fetching latest reading:', error);
    return res.status(500).json({ error: 'Failed to retrieve latest reading' });
  }
});

// GET /api/readings - Paginated records for table (Latest first, 20 per page)
router.get('/readings', async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;

    const data = await db.getReadingsPaginated(page, limit);

    // Add IST formatted time string for display
    const formattedRecords = data.records.map((r) => ({
      ...r,
      formattedTime: formatKolkataTime(r.created_at)
    }));

    return res.json({
      records: formattedRecords,
      pagination: data.pagination
    });
  } catch (error) {
    console.error('Error fetching paginated readings:', error);
    return res.status(500).json({ error: 'Failed to retrieve readings list' });
  }
});

// GET /api/readings/graph - Historical points for Chart.js
router.get('/readings/graph', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 30;
    const rows = await db.getReadingsForGraph(limit);

    const formattedRows = rows.map((r) => ({
      ...r,
      formattedTime: formatKolkataTime(r.created_at)
    }));

    return res.json(formattedRows);
  } catch (error) {
    console.error('Error fetching graph data:', error);
    return res.status(500).json({ error: 'Failed to retrieve graph data' });
  }
});

// DELETE /api/readings/:id - Delete single record
router.delete('/readings/:id', requireAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const success = await db.deleteReading(id);
    if (!success) {
      return res.status(404).json({ success: false, error: 'Record not found' });
    }
    return res.json({ success: true, message: `Record #${id} deleted successfully` });
  } catch (error) {
    console.error('Error deleting reading:', error);
    return res.status(500).json({ success: false, error: 'Failed to delete record' });
  }
});

// POST /api/readings/simulate - Helper to push simulated reading for demonstration
router.post('/readings/simulate', async (req, res) => {
  try {
    // Generate realistic solar flower / DC meter reading
    const voltage = parseFloat((12.0 + Math.random() * 2.5).toFixed(2)); // ~12V - 14.5V DC
    const current_ma = parseFloat((250 + Math.random() * 600).toFixed(1)); // 250 - 850 mA
    const power_w = parseFloat(((voltage * current_ma) / 1000).toFixed(2));

    const saved = await db.addReading({
      voltage,
      current_ma,
      power_w
    });

    return res.json({
      success: true,
      message: 'Simulated reading added',
      data: saved
    });
  } catch (error) {
    console.error('Error simulating reading:', error);
    return res.status(500).json({ error: 'Simulation failed' });
  }
});

module.exports = router;

