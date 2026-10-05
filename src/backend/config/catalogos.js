// Valores permitidos y umbrales compartidos por backend. Ajustar aquí, no en las rutas.
module.exports = {
	ROLES: {
		ESTUDIANTE: 'ESTUDIANTE',
		DOCENTE: 'DOCENTE',
		ADMINISTRADOR: 'ADMINISTRADOR',
	},
	LED_CONFIGURACIONES: ['suave', 'media', 'intensa', 'maxima'],
	LED_COLORES: ['rojo', 'verde', 'azul', 'blanco', 'amarillo', 'morado'],
	TIPOS_TIERRA: ['franca', 'arenosa', 'arcillosa', 'compost'],
	TIPOS_DISPOSITIVO: ['sensor', 'camara'],
	MODELO_CAMARA: 'ESP32-CAMERA',
	RETOS: ['color', 'crecer', 'compost', 'riego', 'plagas', 'foto'],
	TEMPERATURA_MIN: 0,
	TEMPERATURA_MAX: 50,
	// Lecturas devueltas en el historial: 7 días a una lectura cada 5 minutos.
	HISTORIAL_LECTURAS_LIMITE: 2016,
	// Solo se listan como pendientes los dispositivos provisionados hace menos de estas horas.
	PENDIENTES_VENTANA_HORAS: 24,
	SEMAFORO: {
		DIAS_SIN_BITACORA: 3,
		HUMEDAD_SUELO_MIN: 30,
		TEMPERATURA_MIN: 10,
		TEMPERATURA_MAX: 35,
		SENSOR_SIN_CONEXION_MIN: 30,
		CAMARA_SIN_CONEXION_MIN: 24 * 60,
		LECTURAS_EN_CERO_SEGUIDAS: 3,
		// Una lectura más vieja que esto no se usa para decidir si la planta está en riesgo.
		LECTURA_VIGENTE_MIN: 24 * 60,
	},
};
