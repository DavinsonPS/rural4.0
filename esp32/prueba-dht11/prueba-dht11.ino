#include <DHT.h>

#define DHT_PIN 15
#define DHT_TYPE DHT11

DHT dht(DHT_PIN, DHT_TYPE);

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println();
  Serial.println("Prueba independiente del DHT11");
  Serial.println("VCC -> 3V3 | DAT -> D15 | GND -> GND");
  dht.begin();
  delay(2000);
}

void loop() {
  float humidity = dht.readHumidity();
  float temperature = dht.readTemperature();

  Serial.printf("Lectura cruda: temperatura = %.2f C, humedad = %.2f %%\n", temperature, humidity);

  if (isnan(temperature) || isnan(humidity)) {
    Serial.println("ERROR: el DHT11 no entrego una lectura valida.");
  } else {
    Serial.println("DHT11 responde correctamente.");
  }

  delay(2500);
}
