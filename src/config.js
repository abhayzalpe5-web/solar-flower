const path = require('path');
require('dotenv').config();

module.exports = {
  PORT: process.env.PORT || 3000,
  PASSWORD: process.env.APP_PASSWORD || '2702',
  RATE_PER_UNIT: parseFloat(process.env.RATE_PER_UNIT) || 4.32, // Rupees per kWh (unit)
  API_KEY: process.env.API_KEY || 'solar-flower-secret-key-2702',
  SESSION_SECRET: process.env.SESSION_SECRET || 'solar-flower-jwt-or-token-secret-xyz',
  DB_PATH: process.env.DB_PATH || path.join(__dirname, '../data/solar_flower.db'),
  TIMEZONE: 'Asia/Kolkata'
};

