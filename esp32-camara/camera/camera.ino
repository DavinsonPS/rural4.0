#include "esp_camera.h"
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <WiFiClient.h>
#include <WiFiManager.h>
#include <Preferences.h>
#include <SD_MMC.h>
#include <time.h>

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

const char *PENDING_PHOTO = "/pending.jpg";
const char *DEFAULT_API_URL = "https://rural40.ml-ware.com";
const char *SIMULATION_WIFI = "Wokwi-GUEST";
const char *DEFAULT_DEVICE_KEY = "160b61a64e0628f19a44e7841b02824ded012bdc77a2b649eb4e2433a5bd966b";
Preferences preferences;
String apiUrl;
String deviceKey;
int lastPhotoDay = -1;

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
  WiFi.mode(WIFI_STA);
  WiFi.begin(SIMULATION_WIFI, "");
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 10000) delay(250);
  if (WiFi.status() != WL_CONNECTED) manager.autoConnect("Rural40-Camera-Setup");
  apiUrl = String(apiParameter.getValue());
  deviceKey = String(keyParameter.getValue());
  apiUrl.trim();
  apiUrl.replace("/api/health/db", "");
  apiUrl.replace("/api/health", "");
  if (apiUrl.endsWith("/")) apiUrl.remove(apiUrl.length() - 1);
  preferences.putString("api_url", apiUrl);
  preferences.putString("device_key", deviceKey);
  configTime(-5 * 3600, 0, "pool.ntp.org", "time.nist.gov");
}

bool sendPhoto(const char *filePath) {
  if (WiFi.status() != WL_CONNECTED || apiUrl.length() == 0 || deviceKey.length() == 0) return false;
  int separator = apiUrl.indexOf("://");
  int hostStart = separator < 0 ? 0 : separator + 3;
  int pathStart = apiUrl.indexOf('/', hostStart);
  String hostPort = pathStart < 0 ? apiUrl.substring(hostStart) : apiUrl.substring(hostStart, pathStart);
  String basePath = pathStart < 0 ? "" : apiUrl.substring(pathStart);
  int port = apiUrl.startsWith("https://") ? 443 : 80;
  int portSeparator = hostPort.indexOf(':');
  if (portSeparator >= 0) {
    port = hostPort.substring(portSeparator + 1).toInt();
    hostPort = hostPort.substring(0, portSeparator);
  }

  File photo = SD_MMC.open(filePath, FILE_READ);
  if (!photo) return false;
  String boundary = "----Rural40Boundary7MA4YWxkTrZu0gW";
  String prefix = "--" + boundary + "\r\nContent-Disposition: form-data; name=\"foto\"; filename=\"plant.jpg\"\r\nContent-Type: image/jpeg\r\n\r\n";
  String suffix = "\r\n--" + boundary + "--\r\n";
  size_t contentLength = prefix.length() + photo.size() + suffix.length();
  WiFiClient plainClient;
  WiFiClientSecure secureClient;
  Client *client = &plainClient;
  if (apiUrl.startsWith("https://")) {
    secureClient.setInsecure();
    client = &secureClient;
  }
  if (!client->connect(hostPort.c_str(), port)) {
    photo.close();
    return false;
  }
  client->printf("POST %s/api/monitoreo/fotografias HTTP/1.1\r\n", basePath.c_str());
  client->printf("Host: %s\r\n", hostPort.c_str());
  client->printf("X-Device-Key: %s\r\n", deviceKey.c_str());
  client->printf("Content-Type: multipart/form-data; boundary=%s\r\n", boundary.c_str());
  client->printf("Content-Length: %u\r\nConnection: close\r\n\r\n", (unsigned)contentLength);
  client->print(prefix);
  uint8_t buffer[1024];
  while (photo.available()) client->write(buffer, photo.read(buffer, sizeof(buffer)));
  client->print(suffix);
  photo.close();
  unsigned long start = millis();
  while (!client->available() && millis() - start < 15000) delay(10);
  String status = client->readStringUntil('\n');
  client->stop();
  return status.indexOf(" 2") >= 0;
}

bool capturePhoto() {
  camera_fb_t *frame = esp_camera_fb_get();
  if (!frame) return false;
  File photo = SD_MMC.open(PENDING_PHOTO, FILE_WRITE);
  if (!photo) {
    esp_camera_fb_return(frame);
    return false;
  }
  photo.write(frame->buf, frame->len);
  photo.close();
  esp_camera_fb_return(frame);
  return true;
}

void photoSchedule() {
  struct tm currentTime;
  if (!getLocalTime(&currentTime, 1000)) return;
  if (currentTime.tm_hour != 8 || currentTime.tm_min != 0 || currentTime.tm_yday == lastPhotoDay) return;
  lastPhotoDay = currentTime.tm_yday;
  if (SD_MMC.exists(PENDING_PHOTO)) {
    if (!sendPhoto(PENDING_PHOTO)) return;
    SD_MMC.remove(PENDING_PHOTO);
  }
  if (capturePhoto() && sendPhoto(PENDING_PHOTO)) SD_MMC.remove(PENDING_PHOTO);
}

void setup() {
  Serial.begin(115200);
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
  config.frame_size = FRAMESIZE_UXGA;
  config.jpeg_quality = 10;
  config.fb_count = psramFound() ? 2 : 1;
  if (esp_camera_init(&config) != ESP_OK) return;
  if (!SD_MMC.begin("/sdcard", true)) Serial.println("SD de la cámara no disponible");
  configureConnection();
}

void loop() {
  photoSchedule();
  delay(1000);
}
