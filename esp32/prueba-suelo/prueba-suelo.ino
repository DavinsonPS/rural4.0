const int SOIL_PIN = 34;

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println();
  Serial.println("Prueba independiente del sensor de humedad del suelo");
  Serial.println("VCC -> 3V3 | GND -> GND | AO -> D34 | DO sin conectar");
}

void loop() {
  int rawValue = analogRead(SOIL_PIN);
  int humidityPercent = constrain(map(rawValue, 4095, 0, 0, 100), 0, 100);

  Serial.printf("Valor AO: %d | Humedad estimada: %d %%\n", rawValue, humidityPercent);
  delay(1000);
}
