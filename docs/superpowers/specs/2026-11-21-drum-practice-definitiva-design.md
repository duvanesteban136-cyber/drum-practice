# Drum Practice — versión definitiva (documento de diseño)

Fecha: 2026-11-21 · Estado: **aprobado por el usuario** (2026-11-21)

**Respuestas del usuario al aprobar:**
- **Alcance:** todo el plan.
- **Look:** **rediseño visual nuevo**, a partir de imágenes de referencia que el usuario enviará. El mundo visual se define con impeccable (`init` + new-work) cuando lleguen. Hasta entonces se construye todo lo que no depende del look: datos, sincronización, motor, lógica de sesión y pruebas.
- **Datos:** **empezar limpio**. No se migran los datos v3. Solo se borran las claves `sb-*` de la sesión vieja de Supabase, que provocan la pantalla negra. Las demás claves viejas se ignoran.
- **Pruebas en dispositivo:** el usuario prueba en su iPhone/iPad al final. Mientras tanto, las verificaciones de WebKit/iOS se hacen en el simulador de iOS (Safari) y en el navegador.

## 1. Intención

App personal para practicar batería. Se usa en iPhone o iPad sobre un atril a ~1 m del banco (manos ocupadas con baquetas, a menudo con poca luz) y en Mac para organizar. Tiene que:

1. Funcionar sin internet y abrir directo a tocar (sin login ni esperas).
2. Sincronizar los datos entre celular, iPad y Mac.
3. Hacer exactamente lo que cada modo promete (hoy varios modos no lo hacen).
4. Registrar progreso real: minutos practicados y BPM por ejercicio.

## 2. Estado actual verificado

- El proyecto Supabase original (`jsmdxlrduukvshrppiit`) fue eliminado: login, sincronización y subidas de archivos están muertos.
- La app publicada real es **https://drum-practice.vercel.app** (CI de GitHub Actions al hacer push a `main`). `drum-practice-duvan.vercel.app` (la URL del CLAUDE.md) sirve un build viejo anterior a la sincronización.
- Calidad de código: 31 errores de lint; bundle JS de 523 KB (recharts, tone y lucide instalados sin usarse).
- Bugs confirmados en navegador y en código (lista completa en §12):
  - Un ejercicio de 20 s dura 60 s (la sesión lee `duration`, el formulario guarda `durationSeconds`).
  - La sesión ignora `currentBPM`, la rampa (`bpmStart/bpmEnd`), los escalones y toda la configuración de metrónomo del ejercicio.
  - "Iniciar rutina" solo ejecuta los bloques de ejercicio: ignora calentamiento, descansos, fills y canciones.
  - Pausar reinicia la cuenta regresiva del ejercicio; el calentamiento cuenta un compás de menos; hay un descanso después del último ejercicio.
  - Gap, Speed y Poly se apagan al cerrar su panel, así que solo funcionan con el panel tapando la pantalla.
  - Las canciones guardadas no se reproducen (el botón de play retorna sin hacer nada si no se eligió un archivo en ese momento).
  - Las fechas usan UTC: después de las 7 p. m. en Colombia la práctica queda registrada al día siguiente y rompe la racha.
  - Categorías y plan semanal no tienen interfaz; "Rutina de hoy" y los puntos de la semana no reflejan nada real.
  - La sesión sobrescribe la configuración del metrónomo libre (al salir queda con el BPM del último ejercicio).
  - Íconos rotos (semicorchea U+1D161 y el símbolo `metronome` no existen en las fuentes cargadas).
  - En iPad el botón flotante del Vault queda en medio de la pantalla (los `position: fixed` quedan relativos a un contenedor con `transform`).
  - El toast y la sesión guiada quedan bajo el notch y el indicador de inicio en el iPhone instalado.

## 3. Objetivos, no-objetivos y anti-objetivos

**Objetivos**
- Cada modo funciona según la especificación de §6 y está cubierto por pruebas.
- Sincronización confiable sin login, alojada en el proyecto Supabase `ipuc-trinidad` con consumo mínimo.
- Legible y operable a 1 m: cifras grandes, controles grandes en la zona del pulgar, atajos de teclado y pedal.
- Los datos que ya existen en cada dispositivo se migran sin pérdida.

**No-objetivos (por ahora)**: cuentas o varios usuarios, compartir con otros, MIDI, grabarse, separación de pistas, editor de notación, notificaciones.

**Anti-objetivos (sería un fracaso aunque "funcione")**
- Perder datos del usuario (en la migración o en la sincronización).
- Un click que deriva, se corta o reinicia el compás al cambiar un ajuste.
- Paneles que tapan el pulso mientras se toca.
- Login o spinner antes de poder tocar.
- Afectar el proyecto `ipuc-trinidad`: sus tablas, su autenticación, su configuración o su cuota.

## 4. Restricciones

- React 19 + Vite, JavaScript, PWA en Vercel. Cada cambio se publica con commit + push a `main` (CLAUDE.md).
- Supabase `ipuc-trinidad` (18 MB usados de 500 MB): solo se agregan tablas `drum_*` y el esquema no expuesto `drum_private`. Todo con RLS. Huella objetivo por debajo de 20 MB.
- iOS Safari: el AudioContext solo arranca tras un gesto; hay que saltarse el interruptor de silencio; Wake Lock funciona en apps instaladas desde iOS 18.4; Safari puede borrar datos de sitios no instalados tras 7 días sin uso (por eso: invitar a instalar y pedir `navigator.storage.persist()`).
- Sin backend propio: el navegador habla directo con la API REST de Supabase.

## 5. Enfoques considerados (sincronización)

| Enfoque | A favor | En contra |
|---|---|---|
| **A. Tablas aisladas en `ipuc-trinidad` + código de sincronización** (elegido por el usuario) | Gratis, sin login, app instalable, offline; lo configuro todo | Depende de un proyecto compartido; un proyecto gratis se pausa tras 7 días sin actividad |
| B. Artifact de Claude con almacenamiento propio | Sin servicios externos, no se pausa | Vive dentro de claude.ai, no es app instalada, audios solo locales |
| C. Almacenamiento nuevo en Vercel | Independiente | Requiere que el usuario lo cree en el panel de Vercel |
| D. Solo local + archivo de respaldo | Lo más simple | Manual |

Se implementa **A**. Además se incluye **D** (exportar/importar respaldo) como red de seguridad.

## 6. Diseño funcional

### 6.1 Navegación y lenguaje
- Cinco pestañas: **Inicio · Metrónomo · Rutinas · Vault · Progreso**. **Ajustes** (sincronización, respaldo, preferencias) se abre con el ícono ⚙︎ de Inicio.
- Todo en español y consistente. *Mi decisión:* "Vault" se queda como nombre propio de la biblioteca; "THE ROUTINE" pasa a "Rutinas", "Songs" a "Canciones" y "+ ADD" a "Agregar".

### 6.2 Metrónomo
- **Pantalla:** BPM gigante (cifras de al menos ~120 px en celular) con la unidad del pulso ("♩ = 120", "♩. = 60"). Se cambia arrastrando en vertical, con −/+ (mantener presionado repite tras 400 ms y acelera) o con TAP (promedio de los últimos 4 toques).
- **Compás y subdivisión:** numerador 1–16, denominador 2/4/8/16 y subdivisión (negras, corcheas, tresillos, semicorcheas, quintillos, seisillos) dibujada con íconos SVG propios.
- **Compases compuestos (6/8, 9/8, 12/8):** por defecto el pulso es la negra con puntillo y acentos en 1 (fuerte) y 4/7/10 (medio). Un interruptor "contar en corcheas" cambia el pulso a la corchea. En compases simples el BPM se refiere a la figura del denominador.
- **Rejilla de acentos:** un toque recorre acento → normal → suave → silencio. Una pulsación larga de 500 ms abre el sonido de esa celda y anula el toque.
- **Mientras suena:** número de pulso grande, contador de compás y línea de estado del modo activo. Destello opcional (solo el 1, todos los pulsos o apagado), limitado a 3 por segundo.
- **Modos:** las pastillas Sonido · Poly · Gap · Speed abren una hoja inferior que no tapa el pulso. Abrir un modo lo activa (como antes), cerrar la hoja **lo deja activo**, y la hoja tiene un interruptor "Activado" visible. La pastilla muestra el estado ("Gap 2/4", "Speed →140", "Poly 3:2").
- **Sonido:** volumen general, sonido de acento/normal/suave (7 sonidos que se escuchan al tocarlos) y volumen de las subdivisiones.
- **Poly:** relación N:M con dos anillos, sonido y volumen de la capa 2. Ambas capas comparten el tiempo 1 y se calculan como fracciones exactas del compás.
- **Gap:** compases de intro (0–4), N compases con click y M en silencio (1–8 cada uno). Modos: silencio total, solo el 1, click al contratiempo. "Ocultar el pulso visual en silencio" viene activado. Random mute en % con opción "nunca silenciar el 1". En pantalla se ve una barra segmentada del ciclo y "CLICK 2/4" / "SILENCIO 1/2" grande.
- **Speed:** rampa (cambio suave por pulso, de inicio a meta en T segundos) o escalones (+X BPM cada N compases, siempre en la barra de compás, con tope en la meta). Al llegar: mantener (por defecto), parar o reiniciar. Estado en pantalla tipo "112 → 140 · +2 en 3 compases". Un ±BPM manual pausa la progresión en vez de pelear con ella.
- **Ajustes (⚙︎):** conteo previo de 0, 1 o 2 compases con sonido propio y "4-3-2-1" en grande; presets con nombre (guardar, cargar, borrar; se sincronizan); BPM rápidos; resetear la rejilla.
- **Comportamiento:**
  - La configuración se recuerda en cada dispositivo.
  - Wake Lock mientras suena.
  - Teclado: Espacio = tocar/parar, ↑/↓ = ±1 (Shift ±5), T = tap.
  - Una práctica libre de 2 minutos o más se registra sola como "Metrónomo libre".

### 6.3 Motor de audio
- Clase JavaScript pura (sin React) con reloj del AudioContext como maestro. Un temporizador en un Web Worker (25 ms) programa con 100 ms de anticipación.
- **Cambios en vivo:** el BPM se aplica en el siguiente pulso; compás, subdivisión y rejilla en la siguiente barra. Nunca reinicia.
- Swing del 50 al 75 % cuando los pulsos por tiempo son pares.
- Gap y random mute se evalúan por compás y por pulso. El conteo previo no cuenta para Gap ni para Speed.
- Exponer el estado del pulso como un store externo (`subscribe`/`getSnapshot`): solo los componentes visuales del pulso se re-renderizan, nunca toda la app.
- Sonidos sintetizados mejorados (ataque rápido, que se oigan sobre la batería) y ganancia general.
- iOS: audio silencioso para saltarse el interruptor de silencio, y `resume()` al volver a la app.
- Una función pura `planBar(config, state)` genera los eventos de cada compás para poder probarlos sin audio.

### 6.4 Rutinas (editor)
- **Lista de rutinas:** nombre, duración estimada, número de bloques, días asignados (L M X J V S D) y botón **Empezar**. Crear, duplicar, renombrar (con ícono de lápiz) y eliminar con confirmación.
- **Editor de bloques:** se arrastra el asa (`touch-action: none`, con auto-scroll) y se toca un bloque para editarlo en una hoja:
  - **Calentamiento:** N compases a un BPM; por defecto el BPM del siguiente ejercicio.
  - **Ejercicio:** usa la configuración del ejercicio; opcionalmente se cambia la duración solo en esta rutina.
  - **Descanso:** segundos.
  - **Fill/Groove:** modo frase (N compases de groove + 1 de fill), repeticiones o duración, BPM.
  - **Canción:** abre el play-along; "Listo" continúa.
- **Agregar bloque:** al final, y entre bloques con un botón discreto. Abre una hoja (portal) con tipos y un buscador; se corrige el bug que la reiniciaba.
- La duración estimada cuenta todos los tipos de bloque.
- *Mi decisión:* se quitan los botones "BPM global ±1/+5" (afectaban a todos los ejercicios); los reemplaza la progresión por ejercicio de §6.5.
- **Plan semanal:** cada rutina se asigna a días, e Inicio muestra la de hoy.

### 6.5 Sesión guiada
- **Flujo por bloque:**
  1. Tarjeta "prepárate": nombre, partitura, BPM y lo que sigue. Empieza sola en 5 s o espera, según la preferencia.
  2. Conteo previo.
  3. El bloque suena con su propia configuración y termina en una barra de compás al cumplirse el tiempo.
  4. Calificación de un toque para ejercicios y fills: **Limpio / Casi / Costó**, con el BPM ya puesto; se cierra sola a los 8 s.
  5. Siguiente bloque.
- Los descansos muestran una cuenta regresiva grande y "Sigue: …". La canción muestra el reproductor dentro de la sesión.
- **Controles grandes abajo:** Pausa/Reanudar al centro, Siguiente, Reiniciar/Anterior, ±BPM, +1 min y Salir (pregunta antes y guarda lo practicado).
- **Pausa:** congela el bloque, el reloj de la sesión y la rampa; reanuda con conteo previo. Se pausa sola al ocultar la app.
- El estado se guarda cada ~3 s; si la página se recarga ofrece "Reanudar sesión".
- **Teclado y pedal** (AirTurn/PageFlip):
  - Espacio/Enter: pausa
  - →/↓/AvPág: siguiente
  - ←/↑/RePág: reiniciar (dos veces = anterior)
  - +/−: BPM
  - Esc: menú
- Wake Lock durante la sesión. Usa su propia configuración de metrónomo: **no toca la del metrónomo libre**.
- **Resumen final** (se guarda solo aunque se termine antes): minutos activos, bloques hechos y saltados, BPM por ejercicio frente a la vez anterior, récords y sugerencia del próximo BPM (aceptar o ajustar).
- **Progresión del ejercicio:** se registra cada intento (fecha, BPM inicial y final, segundos, calificación).
  - Mejor BPM limpio = el BPM más alto calificado "Limpio".
  - Meta de BPM opcional con barra de avance.
  - Sugerencia del próximo BPM: Limpio +3 %, Casi igual, Costó −7 % (o el último limpio). Si lleva más de 14 días sin practicarse, −5 %.

### 6.6 Vault
- **Buscador**, y chips de categoría en Ejercicios (las categorías actuales pasan a ser etiquetas editables en Ajustes).
- **Ejercicios:**
  - **Tarjeta:** nombre, categoría, BPM actual → meta, "hace 3 días" y miniatura.
  - **Detalle:** imagen a pantalla completa con zoom, notas, resumen de configuración, gráfica de BPM y acciones (Practicar ahora, Editar, Duplicar, Agregar a rutina…, Eliminar con confirmación y "Deshacer").
  - **Formulario reordenado:** Nombre* → Categoría → Velocidad (fijo / rampa gradual / escalones) → Meta → Duración (min:seg) → Metrónomo (compás, subdivisión, gap, poly) → Imagen → Notas.
  - Validación en línea (BPM 20–400, duración 10–3600 s). Los campos numéricos permiten borrar mientras se escribe.
  - *Mi decisión:* el selector "RUTINA" del formulario (no hacía nada) se reemplaza por la acción "Agregar a rutina…".
- **Fills y Grooves:**
  - **Tarjeta:** BPM, indicador de medio y última vez practicado.
  - **Detalle:** imagen, video o audio con reproductor, notas, "Practicar" (sesión de un bloque en modo frase) y "Marcar practicado".
- **Canciones:** tarjeta con artista, BPM, última velocidad y "archivo en este dispositivo" / "elige el archivo en este dispositivo".
- **Reproductor de canciones:**
  - Funciona con el archivo guardado en este dispositivo (IndexedDB).
  - Velocidad del 25 al 150 % sin cambiar el tono (deslizador, ±1/±5 y atajos), con el BPM efectivo visible (BPM de referencia × velocidad).
  - A y B se marcan mientras suena, con ajuste fino de ±0,1 s, y un conteo previo opcional antes de cada vuelta.
  - Recuerda velocidad y loop por canción. El video se ve en línea (`playsinline`).
  - Se elimina la onda decorativa (era una AudioContext extra con problemas de CORS) y se reemplaza por una barra de tiempo con marcadores A/B.

### 6.7 Inicio
- **Encabezado:** fecha, racha y ⚙︎.
- **Tarjeta "Hoy":** la rutina asignada a hoy (o "Elige una rutina para hoy"), con bloques, minutos estimados y botón grande **Empezar**.
- **Franja de la semana:** minutos por día y el día de hoy marcado.
- **Metrónomo rápido** (BPM, compás, play) y **las 3 sesiones recientes** con lo destacado.
- **Primera vez:** si el Vault está vacío, guía para crear el primer ejercicio.

### 6.8 Progreso
- **Esta semana:** minutos frente a una meta semanal (configurable, por defecto 150) y días practicados.
- **Racha** actual y mejor. Un día cuenta con al menos 5 minutos activos (configurable).
- **Calendario de calor** de las últimas 12 semanas.
- **Totales:** horas, sesiones y promedio.
- **Ejercicios:** BPM actual, mejor limpio y meta; al tocarlo, la gráfica de BPM en el tiempo con la calificación.
- **Historial de sesiones.**
- P1: "Registrar práctica manual", por ejemplo un ensayo con la banda.

### 6.9 Ajustes
- **Sincronización:** estado (último sync, pendientes, sin conexión), "Activar en este dispositivo" (genera el código), "Unirme con un código", ver/copiar el código y desvincular.
- **Respaldo:** exportar JSON (con imágenes opcionales) e importar (combinar o reemplazar, con confirmación).
- **Práctica:** conteo previo por defecto, avance automático, pedir calificación, destello, meta semanal, umbral de día practicado y categorías.
- **Instalación:** guía "Agregar a pantalla de inicio" si no está instalada, y solicitud de almacenamiento persistente.

## 7. Datos

**Entidades sincronizadas**: todas tienen `id`, `updatedAt` (ms) y `deletedAt` (lápida).
- **exercise:**
  - `name`, `categoryId`, `notes`, `imageId`, `durationSec`.
  - Velocidad: `velocityMode` (fixed|ramp), `bpm` (BPM de trabajo), `bpmStart`, `bpmEnd`, `rampType` (gradual|steps), `rampStepBars`, `rampStepBpm`.
  - Progreso: `goalBpm`, `bestCleanBpm`.
  - Metrónomo: `meter {num, den, feel}`, `subdivision`, `gap {enabled, play, mute, mode}`, `poly {enabled, n}`.
- **fill:** `type` (fill|groove), `name`, `bpm`, `notes`, `imageId`, `phrase {grooveBars, fillBars}`, `lastPracticed`. El audio o video queda solo en el dispositivo.
- **song:** `name`, `artist`, `bpm`, `notes`, `speed`, `loopA`, `loopB`. El archivo queda solo en el dispositivo.
- **routine:** `name`, `blocks[]` (`{id, type, refId, bars, seconds, bpm, reps, durationOverride}`), `days[]`.
- **log:** `date` (local AAAA-MM-DD), `startedAt`, `endedAt`, `activeSec`, `kind` (routine|free|single|manual|legacy), `routineId`, `items[]` (`{type, refId, name, startBpm, endBpm, seconds, rating, skipped}`).
- **preset:** configuración de metrónomo con nombre.
- **prefs:** un solo registro con las preferencias.

**Local por dispositivo:** configuración actual del metrónomo, código de sincronización, `lastRev`, cola de pendientes, audios y videos, y la sesión en curso.

**Almacenamiento:** JSON de entidades en `localStorage` (clave `dp-v4`). Imágenes y medios en IndexedDB (`idb-keyval`); las imágenes se comprimen a 1600 px JPEG ~0.8.

**Migración v3 → v4:**

| Origen v3 | Destino v4 |
|---|---|
| `durationSeconds` | `durationSec` |
| `currentBPM` (o `bpm`) | `bpm` |
| `metro*` | `meter`, `subdivision`, `gap`, `poly` |
| imagen base64 | blob en IndexedDB |
| URL de Supabase muerta | se descarta, avisando |
| `fileData` base64 de canción | medio local |
| `routineBlocks` legado | rutina |
| registros | `kind: legacy` |

Se conserva una copia `dp-backup-v3` sin tocar.

**Fechas:** siempre locales (nada de `toISOString` para días).

## 8. Sincronización (Supabase `ipuc-trinidad`)

- **Tablas:**
  - `public.drum_items (key_hash, kind, id, data jsonb, updated_at, deleted, rev)`: una fila por entidad.
  - `public.drum_media (key_hash, id, mime, data base64, bytes, updated_at)`: solo imágenes, máximo 1 MB cada una.
- **Acceso sin Auth:** el cliente envía el código en el encabezado `x-drum-key`. Las políticas RLS solo permiten filas con `key_hash = sha256(encabezado)`, calculado por `drum_private.request_key_hash()` (esquema no expuesto). No hay funciones `SECURITY DEFINER` expuestas.
- **Disparadores** en `drum_private`:
  - Gana la escritura más nueva (`updated_at`).
  - Asignan `rev` desde una secuencia.
  - Topes globales: 50 000 filas y 150 MB de imágenes.
- Se revocan TRUNCATE, REFERENCES y TRIGGER para anon/authenticated. Advisors antes y después sin advertencias nuevas.
- **Cliente** (fetch directo a PostgREST, sin `supabase-js`):
  - El código es de 16 caracteres Crockford base32 (80 bits).
  - Subir: cambios marcados como pendientes, agrupados 1,5 s, upsert en lotes de hasta 200.
  - Bajar: filas con `rev > lastRev − 50`, combinadas por `updatedAt`.
  - Cuándo: al abrir (después de pintar), al volver a la app, cada 5 min con la app visible y tras subir.
  - Imágenes: se suben al guardarlas y se bajan perezosamente al mostrarlas.
- **Estado visible** en Ajustes y en un indicador discreto. Nunca bloquea el inicio.
- **Consumo:** pocas solicitudes por minuto en el peor caso y menos de 10 MB de datos.

## 9. Dirección visual

Refinar la identidad actual (obsidiana + ámbar; un acento por sección: ámbar en metrónomo/inicio, cian en rutinas, violeta en Vault, verde en progreso), no reemplazarla. La revisión de impeccable (§11) define los detalles.

- Contraste mínimo de 4,5:1 en texto y de 7:1 en lo que se lee a distancia.
- Texto mínimo de 12 px y cuerpo de 15–16 px.
- Objetivos táctiles de al menos 44 px; los primarios, de 64–80 px.
- Áreas seguras (notch e indicador de inicio) y `prefers-reduced-motion`.
- iPad con diseño a dos columnas donde ayude: metrónomo grande + controles en horizontal; lista + detalle en el Vault.
- Se pasa de estilos en línea a CSS (tokens + clases) con primitivas compartidas: Botón, Hoja, Diálogo, Stepper, Pastilla, Campo, Toast, Ícono.

## 10. Calidad y verificación

- **Pruebas Vitest:**
  - Motor: espaciado, swing, poly, gap, speed, conteo previo y cambios en vivo.
  - Fechas, racha y semana.
  - Migración v3→v4.
  - Combinación con lápidas.
  - Reductor de la sesión guiada.
  - Reglas de progresión.
  - Cliente de sincronización con fetch simulado.
- Lint limpio y JS por debajo de 200 KB gzip.
- QA en navegador con agentes a 375, 768 y 1280 px en todos los flujos.
- Pruebas de RLS con curl (sin código, con código incorrecto y con el correcto) y advisors de Supabase.
- `impeccable detect` y una nueva crítica de diseño al final, más revisión de código.

## 11. Revisión de diseño (impeccable: crítica con dos agentes + auditoría)

### Resultados
- **Heurísticas de Nielsen: 15/40 (Pobre).**

  | Heurística | Puntaje |
  |---|---|
  | Visibilidad del estado | 2 |
  | Lenguaje del mundo real | 2 |
  | Control y libertad | 1 |
  | Consistencia | 1 |
  | Prevención de errores | 1 |
  | Reconocer antes que recordar | 2 |
  | Flexibilidad y eficiencia | 2 |
  | Estética minimalista | 2 |
  | Recuperarse de errores | 1 |
  | Ayuda | 1 |

- **Auditoría técnica: 6/20 (Pobre).**

  | Dimensión | Puntaje |
  |---|---|
  | Accesibilidad | 1 |
  | Rendimiento | 2 |
  | Tokens y tema | 1 |
  | Responsive | 1 |
  | Integridad de la implementación | 1 |

- **Carga cognitiva:** fallan 6 de 8 criterios.
  - 21 pastillas de sonido.
  - Unos 20 controles a la vez en Práctica.
  - Inicio no tiene acción principal.
- **Especificidad:** el motor es de baterista de verdad (niveles de acento, gap, poly, speed). La carcasa visual es una plantilla genérica "dark premium" (glass, auroras, ruido, títulos con degradado) y no está pensada para la escena real: el atril a 1 m, poca luz, el iPad.
- **Detector (12 hallazgos, verificados):**
  - Inter y Space Grotesk sobreusadas.
  - Easing con rebote en 3 transiciones.
  - Texto con degradado en los 3 títulos.
  - Falsos positivos descartados: `tokens.js` (código muerto) y `.gradient-text` (sin uso).

### Medidas clave
- **Contraste:** falla en la mayoría del texto de cada pantalla.
  - Etiquetas del menú inferior: 1,98:1.
  - "+ ADD": 1,91:1.
  - `--text3` (#5C5650): 2,5–2,8:1.
  - "INICIAR RUTINA" blanco sobre cian: 2,43:1.
  - 19 de 32 textos de Inicio miden menos de 12 px.
- **Objetivos táctiles por debajo de 44 px** en todas las pantallas. "VER RUTINA →" mide 83×12, los botones de subdivisión 30×30 y los "+ ADD" 70×18.
- **Semántica y teclado:**
  - 0 atributos `aria-*` o `role` en todo `src`.
  - Los íconos se anuncian por su ligadura ("content_copy", "drag_indicator").
  - Las celdas del grid no tienen nombre.
  - Los inputs no muestran ningún foco.
  - El zoom está deshabilitado.
  - No hay `prefers-reduced-motion`, y las auroras (blur de 90 px) giran en bucle infinito.
- **Rendimiento:**
  - Toda la app se re-renderiza en cada pulso (unas 20 veces por segundo).
  - Un solo chunk de 523 KB.
  - La fuente de íconos completa pesa 325 KB para unos 35 íconos.
  - Se cargan 12 pesos de fuente.
- **Tema:** unos 387 colores literales frente a 386 usos de variables. La escala de opacidades del texto no está tokenizada. Hay CSS muerto y un tema que no coincide entre el manifest (#131313) y la app (#08080C).

### Decisiones de dirección visual
Se integran a §9. Refinar, no reemplazar, salvo la decoración:

- **Mantener:** la paleta obsidiana + ámbar, los acentos por sección y las tipografías actuales con menos pesos.
  - *Mi decisión:* Space Grotesk solo para cifras y títulos; Inter para el resto; JetBrains Mono para tiempos.
- **Quitar:**
  - las auroras animadas y el ruido superpuesto;
  - los títulos con degradado;
  - los brillos (`text-shadow`/`glow`) decorativos;
  - el easing con rebote.
- **"Modo escenario"** en metrónomo y sesión: BPM y tiempo restante a 15–20 vh en blanco, pulso visible a distancia y el transporte fijo abajo.
- **Escala de texto:** mínimo 12 px y cuerpo de 15–16 px.
- **Contraste:** `--text2` y `--text3` recalibrados a 4,5:1 o más.
- **Accesibilidad:**
  - `aria-label` en todos los botones de ícono.
  - Diálogos con rol, foco atrapado y Esc.
  - Foco visible (`:focus-visible`).
  - Zoom permitido.
  - `prefers-reduced-motion`.
- **Íconos y fuentes:**
  - Material Symbols cargado solo con los íconos usados (`icon_names`).
  - Notas musicales en SVG propio.
- **Layout iPad/desktop:** dos columnas donde aporta. Los elementos fijos van en portales fuera del contenedor transformado.

## 12. Inventario de bugs

Se completa con los reportes de los agentes de revisión (motor, flujos, datos) y la auditoría técnica. Cada uno queda cubierto por el diseño de §6–§8.

### 12.1 Flujos de rutina y sesión (agente de flujos, verificado con la app corriendo)

1. **[Crítico] La racha se rompe al practicar de noche.** `getToday()` usa UTC y `calcStreak` cuenta desde la medianoche local. En Bogotá, una sesión el lunes a las 20:30 se guarda como martes y la racha queda en 0.
2. **Después de cada descanso la sesión vuelve a "listo"** y espera un toque. No sirve con las manos ocupadas.
3. **Saltar todos los ejercicios cuenta como completado:** muestra "¡BIEN HECHO! 2 completados", registra la sesión y suma racha.
4. **SALIR no pregunta, no guarda el registro y pierde los cambios de BPM.** El registro solo se escribe al cerrar la pantalla final, y ‹ sigue activo ahí: un toque vuelve a "listo" y la sesión no se registra.
5. **La sesión mezcla su configuración con la del metrónomo libre, en ambos sentidos:**
   - Fuerza `subId` a negras (el campo no existe en el ejercicio).
   - El swing, random mute, gap y poly del metrónomo libre suenan dentro de la rutina.
   - Si el metrónomo ya sonaba, no se detiene.
   - Al salir, el metrónomo libre queda con el BPM, el compás, la subdivisión y la rampa de la sesión.
6. **La rampa falla:**
   - La pantalla muestra `cfg.bpm`, no el BPM real de la rampa.
   - `start()` lee `cfgRef` antes de que React aplique el `update()` (carrera): sonó a 100 mostrando 80.
   - La rampa corre también durante el calentamiento, con los 60 s por defecto.
7. **La sesión no muestra la partitura ni las notas:** lee `ex.description` y el formulario guarda `notes`.
8. **El overlay de la sesión no respeta las áreas seguras:** SALIR queda bajo el notch y los controles bajo el indicador de inicio.
9. **No hay Wake Lock:** el bloqueo automático del iPhone suspende el audio y los temporizadores, que además derivan porque cuentan con intervalos de 1 s.
10. **Hay dos maneras distintas de elegir la rutina activa.**
    - Con datos `routineBlocks` legados, la línea de tiempo muestra el ejercicio pero INICIAR dice "No hay ejercicios en esta categoría".
    - Las rutinas sin ejercicios caen en el mismo callejón sin salida.
    - Los bloques de ejercicios borrados siguen contando en la estimación.
11. **`completePractice` pierde casi todo:**
    - Guarda fecha UTC y `exercises: []`, sin rutina, sin bloques hechos o saltados y sin BPM alcanzado.
    - No sube `updatedAt`.
    - La sincronización reemplaza los registros locales en bloque.
12. **Los botones ±BPM de la rutina reescriben todos los ejercicios del Vault.**
13. **Mantener presionado ± no repite.** El intervalo puede quedar vivo y forzar un BPM cada 120 ms incluso en el metrónomo libre.
14. **En desarrollo (StrictMode), `completePractice` se ejecuta dos veces:** se llama dentro de un actualizador de estado y las props en línea reinician la cuenta regresiva final.
15. **Los números no coinciden:**
    - `currentBPM` queda viejo al editar el BPM.
    - Borrar el BPM guarda 0: la insignia dice 80 y la sesión toca 100.
    - Duración 0 muestra un "0" suelto.
    - La estimación dice 12 min para una rutina que duró 2,6.
16. **Editar la línea de tiempo:**
    - Borrar rutina o bloque es un toque, sin deshacer.
    - Renombrar solo con doble toque y una ayuda que no se ve en pantallas táctiles.
    - Elegir rutina dispara una escritura completa a la nube.
    - Arrastrar no maneja `pointercancel` y no hace auto-scroll.
    - Un segundo "+ ADD" con el menú abierto solo cierra el menú.

### 12.2 Motor del metrónomo (agente de audio, medido con el hook real y AudioContext simulado)

**Lo que ya funciona bien y hay que conservar:**
- El espaciado de pulsos es exacto: 0 µs de deriva en 30 s.
- El poly a tempo fijo es exacto (4:3, 3:2, 5:4 y 7:4).
- Los modos gap "full" y "beat1" funcionan bien.

**Problemas encontrados:**

1. **[Crítico] El botón de play queda fuera de la pantalla y no se puede hacer scroll.**
   - En un iPhone SE desaparece con cualquier subdivisión de corcheas o más fina.
   - En un iPhone de 390×844 desaparece con 4/4 en quintillos o seisillos y con 7/4 en corcheas o más fina.
   - La rejilla además se parte de forma irregular (3 tiempos + 1).
2. **[Mayor] El MP3 silencioso está corrupto:** el base64 está mal formado y `afinfo` no lo abre. Por eso el truco del interruptor de silencio del iPhone nunca funcionó.
   - Solución: `navigator.audioSession.type = "playback"` (iOS 17+) más un archivo silencioso válido.
3. **[Mayor] Cambiar compás o subdivisión reinicia el compás a +50 ms** mientras ya hay clicks programados. Suenan dos tiempos 1 seguidos y el 1 se corre de −533 a +49 ms.
4. **[Mayor] Los temporizadores atrasados pierden pulsos en silencio.**
   - Con más de 32 atrasados se resincroniza sin avanzar los contadores y el 1 cae en el pulso equivocado.
   - Un error de "uno más" duplica clicks cada 32 iteraciones.
   - Con la pestaña en segundo plano (1 Hz) se pierden 13 de 17 clicks.
5. **[Mayor] iOS:**
   - Con el contexto "interrupted" nunca se llama `resume()`: suena una nota y luego nada, aunque la interfaz dice que está sonando.
   - Si `resume()` falla, el error se traga y no se muestra nada.
   - Darle play y stop antes de que `resume()` termine deja el metrónomo sonando con la interfaz en "parado".
6. **[Mayor] La escala del swing está mal:** 75 % produce 60 %, así que el swing de tresillo es inalcanzable. Además se aplica a tresillos, donde no tiene sentido.
7. **[Mayor] El campo HASTA del Speed recorta el valor en cada tecla:** borrarlo da 20 y escribir "150" da 400.
8. **[Mayor] `stop()` no silencia lo que ya está programado:** suena un click hasta 117 ms después, y uno de poly hasta casi 2 s después.
9. **Cambiar el BPM a mitad de compás con poly activo** produce golpes de más o de menos en ese compás.
10. **Gap y random mute:**
    - El modo "offbeat" con negras queda en silencio total.
    - Al reactivar el gap retoma el ciclo congelado.
    - El random mute actúa por subdivisión y silencia también el poly.
11. **Speed:** al reactivar el trainer salta al último BPM de la rampa, y el anillo no avanza en rampas descendentes.
12. **El tap tempo no es robusto:**
    - Un toque perdido da 75 a 100 BPM.
    - Usa el `click` (al soltar el dedo) en lugar de `pointerdown`.
13. **El arrastre de BPM no tiene `touch-action` ni `pointercancel`.**
14. **Detalles:**
    - La fila del compás se recorta a 320 px.
    - La hoja de Poly mide 636 px y supera el 80 vh.
    - Pantalla completa no hace nada en iPhone.
    - Volver a tocar la subdivisión activa borra los acentos.
    - Un acento más un golpe de poly suma 1,25 de ganancia y satura.

**Cambios al motor que salen de este reporte** (aplican al diseño §6.3):
- Posición musical explícita (compás/tiempo/subdivisión).
- Recuperarse de atrasos por tiempo, sin tope de iteraciones.
- GainNode maestro por ejecución, con rampa a 0 al parar.
- Compresor y volúmenes por nivel.
- Sonidos pre-renderizados en buffers.
- Pulso visual con `requestAnimationFrame` que compensa la latencia de salida.
- Recuperación de los estados `suspended`/`interrupted` con un identificador de ejecución.

### 12.3 Vault, reproductor y datos (agente de datos: app real con backend caído, WebKit y simulaciones en Bogotá)

1. **[Crítico] Una sesión de login guardada deja la pantalla negra para siempre.** Con un token vencido, `getSession()` reintenta contra el host muerto, choca con el lock y nunca habilita el render (`#root` seguía vacío a los 169 s). Probablemente es lo que ves hoy si alguna vez iniciaste sesión en un dispositivo.
   - Solución: sacar Supabase Auth del arranque, borrar las claves `sb-*` al iniciar y nunca condicionar el primer render.
2. **[Crítico] Se pierden datos sin aviso cuando `localStorage` se llena.**
   - Las imágenes en base64 llenan la cuota: en WebKit es de 5,2 M caracteres, o 2,6 M si hay caracteres fuera de Latin-1 como "…", "—" o emoji.
   - `setItem` falla, solo hay un `console.warn` y el toast dice "guardado". Las sesiones también se pierden.
3. **El menú inferior queda por encima de los formularios y del reproductor.** Al tocarlo se pierde el borrador y el reproductor queda sin descargar. Tocar el fondo también descarta el formulario sin preguntar.
4. **El botón flotante queda mal ubicado desde 820 px**, y desde unos 2090 px ya no se ve ni se puede tocar.
5. **Lo que guarda el Vault y lo que lee la sesión no coinciden:**
   - `durationSeconds` / `currentBPM` / `metro*` / `bpmEnd` / `notes` frente a `duration` / `bpm` / `timeNum` / `targetBpm` / `description`.
   - Al editar el BPM la tarjeta sigue mostrando el valor viejo.
6. **La velocidad guardada de la canción no se aplica:** `load()` reinicia `playbackRate`. Muestra 75 % y suena al 100 %.
7. **El reproductor desperdicia recursos:**
   - Crea un AudioContext nuevo por archivo y no lo cierra.
   - Re-renderiza unas 64 veces por segundo.
   - No reconecta al cambiar de audio a video.
8. **El loop A-B se pasa de B entre 68 y 205 ms** (`timeupdate` cada ~265 ms). Si B está cerca del final, la canción termina.
9. **[iPhone] El video no tiene `playsInline`:** se abre el reproductor nativo y se pierden los controles de velocidad y loop.
10. **El canvas de la onda:**
    - `fillStyle="var(--amber)"` no funciona en canvas.
    - Se recorta y no escala con el DPR.
    - Es un osciloscopio en vivo, no una vista general de la canción.
11. **Los puntos de la semana nunca se completan** y "Recientes" dice "Práctica libre".
12. **Más efectos del bug de UTC:** `bestStreak` siempre queda bajo, y las barras de Progreso combinan etiquetas de días locales con fechas UTC. También falla en zonas UTC+.
13. **Dos ventanas (Mac PWA + pestaña, o Split View en iPad) se sobrescriben entre sí:** cada cambio reescribe el documento completo y nadie escucha el evento `storage`.
14. **Números de Progreso:**
    - TOTAL redondea las horas (25 min se ven como "0h").
    - PROMEDIO cuenta sesiones de 0 s.
    - Solo se guardan 500 registros.
    - `bestStreak` nunca se muestra.
15. **Formularios:**
    - Sin nombre, el botón no hace nada y no explica por qué.
    - No se validan los rangos (acepta 0 o 999 BPM).
    - `_metroOpen` se guarda en los datos.
    - Volver a elegir el mismo archivo no hace nada.
    - Fill y Canción cierran con toast de éxito aunque la subida haya fallado.
    - Borrar no se puede deshacer y deja bloques huérfanos.
    - JSON corrupto se carga como datos por defecto y el siguiente guardado borra la única copia.

**Decisiones que salen de este reporte** (aplican a §7):
- Al guardar se lee el documento actual, se combina por entidad (LWW) y se escribe. Se escucha `storage` para refrescar otras ventanas.
- Los errores de cuota se muestran.
- No hay tope de registros.
- Si el JSON está corrupto, se guarda como `dp-corrupt-<fecha>` y se avisa; nunca se sobrescribe la única copia.
- Se borran las claves `sb-*` al migrar.
- Overlays en portal sobre el menú, confirmación al descartar y Esc para cerrar.

**Lo que muestra Inicio hoy (renderizado real):** todas las sesiones de rutina aparecen como "Práctica libre" y los puntos de la semana nunca quedan "hechos".
- Lunes y jueves: "3 ejercicios · 24 min" (todos son cat-1, por 8 min fijos).
- Los demás días: "0 ejercicios".
- La barra de progreso divide sesiones entre categorías: con 2 sesiones llega a 200 %.

## 12.4 Decisiones tomadas tras la revisión del constructor

- **Progresión en ejercicios de rampa o escalones** (*mi decisión*):
  - Se califica el BPM final alcanzado. La tarjeta muestra "inicio → meta".
  - "Mejor limpio" es el BPM final más alto calificado Limpio.
  - Aceptar una sugerencia mueve `bpmStart` y `bpmEnd` en la misma cantidad, conservando el ancho de la rampa.
  - `bpm` (de trabajo) solo se usa en modo fijo.
  - En la migración, `currentBPM` solo se aplica a ejercicios fijos.
- **Primer encuentro entre dispositivos con ediciones distintas del mismo elemento** (*mi decisión*): las entidades migradas no traen fechas confiables. Si en la primera unión dos versiones del mismo id difieren, **se conservan ambas**: la entrante se guarda como "(otro dispositivo)". A partir de ahí gana la más nueva por `updatedAt`. Ningún dato se pierde en silencio.
- **Llave pública de ipuc-trinidad:** ya es pública por diseño. El sitio en producción la usa desde el navegador: hay RPCs llamables por anon como `dir_abrir` y `juegos_*`. Las 25 tablas existentes tienen RLS. Agregarla a esta app no expone nada nuevo. Las tablas `drum_*` solo responden con el código correcto.
- **Publicación por hitos:** cada push a `main` publica (CLAUDE.md). Solo se publican estados completos y verificados (pruebas + navegador). La migración nunca borra la copia original (`dp-backup-v3`), así que cualquier problema se puede recuperar.

## 13. Fuera de alcance (P2) y P1 opcional

- **P1, si el tiempo alcanza:**
  - Modo YouTube "lite" para canciones.
  - Registrar práctica manual.
  - Paquete inicial de rudimentos.
  - Onda real del audio en el reproductor.
  - Subir la velocidad por cada vuelta del loop.
- **P2:** MIDI, grabación, stems, asistente para aprender pedales, polimetría, agrupaciones 2+2+3 y conteo con voz.
