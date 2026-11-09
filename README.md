# 🌻 Solar Flower - IoT Smart DC Energy Meter

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/abhayzalpe5-web/solar-flower)

A professional, real-time IoT DC energy metering and billing web application powered by **ESP8266**, **INA219**, and a **1.3" I2C OLED display**. The system continuously monitors voltage, current, power, cumulative energy consumption, and real-time electricity cost in Indian Rupees (₹4.32/kWh), logging records to an SQLite database every 5 seconds.

> **Project Attribution:**  
> **Designed and developed by madmax, Dept. of Electrical Engineering, GCOEY**

---

## 🚀 Key Features

### 🖥️ Frontend (Simple & Professional)
- **Tech Stack:** HTML5, Tailwind CSS, FontAwesome 6, Chart.js.
- **Single Password Authentication:** Secure login using password **`2702`**.
- **Innovative Gauge & Seek-Bar UI (Section 1):**
  - **Bus Voltage (V):** Circular SVG radial gauge & dynamic seek-bar (0–26V scale).
  - **DC Current (mA & A):** Circular radial gauge & seek-bar (0–3.2A scale).
  - **Instant Power (W):** Radial gauge & seek-bar (0–80W scale).
  - **Accumulated Energy (Wh / Units):** Radial gauge & seek-bar with target tracking.
  - **Total Electricity Cost (₹):** Live accumulator based on tariff (**₹4.32 per kWh / unit**).
- **Interactive Analytics & Records (Section 2):**
  - **Chart.js Telemetry Graph:** Multi-metric real-time graph (Voltage, Current, Power) auto-updating every 5 seconds.
  - **Paginated Saved Records Table:** Displays latest records first (20 records per page), showing ID, Asia/Kolkata (+05:30) timestamp, Voltage, Current, Power, Energy, Cost, and Delete action.
  - **Record Deletion:** Individual record deletion with modal confirmation.
  - **Simulate Data Button:** Built-in telemetry simulator to test and demo the dashboard even when hardware is offline.

### ⚙️ Backend & Database
- **Tech Stack:** Node.js, Express, SQLite (`sqlite3`).
- **Render Ready:** Pre-configured with `render.yaml`, `PORT` environment handling, health check endpoint (`/health`), and static asset serving.
- **Timezone:** Formats and displays all timestamps in `Asia/Kolkata` (+05:30 IST).
- **Tariff Engine:** Real-time billing at ₹4.32 per unit (kWh).

### ⚡ Hardware & Firmware (ESP8266 + INA219 + 1.3" OLED)
- **Microcontroller:** ESP8266 (NodeMCU v2/v3 or Wemos D1 Mini).
- **Current & Voltage Sensor:** INA219 (High-side / Low-side DC power monitor).
- **Display:** 1.3" I2C OLED (128×64 resolution).
  - **Intro Screen:** Displays title **"Smart Energy Meter"** for strictly 2 seconds on boot.
  - **Telemetry Screen:** Displays Voltage (V), Current (mA), Power (W), Energy (Wh), and Cost (INR).
- **WiFi Connectivity:**
  - **SSID:** `SPIDERMAN`
  - **Password:** `000000000`
- **Data Push Interval:** Telemetry sent via HTTP POST to the backend every 5 seconds.

---

## 🔌 Hardware Circuit & Wiring Diagram

The OLED display and INA219 share the ESP8266 I2C bus on pins **D1 (SCL)** and **D2 (SDA)**:

| ESP8266 Pin | 1.3" OLED Pin | INA219 Pin | Description |
|:---|:---|:---|:---|
| **D1 (GPIO 5)** | SCK / SCL | SCL | I2C Clock Line |
| **D2 (GPIO 4)** | SDA | SDA | I2C Data Line |
| **3V3 or 5V** | VCC | VCC | Power Supply (3.3V or 5V) |
| **GND** | GND | GND | Common System Ground |

### Shunt Resistor Power Wiring
As specified:
- **DC Source (+):** Connect to INA219 **`Vin-`**
- **DC Load (+):** Connect to INA219 **`Vin+`**
- **DC Source (-) & Load (-):** Connect to common **GND**

> **Note on Current Polarity:** Because the source enters `Vin-` and exits `Vin+`, the code automatically takes `abs(raw_current)` so that consumption values, power, and cost are calculated cleanly as positive values.

---

## 📁 Project Structure

```
solar/
├── firmware/
│   └── solar_flower_meter/
│       └── solar_flower_meter.ino   # Arduino ESP8266 source code
├── public/
│   ├── css/
│   │   └── style.css                # Custom seek bar & radial gauge styling
│   ├── js/
│   │   ├── auth.js                  # Password validation & session management
│   │   └── app.js                   # Live telemetry, polling, Chart.js & pagination
│   ├── index.html                   # Professional login page (password: 2702)
│   └── dashboard.html               # Main dashboard (Tab 1: Gauges & Records)
├── src/
│   ├── config.js                    # Server configuration & environment variables
│   ├── db.js                        # SQLite database queries & schema
│   └── routes.js                    # REST API endpoints
├── data/                            # Persistent SQLite database folder
├── server.js                        # Express server entry point
├── package.json                     # Node.js dependencies & scripts
├── render.yaml                      # Render Blueprint deployment configuration
├── .env.example                     # Environment variables template
└── README.md                        # Documentation
```

---

## 🛠️ Local Development & Quick Start

### 1. Prerequisites
- **Node.js** v18+ installed.
- **npm** installed.

### 2. Installation
```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/solar-flower.git
cd solar-flower

# Install dependencies
npm install
```

### 3. Run Server
```bash
npm start
```

Open your browser and navigate to:
```
http://localhost:3000
```
- **Login Password:** `2702`

---

## ☁️ Deploying to Render

This repository is optimized for one-click or Git-based deployment on **[Render](https://render.com/)**:

1. Push this repository to your GitHub account.
2. Sign in to your **Render Dashboard** and click **New + > Web Service**.
3. Select your repository.
4. Render will automatically detect the settings from `render.yaml`:
   - **Environment:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
5. Configure Environment Variables in Render:
   - `APP_PASSWORD`: `2702`
   - `RATE_PER_UNIT`: `4.32`
   - `TIMEZONE`: `Asia/Kolkata`
6. Click **Deploy Web Service**.
7. Once deployed, copy your Render URL (e.g. `https://smart-solar-flower.onrender.com`).
8. Paste this URL into `firmware/solar_flower_meter/solar_flower_meter.ino` under `serverUrl`:
   ```cpp
   const char* serverUrl = "https://smart-solar-flower.onrender.com/api/sensor-data";
   ```

---

## 🤖 Flashing the ESP8266 Firmware

1. Open the **Arduino IDE**.
2. Go to **Tools > Board > ESP8266 Boards** and select **NodeMCU 1.0 (ESP-12E Module)** or **Generic ESP8266 Module**.
3. Install the required libraries via **Sketch > Include Library > Manage Libraries**:
   - `Adafruit INA219`
   - `Adafruit GFX Library`
   - `Adafruit SSD1306` (or `Adafruit_SH1106` depending on your 1.3" OLED panel)
   - `ESP8266WiFi` and `ESP8266HTTPClient` (included with ESP8266 Board Core)
4. Open `firmware/solar_flower_meter/solar_flower_meter.ino`.
5. Update `serverUrl` with your deployed Render URL or local machine IP.
6. Connect the ESP8266 via USB, select the correct COM port under **Tools > Port**, and click **Upload**.

---

## 📡 API Reference

| Method | Endpoint | Description |
|:---|:---|:---|
| `POST` | `/api/auth/login` | Authenticate with password `2702` |
| `POST` | `/api/auth/logout` | Terminate session |
| `GET` | `/api/auth/check` | Verify current auth state |
| `POST` | `/api/sensor-data` | Ingest sensor data from ESP8266 (every 5s) |
| `GET` | `/api/readings/latest` | Get real-time readings & summary totals |
| `GET` | `/api/readings?page=1&limit=20` | Paginated records table (latest first) |
| `GET` | `/api/readings/graph?limit=30` | Time-series data points for Chart.js |
| `DELETE` | `/api/readings/:id` | Delete a single record |
| `POST` | `/api/readings/simulate` | Generate a realistic simulation reading |
| `GET` | `/health` | Server health check for Render |

---

## 📜 License & Credits

Designed and developed by **madmax**, Dept. of Electrical Engineering, **GCOEY**.  
Released under the [MIT License](LICENSE).

