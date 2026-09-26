# Conexiones aplicadas del ESP32

## Alimentacion

| Elemento | Conexion |
|---|---|
| Riel positivo de la protoboard | `3V3` del ESP32 |
| Riel negativo de la protoboard | Cualquier `GND` del ESP32 |
| Sensor BH1750 VCC | `3V3` |
| Sensor BH1750 GND | Cualquier `GND` |

Los dos pines `GND` del ESP32 son tierra comun. Se puede usar cualquiera.

## Sensor BH1750FVI

El modulo tiene los pines numerados y se conectan por etiqueta:

| Pin del sensor | Funcion | ESP32 |
|---:|---|---|
| 1 | `VCC` | `3V3` |
| 2 | `SCL` | `D22` / GPIO 22 |
| 3 | `DAT` | `D21` / GPIO 21 |
| 4 | `GND` | `GND` |
| 5 | `ADDR` | `GND` |

`DAT` equivale a `SDA`. Con `ADDR` conectado a `GND`, la direccion I2C esperada es `0x23`.

## Sensores del sketch principal

| Sensor | Alimentacion | Senal | Pin ESP32 |
|---|---|---|---:|
| DHT11 de 3 pines | `3V3` y `GND` | `DAT` | GPIO 15 |
| Sensor de humedad del suelo | `3V3` y `GND` | `AO` | GPIO 34 |
| Sensor de luz analogico | `3V3` y `GND` | `AO` | GPIO 35 |
| BH1750 | `3V3` y `GND` | `DAT/SDA` | GPIO 21 |
| BH1750 | `3V3` y `GND` | `SCL` | GPIO 22 |

## Regla de funcionamiento

Los sensores funcionan de forma independiente. Si el DHT11 falla, el programa envia temperatura y humedad en cero, pero continua leyendo el sensor de suelo y el BH1750.

La configuracion esta implementada en:

- `sketch/sketch.ino`
- `prueba-bh1750/prueba-bh1750.ino`

## Comprobacion del BH1750

En el monitor serial, configurado a `115200` baudios, debe aparecer algo similar a:

```text
BH1750 listo en 0x23.
Luz: 125.40 lux
```

## Precauciones

- Desconectar el USB antes de cambiar cables.
- No conectar el BH1750 a `VIN`; usar `3V3`.
- No intercambiar `SCL` y `DAT`.
- No conectar una salida analogica de sensor a `5V`.
- Mantener todos los `GND` unidos.
