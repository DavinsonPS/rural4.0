// Copia este archivo como config.h y completa la clave de provisión.
// config.h NO se sube a git (tiene la clave de provisión).
#pragma once

// Servidor de Rural 4.0 (igual que en el firmware de sensores).
#define RURAL_API_URL "https://rural40.ml-ware.com"

// Debe coincidir con DEVICE_PROVISIONING_KEY del .env del servidor.
// No es la api_key operativa: esa la entrega el servidor al provisionar.
#define RURAL_PROVISIONING_KEY "PEGA_AQUI_LA_CLAVE_DE_PROVISION"

// Versión del firmware de la cámara (formato X.Y.Z, la usa el control de OTA).
#define RURAL_FIRMWARE_VERSION "1.0.3"

// Frecuencia de fotos. 60 s es para PRUEBAS: produce ~1.440 fotos al día por cámara
// (~85 MB/día). Para uso real se recomienda 2 horas (7200000UL).
#define PHOTO_INTERVAL_MS 60000UL

// Cada cuánto se consulta si la cámara ya está vinculada a un proyecto.
#define CONFIG_INTERVAL_MS 60000UL

// OTA desactivado: huge_app.csv no tiene partición OTA.
#define ENABLE_OTA 0
#define OTA_INTERVAL_MS 3600000UL

// Máximo de fotos guardadas en la microSD cuando no hay conexión.
#define MAX_PENDING_PHOTOS 30
