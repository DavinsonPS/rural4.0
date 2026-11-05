# Storyboard — Retos diarios · Guardián natural

Formato: videos locales en loop y sin audio para las seis misiones del popup.

| # | Tiempo | Escena / cámara | Composición | Acción principal | Transición | Frames de revisión |
|---|---|---|---|---|---|---|
| 1 | Video local `videos/mision1.mp4` | Se reproduce dentro del escenario del popup, sin controles ni audio | El video ocupa la escena con un recorte superior del 10% | Ilustra la misión «Observa el color» | Se pausa al cerrar | Revisar en el popup |
| 2 | Video local `videos/mision2.mp4` | Se reproduce dentro del escenario del popup, sin controles ni audio | El video ocupa la escena con un recorte superior del 10% | Ilustra la misión «Revisa el compost» | Se pausa al cerrar | Revisar en el popup |
| 3 | Video local `videos/mision3.mp4` | Se reproduce dentro del escenario del popup, sin controles ni audio | El video ocupa la escena con un recorte superior del 10% | Ilustra la misión «Detecta visitantes» | Se pausa al cerrar | Revisar en el popup |
| 4 | Video local `videos/mision4.mp4` | Se reproduce dentro del escenario del popup, sin controles ni audio | El video ocupa la escena con un recorte superior del 10% | Ilustra la misión «Mide el crecimiento» | Se pausa al cerrar | Revisar en el popup |
| 5 | Video local `videos/mision5.mp4` | Se reproduce dentro del escenario del popup, sin controles ni audio | El video ocupa la escena con un recorte superior del 10% | Ilustra la misión «Cuida el riego» | Se pausa al cerrar | Revisar en el popup |
| 6 | Video local `videos/mision6.mp4` | Se reproduce dentro del escenario del popup, sin controles ni audio | El video ocupa la escena con un recorte superior del 10% | Ilustra la misión «Captura el avance» | Se pausa al cerrar | Revisar en el popup |

## Reglas compartidas

- Un único foco de lectura por escena.
- No se usan partículas, HUD ni decoración tecnológica.
- La escena permanece legible en el tamaño reducido del modal.
- `prefers-reduced-motion` muestra el primer fotograma y mantiene pausado el video.
- Si un video no se puede cargar o reproducir, el popup muestra un mensaje accesible.
- Todos los videos tienen el mismo recorte superior del 10%.
- La implementación reutiliza los IDs de reto existentes: `color`, `crecer`, `compost`, `riego`, `plagas`, `foto`.
