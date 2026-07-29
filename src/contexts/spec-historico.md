# Spec — Ventana "Histórico" — Mis Finanzas

> Documento autocontenido para pasar directo a Claude Code. Cubre `src/ui/pages/historico.ts` + `src/domain/historico.ts`. Basado en el mockup `Historico.dc.html` (Claude Design), sin las gráficas que traía el mockup (se pidió explícitamente quitarlas). Depende del sistema global de periodo (`spec-ingresos.md`, sección 1-2).

## 1. Navegador de periodo

Barra con botón ← / etiqueta del periodo centrada / botón → — sin `<select>` de salto directo (a diferencia de la versión anterior). Navega un periodo a la vez, del más antiguo al actual (en curso). La etiqueta usa `formatPeriodoLabel` (rango de fechas real, o solo el nombre del mes si el periodo coincide con un mes calendario completo).

## 2. Tarjetas de resumen del periodo — clickeables, con desglose

Grilla de 7 tarjetas (igual que antes en contenido, nuevo en interacción): Ingresos, Gastos fijos, Gastos y compras, **Balance del periodo** (tarjeta primaria, no clickeable), Aportado a ahorros, Abonado a deudas, Recibido de Me Deben.

- Cada tarjeta (salvo Balance) es un botón: al hacer clic, se abre un panel debajo con el **detalle ítem por ítem** de esa categoría en este periodo (nombre, categoría/nota si aplica, monto) — `domain/historico.ts` → `detallePeriodo(snap, periodo)`. Solo una tarjeta puede estar abierta a la vez; un chevron rota para indicar el estado.
- Sin movimientos en ese periodo → el panel dice "Sin movimientos en este periodo."
- Cambiar de periodo (← / →) cierra el panel de detalle abierto.
- Línea de nota debajo de todo: "Gastos fijos: $X pagados · $Y pendientes en este periodo." — sin cambio respecto a antes.

## 3. Gráficas — eliminadas

Se quitaron las 3 gráficas que existían antes (comparativa de barras Ingresos/Gastos/Ahorro, evolución de patrimonio neto, histórico por categoría) y sus selectores de rango/categoría asociados. El componente `src/ui/components/charts.ts` (SVG hecho a mano) y todas las funciones de dominio que solo alimentaban esas gráficas (`serieMensual`, `patrimonioNetoSerie`, `serieCategoria`, `seriePeriodos`, `patrimonioNetoSeriePeriodos`, `seriePeriodoCategoria`, `ultimosMeses`, `ultimosPeriodos`, `listCategoriasHistoricas`, `formatPeriodoLabelCorto`, y sus interfaces `Punto*`) se eliminaron del código — nadie más las usaba.

## 4. "Resumen anual" — sin cambio

Se mantiene tal cual, por año calendario real (independiente del tipo de periodo configurado): grilla de stats (Total ingresos/gastos/ahorrado/pagado en deudas) para el año seleccionado, tabla de facturas registradas ese año (Fecha/Nombre/Monto/enlace "Ver"), botón "⬇️ Descargar resumen anual (CSV)".

## 5. Resumen de cambios

**Se quita:** las 3 gráficas y sus controles de rango/categoría; el `<select>` de salto directo a un periodo (queda solo ← / →).

**Se agrega:** desglose ítem por ítem al hacer clic en cada tarjeta de resumen del periodo (antes las tarjetas eran solo lectura).

**No cambia:** "Resumen anual" completo (stats, facturas, CSV).
