# Spec — Ventana "Gastos y Compras" — Mis Finanzas

> Documento autocontenido para pasar directo a Claude Code. Cubre la ventana **Gastos y Compras** (`src/ui/pages/gastos-personales.ts`). Depende del sistema global de periodo (`spec-ingresos.md`, sección 1-2) y reutiliza el concepto de recurrencia de 3 tipos definido en `spec-gastos-fijos.md`, pero con una diferencia clave: **aquí la recurrencia nunca es obligatoria.**

## 0. Distinción de concepto: Gastos Fijos vs. Gastos y Compras (confirmado con el usuario)

- **Gastos Fijos** = compromisos del hogar que **hay que pagar sí o sí** (arriendo, servicios, etc.) — generan alertas de vencido, son obligatorios.
- **Gastos y Compras** = consumo/compras que a veces también siguen un patrón recurrente (ej. **champú, maquillaje**), pero **nunca son obligatorias** — no generan alertas de vencido, solo un recordatorio suave que el usuario puede ignorar o posponer sin consecuencia.

## 1. Adaptación al sistema de periodo (sin cambios funcionales adicionales más allá de esto)

| Elemento | Antes | Ahora |
|---|---|---|
| Insignia de la fila de título | Mostraba el mes | **Contador de días desde el último reinicio** (mismo patrón ya aplicado en Ingresos y Gastos Fijos) |
| Stat "Gastado este mes" | "Gastado este mes" | **"Gastado en el periodo"** |
| Stat "Pendientes por pagar" | Sin cambio de copy | Sin cambio |

## 2. Modelo de recurrencia — 3 tipos, pero NUNCA obligatorios

Se agrega el mismo selector de tipo que en Gastos Fijos, con **comportamiento distinto** porque las compras nunca son obligatorias:

| Tipo | Comportamiento en Gastos y Compras |
|---|---|
| **Adicional** | *(comportamiento actual, sin cambios)* — una compra puntual, con Fecha/Categoría/Nombre/Monto/"¿Ya lo hiciste?" (Pagado/Pendiente). Va a la tabla de historial o a "Pendientes por pagar" si está pendiente. Es la única que puede **"Convertir en meta de ahorro"**. |
| **Fijo** | Se repite **cada periodo** como recordatorio (no como obligación). |
| **Personalizado** | Se repite **cada N periodos** (campo numérico, igual que Gastos Fijos — solo aparece si se elige este tipo) como recordatorio. |

- **"Convertir en meta de ahorro" solo aplica a compras "Adicional"** (una sola vez) — confirmado. No tiene sentido para compras recurrentes de consumo como champú/maquillaje.

## 3. Cómo funciona el recordatorio de compras recurrentes (Fijo/Personalizado) — confirmado con ejemplo del champú

Cuando le "toca" a una compra recurrente (cada periodo si es Fijo, cada N periodos si es Personalizado):

- Aparece como un **recordatorio/sugerencia** (ej. "Toca tu compra recurrente de Champú") en una **nueva tarjeta separada de 'Pendientes por pagar'** — ver sección 4.
- **No es una alerta de vencido**, no usa colores rojos ni lenguaje de urgencia — es informativo/sugerido.
- El usuario decide: **registrarla ahora** (abre el mismo tipo de diálogo que "Marcar como realizado", pidiendo fecha/monto real) o **posponerla** (no pasa nada, se queda ahí).
- **El contador de N periodos solo se reinicia cuando el usuario efectivamente la registra** — si la pospone varias veces, el contador NO se reinicia y el recordatorio simplemente sigue apareciendo hasta que se registre.

## 4. Nueva tarjeta: "Compras recurrentes pendientes de registrar" *(nombre propuesto, ajustable)*

*(Nueva sección — separada de "Pendientes por pagar", que sigue siendo solo para compras Adicional marcadas como Pendiente)*

- Lista simple de filas, una por cada compra Fijo/Personalizado que le tocó este periodo (o periodos anteriores si se pospuso).
- Cada fila: nombre, categoría, monto de referencia (el registrado la última vez), y dos botones: **"Registrar ahora"** (abre diálogo de fecha/monto real, igual patrón que "Marcar como realizado") y **"Posponer"** (no hace nada más que dejarla ahí para el siguiente ciclo de revisión).
- Estilo visual **neutro/informativo**, no rojo/alerta — para reforzar que no es una obligación.

## 5. Cambios en el formulario "Agregar compra"

- **Tipo de recurrencia** *(nuevo campo, primero en el formulario)*: Adicional / Fijo / Personalizado.
  - Si es **Personalizado** → aparece el campo numérico "¿Cada cuántos periodos se repite?" (igual que Gastos Fijos).
- **Si es Adicional** → el formulario se mantiene exactamente igual a hoy: Fecha, Categoría, Nombre, Monto, "¿Ya lo hiciste?" (Pagado/Pendiente).
- **Si es Fijo o Personalizado** *(propuesta — no se confirmó el detalle exacto de campos, ajustar si es necesario)*: se omiten "Fecha" y "¿Ya lo hiciste?" (porque se está creando la plantilla recurrente, no un registro puntual con fecha real) — el formulario queda en Categoría, Nombre, Monto de referencia, y el campo N si aplica. La fecha y el monto real se piden después, cuando el usuario "Registra ahora" desde la tarjeta de la sección 4.

## 6. Contenido no modificado (referencia — sin cambios salvo lo indicado arriba)

- Título "🛒 Gastos y Compras".
- **Tarjeta "Pendientes por pagar"** — sin cambios: sigue siendo solo para compras **Adicional** marcadas como Pendiente. Botones: "Marcar como realizado" (con subida opcional de factura a Drive), "Convertir en meta de ahorro", ícono de basura.
- **Tarjeta "Ahorrando para estas compras"** — sin cambios.
- **Tabla de historial** filtrable por categoría, columnas Fecha/Categoría/Nombre/Monto/Factura/Acciones — sin cambios. *(Nota: las instancias registradas de compras Fijo/Personalizado también caen aquí, como cualquier otro gasto ya realizado.)*
- Subida de facturas vía `<input type="file">` oculto → `src/api/drive.ts` (`uploadGastoFactura`) — sin cambios.
- Modales: Nueva categoría, Editar gasto — sin cambios (Editar gasto ahora también refleja el tipo de recurrencia si aplica).

## 7. Resumen de lo que se agrega vs. lo que no cambia

**Se agrega:**
- Selector de **Tipo de recurrencia** (Adicional/Fijo/Personalizado) en el formulario y en la edición.
- Campo numérico condicional N (solo Personalizado).
- Nueva tarjeta **"Compras recurrentes pendientes de registrar"** (recordatorio suave, no obligatorio, sin alertas de vencido).
- Lógica de reinicio de contador N: solo se reinicia al registrar efectivamente, no al posponer.

**No cambia:**
- Todo lo relacionado con compras **Adicional** (que es el comportamiento actual completo de este módulo hoy).
- "Convertir en meta de ahorro" (solo para Adicional).
- Tabla de historial, subida de facturas, modal de categorías.

## 8. Pendiente de confirmar

- El detalle exacto de qué campos pide el formulario al crear una compra **Fijo/Personalizado** (sección 5) es una propuesta razonable, no algo confirmado explícitamente — ajustar si el usuario prefiere que sí se pida fecha/monto desde la creación.
- Nombre definitivo de la nueva tarjeta de la sección 4 (propuse "Compras recurrentes pendientes de registrar").