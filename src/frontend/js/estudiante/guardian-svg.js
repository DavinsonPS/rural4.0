// Dibujo vectorial de Guardián, la mascota de Rural 4.0. Las partes que se animan tienen
// clase propia (gd-eyes, gd-antenna, gd-mouth-*) y el ánimo se cambia con data-mood en
// el contenedor: normal, feliz, preocupado, confundido, celebrando, dormido.

// Contorno "peludito": elipse con festones curvos (cada mechón es una curva cuadrática
// cuyo punto de control sobresale del borde).
function fuzzyPath(cx, cy, rx, ry, bumps, amplitude, rotation = 0) {
	const point = (angle, scale) => [cx + Math.cos(angle) * rx * scale, cy + Math.sin(angle) * ry * scale];
	const format = ([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`;
	const step = (Math.PI * 2) / bumps;
	let path = `M ${format(point(rotation, 1))}`;
	for (let index = 0; index < bumps; index += 1) {
		const start = rotation + index * step;
		path += ` Q ${format(point(start + step / 2, 1 + amplitude * 2.2))} ${format(point(start + step, 1))}`;
	}
	return `${path} Z`;
}

export function guardianSvg() {
	const body = fuzzyPath(100, 150, 46, 46, 28, 0.035);
	const head = fuzzyPath(100, 82, 58, 50, 34, 0.035, 0.2);
	const leftArm = fuzzyPath(52, 152, 13, 26, 8, 0.1);
	const rightArm = fuzzyPath(148, 138, 12, 24, 8, 0.1);
	return `<svg class="gd-svg" viewBox="0 0 200 230" role="img" aria-label="Guardián, la mascota de Rural 4.0">
	<defs>
		<radialGradient id="gd-fur" cx="40%" cy="30%" r="75%"><stop offset="0%" stop-color="#9fd65f"/><stop offset="70%" stop-color="#6fb33b"/><stop offset="100%" stop-color="#57952b"/></radialGradient>
		<radialGradient id="gd-glow" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#d9fff6"/><stop offset="100%" stop-color="#5cc9b0"/></radialGradient>
	</defs>
	<ellipse class="gd-shadow" cx="100" cy="220" rx="52" ry="7" fill="#1f2d1a" opacity=".15"/>
	<g class="gd-body">
		<rect x="74" y="182" width="20" height="30" rx="10" fill="#5f9f31"/>
		<rect x="106" y="182" width="20" height="30" rx="10" fill="#5f9f31"/>
		<path d="${leftArm}" fill="url(#gd-fur)" stroke="#3f7a22" stroke-width="2"/>
		<g class="gd-arm-right"><path d="${rightArm}" fill="url(#gd-fur)" stroke="#3f7a22" stroke-width="2"/>
			<path class="gd-leaf" d="M150 112 C 160 92, 180 92, 184 100 C 176 104, 166 112, 150 112 Z" fill="#8fd14f" stroke="#3f7a22" stroke-width="2"/>
			<path d="M152 111 L 178 99" stroke="#3f7a22" stroke-width="1.4" fill="none"/></g>
		<path d="${body}" fill="url(#gd-fur)" stroke="#3f7a22" stroke-width="2.4"/>
		<g class="gd-board">
			<path d="M70 132 C 56 128, 50 142, 56 150" stroke="#e8674a" stroke-width="3" fill="none" stroke-linecap="round"/>
			<path d="M130 130 C 146 122, 150 112, 148 104" stroke="#3aa0e6" stroke-width="3" fill="none" stroke-linecap="round"/>
			<path d="M128 136 C 144 132, 152 122, 152 112" stroke="#f2c230" stroke-width="3" fill="none" stroke-linecap="round"/>
			<rect x="68" y="126" width="64" height="48" rx="5" fill="#2e8a74" stroke="#1d5a4c" stroke-width="2"/>
			<rect x="92" y="140" width="18" height="18" rx="2" fill="#1f2d2a"/>
			${[0, 1, 2, 3, 4, 5].map((index) => `<rect x="${73 + index * 9}" y="129" width="5" height="3" fill="#cfe9df"/>`).join('')}
			${[0, 1, 2, 3, 4, 5].map((index) => `<rect x="${73 + index * 9}" y="168" width="5" height="3" fill="#cfe9df"/>`).join('')}
			<circle class="gd-led" cx="122" cy="146" r="3" fill="#8dff7a"/>
			<rect x="74" y="146" width="10" height="8" rx="1" fill="#b9c7c3"/>
		</g>
	</g>
	<g class="gd-head">
		<g class="gd-antenna gd-antenna-left"><path d="M84 40 C 80 24, 74 16, 70 10" stroke="#2f6b1c" stroke-width="4" fill="none" stroke-linecap="round"/><circle cx="69" cy="8" r="6" fill="url(#gd-glow)" stroke="#2f6b1c" stroke-width="2"/></g>
		<g class="gd-antenna gd-antenna-right"><path d="M116 40 C 120 24, 126 16, 130 10" stroke="#2f6b1c" stroke-width="4" fill="none" stroke-linecap="round"/><circle cx="131" cy="8" r="6" fill="url(#gd-glow)" stroke="#2f6b1c" stroke-width="2"/></g>
		<path d="${head}" fill="url(#gd-fur)" stroke="#3f7a22" stroke-width="2.4"/>
		<path class="gd-tuft" d="M86 36 C 84 24, 94 20, 98 28 C 100 18, 112 20, 110 32 C 118 26, 124 34, 116 40 C 106 34, 94 34, 86 36 Z" fill="#7cc043" stroke="#3f7a22" stroke-width="2" stroke-linejoin="round"/>
		<path d="M78 46 C 88 38, 104 38, 116 46" stroke="#9fd65f" stroke-width="5" fill="none" stroke-linecap="round" opacity=".6"/>
		<g class="gd-brows gd-brows-worried"><path d="M70 69 L 88 63" stroke="#2f5a1a" stroke-width="3.2" stroke-linecap="round"/><path d="M130 69 L 112 63" stroke="#2f5a1a" stroke-width="3.2" stroke-linecap="round"/></g>
		<g class="gd-brows gd-brows-confused"><path d="M70 62 C 76 58, 84 58, 90 62" stroke="#2f5a1a" stroke-width="3.2" fill="none" stroke-linecap="round"/><path d="M112 68 L 130 68" stroke="#2f5a1a" stroke-width="3.2" stroke-linecap="round"/></g>
		<g class="gd-eyes">
			<ellipse cx="80" cy="82" rx="10" ry="12" fill="#1c2618"/><circle cx="83.5" cy="77" r="3.6" fill="#fff"/><circle cx="77" cy="87" r="1.6" fill="#fff" opacity=".8"/>
			<ellipse cx="120" cy="82" rx="10" ry="12" fill="#1c2618"/><circle cx="123.5" cy="77" r="3.6" fill="#fff"/><circle cx="117" cy="87" r="1.6" fill="#fff" opacity=".8"/>
		</g>
		<g class="gd-eyes-closed"><path d="M70 84 C 75 89, 85 89, 90 84" stroke="#1c2618" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M110 84 C 115 89, 125 89, 130 84" stroke="#1c2618" stroke-width="3" fill="none" stroke-linecap="round"/></g>
		<ellipse cx="66" cy="100" rx="8" ry="5" fill="#f28c8c" opacity=".55"/>
		<ellipse cx="134" cy="100" rx="8" ry="5" fill="#f28c8c" opacity=".55"/>
		<path class="gd-mouth gd-mouth-smile" d="M90 101 C 95 108, 105 108, 110 101" stroke="#1c2618" stroke-width="3" fill="none" stroke-linecap="round"/>
		<path class="gd-mouth gd-mouth-open" d="M88 100 C 92 114, 108 114, 112 100 Z" fill="#6b1f1f" stroke="#1c2618" stroke-width="2.4" stroke-linejoin="round"/>
		<path class="gd-mouth gd-mouth-worried" d="M90 108 C 95 101, 105 101, 110 108" stroke="#1c2618" stroke-width="3" fill="none" stroke-linecap="round"/>
		<ellipse class="gd-mouth gd-mouth-o" cx="100" cy="105" rx="4.5" ry="5.5" fill="#6b1f1f" stroke="#1c2618" stroke-width="2"/>
		<path class="gd-mouth gd-mouth-sleep" d="M93 104 L 107 104" stroke="#1c2618" stroke-width="3" stroke-linecap="round"/>
	</g>
	<g class="gd-sparkles" fill="#f2c230"><path d="M30 60 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3z"/><path d="M168 40 l2 6 6 2 -6 2 -2 6 -2 -6 -6 -2 6 -2z"/><path d="M176 160 l2 6 6 2 -6 2 -2 6 -2 -6 -6 -2 6 -2z"/></g>
	<g class="gd-zzz" fill="#205b66" font-family="DM Sans, sans-serif" font-weight="700"><text x="150" y="50" font-size="16">z</text><text x="162" y="34" font-size="20">z</text><text x="176" y="16" font-size="24">Z</text></g>
	<g class="gd-question" fill="#205b66" font-family="DM Sans, sans-serif" font-weight="700"><text x="156" y="44" font-size="30">?</text></g>
</svg>`;
}
