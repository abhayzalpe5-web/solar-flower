/*
 * =========================================================================================
 * Project Name : Solar Flower - Smart IoT DC Energy Meter
 * Organization : Dept. of Electrical Engineering, GCOEY
 * Developer    : madmax
 * Hardware     : ESP8266 (NodeMCU / Wemos D1 Mini)
 * Sensors      : INA219 High-Side / Low-Side DC Current & Voltage Sensor
 * Display      : 1.3" I2C OLED Display (128x64) (SH1106 / SSD1306)
 *
 * Pin Connections:
 *   ESP8266 D1 (GPIO 5) -> OLED SCK/SCL & INA219 SCL
 *   ESP8266 D2 (GPIO 4) -> OLED SDA     & INA219 SDA
 *   ESP8266 3V3 / 5V    -> VCC of OLED & INA219
 *   ESP8266 GND         -> GND of OLED & INA219 & Load/Power GND
 *
 * Shunt Connections (User Specified):
 *   Power Source (+) -> INA219 Vin-
 *   Load (+)         -> INA219 Vin+
 *   Common Ground    -> INA219 GND & Source (-) & Load (-)
 *   * Note: Current flows from Vin- to Vin+, reading is inverted (abs) in code for accuracy.
 *
 * WiFi Configuration:
 *   SSID     : SPIDERMAN
 *   Password : 000000000
 *
 * Telemetry Interval : Every 5 seconds
 * Rate per Unit      : ₹4.32 per kWh
 * =========================================================================================
 */

#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClient.h>
#include <Wire.h>
#include <Adafruit_INA219.h>

// For 1.3" OLED: If using Adafruit_SH1106 library (most common for 1.3" 128x64 OLED)
// Or Adafruit_SSD1306. Here we include standard U8g2 or Adafruit GFX support.
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// OLED Configuration (128x64)
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET -1
#define OLED_I2C_ADDRESS 0x3C // Default 1.3" OLED I2C Address

// Create display instance
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

// Create INA219 instance (Default I2C address 0x40)
Adafruit_INA219 ina219;

// WiFi Credentials
const char* ssid     = "SPIDERMAN";
const char* password = "000000000";

// Backend Server Configuration
// Replace with your deployed Render URL (e.g. "https://smart-solar-flower.onrender.com/api/sensor-data")
// or your local computer IP for local testing (e.g. "http://192.168.1.100:3000/api/sensor-data")
const char* serverUrl = "http://YOUR-RENDER-APP.onrender.com/api/sensor-data";

// Measurement and Energy Accumulation Variables
float busVoltage_V = 0.0;
float current_mA   = 0.0;
float power_W      = 0.0;
float energy_Wh    = 0.0;
float energy_kWh   = 0.0;
float cost_INR     = 0.0;
const float tariffPerUnit = 4.32; // Rupees per kWh

unsigned long lastMillis = 0;
const unsigned long interval = 5000; // 5 seconds interval

// Function Prototypes
void showIntroSplash();
void updateOledDisplay();
void readSensors();
void sendTelemetry();

void setup() {
  Serial.begin(115200);
  delay(100);
  Serial.println("\n--- Starting Smart Solar Flower Energy Meter ---");

  // Initialize I2C with ESP8266 pins: D2=SDA (GPIO4), D1=SCL (GPIO5)
  Wire.begin(4, 5);

  // Initialize OLED Display
  if (!display.begin(SSD1306_SWITCHCAPVCC, OLED_I2C_ADDRESS)) {
    Serial.println(F("OLED allocation failed. Trying 0x3D..."));
    display.begin(SSD1306_SWITCHCAPVCC, 0x3D);
  }

  // Show starting 2-second intro title
  showIntroSplash();

  // Initialize INA219
  if (!ina219.begin()) {
    Serial.println("Failed to find INA219 chip. Check wiring!");
    display.clearDisplay();
    display.setTextSize(1);
    display.setTextColor(SSD1306_WHITE);
    display.setCursor(10, 20);
    display.println("INA219 NOT FOUND!");
    display.setCursor(10, 35);
    display.println("Check D1(SCL)/D2(SDA)");
    display.display();
    delay(3000);
  } else {
    Serial.println("INA219 Current & Voltage Sensor connected successfully.");
    ina219.setCalibration_32V_2A(); // Configure standard INA219 range
  }

  // Connect to WiFi
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi: ");
  Serial.println(ssid);

  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 10);
  display.println("Connecting to WiFi:");
  display.setCursor(0, 25);
  display.println(ssid);
  display.display();

  int wifiRetries = 0;
  while (WiFi.status() != WL_CONNECTED && wifiRetries < 25) {
    delay(400);
    Serial.print(".");
    wifiRetries++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi Connected!");
    Serial.print("IP Address: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\nWiFi connection pending. Will retry in loop...");
  }

  lastMillis = millis();
}

void loop() {
  unsigned long currentMillis = millis();

  // Run every 5 seconds
  if (currentMillis - lastMillis >= interval) {
    float dtHours = (currentMillis - lastMillis) / 3600000.0;
    lastMillis = currentMillis;

    // Read INA219 Sensor Data
    readSensors();

    // Accumulate Energy (Wh) and calculate Cost (₹)
    energy_Wh += (power_W * dtHours);
    energy_kWh = energy_Wh / 1000.0;
    cost_INR = energy_kWh * tariffPerUnit;

    // Update 1.3" OLED Display
    updateOledDisplay();

    // Transmit telemetry to Web Application via HTTP POST
    sendTelemetry();
  }
}

// 2-Second Intro Title Display
void showIntroSplash() {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);

  // Outer decorative border
  display.drawRect(0, 0, 128, 64, SSD1306_WHITE);
  display.drawRect(2, 2, 124, 60, SSD1306_WHITE);

  // App Title
  display.setTextSize(1);
  display.setCursor(24, 8);
  display.println("SOLAR FLOWER");

  display.setTextSize(1);
  display.setCursor(14, 22);
  display.println("SMART ENERGY");
  display.setCursor(44, 34);
  display.println("METER");

  // Footer attribution
  display.setTextSize(1);
  display.setCursor(28, 50);
  display.println("GCOEY - EE");

  display.display();
  delay(2000); // Intro screen displayed strictly for 2 seconds
}

// Read INA219 Measurements
void readSensors() {
  float bus_v = ina219.getBusVoltage_V();
  float raw_current = ina219.getCurrent_mA();
  
  // Since Source is at Vin- and Load is at Vin+, current reading is negative.
  // We use abs() to record positive consumed current.
  current_mA = abs(raw_current);
  busVoltage_V = bus_v;
  power_W = (busVoltage_V * current_mA) / 1000.0;

  Serial.println("----------------------------------------");
  Serial.print("Voltage  : "); Serial.print(busVoltage_V, 2); Serial.println(" V");
  Serial.print("Current  : "); Serial.print(current_mA, 1);   Serial.println(" mA");
  Serial.print("Power    : "); Serial.print(power_W, 2);      Serial.println(" W");
  Serial.print("Energy   : "); Serial.print(energy_Wh, 2);    Serial.println(" Wh");
  Serial.print("Cost     : INR "); Serial.println(cost_INR, 3);
}

// Display Live Readings on 1.3" OLED Screen
void updateOledDisplay() {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);

  // Header Bar
  display.fillRect(0, 0, 128, 12, SSD1306_WHITE);
  display.setTextColor(SSD1306_BLACK);
  display.setTextSize(1);
  display.setCursor(4, 2);
  display.print("SOLAR FLOWER");

  // WiFi status badge
  display.setCursor(95, 2);
  if (WiFi.status() == WL_CONNECTED) {
    display.print("[WIFI]");
  } else {
    display.print("[NO-WF]");
  }

  // Display Telemetry in 2-column or list format
  display.setTextColor(SSD1306_WHITE);

  // Voltage
  display.setCursor(0, 16);
  display.print("V: ");
  display.print(busVoltage_V, 2);
  display.print(" V");

  // Current
  display.setCursor(68, 16);
  display.print("I: ");
  display.print(current_mA, 0);
  display.print("mA");

  // Power
  display.setCursor(0, 28);
  display.print("P: ");
  display.print(power_W, 2);
  display.print(" W");

  // Energy
  display.setCursor(68, 28);
  display.print("E: ");
  display.print(energy_Wh, 1);
  display.print("Wh");

  // Cost
  display.setCursor(0, 42);
  display.print("Cost: INR ");
  display.print(cost_INR, 2);

  // Rate tag
  display.setCursor(0, 54);
  display.print("@ 4.32/kWh | 5s poll");

  display.display();
}

// Send Data to Node.js Backend via HTTP POST
void sendTelemetry() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi not connected. Skipping HTTP post.");
    return;
  }

  WiFiClient client;
  HTTPClient http;

  // Initialize HTTP Client
  if (http.begin(client, serverUrl)) {
    http.addHeader("Content-Type", "application/json");

    // Construct JSON Payload
    String jsonPayload = "{";
    jsonPayload += "\"voltage\":" + String(busVoltage_V, 2) + ",";
    jsonPayload += "\"current\":" + String(current_mA, 2) + ",";
    jsonPayload += "\"power\":" + String(power_W, 2) + ",";
    jsonPayload += "\"energy_wh\":" + String(energy_Wh, 4) + ",";
    jsonPayload += "\"energy_kwh\":" + String(energy_kWh, 6) + ",";
    jsonPayload += "\"cost_inr\":" + String(cost_INR, 4);
    jsonPayload += "}";

    Serial.print("Posting payload to server: ");
    Serial.println(jsonPayload);

    int httpCode = http.POST(jsonPayload);

    if (httpCode > 0) {
      Serial.printf("HTTP Response Code: %d\n", httpCode);
      if (httpCode == HTTP_CODE_OK || httpCode == HTTP_CODE_CREATED) {
        String response = http.getString();
        Serial.println("Server Response: " + response);
      }
    } else {
      Serial.printf("HTTP POST failed, error: %s\n", http.errorToString(httpCode).c_str());
    }

    http.end();
  } else {
    Serial.println("Unable to connect to HTTP host.");
  }
}
