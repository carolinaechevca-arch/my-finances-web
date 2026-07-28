# Spec — Ventana "Ahorros y Metas" — Mis Finanzas

> Documento autocontenido para pasar directo a Claude Code. Cubre `src/ui/pages/ahorros.ts`. **Sin cambios funcionales nuevos** — el usuario confirmó que se deja igual, solo formalizado como spec independiente. Este módulo no dependía de "mes" en su diseño original (no tiene insignia de mes/periodo en la fila de título), así que no requiere adaptación al sistema global de periodo.

## 1. Título y stats

- Título "🐷💰 Ahorros y Metas" (ícono `moneybag-plus`).
- Tarjeta de stats: **Total acumulado**.

## 2. Formulario "Agregar meta"

- **Nombre**.
- **Tipo** — combo personalizado (crear/borrar), igual patrón que el resto de módulos.
- **Monto objetivo**.
- **Fecha límite** (opcional) — fecha calendario real, no depende del sistema de periodo.

## 3. Control de orden

- "Más cerca de cumplirse" / "Fecha límite más próxima".

## 4. Lista de metas activas (`.deuda-card` reutilizado)

- **Encabezado:** nombre, insignia de tipo, insignia "Vinculada a una compra" (si aplica), insignia "Pausada" (si aplica).
- **Cuerpo:** barra de progreso, grilla de stats (Acumulado / Objetivo / Progreso %), línea opcional de fecha límite.
- **Acciones de pie:**
  - **Aportar** — diálogo de monto/fecha/nota.
  - **Retirar** — solo si acumulado > 0; diálogo exige motivo obligatorio, con tope en el saldo actual.
  - **Ver historial** — línea de tiempo de aportes/retiros/aportes automáticos.
  - Para metas vinculadas a una compra pendiente: **"Marcar compra como pagada"** (una vez financiada al ≥100%) / **"Deshacer conversión"**.
  - **Pausar/Reanudar**, **Marcar cumplida/Reabrir**.

## 5. Nota histórica sobre aportes automáticos

Los aportes automáticos fueron eliminados (commit `3743054`). El tipo de movimiento `AporteAutomatico` **sigue existiendo solo para mostrar historial antiguo** — no hay ningún flujo de UI que los cree. Esto se mantiene igual.

## 6. Sección "Cumplidas"

Colapsable, mismo diseño de tarjeta que las activas.

## 7. Modales

- Editar meta.
- Nuevo tipo de meta.
- Historial (solo lectura).