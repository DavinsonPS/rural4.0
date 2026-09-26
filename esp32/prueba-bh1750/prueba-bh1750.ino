#include <Wire.h>
#include <BH1750.h>

const int SDA_PIN = 21;
const int SCL_PIN = 22;

BH1750 lightMeter;
uint8_t sensorAddress = 0;

void scanI2C() {
  Serial.println("Escaneo I2C:");

  byte found = 0;
  for (byte address = 1; address < 127; address++) {
    Wire.beginTransmission(address);
    byte error = Wire.endTransmission();

    if (error == 0) {
      Serial.printf("  Dispositivo encontrado en 0x%02X\n", address);
      found++;
    }
  }

  if (found == 0) {
    Serial.println("  No se encontraron dispositivos I2C.");
  }
}

bool initializeSensor() {
  if (lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE, 0x23, &Wire)) {
    sensorAddress = 0x23;
    return true;
  }

  if (lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE, 0x5C, &Wire)) {
    sensorAddress = 0x5C;
    return true;
  }

  return false;
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println();
  Serial.println("Prueba del sensor BH1750FVI");
  Serial.println("SDA/DAT: D21 | SCL: D22");

  Wire.begin(SDA_PIN, SCL_PIN);
  Wire.setClock(100000);
  scanI2C();

  if (!initializeSensor()) {
    Serial.println("BH1750 no encontrado.");
    Serial.println("Revisa VCC, GND, DAT->D21, SCL->D22 y ADDR.");
    return;
  }

  Serial.printf("BH1750 listo en 0x%02X.\n", sensorAddress);
}

void loop() {
  if (sensorAddress == 0) {
    delay(2000);
    return;
  }

  float lux = lightMeter.readLightLevel();

  if (lux < 0) {
    Serial.println("Error leyendo la luz.");
  } else {
    Serial.printf("Luz: %.2f lux\n", lux);
  }

  delay(1000);
}
