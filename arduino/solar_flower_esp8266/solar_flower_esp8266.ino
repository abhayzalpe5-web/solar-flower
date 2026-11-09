/*
 * =========================================================================================
 * Project Name : Solar Flower - Smart IoT DC Energy Meter
 * Institution  : Dept. of Electrical Engineering, GCOEY
 * Developer    : madmax
 * Hardware     : ESP8266 (NodeMCU / Wemos D1 Mini)
 * Sensors      : INA219 DC Current & Voltage Sensor
 * Display      : 1.3" I2C OLED Display (128x64) (SH1106 / SSD1306)
 *
 * Pin Connections:
 *   ESP8266 D1 (GPIO 5) -> OLED SCK/SCL & INA219 SCL
 *   ESP8266 D2 (GPIO 4) -> OLED SDA     & INA219 SDA
 *   ESP8266 3V3 / 5V    -> VCC of OLED & INA219
 *   ESP8266 GND         -> GND of OLED, INA219, Source(-) and Load(-)
 *
 * Shunt Connections:
 *   DC Source (+) -> INA219 Vin-
 *   DC Load (+)   -> INA219 Vin+
 *   Common GND    -> INA219 GND & Source (-) & Load (-)
 *   * Note: Current flows Vin- to Vin+, inverted using abs() for positive measurement.
 *
 * WiFi Configuration:
 *   SSID     : SPIDERMAN
 *   Password : 000000000
 *
 * OLED Format:
 *   - 2-second intro title on boot: "SMART ENERGY METER"
 *   - Continuous single-screen 5-block dashboard format (strictly NO slideshow)
 *   - Shows Voltage, Current, Power, Energy, Total Cost, and Render cloud sync status.
 *
 * Cloud Integration:
 *   - Sends live telemetry every 5 seconds via HTTPS POST to your Render deployment.
 * =========================================================================================
 */

#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClient.h>
#include <WiFiClientSecure.h>
#include <Wire.h>
#include <Adafruit_INA219.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// OLED Display Configuration (128x64)
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET -1
#define OLED_I2C_ADDRESS 0x3C // Standard I2C address for 1.3" OLED (or 0x3D)

Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);
Adafruit_INA219 ina219;

// WiFi Settings (Pre-configured)
const char* ssid     = "SPIDERMAN";
const char* password = "000000000";

// Render Cloud Backend URL
// Replace "smart-solar-flower" with your exact Render app name if different
const char* serverUrl = "https://solar-flower-4.onrender.com";

// Live Measurement & Accumulator Variables
float busVoltage_V = 0.0;
float current_mA   = 0.0;
float power_W      = 0.0;
float energy_Wh    = 0.0;
float energy_kWh   = 0.0;
float cost_INR     = 0.0;
const float tariffPerUnit = 4.32; // ₹4.32 per kWh (Unit)

// Telemetry & Sync State
unsigned long lastMillis = 0;
const unsigned long interval = 5000; // Strictly 5 seconds interval
int lastCloudStatus = 0;             // HTTP response code from Render (200/201 = success)
bool cloudSyncSuccess = false;

// Function Prototypes
void showIntroSplash();
void updateOledDisplay();
void readSensors();
void sendTelemetry();

void setup() {
  Serial.begin(115200);
  delay(150);
  Serial.println("\n========================================================");
  Serial.println("🌻 SOLAR FLOWER - SMART DC ENERGY METER (ESP8266)");
  Serial.println("⚡ Dept. of Electrical Engineering, GCOEY | madmax");
  Serial.println("========================================================");

  // Initialize I2C Bus on ESP8266 pins: D1 = SCL (GPIO 5), D2 = SDA (GPIO 4)
  Wire.begin(4, 5);

  // Initialize 1.3" OLED Display
  if (!display.begin(SSD1306_SWITCHCAPVCC, OLED_I2C_ADDRESS)) {
    Serial.println(F("OLED not found on 0x3C. Trying address 0x3D..."));
    display.begin(SSD1306_SWITCHCAPVCC, 0x3D);
  }

  // 1. Show the starting 2-second intro title
  showIntroSplash();

  // 2. Initialize INA219 Current & Voltage Sensor
  if (!ina219.begin()) {
    Serial.println("❌ INA219 chip not detected! Check D1 (SCL) & D2 (SDA) wiring.");
    display.clearDisplay();
    display.setTextSize(1);
    display.setTextColor(SSD1306_WHITE);
    display.setCursor(12, 18);
    display.println("INA219 NOT FOUND!");
    display.setCursor(6, 34);
    display.println("Check D1(SCL) D2(SDA)");
    display.display();
    delay(2500);
  } else {
    Serial.println("✅ INA219 Sensor initialized successfully.");
    ina219.setCalibration_32V_2A(); // Up to 32V and 2A (or 3.2A peak)
  }

  // 3. Connect to WiFi: SPIDERMAN
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi (");
  Serial.print(ssid);
  Serial.println(")...");

  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.drawRect(0, 0, 128, 64, SSD1306_WHITE);
  display.setCursor(14, 12);
  display.println("WIFI CONNECTING");
  display.setCursor(26, 26);
  display.println(ssid);
  display.setCursor(20, 44);
  display.println("Please wait...");
  display.display();

  int wifiRetries = 0;
  while (WiFi.status() != WL_CONNECTED && wifiRetries < 25) {
    delay(400);
    Serial.print(".");
    wifiRetries++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n✅ WiFi Connected Successfully!");
    Serial.print("ESP8266 IP Address: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\n⚠️ WiFi not connected yet. Will auto-reconnect in loop...");
  }

  // Initial sensor read and display
  readSensors();
  updateOledDisplay();
  lastMillis = millis();
}

void loop() {
  // Ensure WiFi auto-reconnects if disconnected
  if (WiFi.status() != WL_CONNECTED) {
    WiFi.reconnect();
  }

  unsigned long currentMillis = millis();

  // Execute strictly every 5 seconds
  if (currentMillis - lastMillis >= interval) {
    float dtHours = (currentMillis - lastMillis) / 3600000.0;
    lastMillis = currentMillis;

    // 1. Read INA219 Live Sensor Data
    readSensors();

    // 2. Accumulate Energy (Wh / kWh) and Calculate Real-Time Cost (₹ @ 4.32)
    energy_Wh += (power_W * dtHours);
    energy_kWh = energy_Wh / 1000.0;
    cost_INR = energy_kWh * tariffPerUnit;

    // 3. Send Telemetry to Render Cloud via HTTPS POST
    sendTelemetry();

    // 4. Update 1.3" OLED Display in Single Block Format (with sync indicator)
    updateOledDisplay();
  }
}

// =========================================================================================
// 1. INTRO SPLASH: Displays "SMART ENERGY METER" for strictly 2 seconds on boot
// =========================================================================================
void showIntroSplash() {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);

  // High-precision double frame border
  display.drawRect(0, 0, 128, 64, SSD1306_WHITE);
  display.drawRect(2, 2, 124, 60, SSD1306_WHITE);

  // Title: SMART ENERGY METER
  display.setTextSize(1);
  display.setCursor(28, 8);
  display.println("SOLAR FLOWER");

  display.setCursor(16, 22);
  display.println("SMART ENERGY");
  display.setCursor(46, 34);
  display.println("METER");

  // Attribution Footer
  display.setCursor(30, 48);
  display.println("GCOEY - EE");

  display.display();
  delay(2000); // 2-second intro screen duration
}

// Helper function to print text perfectly centered within any block/region
void printCenteredInBlock(const String &text, int y, int startX, int blockWidth) {
  int charWidth = 6; // Standard 5x7 Adafruit font is 6px per character (5px glyph + 1px spacing)
  int textWidth = text.length() * charWidth;
  int x = startX + (blockWidth - textWidth) / 2;
  if (x < startX + 2) x = startX + 2;
  display.setCursor(x, y);
  display.print(text);
}

// =========================================================================================
// 2. LIVE TELEMETRY: All readings perfectly centered inside each dashboard block
// =========================================================================================
void updateOledDisplay() {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);

  // Outer Screen Border
  display.drawRect(0, 0, 128, 64, SSD1306_WHITE);

  // Grid Dividers separating the 5 blocks
  display.drawLine(64, 0, 64, 48, SSD1306_WHITE);  // Vertical center divider
  display.drawLine(0, 24, 128, 24, SSD1306_WHITE); // Horizontal divider between row 1 & row 2
  display.drawLine(0, 48, 128, 48, SSD1306_WHITE); // Horizontal divider above bottom cost bar

  display.setTextSize(1);

  // --- BLOCK 1: VOLTAGE (Top-Left: Centered in 0..64) ---
  printCenteredInBlock("VOLTAGE", 3, 0, 64);
  String vStr = String(busVoltage_V, 2) + " V";
  printCenteredInBlock(vStr, 13, 0, 64);

  // --- BLOCK 2: CURRENT (Top-Right: Centered in 64..128) ---
  printCenteredInBlock("CURRENT", 3, 64, 64);
  String iStr;
  if (current_mA >= 1000.0) {
    iStr = String(current_mA / 1000.0, 2) + " A";
  } else {
    iStr = String(current_mA, 0) + " mA";
  }
  printCenteredInBlock(iStr, 13, 64, 64);

  // --- BLOCK 3: POWER (Mid-Left: Centered in 0..64) ---
  printCenteredInBlock("POWER", 27, 0, 64);
  String pStr = String(power_W, 2) + " W";
  printCenteredInBlock(pStr, 37, 0, 64);

  // --- BLOCK 4: ENERGY (Mid-Right: Centered in 64..128) ---
  printCenteredInBlock("ENERGY", 27, 64, 64);
  String eStr;
  if (energy_Wh >= 1000.0) {
    eStr = String(energy_kWh, 3) + " kWh";
  } else {
    eStr = String(energy_Wh, 1) + " Wh";
  }
  printCenteredInBlock(eStr, 37, 64, 64);

  // --- BLOCK 5: COST & CLOUD STATUS (Bottom Bar: Centered in 0..128) ---
  // Inverted white background bar for maximum visibility
  display.fillRect(1, 49, 126, 14, SSD1306_WHITE);
  display.setTextColor(SSD1306_BLACK); // Black text on white bar

  String bottomStr = "Rs: " + String(cost_INR, 2) + "  @ 4.32";
  if (cloudSyncSuccess) {
    bottomStr = "Rs:" + String(cost_INR, 2) + " [RNDR:OK]";
  }
  printCenteredInBlock(bottomStr, 52, 0, 128);

  display.display();
}
    display.print("RNDR:.. 4.32");
  } else {
    display.print("NO-WIFI 4.32");
  }

  display.display();
}

// =========================================================================================
// 3. INA219 MEASUREMENT: Handles polarity (Source to Vin-, Load to Vin+)
// =========================================================================================
void readSensors() {
  float bus_v = ina219.getBusVoltage_V();
  float raw_current = ina219.getCurrent_mA();

  // Inverted shunt wiring: Source at Vin-, Load at Vin+ produces negative raw current.
  // We apply abs() to ensure positive consumed current, power, and energy.
  current_mA = abs(raw_current);
  busVoltage_V = bus_v;
  power_W = (busVoltage_V * current_mA) / 1000.0;

  Serial.println("--------------------------------------------------------");
  Serial.printf("[TELEMETRY] V: %.2f V | I: %.1f mA | P: %.2f W | E: %.2f Wh | Cost: Rs %.3f\n",
                busVoltage_V, current_mA, power_W, energy_Wh, cost_INR);
}

// =========================================================================================
// 4. CLOUD TRANSMISSION: Sends JSON payload to Render via HTTPS POST
// =========================================================================================
void sendTelemetry() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("⚠️ WiFi not connected. Skipping cloud post.");
    cloudSyncSuccess = false;
    return;
  }

  // Construct JSON payload
  String jsonPayload = "{";
  jsonPayload += "\"voltage\":" + String(busVoltage_V, 2) + ",";
  jsonPayload += "\"current\":" + String(current_mA, 2) + ",";
  jsonPayload += "\"power\":" + String(power_W, 2) + ",";
  jsonPayload += "\"energy_wh\":" + String(energy_Wh, 4) + ",";
  jsonPayload += "\"energy_kwh\":" + String(energy_kWh, 6) + ",";
  jsonPayload += "\"cost_inr\":" + String(cost_INR, 4);
  jsonPayload += "}";

  // Auto-resolve endpoint path if base URL was entered
  String fullUrl = String(serverUrl);
  if (!fullUrl.endsWith("/api/sensor-data") && !fullUrl.endsWith("/api/readings")) {
    if (fullUrl.endsWith("/")) {
      fullUrl += "api/sensor-data";
    } else {
      fullUrl += "/api/sensor-data";
    }
  }

  Serial.print("📡 Posting to Render: ");
  Serial.println(fullUrl);

  HTTPClient http;
  bool isHttps = fullUrl.startsWith("https://");

  if (isHttps) {
    WiFiClientSecure secureClient;
    secureClient.setInsecure(); // Permits ESP8266 to communicate over Render's SSL without hardcoded certs
    if (http.begin(secureClient, fullUrl)) {
      http.addHeader("Content-Type", "application/json");
      int httpCode = http.POST(jsonPayload);
      lastCloudStatus = httpCode;

      if (httpCode > 0) {
        Serial.printf("✅ Render HTTP Response Code: %d\n", httpCode);
        if (httpCode == HTTP_CODE_OK || httpCode == HTTP_CODE_CREATED) {
          Serial.println("✅ Data successfully saved in cloud database.");
          cloudSyncSuccess = true;
        } else {
          cloudSyncSuccess = false;
        }
      } else {
        Serial.printf("❌ HTTPS POST failed, error: %s\n", http.errorToString(httpCode).c_str());
        cloudSyncSuccess = false;
      }
      http.end();
    }
  } else {
    WiFiClient client;
    if (http.begin(client, fullUrl)) {
      http.addHeader("Content-Type", "application/json");
      int httpCode = http.POST(jsonPayload);
      lastCloudStatus = httpCode;

      if (httpCode > 0) {
        Serial.printf("✅ Render HTTP Response Code: %d\n", httpCode);
        cloudSyncSuccess = (httpCode == HTTP_CODE_OK || httpCode == HTTP_CODE_CREATED);
      } else {
        Serial.printf("❌ HTTP POST failed, error: %s\n", http.errorToString(httpCode).c_str());
        cloudSyncSuccess = false;
      }
      http.end();
    }
  }
}
