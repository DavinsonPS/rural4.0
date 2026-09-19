const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version || '')) {
	console.error('Uso: node scripts/update-firmware-manifest.js 1.0.0');
	process.exit(1);
}

const firmwarePath = path.join(__dirname, '..', 'esp32-firmware', 'firmware.bin');
const manifestPath = path.join(__dirname, '..', 'esp32-firmware', 'manifest.json');
if (!fs.existsSync(firmwarePath)) {
	console.error(`No existe ${firmwarePath}`);
	process.exit(1);
}

const firmware = fs.readFileSync(firmwarePath);
const manifest = {
	version,
	sha256: crypto.createHash('sha256').update(firmware).digest('hex'),
	tamano_bytes: firmware.length,
	obligatoria: false,
};
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(`Manifest actualizado: ${version}, ${firmware.length} bytes, ${manifest.sha256}`);
