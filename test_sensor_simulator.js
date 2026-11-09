/**
 * Solar Flower - Local Sensor Telemetry Simulator
 * Simulates ESP8266 + INA219 sensor by sending realistic readings every 5 seconds.
 */

const http = require('http');

const PORT = process.env.PORT || 3000;
const SERVER_URL = `http://localhost:${PORT}/api/sensor-data`;
const INTERVAL_MS = 5000;

console.log('🌻 Solar Flower - IoT Sensor Telemetry Simulator');
console.log(`📡 Sending sensor data to: ${SERVER_URL} every 5 seconds\n`);

let simulatedEnergyWh = 0.0;
const TARIFF_PER_UNIT = 4.32;

function generateReading() {
  // Typical 12V Solar / DC Load telemetry
  const voltage = parseFloat((12.2 + (Math.random() * 2.2 - 0.8)).toFixed(2)); // ~11.4V - 14.4V
  const current_ma = parseFloat((280 + (Math.random() * 550)).toFixed(1));     // ~280mA - 830mA
  const power_w = parseFloat(((voltage * current_ma) / 1000).toFixed(2));      // in Watts

  // Add incremental energy for 5 seconds
  const dtHours = 5.0 / 3600.0;
  simulatedEnergyWh += power_w * dtHours;
  const energy_kwh = simulatedEnergyWh / 1000.0;
  const cost_inr = energy_kwh * TARIFF_PER_UNIT;

  return {
    voltage,
    current_ma,
    power_w,
    energy_wh: parseFloat(simulatedEnergyWh.toFixed(4)),
    energy_kwh: parseFloat(energy_kwh.toFixed(6)),
    cost_inr: parseFloat(cost_inr.toFixed(4)),
    timestamp: new Date().toISOString()
  };
}

function sendReading() {
  const payload = JSON.stringify(generateReading());
  const url = new URL(SERVER_URL);

  const req = http.request(
    {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    },
    (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const now = new Date().toLocaleTimeString();
        console.log(`[${now}] ✅ Telemetry sent (HTTP ${res.statusCode}): ${payload}`);
      });
    }
  );

  req.on('error', (err) => {
    console.error(`❌ Connection error: ${err.message}. Make sure server is running on port ${PORT}.`);
  });

  req.write(payload);
  req.end();
}

// Send first reading immediately, then every 5 seconds
sendReading();
setInterval(sendReading, INTERVAL_MS);

