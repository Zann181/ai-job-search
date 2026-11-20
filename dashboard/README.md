# Dashboard de búsqueda de empleo

Panel local (React + Bun) sobre los mismos archivos que usan `/scrape`, `/rank` y `/apply`:
`job_scraper/seen_jobs.json`, `job_search_tracker.csv` y los PDF de `cv/` y `cover_letters/`.

```bash
cd dashboard && bun install && cd ..
bun run dashboard/src/main.ts
```

En Windows también sirve `dashboard\iniciar.bat` (instala las dependencias la primera vez y abre
el navegador). Abre http://127.0.0.1:4317. Solo escucha en localhost, y cada llamada a la API exige
un token nuevo por arranque, porque la API puede iniciar sesiones de Claude.

## Tu perfil: `candidato.local.json` (solo en local)

El código no lleva datos personales. Lo que el dashboard necesita de ti lo lee de
`dashboard/candidato.local.json`, que está en `.gitignore`; si no existe, usa
`dashboard/candidato.example.json` (valores de ejemplo, que cuentan como vacíos):

```bash
cp dashboard/candidato.example.json dashboard/candidato.local.json   # y edítalo
```

| Campo | Para qué |
|-------|----------|
| `nombre`, `nombre_completo` | Cómo te nombran los prompts de los agentes. Vacío: «el candidato» |
| `ciudad` | Ciudad por defecto del Buscador («Ciudad, Departamento»: usa la parte antes de la coma) |
| `salario_minimo_mensual` | Piso en COP: el panel de la oferta avisa si el salario publicado queda por debajo. `0` lo apaga |
| `deal_breakers` | Lista de condiciones: Postular con Chrome no llena nada si la oferta choca con una |
| `respuestas_semilla` | Preguntas y respuestas con que arranca **Respuestas** (`job_scraper/application_answers.json`), solo si ese archivo aún no existe |

Los valores entre corchetes (`"[TU_NOMBRE]"`) se toman como vacíos. Cambios en el archivo se leen al
reiniciar el dashboard. La página solo recibe de la API el piso salarial y la ciudad.

## Plantillas

Primera sección del menú. Tus hojas de vida por rol de `cv/plantillas/` (`hoja_de_vida_<rol>.tex`,
LaTeX `article`, pdflatex, exactamente 1 página), cada una en su archivo. La carpeta está en
`.gitignore`; para empezar, copia `templates/plantillas/hoja_de_vida_ejemplo.tex` (candidato ficticio)
como `cv/plantillas/hoja_de_vida_<rol>.tex` (ver `cv/plantillas/README.md`):

- **Izquierda:** la foto del currículum (**Cambiar foto**), **Importar .tex**, el selector de
  plantillas (páginas, `% CONFIRMAR` pendientes) y el índice de la elegida. También acepta arrastrar
  un `.tex` (se importa como `hoja_de_vida_<nombre>.tex`; si ya existe, pregunta antes de reemplazar)
  o una imagen (se convierte a JPEG de 1000 px como `Foto_perfil.jpeg`, la anterior queda como
  `Foto_perfil.anterior.jpeg`).
- **Centro:** editor LaTeX (CodeMirror). Ctrl+S guarda y compila.
- **Derecha:** lo que dice la plantilla: la **hoja** (el PDF renderizado como imagen con `pdftoppm`,
  sin el visor del navegador; Ajustar o 100 %), el LaTeX guardado (solo lectura) o la ficha
  (titular, enfoque, palabras clave del PDF, afirmaciones por confirmar, estado de los anexos).

Los dos laterales se redimensionan arrastrando o con las flechas, y se pliegan a un riel. Guardar se
niega si el texto activa `\anexostrue`. Para adaptar una plantilla a una oferta está la skill
`/adaptar-plantilla`, que trabaja sobre una copia `cv/main_<empresa>_<rol>.tex`.

## CV generado y carta

El editor del CV/carta de una oferta usa la misma hoja que Plantillas (imagen con `pdftoppm`,
pestañas **Hoja | LaTeX guardado**, Ajustar o 100 %). Arriba, plegable, **Lo que pide la oferta**:
ubicación, salario, cierre, publicación, postulantes, puntaje, idioma, perfil con que se buscó,
requisitos y funciones extraídos de la descripción, lo que cumples y las brechas, y el texto
completo. En el panel de la oferta, **Descripción del cargo** aparece antes del enlace al portal, y
la pestaña Documentos muestra la hoja en vez del visor PDF. La descripción del portal se muestra
como texto plano.

**Generar CV y carta desde la plantilla** corre `/adaptar-plantilla` (Sonnet, sin preguntas): el
dashboard guarda la descripción en `job_scraper/ofertas/<oferta>.txt` (gitignored; el agente la pasa
por `posting_guard.py`), le indica la plantilla del perfil con que el Buscador puntuó la oferta y
deja `cv/Foto_perfil.jpeg` junto a la copia. El agente adapta `cv/main_<empresa>_<rol>.tex` (1 página,
pdflatex), redacta la carta con `cover.cls` y registra la fila `drafted` en el tracker. Un deal-breaker
no la detiene: queda como advertencia al inicio del resumen. Sin plantillas en `cv/plantillas/` sigue el flujo `/apply` de antes.

## Arquitectura (DDD)

| Capa | Carpeta | Contenido |
|------|---------|-----------|
| Dominio | `src/domain` | Agregado `Job` y sus etapas, vocabulario del tracker, política de modelos, puertos |
| Aplicación | `src/application` | `JobService` (listar, seguir, confirmar CV, estado, seguimiento), `TaskQueue`, prompts |
| Infraestructura | `src/infrastructure` | `seen_jobs.json`, tracker CSV, estado del dashboard, perfil (`candidato.local.json`), CLI de portales, `claude -p` |
| Interfaz | `src/interfaces/http.ts`, `web/` | API HTTP y la app React |

## Modelos por tarea (nunca Opus)

| Tarea | Dificultad | Modelo |
|-------|-----------|--------|
| Buscar ofertas (`/scrape`) | mecánica | Haiku |
| Puntuar (`/rank`) | juicio | Sonnet |
| Crítica de probabilidad | juicio | Sonnet |
| Generar CV y carta (`/apply`) | redacción | Sonnet |
| Postular con Chrome | navegador | Sonnet |
| Seguimiento de ofertas | sin modelo | CLI del portal |

Los subagentes heredan el mismo modelo (`CLAUDE_CODE_SUBAGENT_MODEL`).

## Seguimiento y postulación

- Las ofertas marcadas como seguidas se revisan cada 6 h mientras el dashboard está abierto:
  si siguen abiertas, la fecha de cierre, el salario y, en LinkedIn, el número de postulantes.
- **Postular con Chrome** necesita un CV generado y confirmado. Corre `claude -p` con el MCP
  [`chrome-devtools-mcp@1.10.1`](https://github.com/ChromeDevTools/chrome-devtools-mcp)
  (`--mcp-config`, sin extensión) conectado a **tu Brave**, con las sesiones que ya tiene. Una
  vez, activa la depuración remota en `brave://inspect/#remote-debugging` (botón **Conectar
  Brave**); el dashboard lee `DevToolsActivePort` de la carpeta de usuario de Brave y pasa ese
  endpoint con `--wsEndpoint` (`BRAVE_PATH`, `BRAVE_USER_DATA` para otras rutas). Brave pide
  permiso en cada conexión. Abre la oferta, sube el CV confirmado (si el portal usa el CV del
  perfil, como Computrabajo, reemplaza ese archivo) y llena el formulario con CLAUDE.md y
  **Respuestas** (`job_scraper/application_answers.json`); se detiene ante un `deal_breakers` de
  `candidato.local.json`. **Nunca envía**: se detiene antes del
  botón final, deja la pestaña al frente y tú haces clic en Postularme. Luego **Ya la envié**, en
  el panel de la oferta, la marca como Aplicada. Las preguntas sin respuesta quedan en Respuestas
  para que las contestes una vez. No acepta términos por ti y se detiene ante login o CAPTCHA.
  Con la depuración remota activa, un programa local que obtenga tu permiso puede controlar
  todo tu Brave: desactívala en `brave://inspect` cuando no postules.
