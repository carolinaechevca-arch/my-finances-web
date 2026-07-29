# Spec — Ventana "Gastos y Compras" — Mis Finanzas

> Documento autocontenido para pasar directo a Claude Code. Cubre la ventana **Gastos y Compras** (`src/ui/pages/gastos-personales.ts`). Depende del sistema global de periodo (`spec-ingresos.md`, sección 1-2).

## 0. Distinción de concepto: Gastos Fijos vs. Gastos y Compras (confirmado con el usuario)

- **Gastos Fijos** = compromisos del hogar que **hay que pagar sí o sí** (arriendo, servicios, etc.) — generan alertas de vencido, son obligatorios.
- **Gastos y Compras** = consumo/compras puntuales — no generan alertas de vencido.

## 1. Adaptación al sistema de periodo

| Elemento | Comportamiento |
|---|---|
| Insignia de la fila de título | Contador de días desde el último reinicio (mismo patrón que Ingresos y Gastos Fijos) |
| Tarjeta "Gastado en el periodo" | Tarjeta oscura, número grande en blanco |
| Tarjeta "Pendientes" | Tarjeta blanca, número en rojo (`--color-danger`) |

## 2. Formulario "Agregar gasto o compra" (sin selector de recurrencia)

No existe un selector de "Tipo de recurrencia": toda compra que se registra aquí es puntual, con fecha real. Campos, en orden: Fecha, Categoría, Nombre, Monto, toggle segmentado **Pendiente / Ya lo pagué**, botón **Archivar**, botón Guardar (ícono de disquete).

- El toggle **Pendiente / Ya lo pagué** (`.segmented`) reemplaza al antiguo `<select>` "¿Ya lo hiciste?" — sin título encima, mismo grosor visual que los demás campos del formulario.
- **Archivar** (`.archive-toggle`, casilla cuadrada con check) — si se marca al guardar:
  1. Se crea el gasto normal (pendiente o pagado, según el toggle) — igual que si no se hubiera marcado.
  2. **Además** se guarda una plantilla en "Archivados" (ver sección 3) con nombre/categoría/monto, para reutilizarla la próxima vez sin volver a escribir el formulario.
- Si "Ya lo pagué" está activo, se ofrece adjuntar factura (sin cambios respecto a antes).
- "Convertir en meta de ahorro" sigue existiendo, pero ahora aplica a cualquier compra que caiga en "Pendientes" (ya no depende de un tipo "Adicional", porque ese tipo dejó de existir).

## 3. Archivados (antes "Compras recurrentes pendientes de registrar")

Reemplaza por completo al viejo sistema de recurrencia Fijo/Personalizado con contador de periodos y detección automática de "toca comprar". Ahora es 100% manual: el usuario decide cuándo reutilizar una plantilla archivada, no hay avisos automáticos ni alertas.

- Tarjeta con acordeón (cerrado por defecto, igual que Historial — sección 5), oculta por completo si no hay archivados.
- Cada fila: nombre, categoría, monto de referencia (el de la última vez que se guardó/actualizó), y botones:
  - **"Ya la compré"** → abre el mismo diálogo de fecha/monto real que "Marcar como realizado", crea el gasto como **Pagado** y conserva la plantilla archivada (no se borra).
  - **"Pasar a pendientes"** → crea el gasto como **Pendiente** con la fecha de hoy y el monto de referencia, sin pedir diálogo. Conserva la plantilla.
  - Editar (nombre/categoría/monto) y Eliminar.
- Dominio: `src/domain/archivados.ts` (reemplaza a `src/domain/compras-recurrentes.ts`, que se eliminó). Reutiliza la misma hoja de cálculo `ComprasRecurrentes` — las columnas de recurrencia/repiteCadaN/contadorPeriodos quedan sin usar (se escriben vacías) en vez de migrar/renombrar la hoja.

## 4. Pendientes (antes "Pendientes por pagar")

Sin cambios de comportamiento — solo se acortó el nombre a "Pendientes" (en la tarjeta resumen y en el título de la sección). Es la única sección que se mantiene **siempre visible** (no es acordeón). Botones: "Marcar como realizado" (con subida opcional de factura a Drive), "Convertir en meta de ahorro", ícono de basura.

## 5. Historial — ahora en acordeón

El historial (tabla Fecha/Categoría/Nombre/Monto/Factura/Acciones, filtrable por categoría) se colapsa detrás de un encabezado con chevron, cerrado por defecto. Solo "Pendientes" queda fijo/siempre visible; Historial y Archivados se abren bajo demanda.

## 6. Contenido no modificado

- Título "🛒 Gastos y Compras".
- **Tarjeta "Ahorrando para estas compras"** — sin cambios, sigue siempre visible cuando tiene contenido (no es acordeón).
- Subida de facturas vía `<input type="file">` oculto → `src/api/drive.ts` (`uploadGastoFactura`).
- Modal "Nueva categoría".
- Modal "Editar gasto" (ahora sin campo de recurrencia, porque ya no existe).

## 7. Resumen de lo que cambió respecto a la versión anterior

**Se quitó:**
- Selector de "Tipo de recurrencia" (Adicional/Fijo/Personalizado) y el campo "¿Cada cuántos periodos se repite?".
- La detección automática de "toca comprar" (contador de periodos, alertas suaves de recordatorio).
- El módulo `domain/compras-recurrentes.ts` y su llamada en `ejecutarReinicioPeriodo` (`avanzarComprasRecurrentes`).

**Se agregó:**
- Botón "Archivar" (checkbox) en el formulario — guarda una plantilla reutilizable en paralelo al gasto normal.
- Sección "Archivados", con acciones manuales "Ya la compré" / "Pasar a pendientes" (sin fechas ni contadores automáticos).
- Acordeones para Historial y Archivados; "Pendientes" es la única sección siempre visible.
- Toggle segmentado (Pendiente/Ya lo pagué) reemplazando el `<select>` de estado.

**No cambió:**
- "Convertir en meta de ahorro", tabla de historial (contenido), subida de facturas, modal de categorías.
