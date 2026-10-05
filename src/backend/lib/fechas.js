// La base de datos guarda fechas en hora de Colombia (NOW() del servidor MariaDB).
// Estas utilidades evitan mezclar UTC con hora local al construir DATETIME desde Node.
const TIME_ZONE = 'America/Bogota';

const formatter = new Intl.DateTimeFormat('en-CA', {
	timeZone: TIME_ZONE,
	year: 'numeric',
	month: '2-digit',
	day: '2-digit',
	hour: '2-digit',
	minute: '2-digit',
	second: '2-digit',
	hourCycle: 'h23',
});

function parts(date) {
	return Object.fromEntries(formatter.formatToParts(date).map(({ type, value }) => [type, value]));
}

function toColombiaDateTime(date = new Date()) {
	const value = parts(date);
	return `${value.year}-${value.month}-${value.day} ${value.hour}:${value.minute}:${value.second}`;
}

function toColombiaDate(date = new Date()) {
	return toColombiaDateTime(date).slice(0, 10);
}

// Acepta 'YYYY-MM-DD HH:MM:SS' tal cual (ya viene en hora local) o cualquier fecha
// interpretable por Date, que se convierte a hora de Colombia.
function toMysqlDateTime(value) {
	if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(String(value || ''))) return value;
	const parsedDate = value ? new Date(value) : new Date();
	if (Number.isNaN(parsedDate.getTime())) return null;
	return toColombiaDateTime(parsedDate);
}

module.exports = { toColombiaDateTime, toColombiaDate, toMysqlDateTime };
