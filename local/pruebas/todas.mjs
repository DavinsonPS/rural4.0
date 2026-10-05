// Corre todas las pruebas de extremo a extremo contra el servidor local.
// Requisitos: docker compose -f local/docker-compose.yml up -d  y  cd src/backend && npm run dev
// Uso: node local/pruebas/todas.mjs
import plataforma from './plataforma.mjs';
import cuestionarios from './cuestionarios.mjs';
import admin from './admin.mjs';
import camara from './camara.mjs';
import { BASE } from './_lib.mjs';

try {
	await fetch(`${BASE}/api/health`);
} catch {
	console.error(`No responde ${BASE}. Levanta la base (Docker) y el servidor (npm run dev) primero.`);
	process.exit(1);
}

let failed = 0;
for (const suite of [plataforma, cuestionarios, admin, camara]) failed += await suite();
console.log(`\n${failed ? `❌ ${failed} comprobación(es) fallaron` : '✅ Todas las comprobaciones pasaron'}`);
process.exit(failed ? 1 : 0);
