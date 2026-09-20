#include <DHT.h>
#include <RTClib.h>
#include <BH1750.h>
#include <Adafruit_NeoPixel.h>
#include <Wire.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <WiFiManager.h>
#include <SPI.h>
#include <Preferences.h>
#include <SD.h>
#include <ArduinoJson.h>
#include <Update.h>

#define DHT_PIN 15
#define SOIL_PIN 34
#define LIGHT_PIN 35
BH1750 lightMeter;

void scanI2C() {
  Serial.println("Escaneo I2C:");
  byte found = 0;
  for (byte address = 1; address < 127; address++) {
    Wire.beginTransmission(address);
    if (Wire.endTransmission() == 0) {
      Serial.printf("  Dispositivo I2C en 0x%02X\n", address);
      found++;
    }
  }
  if (found == 0) Serial.println("  No se encontraron dispositivos I2C.");
}

bool initializeLightSensor() {
  if (lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE, 0x23, &Wire)) {
    Serial.println("BH1750 listo en 0x23.");
    return true;
  }
  if (lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE, 0x5C, &Wire)) {
    Serial.println("BH1750 listo en 0x5C. Revisa ADDR: debe estar en alto.");
    return true;
  }
  Serial.println("BH1750 no encontrado: revisa VCC, GND, SDA, SCL y ADDR.");
  return false;
}

#define MATRIX_PIN 13
#define LED_PIN 2
#define SD_CS 5
#define NUM_PIXELS 64
#define READING_INTERVAL_MS 300000UL
#define CONFIG_INTERVAL_MS 60000UL
#define OTA_INTERVAL_MS 3600000UL

extern Adafruit_NeoPixel matrix;

const char *DEFAULT_API_URL = "https://rural40.ml-ware.com";
// Debe coincidir con DEVICE_PROVISIONING_KEY del backend.
// No es la api_key operativa del dispositivo.
const char *DEFAULT_PROVISIONING_KEY = "Rural-pr0vision1ng/k3y";
const char *DEFAULT_DEVICE_KEY = "";
const char *READING_QUEUE = "/readings.queue";
DHT dht(DHT_PIN, DHT22);
RTC_DS1307 rtc;
Adafruit_NeoPixel matrix(NUM_PIXELS, MATRIX_PIN, NEO_GRB + NEO_KHZ800);
Preferences preferences;
String apiUrl;
String deviceKey;
bool sdReady = false;
bool lightReady = false;
unsigned long lastReading = 0;
unsigned long lastConfigurationCheck = 0;
unsigned long lastOtaCheck = 0;
const char *FIRMWARE_VERSION = "1.0.1";

bool provisionDevice();

uint32_t ledColorFromName(const char *name) {
  if (strcmp(name, "verde") == 0) return matrix.Color(0, 255, 0);
  if (strcmp(name, "azul") == 0) return matrix.Color(0, 0, 255);
  if (strcmp(name, "blanco") == 0) return matrix.Color(255, 255, 255);
  if (strcmp(name, "amarillo") == 0) return matrix.Color(255, 180, 0);
  if (strcmp(name, "morado") == 0) return matrix.Color(180, 0, 255);
  return matrix.Color(255, 0, 0);
}

void applyRemoteConfiguration() {
  if (WiFi.status() != WL_CONNECTED || apiUrl.length() == 0 || deviceKey.length() == 0) return;
  HTTPClient http;
  String endpoint = apiUrl + "/api/dispositivos/configuracion";
  WiFiClientSecure secureClient;
  if (apiUrl.startsWith("https://")) {
    secureClient.setInsecure();
    http.begin(secureClient, endpoint);
  } else {
    http.begin(endpoint);
  }
  http.addHeader("X-Device-Key", deviceKey);
  int status = http.GET();
  if (status == 200) {
    DynamicJsonDocument document(256);
    DeserializationError error = deserializeJson(document, http.getString());
    if (!error) {
      uint8_t brightness = constrain(document["brillo_led"] | 255, 0, 255);
      const char *color = document["color_led"] | "rojo";
      matrix.setBrightness(brightness);
      matrix.fill(ledColorFromName(color));
      matrix.show();
      Serial.printf("Configuracion LED aplicada: %s, brillo %u.\n", color, brightness);
    } else {
      Serial.println("Configuracion LED invalida recibida.");
    }
  } else if (status == 401) {
    Serial.println("API configuracion: clave invalida; reprovisionando dispositivo.");
    deviceKey = "";
    preferences.putString("device_key", deviceKey);
    provisionDevice();
  } else if (status > 0) {
    Serial.printf("API configuracion: HTTP %d\n", status);
  }
  http.end();
}

void configureConnection() {
  preferences.begin("rural40", false);
  apiUrl = preferences.getString("api_url", DEFAULT_API_URL);
  deviceKey = preferences.getString("device_key", DEFAULT_DEVICE_KEY);
  WiFiManager manager;
  WiFiManagerParameter apiParameter("api_url", "URL API Rural40", apiUrl.c_str(), 160);
  WiFiManagerParameter keyParameter("device_key", "Clave del dispositivo", deviceKey.c_str(), 80);
  manager.addParameter(&apiParameter);
  manager.addParameter(&keyParameter);
  manager.setConnectTimeout(20);
  manager.setConfigPortalTimeout(300);
  WiFi.mode(WIFI_STA);
  Serial.println("Conectando a Wi-Fi guardado o abriendo Rural40-Setup...");
  if (WiFi.status() != WL_CONNECTED && !manager.autoConnect("Rural40-Setup")) {
    Serial.println("No fue posible configurar Wi-Fi. Reinicia para intentarlo de nuevo.");
    return;
  }
  Serial.print("Wi-Fi conectado. IP: ");
  Serial.println(WiFi.localIP());
  apiUrl = String(apiParameter.getValue());
  deviceKey = String(keyParameter.getValue());
  apiUrl.trim();
  apiUrl.replace("/api/health/db", "");
  apiUrl.replace("/api/health", "");
  if (apiUrl.endsWith("/")) apiUrl.remove(apiUrl.length() - 1);
  preferences.putString("api_url", apiUrl);
  preferences.putString("device_key", deviceKey);
}

bool provisionDevice() {
  if (WiFi.status() != WL_CONNECTED || apiUrl.length() == 0) return false;
  String macAddress = WiFi.macAddress();
  String serial = String((uint32_t)(ESP.getEfuseMac() >> 32), HEX) + String((uint32_t)ESP.getEfuseMac(), HEX);
  String internalCode = "RURAL-" + macAddress;
  internalCode.replace(":", "");
  internalCode = internalCode.substring(0, 16);

  HTTPClient http;
  String endpoint = apiUrl + "/api/dispositivos/provisionar";
  WiFiClientSecure secureClient;
  if (apiUrl.startsWith("https://")) {
    secureClient.setInsecure();
    http.begin(secureClient, endpoint);
  } else {
    http.begin(endpoint);
  }
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Provisioning-Key", DEFAULT_PROVISIONING_KEY);
  String payload = "{\"codigo_interno\":\"" + internalCode + "\",\"mac_address\":\"" + macAddress + "\",\"serial\":\"" + serial + "\",\"modelo\":\"ESP32\"}";
  int status = http.POST(payload);
  if (status != 200 && status != 201) {
    Serial.printf("API provision: HTTP %d\n", status);
    http.end();
    return false;
  }

  DynamicJsonDocument document(512);
  DeserializationError error = deserializeJson(document, http.getString());
  if (error || !document["api_key"].is<const char *>()) {
    Serial.println("Respuesta de provision invalida.");
    http.end();
    return false;
  }
  deviceKey = String(document["api_key"].as<const char *>());
  preferences.putString("device_key", deviceKey);
  Serial.println("Dispositivo provisionado. API key guardada localmente.");
  http.end();
  return true;
}

bool isNewerVersion(const char *available, const char *installed) {
  int availableMajor, availableMinor, availablePatch;
  int installedMajor, installedMinor, installedPatch;
  if (sscanf(available, "%d.%d.%d", &availableMajor, &availableMinor, &availablePatch) != 3) return false;
  if (sscanf(installed, "%d.%d.%d", &installedMajor, &installedMinor, &installedPatch) != 3) return false;
  if (availableMajor != installedMajor) return availableMajor > installedMajor;
  if (availableMinor != installedMinor) return availableMinor > installedMinor;
  return availablePatch > installedPatch;
}

void checkForFirmwareUpdate() {
  if (WiFi.status() != WL_CONNECTED || apiUrl.length() == 0 || deviceKey.length() == 0) return;
  HTTPClient manifestHttp;
  String manifestEndpoint = apiUrl + "/api/firmware/latest";
  WiFiClientSecure manifestClient;
  if (apiUrl.startsWith("https://")) {
    manifestClient.setInsecure();
    manifestHttp.begin(manifestClient, manifestEndpoint);
  } else {
    manifestHttp.begin(manifestEndpoint);
  }
  manifestHttp.addHeader("X-Device-Key", deviceKey);
  int status = manifestHttp.GET();
  if (status == 204) {
    manifestHttp.end();
    return;
  }
  if (status != 200) {
    Serial.printf("OTA manifiesto: HTTP %d\n", status);
    manifestHttp.end();
    return;
  }
  DynamicJsonDocument manifest(768);
  DeserializationError error = deserializeJson(manifest, manifestHttp.getString());
  manifestHttp.end();
  if (error) {
    Serial.println("OTA: manifiesto invalido.");
    return;
  }
  const char *availableVersion = manifest["version"] | "";
  const char *downloadPath = manifest["url"] | "";
  int expectedSize = manifest["tamano_bytes"] | 0;
  if (!isNewerVersion(availableVersion, FIRMWARE_VERSION) || downloadPath[0] == '\0' || expectedSize <= 0) return;

  HTTPClient firmwareHttp;
  String firmwareUrl = apiUrl + String(downloadPath);
  WiFiClientSecure firmwareClient;
  if (apiUrl.startsWith("https://")) {
    firmwareClient.setInsecure();
    firmwareHttp.begin(firmwareClient, firmwareUrl);
  } else {
    firmwareHttp.begin(firmwareUrl);
  }
  firmwareHttp.addHeader("X-Device-Key", deviceKey);
  int downloadStatus = firmwareHttp.GET();
  if (downloadStatus != 200) {
    Serial.printf("OTA descarga: HTTP %d\n", downloadStatus);
    firmwareHttp.end();
    return;
  }
  int contentLength = firmwareHttp.getSize();
  if (contentLength <= 0 || contentLength != expectedSize || !Update.begin(contentLength)) {
    Serial.println("OTA: tamaño inválido o espacio insuficiente.");
    firmwareHttp.end();
    return;
  }
  size_t written = Update.writeStream(firmwareHttp.getStream());
  bool completed = written == (size_t)contentLength && Update.end() && Update.isFinished();
  firmwareHttp.end();
  if (!completed) {
    Serial.printf("OTA fallo: %s\n", Update.errorString());
    Update.abort();
    return;
  }
  Serial.printf("OTA instalada: %s. Reiniciando...\n", availableVersion);
  delay(1000);
  ESP.restart();
}

String dateTimeText(const DateTime &value) {
  if (value.year() < 2024 || value.month() < 1 || value.month() > 12 || value.day() < 1 || value.day() > 31) {
    return dateTimeText(DateTime(F(__DATE__), F(__TIME__)));
  }
  char buffer[20];
  snprintf(buffer, sizeof(buffer), "%04d-%02d-%02d %02d:%02d:%02d", value.year(), value.month(), value.day(), value.hour(), value.minute(), value.second());
  return String(buffer);
}

int postReading(const String &payload) {
  if (WiFi.status() != WL_CONNECTED || apiUrl.length() == 0 || deviceKey.length() == 0) return 0;
  HTTPClient http;
  String endpoint = apiUrl + "/api/monitoreo/lecturas";
  WiFiClientSecure secureClient;
  if (apiUrl.startsWith("https://")) {
    secureClient.setInsecure();
    http.begin(secureClient, endpoint);
  } else {
    http.begin(endpoint);
  }
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", deviceKey);
  int status = http.POST(payload);
  Serial.printf("API lectura: HTTP %d\n", status);
  http.end();
  return status;
}

void queueReading(const String &payload) {
  if (!sdReady) return;
  File queue = SD.open(READING_QUEUE, FILE_APPEND);
  if (queue) {
    queue.println(payload);
    queue.close();
    Serial.println("Lectura guardada en la microSD: sin conexión con la API.");
  } else {
    Serial.println("Error: no se pudo abrir la cola de la microSD.");
  }
}

void flushReadingQueue() {
  if (!sdReady || !SD.exists(READING_QUEUE) || WiFi.status() != WL_CONNECTED) return;
  File source = SD.open(READING_QUEUE, FILE_READ);
  File pending = SD.open("/readings.tmp", FILE_WRITE);
  if (!source || !pending) return;
  bool failed = false;
  unsigned int sent = 0;
  unsigned int retained = 0;
  while (source.available()) {
    String payload = source.readStringUntil('\n');
    payload.trim();
    if (payload.length() == 0) continue;
    int status = postReading(payload);
    if (failed || status < 200 || status >= 300) {
      failed = true;
      pending.println(payload);
      retained++;
    } else {
      sent++;
    }
  }
  source.close();
  pending.close();
  SD.remove(READING_QUEUE);
  if (failed) SD.rename("/readings.tmp", READING_QUEUE);
  else SD.remove("/readings.tmp");
  Serial.printf("Cola microSD: %u enviadas, %u pendientes.\n", sent, retained);
}

bool readSensors(float &temperature, float &humidity, int &soil, float &lightLux) {
  temperature = 0.0f;
  humidity = 0.0f;
  soil = 0;
  lightLux = 0.0f;
  bool dhtReady = false;
  for (int attempt = 0; attempt < 3; attempt++) {
    temperature = dht.readTemperature();
    humidity = dht.readHumidity();
    if (!isnan(temperature) && !isnan(humidity) && temperature >= 0.0f && temperature <= 50.0f && humidity >= 0.0f && humidity <= 100.0f) {
      dhtReady = true;
      break;
    }
    delay(1500);
  }
  if (!dhtReady) {
    temperature = 0.0f;
    humidity = 0.0f;
    Serial.println("DHT22 no disponible: se enviaran sensores en cero.");
    return true;
  }

  int soilRaw = analogRead(SOIL_PIN);
  if (soilRaw > 0 && soilRaw < 4095) {
    soil = constrain(map(soilRaw, 4095, 0, 0, 100), 0, 100);
  }

  if (lightReady) {
    float measuredLight = lightMeter.readLightLevel();
    if (isfinite(measuredLight) && measuredLight >= 0.0f) lightLux = measuredLight;
  }
  return true;
}

void takeReading() {
  float temperature;
  float humidity;
  int soil;
  float lightLux;
  readSensors(temperature, humidity, soil, lightLux);
  if (!isfinite(temperature)) temperature = 0.0f;
  if (!isfinite(humidity)) humidity = 0.0f;
  if (!isfinite(lightLux) || lightLux < 0.0f) lightLux = 0.0f;
  String lightValue = String(lightLux, 1);
  String payload = "{\"fecha_lectura\":\"" + dateTimeText(rtc.now()) + "\",\"temperatura_c\":" + String(temperature, 1) + ",\"humedad_ambiente_pct\":" + String(humidity, 1) + ",\"humedad_suelo_pct\":" + String(soil) + ",\"intensidad_luz_lux\":" + lightValue + "}";
  int status = postReading(payload);
  if (status == 401) {
    Serial.println("API lectura: clave invalida; reprovisionando dispositivo.");
    deviceKey = "";
    preferences.putString("device_key", deviceKey);
    if (provisionDevice()) status = postReading(payload);
  }
  if (status < 200 || status >= 300) queueReading(payload);
  Serial.println(payload);
}

void setup() {
  Serial.begin(115200);
  pinMode(LED_PIN, OUTPUT);
  dht.begin();
  Wire.begin(21, 22);
  Wire.setClock(100000);
  bool rtcReady = rtc.begin();
  if (!rtcReady) Serial.println("RTC DS1307 no encontrado");
  scanI2C();
  lightReady = initializeLightSensor();
  if (!lightReady) Serial.println("BH1750 no disponible: la luz se enviara en cero.");
  if (rtcReady && !rtc.isrunning()) rtc.adjust(DateTime(F(__DATE__), F(__TIME__)));
  matrix.begin();
  matrix.setBrightness(255);
  matrix.fill(matrix.Color(255, 0, 0));
  matrix.show();
  pinMode(SD_CS, OUTPUT);
  digitalWrite(SD_CS, HIGH);
  SPI.begin(18, 19, 23, SD_CS);
  sdReady = SD.begin(SD_CS, SPI, 1000000);
  if (sdReady) {
    Serial.println("MicroSD lista: las lecturas podrán guardarse sin Wi-Fi.");
  } else {
    Serial.println("MicroSD no disponible: no se podrán guardar lecturas offline.");
  }
  configureConnection();
  if (deviceKey.length() == 0) provisionDevice();
  applyRemoteConfiguration();
  lastConfigurationCheck = millis();
  checkForFirmwareUpdate();
  lastOtaCheck = millis();
  takeReading();
  lastReading = millis();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) WiFi.reconnect();
  flushReadingQueue();
  if (millis() - lastReading >= READING_INTERVAL_MS) {
    lastReading = millis();
    takeReading();
  }
  if (millis() - lastConfigurationCheck >= CONFIG_INTERVAL_MS) {
    lastConfigurationCheck = millis();
    applyRemoteConfiguration();
  }
  if (millis() - lastOtaCheck >= OTA_INTERVAL_MS) {
    lastOtaCheck = millis();
    checkForFirmwareUpdate();
  }
  delay(1000);
}