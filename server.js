const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const config = require('./src/config');
const db = require('./src/db');
const apiRoutes = require('./src/routes');

const app = express();

// Middleware setup
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Serve static assets from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Mount API routes
app.use('/api', apiRoutes);

// Also accept direct POST to root as fallback for sensor data ingestion
app.post('/', (req, res, next) => {
  req.url = '/sensor-data';
  apiRoutes(req, res, next);
});

// Health check endpoint for Render
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    app: 'Smart Solar Flower',
    timestamp: new Date().toISOString()
  });
});

// Serve frontend entry points
app.get('/', (req, res) => {
  // If authenticated cookie exists, redirect to dashboard, else index (login)
  const token = req.cookies?.solar_session;
  if (token === config.SESSION_SECRET || token === config.PASSWORD) {
    return res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
  }
  return res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/dashboard', (req, res) => {
  return res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/login', (req, res) => {
  return res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Fallback for 404
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
const startServer = async () => {
  try {
    await db.initDB();
    const server = app.listen(config.PORT, '0.0.0.0', () => {
      console.log(`====================================================`);
      console.log(`🌻 Smart Solar Flower - DC Energy Meter Server`);
      console.log(`🚀 Server listening on http://localhost:${config.PORT}`);
      console.log(`⚡ Rate per unit: ₹${config.RATE_PER_UNIT} / kWh`);
      console.log(`🕒 Timezone: ${config.TIMEZONE}`);
      console.log(`🔑 Login Password: ${config.PASSWORD}`);
      console.log(`====================================================`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
};

startServer();

