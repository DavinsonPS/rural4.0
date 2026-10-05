// Rural 4.0 · Firmware de la ESP32-CAMERA (AI-Thinker ESP32-CAM)
//
// Misma metodología que el firmware de sensores:
//   - WiFiManager: si no hay red guardada abre el portal "Rural40-Camera-Setup" (192.168.4.1)
//     que solo pide el Wi-Fi; la URL del servidor viene en el firmware.
//   - Preferences "rural40": api_url y device_key guardados en la placa.
//   - Provisión automática (X-Provisioning-Key) si no hay device_key.
//   - GET /api/dispositivos/configuracion para saber si ya está vinculada a un proyecto.
//   - Fotos JPEG crudas a POST /api/monitoreo/fotografias con X-Device-Key.
//   - Cola en la microSD cuando no hay conexión, y OTA (desactivado con huge_app.csv).
//
// Botón IO0 (el del programador ESP32-CAM-MB) presionado al encender durante 3 s:
// borra el Wi-Fi guardado y la device_key (vuelve a abrir el portal y a provisionarse).

#include <Arduino.h>
#include "esp_camera.h"
#include "img_converters.h"
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <WiFiManager.h>
#include <Preferences.h>
#include <ArduinoJson.h>
#include <FS.h>
#include <SD_MMC.h>
#include <Update.h>
#include "config.h"

// Pines de la AI-Thinker ESP32-CAM
#define PWDN_GPIO_NUM 32
#define RESET_GPIO_NUM -1
#define XCLK_GPIO_NUM 0
#define SIOD_GPIO_NUM 26
#define SIOC_GPIO_NUM 27
#define Y9_GPIO_NUM 35
#define Y8_GPIO_NUM 34
#define Y7_GPIO_NUM 39
#define Y6_GPIO_NUM 36
#define Y5_GPIO_NUM 21
#define Y4_GPIO_NUM 19
#define Y3_GPIO_NUM 18
#define Y2_GPIO_NUM 5
#define VSYNC_GPIO_NUM 25
#define HREF_GPIO_NUM 23
#define PCLK_GPIO_NUM 22

#define FLASH_LED_PIN 4     // LED blanco de flash: se mantiene apagado
#define STATUS_LED_PIN 33   // LED rojo de la placa (activo en bajo)
#define RESET_BUTTON_PIN 0  // IO0

const char *PORTAL_NAME = "Rural40-Camera-Setup";
const char *DEVICE_MODEL = "ESP32-CAMERA";
const char *PENDING_DIRECTORY = "/pendientes";

Preferences preferences;
String apiUrl;
String deviceKey;
bool cameraReady = false;
// Algunos módulos no traen OV2640 y su sensor no genera JPEG: se captura en RGB565 y la
// placa lo convierte a JPEG antes de enviarlo.
bool softwareJpeg = false;
const int SOFTWARE_JPEG_QUALITY = 60;  // ~35 KB a 640x480: sube más rápido y alcanza para el timelapse

// Foto lista para enviar: o el buffer JPEG de la cámara, o uno convertido en la placa.
struct Photo {
  uint8_t *buffer = nullptr;
  size_t length = 0;
  camera_fb_t *frame = nullptr;  // se devuelve a la cámara al terminar
  bool ownsBuffer = false;       // true si hay que liberar el buffer convertido
};
bool sdReady = false;
bool linkedToProject = false;
int invalidKeyResponses = 0;
unsigned long lastPhoto = 0;
unsigned long lastConfigurationCheck = 0;
unsigned long lastOtaCheck = 0;
unsigned long lastProvisionAttempt = 0;
unsigned long lastReconnectAttempt = 0;
unsigned long lastPendingFlush = 0;

// --- Utilidades HTTP (igual que en el firmware de sensores) ---

void beginRequest(HTTPClient &http, WiFiClientSecure &secureClient, const String &endpoint) {
  if (apiUrl.startsWith("https://")) {
    secureClient.setInsecure();
    http.begin(secureClient, endpoint);
  } else {
    http.begin(endpoint);
  }
  http.setTimeout(20000);
}

void blinkStatus(int times) {
  for (int index = 0; index < times; index++) {
    digitalWrite(STATUS_LED_PIN, LOW);
    delay(120);
    digitalWrite(STATUS_LED_PIN, HIGH);
    delay(120);
  }
}

// --- Cámara ---

bool initializeCamera() {
  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM;
  config.pin_href = HREF_GPIO_NUM;
  config.pin_sscb_sda = SIOD_GPIO_NUM;
  config.pin_sscb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;
  // SVGA (800x600) con calidad 12: ~40-80 KB por foto, suficiente para ver la planta.
  config.frame_size = FRAMESIZE_SVGA;
  config.jpeg_quality = 12;
  config.fb_count = psramFound() ? 2 : 1;
  config.fb_location = psramFound() ? CAMERA_FB_IN_PSRAM : CAMERA_FB_IN_DRAM;
  config.grab_mode = CAMERA_GRAB_LATEST;
  esp_err_t result = esp_camera_init(&config);
  if (result == ESP_ERR_NOT_SUPPORTED) {
    // El sensor no genera JPEG (no es OV2640/OV3660/OV5640): se usa RGB565 a menor resolución.
    Serial.println("El sensor de esta camara no genera JPEG: se captura en RGB565 y se convierte en la placa.");
    esp_camera_deinit();
    config.pixel_format = PIXFORMAT_RGB565;
    config.frame_size = psramFound() ? FRAMESIZE_VGA : FRAMESIZE_QVGA;
    config.fb_count = 1;
    // Sensores como el GC2145 desbordan el DMA a 20 MHz en RGB565 (cam_hal: EV-EOF-OVF) y,
    // capturando sin parar, le quitan recursos al Wi-Fi: 10 MHz y captura solo bajo pedido.
    config.xclk_freq_hz = 10000000;
    config.grab_mode = CAMERA_GRAB_WHEN_EMPTY;
    result = esp_camera_init(&config);
    softwareJpeg = result == ESP_OK;
  }
  if (result != ESP_OK) {
    Serial.printf("Camara: error al iniciar (0x%x). Revisa el cable plano de la camara.\n", result);
    return false;
  }
  sensor_t *sensor = esp_camera_sensor_get();
  if (sensor) Serial.printf("Sensor de camara detectado: PID 0x%04x\n", sensor->id.PID);
  Serial.println(softwareJpeg ? (psramFound() ? "Camara lista (VGA 640x480, JPEG por software)." : "Camara lista (QVGA 320x240, JPEG por software).")
                              : "Camara lista (SVGA 800x600).");
  return true;
}

void releasePhoto(Photo &photo) {
  if (photo.frame) esp_camera_fb_return(photo.frame);
  if (photo.ownsBuffer && photo.buffer) free(photo.buffer);
  photo = Photo();
}

// La primera captura después de un rato suele salir con la exposición vieja: se descarta.
bool capturePhoto(Photo &photo) {
  camera_fb_t *frame = esp_camera_fb_get();
  if (frame) esp_camera_fb_return(frame);
  delay(150);
  frame = esp_camera_fb_get();
  if (!frame) {
    Serial.println("Camara: no se pudo capturar la foto.");
    return false;
  }
  if (!softwareJpeg) {
    photo.buffer = frame->buf;
    photo.length = frame->len;
    photo.frame = frame;
    return true;
  }
  uint8_t *jpeg = nullptr;
  size_t jpegLength = 0;
  bool converted = frame2jpg(frame, SOFTWARE_JPEG_QUALITY, &jpeg, &jpegLength);
  esp_camera_fb_return(frame);
  if (!converted || !jpeg) {
    Serial.println("Camara: no se pudo convertir la foto a JPEG.");
    return false;
  }
  photo.buffer = jpeg;
  photo.length = jpegLength;
  photo.ownsBuffer = true;
  return true;
}

// --- Conexión y provisión ---

void resetIfButtonHeld() {
  pinMode(RESET_BUTTON_PIN, INPUT_PULLUP);
  if (digitalRead(RESET_BUTTON_PIN) != LOW) return;
  Serial.println("IO0 presionado: manten 3 s para borrar Wi-Fi y clave...");
  unsigned long start = millis();
  while (digitalRead(RESET_BUTTON_PIN) == LOW && millis() - start < 3000) delay(50);
  if (millis() - start < 3000) return;
  WiFiManager manager;
  manager.resetSettings();
  preferences.begin("rural40", false);
  preferences.clear();
  preferences.end();
  Serial.println("Configuracion borrada. Reiniciando...");
  blinkStatus(5);
  ESP.restart();
}

void configureConnection() {
  preferences.begin("rural40", false);
  // La URL siempre es la compilada (como en el firmware de sensores, el portal no la pide).
  // Si la placa se provisionó contra otro servidor, su device_key será rechazada y se
  // provisiona de nuevo sola (ver checkConfiguration).
  apiUrl = RURAL_API_URL;
  if (preferences.getString("api_url", apiUrl) != apiUrl) {
    Serial.println("Servidor distinto al de la ultima vez: se descarta la clave anterior.");
    preferences.putString("device_key", "");
  }
  deviceKey = preferences.getString("device_key", "");
  WiFiManager manager;
  manager.setConnectTimeout(20);
  manager.setConfigPortalTimeout(300);
  WiFi.mode(WIFI_STA);
  Serial.printf("Conectando a Wi-Fi guardado o abriendo %s...\n", PORTAL_NAME);
  if (!manager.autoConnect(PORTAL_NAME)) {
    Serial.println("Sin Wi-Fi configurado. Reiniciando para volver a abrir el portal...");
    delay(3000);
    ESP.restart();
  }
  Serial.print("Wi-Fi conectado. IP: ");
  Serial.println(WiFi.localIP());
  Serial.printf("Señal Wi-Fi: %d dBm (%s)\n", WiFi.RSSI(), WiFi.RSSI() > -67 ? "buena" : WiFi.RSSI() > -78 ? "regular" : "debil: acerca la camara al router");
  // Sin ahorro de energía del Wi-Fi: con la cámara, el modo de ahorro corta los envíos largos.
  WiFi.setSleep(false);
  apiUrl.trim();
  if (apiUrl.endsWith("/")) apiUrl.remove(apiUrl.length() - 1);
  preferences.putString("api_url", apiUrl);
}

String internalCode() {
  // CAM- + últimos 4 bytes de la MAC, p. ej. CAM-A97573EC (mismo formato que ya usa el sistema).
  String mac = WiFi.macAddress();
  mac.replace(":", "");
  return "CAM-" + mac.substring(mac.length() - 8);
}

bool provisionDevice() {
  if (WiFi.status() != WL_CONNECTED || apiUrl.length() == 0) return false;
  lastProvisionAttempt = millis();
  String macAddress = WiFi.macAddress();
  String serial = String((uint32_t)(ESP.getEfuseMac() >> 32), HEX) + String((uint32_t)ESP.getEfuseMac(), HEX);

  HTTPClient http;
  WiFiClientSecure secureClient;
  beginRequest(http, secureClient, apiUrl + "/api/dispositivos/provisionar");
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Provisioning-Key", RURAL_PROVISIONING_KEY);
  DynamicJsonDocument request(256);
  request["codigo_interno"] = internalCode();
  request["mac_address"] = macAddress;
  request["serial"] = serial;
  request["modelo"] = DEVICE_MODEL;
  request["version_firmware"] = RURAL_FIRMWARE_VERSION;
  String payload;
  serializeJson(request, payload);
  int status = http.POST(payload);
  if (status != 200 && status != 201) {
    Serial.printf("API provision: HTTP %d%s\n", status, status == 403 ? " (dispositivo desactivado por el administrador)" : status == 401 ? " (revisa RURAL_PROVISIONING_KEY)" : "");
    http.end();
    return false;
  }
  DynamicJsonDocument document(512);
  DeserializationError error = deserializeJson(document, http.getString());
  http.end();
  if (error || !document["api_key"].is<const char *>()) {
    Serial.println("Respuesta de provision invalida.");
    return false;
  }
  deviceKey = String(document["api_key"].as<const char *>());
  preferences.putString("device_key", deviceKey);
  invalidKeyResponses = 0;
  Serial.println("Dispositivo provisionado. API key guardada localmente.");
  Serial.println("==============================================");
  Serial.printf("  Codigo interno:     %s\n", document["codigo_interno"] | internalCode().c_str());
  Serial.printf("  Codigo vinculacion: %s\n", document["codigo_vinculacion"] | "(ya vinculada)");
  Serial.println("  Vinculala en el dashboard como ESP32-CAMERA.");
  Serial.println("==============================================");
  blinkStatus(3);
  return true;
}

// Consulta si la cámara ya está vinculada a un proyecto (proyecto_id distinto de null).
void checkConfiguration() {
  if (WiFi.status() != WL_CONNECTED || deviceKey.length() == 0) return;
  HTTPClient http;
  WiFiClientSecure secureClient;
  beginRequest(http, secureClient, apiUrl + "/api/dispositivos/configuracion");
  http.addHeader("X-Device-Key", deviceKey);
  int status = http.GET();
  if (status == 200) {
    invalidKeyResponses = 0;
    DynamicJsonDocument document(512);
    if (!deserializeJson(document, http.getString())) {
      bool wasLinked = linkedToProject;
      linkedToProject = !document["proyecto_id"].isNull();
      if (linkedToProject && !wasLinked) Serial.printf("Vinculada al proyecto \"%s\". Empiezan las fotos.\n", document["nombre_proyecto"] | "");
      if (!linkedToProject) Serial.println("Esperando vinculacion en el dashboard (Vincular dispositivo > ESP32-CAMERA).");
    }
  } else if (status == 401) {
    // Clave rechazada: se reemplazó (p. ej. "Reconocer ESP32" en el dashboard) o se desactivó.
    invalidKeyResponses++;
    Serial.printf("API configuracion: clave rechazada (%d/3).\n", invalidKeyResponses);
    if (invalidKeyResponses >= 3) {
      Serial.println("Se descarta la clave guardada y se vuelve a provisionar.");
      deviceKey = "";
      preferences.putString("device_key", "");
      linkedToProject = false;
    }
  } else if (status > 0) {
    Serial.printf("API configuracion: HTTP %d\n", status);
  }
  http.end();
}

// --- Envío de fotos ---

// La foto se sube escribiendo por partes: HTTPClient se rinde si la red no acepta los ~40-60 KB
// de una vez (señal débil o alimentación justa) y corta con "Failed to send chunk".
// Devuelve el código HTTP, -1 si no pudo conectar, -3 si el envío se cortó y -4 si no hubo respuesta.
int sendPhoto(const uint8_t *buffer, size_t length) {
  if (WiFi.status() != WL_CONNECTED || deviceKey.length() == 0) return -1;
  bool https = apiUrl.startsWith("https://");
  String rest = apiUrl.substring(apiUrl.indexOf("://") + 3);
  int slash = rest.indexOf('/');
  String hostPort = slash < 0 ? rest : rest.substring(0, slash);
  String basePath = slash < 0 ? "" : rest.substring(slash);
  String host = hostPort;
  uint16_t port = https ? 443 : 80;
  int colon = hostPort.indexOf(':');
  if (colon >= 0) {
    host = hostPort.substring(0, colon);
    port = hostPort.substring(colon + 1).toInt();
  }

  WiFiClient plainClient;
  WiFiClientSecure secureClient;
  Client *client = &plainClient;
  if (https) {
    secureClient.setInsecure();
    client = &secureClient;
  }
  if (!client->connect(host.c_str(), port)) {
    Serial.printf("API foto: no se pudo conectar a %s:%u (señal %d dBm)\n", host.c_str(), port, WiFi.RSSI());
    return -1;
  }
  client->printf("POST %s/api/monitoreo/fotografias HTTP/1.1\r\n", basePath.c_str());
  client->printf("Host: %s\r\n", hostPort.c_str());
  client->printf("X-Device-Key: %s\r\n", deviceKey.c_str());
  client->print("Content-Type: image/jpeg\r\n");
  client->printf("Content-Length: %u\r\n", (unsigned)length);
  client->print("Connection: close\r\n\r\n");

  size_t sent = 0;
  unsigned long lastProgress = millis();
  while (sent < length) {
    size_t chunk = length - sent < 1024 ? length - sent : 1024;
    size_t written = client->write(buffer + sent, chunk);
    if (written > 0) {
      sent += written;
      lastProgress = millis();
    } else if (!client->connected() || millis() - lastProgress > 15000) {
      Serial.printf("API foto: envio cortado en %u de %u bytes (señal %d dBm)\n", (unsigned)sent, (unsigned)length, WiFi.RSSI());
      client->stop();
      return -3;
    } else {
      delay(20);
    }
  }

  unsigned long waitStart = millis();
  while (!client->available() && client->connected() && millis() - waitStart < 20000) delay(20);
  String statusLine = client->readStringUntil('\n');
  client->stop();
  int firstSpace = statusLine.indexOf(' ');
  int status = firstSpace > 0 ? statusLine.substring(firstSpace + 1, firstSpace + 4).toInt() : -4;
  if (status <= 0) status = -4;
  Serial.printf("API foto (%u bytes): HTTP %d · señal %d dBm\n", (unsigned)length, status, WiFi.RSSI());
  return status;
}

// --- Cola en la microSD (fotos tomadas sin conexión) ---

void initializeStorage() {
  // Modo de 1 bit: deja libre el GPIO4 (flash) y evita que el LED se encienda al escribir.
  sdReady = SD_MMC.begin("/sdcard", true);
  if (!sdReady) {
    Serial.println("MicroSD no disponible: las fotos sin conexion se perderan.");
    return;
  }
  if (!SD_MMC.exists(PENDING_DIRECTORY)) SD_MMC.mkdir(PENDING_DIRECTORY);
  Serial.println("MicroSD lista: las fotos sin conexion se guardan y se envian despues.");
}

int countPending() {
  if (!sdReady) return 0;
  File directory = SD_MMC.open(PENDING_DIRECTORY);
  int count = 0;
  for (File entry = directory.openNextFile(); entry; entry = directory.openNextFile()) {
    count++;
    entry.close();
  }
  directory.close();
  return count;
}

void queuePhoto(const Photo &photo) {
  if (!sdReady) return;
  if (countPending() >= MAX_PENDING_PHOTOS) {
    Serial.println("Cola de la microSD llena: la foto se descarta.");
    return;
  }
  String path = String(PENDING_DIRECTORY) + "/" + String(millis()) + ".jpg";
  File file = SD_MMC.open(path, FILE_WRITE);
  if (!file) return;
  file.write(photo.buffer, photo.length);
  file.close();
  Serial.printf("Foto guardada en la microSD (%d pendientes).\n", countPending());
}

void flushPendingPhotos() {
  if (!sdReady || !linkedToProject || WiFi.status() != WL_CONNECTED) return;
  File directory = SD_MMC.open(PENDING_DIRECTORY);
  if (!directory) return;
  for (File entry = directory.openNextFile(); entry; entry = directory.openNextFile()) {
    String path = String(PENDING_DIRECTORY) + "/" + String(entry.name()).substring(String(entry.name()).lastIndexOf('/') + 1);
    size_t length = entry.size();
    uint8_t *buffer = (uint8_t *)(psramFound() ? ps_malloc(length) : malloc(length));
    if (!buffer) {
      entry.close();
      break;
    }
    entry.read(buffer, length);
    entry.close();
    int status = sendPhoto(buffer, length);
    free(buffer);
    if (status == 201 || status == 400 || status == 413) {
      SD_MMC.remove(path);  // enviada, o inválida: no se reintenta
    } else {
      break;  // sin conexión o no autorizada: se reintenta en el próximo ciclo
    }
  }
  directory.close();
}

void takeAndSendPhoto() {
  if (!cameraReady) {
    Serial.println("Foto omitida: la camara no se inicio.");
    return;
  }
  Photo photo;
  if (!capturePhoto(photo)) return;
  int status = sendPhoto(photo.buffer, photo.length);
  if (status < 0) {
    // Error de red (conexión o envío cortado): se reintenta una vez antes de guardarla.
    delay(2000);
    status = sendPhoto(photo.buffer, photo.length);
  }
  if (status == 201) {
    blinkStatus(1);
  } else if (status == 403) {
    Serial.println("La clave pertenece a un ESP32 de sensores o el dispositivo no es una camara vinculada.");
  } else if (status == 401) {
    linkedToProject = false;
  } else if (status < 0 || status >= 500) {
    queuePhoto(photo);
  }
  releasePhoto(photo);
}

// --- OTA (mismo mecanismo que el sensor; requiere una tabla de particiones con OTA) ---

#if ENABLE_OTA
bool isNewerVersion(const char *available, const char *installed) {
  int availableMajor, availableMinor, availablePatch, installedMajor, installedMinor, installedPatch;
  if (sscanf(available, "%d.%d.%d", &availableMajor, &availableMinor, &availablePatch) != 3) return false;
  if (sscanf(installed, "%d.%d.%d", &installedMajor, &installedMinor, &installedPatch) != 3) return false;
  if (availableMajor != installedMajor) return availableMajor > installedMajor;
  if (availableMinor != installedMinor) return availableMinor > installedMinor;
  return availablePatch > installedPatch;
}

void checkForFirmwareUpdate() {
  if (WiFi.status() != WL_CONNECTED || deviceKey.length() == 0) return;
  HTTPClient manifestHttp;
  WiFiClientSecure manifestClient;
  beginRequest(manifestHttp, manifestClient, apiUrl + "/api/firmware/latest");
  manifestHttp.addHeader("X-Device-Key", deviceKey);
  int status = manifestHttp.GET();
  if (status != 200) {
    if (status != 204) Serial.printf("OTA manifiesto: HTTP %d\n", status);
    manifestHttp.end();
    return;
  }
  DynamicJsonDocument manifest(768);
  DeserializationError error = deserializeJson(manifest, manifestHttp.getString());
  manifestHttp.end();
  if (error) return;
  const char *availableVersion = manifest["version"] | "";
  const char *downloadPath = manifest["url"] | "";
  int expectedSize = manifest["tamano_bytes"] | 0;
  if (!isNewerVersion(availableVersion, RURAL_FIRMWARE_VERSION) || downloadPath[0] == '\0' || expectedSize <= 0) return;
  HTTPClient firmwareHttp;
  WiFiClientSecure firmwareClient;
  beginRequest(firmwareHttp, firmwareClient, apiUrl + String(downloadPath));
  firmwareHttp.addHeader("X-Device-Key", deviceKey);
  if (firmwareHttp.GET() != 200) {
    firmwareHttp.end();
    return;
  }
  int contentLength = firmwareHttp.getSize();
  if (contentLength <= 0 || contentLength != expectedSize || !Update.begin(contentLength)) {
    Serial.println("OTA: tamaño invalido o sin particion OTA.");
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
#endif

// --- Programa principal ---

void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.printf("\nRural 4.0 · ESP32-CAMERA · firmware %s\n", RURAL_FIRMWARE_VERSION);
  pinMode(FLASH_LED_PIN, OUTPUT);
  digitalWrite(FLASH_LED_PIN, LOW);
  pinMode(STATUS_LED_PIN, OUTPUT);
  digitalWrite(STATUS_LED_PIN, HIGH);

  resetIfButtonHeld();          // antes de iniciar la cámara: IO0 también es XCLK
  cameraReady = initializeCamera();
  initializeStorage();
  configureConnection();
  if (deviceKey.length() == 0) provisionDevice();
  checkConfiguration();
  lastConfigurationCheck = millis();
#if ENABLE_OTA
  checkForFirmwareUpdate();
  lastOtaCheck = millis();
#endif
  if (linkedToProject) takeAndSendPhoto();
  lastPhoto = millis();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    if (millis() - lastReconnectAttempt >= 10000UL) {
      lastReconnectAttempt = millis();
      WiFi.reconnect();
    }
  }
  if (deviceKey.length() == 0 && millis() - lastProvisionAttempt >= 60000UL) {
    provisionDevice();
  }
  if (millis() - lastConfigurationCheck >= CONFIG_INTERVAL_MS) {
    lastConfigurationCheck = millis();
    bool wasLinked = linkedToProject;
    checkConfiguration();
    // Recién vinculada: primera foto de inmediato, sin esperar el intervalo completo.
    if (linkedToProject && !wasLinked) {
      takeAndSendPhoto();
      lastPhoto = millis();
    }
  }
  if (millis() - lastPhoto >= PHOTO_INTERVAL_MS) {
    lastPhoto = millis();
    if (linkedToProject) takeAndSendPhoto();
  }
  if (millis() - lastPendingFlush >= 30000UL) {
    lastPendingFlush = millis();
    flushPendingPhotos();
  }
#if ENABLE_OTA
  if (millis() - lastOtaCheck >= OTA_INTERVAL_MS) {
    lastOtaCheck = millis();
    checkForFirmwareUpdate();
  }
#endif
  delay(500);
}
