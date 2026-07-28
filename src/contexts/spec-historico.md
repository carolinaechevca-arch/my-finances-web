# Spec — Ventana "Histórico" — Mis Finanzas

> Documento autocontenido para pasar directo a Claude Code. Cubre `src/ui/pages/historico.ts` + `src/ui/components/charts.ts`. Depende del sistema global de periodo (`spec-ingresos.md`, sección 1-2). **Cambio confirmado:** el navegador y los rangos pasan de "mes" a "periodo" (semana/quincena/mes según la configuración global).

## 1. Navegador — de "mes" a "periodo"

**Antes:** botón ← / `<select>` de mes / botón →.
**Ahora:** botón ← / `<select>` de **periodo** / botón → — navega entre periodos históricos (semanales, quincenales o mensuales, según lo que esté configurado globalmente en Configuración).

- Cada opción del `<select>` representa un periodo pasado. Como aquí sí se necesita identificar periodos específicos del historial (a diferencia de la insignia de "contador de días" usada en Ingresos/Gastos Fijos/Gastos y Compras, que solo indica el periodo *actual*), se propone mostrar el **rango de fechas de cada periodo** en el desplegable (ej. "1 - 15 de julio de 2026", o "21 - 27 de julio de 2026" si es semanal). *(Propuesta — el usuario no especificó el formato exacto de esta etiqueta, solo confirmó que el navegador pasa de mes a periodo.)*

## 2. "Resumen del mes" → "Resumen del periodo"

Misma grilla de tarjetas de stats, solo cambia el copy de "mes" a "periodo":

- Ingresos, Gastos fijos, Gastos y compras, **Balance del periodo** (primaria), Aportado a ahorros, Abonado a deudas, Recibido de Me Deben.
- Línea de nota sobre gastos fijos pagados/pendientes a esa fecha — sin cambio.

## 3. Gráfico "Ingresos vs. Gastos vs. Ahorro"

- Mismo gráfico de barras agrupadas hecho a mano (SVG, `renderBarChart`), mismo esquema de color (verde ingresos, rojo gastos, primario ahorro).
- **Selector de rango:** cambia de "3/6/12 meses/todo" a **"3/6/12 periodos/todo"**.
- Las etiquetas del eje X muestran el identificador de cada periodo (mismo formato que el navegador, sección 1) en vez de nombres de mes.

## 4. Gráfico "Evolución del patrimonio neto"

- Mismo gráfico de línea (SVG, `renderLineChart`), mismo cálculo (total ahorrado − deudas pendientes).
- Ahora recorre **todos los periodos disponibles** (en vez de "todos los meses disponibles").

## 5. Gráfico "Histórico por categoría"

- Igual, pero el rango elegido ahora se mide en periodos, no en meses (ligado al mismo selector de la sección 3).

## 6. "Resumen anual"

> ⚠️ **Asunción — no se preguntó explícitamente:** se propone que esta tarjeta **se mantenga basada en año calendario real**, independiente del tipo de periodo configurado (semana/quincena/mes) — porque es una agrupación distinta y útil para resúmenes anuales/fiscales sin importar qué tan granular sea el periodo elegido. Si el usuario prefiere que el "año" también se recalcule en base a periodos (ej. "últimos 52 periodos semanales"), avisar para ajustar.

Contenido sin cambio: grilla de stats (Total ingresos/gastos/ahorrado/pagado en deudas) para el año seleccionado, tabla de facturas registradas ese año (Fecha/Nombre/Monto/enlace "Ver"), botón "⬇️ Descargar resumen anual (CSV)".

## 7. Detalle técnico — sin cambio

Los gráficos siguen siendo SVG plano construido elemento por elemento (`svgEl`), sin librería de charts, con las mismas clases CSS (`.chart-svg`, `.chart-axis`, `.chart-label`, `.chart-line`, `.chart-legend*`).

## 8. Resumen de cambios

**Se agrega/cambia:**
- Navegador de mes → navegador de periodo (con rango de fechas por periodo en el selector).
- "Resumen del mes" → "Resumen del periodo" (solo copy).
- Selectores de rango de gráficos: "meses" → "periodos".
- Eje X de los gráficos: etiquetas de periodo en vez de nombre de mes.

**No cambia:**
- Lógica de cálculo de los gráficos, estilos, "Resumen anual" (se mantiene por año calendario — ver nota de la sección 6).

## 9. Pendiente de confirmar

- Formato exacto de la etiqueta de cada periodo en el navegador/selector (sección 1) — se propuso rango de fechas.
- Si "Resumen anual" debe seguir siendo por año calendario o también adaptarse a conteo de periodos (sección 6).