# cv/plantillas/: tus hojas de vida por rol (solo en local)

Aquí van **tus** hojas de vida reales, una por rol, y tu foto:

```
cv/plantillas/
├── hoja_de_vida_<rol>.tex   # p. ej. hoja_de_vida_analista_datos.tex, hoja_de_vida_soporte_ti.tex
└── Foto_perfil.jpeg          # la usan las plantillas con \fototrue
```

**Esta carpeta está en `.gitignore`** (`cv/plantillas/*`, salvo este README): lo que pongas aquí
nunca se sube a git. El repositorio solo trae una hoja de vida de ejemplo con un candidato ficticio.

## Primera vez

1. Copia el ejemplo: `templates/plantillas/hoja_de_vida_ejemplo.tex` →
   `cv/plantillas/hoja_de_vida_<rol>.tex` (el `<rol>` en minúsculas, letras, números y `_`).
2. Reemplaza nombre, contacto, experiencia, educación y cursos con tus datos reales. En
   `\hypersetup`, el final de `pdftitle` (después del último ` - `) es el rol y `pdfkeywords` las
   palabras clave: el Buscador del dashboard arma sus búsquedas con ellos.
3. Si quieres foto, pon `Foto_perfil.jpeg` en esta carpeta y cambia `\fotofalse` por `\fototrue`.
4. Compila y deja exactamente 1 página:
   `cd cv/plantillas && pdflatex -interaction=nonstopmode -halt-on-error -no-shell-escape hoja_de_vida_<rol>.tex`
5. Marca con `% CONFIRMAR: ...` al final de la línea lo que aún debas verificar; `/adaptar-plantilla`
   conserva esas marcas y no promueve esas afirmaciones.

Repite con un archivo por rol al que apuntes. El dashboard (sección **Plantillas**) lista solo los
archivos `hoja_de_vida_*.tex` de esta carpeta, y `/adaptar-plantilla` nunca escribe aquí: trabaja
sobre una copia `cv/main_<empresa>_<rol>.tex`.
