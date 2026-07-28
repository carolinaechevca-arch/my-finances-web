# Spec — Ventana "Gastos Fijos" — Mis Finanzas

> Documento autocontenido para pasar directo a Claude Code. Cubre la ventana **Gastos Fijos** (`src/ui/pages/gastos-fijos.ts`). Depende del sistema global de periodo ya definido en el spec de Ingresos (`spec-ingresos.md`, sección 1-2): la app maneja un periodo configurable (Semanal/Quincenal/Mensual/Manual) en vez de mes calendario fijo.

## 0. Referencia visual

El usuario compartió una referencia de UI de app financiera (paleta morada, tarjetas modernas, pantalla "Budget" con categorías y barras de progreso). Confirmado:

- **Se toma:** el estilo visual general de tarjeta (limpio, moderno) y el **patrón de barras de progreso por categoría** de la pantalla "Budget".
- **No se toma:** el concepto de "límite/tope de presupuesto" que esa pantalla sugiere (gastado vs. un tope que el usuario define). El usuario aclaró explícitamente que **no quiere topes configurables** — solo quiere la barra visual mostrando cuánto se gastó por categoría, igual al patrón que ya existe hoy en el Dashboard ("Gastos del mes por categoría": barras horizontales, orden descendente, escaladas a la categoría más grande), pero ahora **también dentro de la propia página de Gastos Fijos**.
- **Paleta:** se mantiene el azul marino de la app — no se adopta el morado de la referencia.

## 1. Modelo de recurrencia — 3 tipos (cambio respecto al modelo actual de 1 solo tipo)

Hoy todo gasto fijo es implícitamente recurrente mensual. Con el periodo global configurable, se introducen **3 tipos de recurrencia** por gasto (más granular que Ingresos, que solo tiene 2):

| Tipo | Comportamiento | Insignia propuesta |
|---|---|---|
| **Fijo** | Se reaplica automáticamente en **cada** reinicio de periodo. | Verde "Fijo" |
| **Personalizado** | Se reaplica **cada N periodos** — el usuario define N (número entero, ej. "cada 3 periodos"). | Azul "Personalizado · cada N" *(color propuesto, ajustable)* |
| **Adicional** | Pago único — **se borra** al siguiente reinicio de periodo (no se reaplica). | Naranja "Adicional" |

- **Campo N (solo para Personalizado):** aparece **únicamente cuando el usuario selecciona "Personalizado"** en el formulario — un campo numérico donde escribe cada cuántos periodos se repite. No aparece para Fijo ni Adicional.
- **Lógica de conteo sugerida para "Personalizado"** *(detalle técnico, no fue una decisión de diseño del usuario — es la implementación natural del comportamiento descrito)*: cada gasto "Personalizado" lleva un contador interno de periodos transcurridos desde su creación (o desde su última reaplicación). En cada reinicio de periodo, el contador aumenta en 1; cuando llega a N, el gasto se reaplica (genera una instancia pagable para ese periodo) y el contador vuelve a 0.
- **Estado "En espera":** en los periodos donde un gasto "Personalizado" todavía no le toca reaplicarse, se sugiere que **siga apareciendo en la tabla** con un badge de estado tipo "En espera (faltan X periodos)" en vez de desaparecer — así el usuario no pierde de vista que existe. *(Propuesta — confirmar si prefieres que simplemente no aparezca hasta que le toque.)*

## 2. Pausado — comportamiento (por consistencia con Ingresos, confirmar si debe ser distinto)

> ⚠️ Esto **no se preguntó explícitamente** para Gastos Fijos — se aplica por consistencia con la regla ya confirmada en Ingresos. Avisar si Gastos Fijos debe comportarse diferente.

Igual que en Ingresos: si un gasto **Fijo** o **Personalizado** está en estado **Pausado** cuando le toca reaplicarse, **no se reaplica pero tampoco se elimina** — la definición queda intacta y pausada, simplemente no genera una instancia pagable para ese periodo.

## 3. Cambios en "Día de pago"

**Confirmado: no cambia.** "Día de pago" sigue siendo un **día de mes calendario fijo (1-31)**, sin importar el tipo de periodo configurado globalmente (semanal/quincenal/mensual/manual). No se adapta al tipo de periodo.

## 4. Nueva tarjeta: "Gasto por categoría" dentro de Gastos Fijos

*(Nueva sección en esta página — antes este desglose solo existía en el Dashboard)*

- Barras de progreso horizontales, una por categoría, mostrando el monto gastado en gastos fijos de esa categoría **en el periodo actual**.
- Ordenadas de mayor a menor, escaladas a la categoría con más gasto (mismo patrón que "Gastos del mes por categoría" del Dashboard).
- **Sin tope/límite configurable** — es puramente informativa/visual, no hay presupuesto que definir.
- Cálculo: **solo gastos fijos** de esa categoría (no incluye Gastos y Compras).
- Ubicación propuesta: entre el bloque de stats/diff-pill y el formulario "Agregar gasto" *(ajustable si se prefiere en otra posición de la página)*.

## 5. Contenido no modificado de la página (referencia — sin cambios salvo lo indicado arriba)

- Título "💸 Gastos Fijos".
- Fila de stats: Gastos pendientes (primaria), Total, Pagado. *(Sin cambio de copy — ya no decía "del mes", se mantiene igual)*
- Botón "Diferencia con lo pagado: $X" (`diff-pill`) → modal con gastos donde `montoPagado` difiere de lo esperado, rojo/verde según sea de más o de menos.
- Tabla ordenable (Nombre/Día/Monto asc/desc), columnas: Nombre, Categoría (insignia), Día de pago (con "Vencido"/"Hoy" y resaltado `is-vencido`/`is-today`), Estado (toggle Pagado/Pendiente — clic en "Pendiente→Pagado" abre `showMontoPagadoDialog`), Monto (con delta de diferencia coloreado si difirió), Acciones.
- Modales: Nueva categoría, Editar gasto fijo.

## 6. Cambios en el formulario "Agregar gasto" y modal "Editar gasto fijo"

Se agrega el selector de tipo de recurrencia (sección 1), con su campo condicional N:

- **Nombre** (con `<datalist>` de autocompletado) — sin cambio.
- **Categoría** (combo) — sin cambio.
- **Tipo de recurrencia** *(nuevo campo)*: Fijo / Personalizado / Adicional.
  - Si es **Personalizado** → aparece el campo numérico "¿Cada cuántos periodos se repite?".
- **Monto** — sin cambio.
- **Día de pago** — sin cambio (día de mes 1-31, sección 3).

El modal "Editar gasto fijo" refleja exactamente los mismos campos, incluyendo el condicional de N para Personalizado.

## 7. Cambios en la tabla — columna Recurrencia (nueva)

Se agrega una columna **Recurrencia** (no existía antes, porque antes todo era implícitamente fijo/mensual):

| Tipo | Insignia | Detalle adicional mostrado |
|---|---|---|
| Fijo | Verde "Fijo" | — |
| Personalizado | Azul "Personalizado" | "cada N periodos" + si aplica, "En espera (faltan X)" |
| Adicional | Naranja "Adicional" | — |

## 8. Resumen de lo que se agrega vs. lo que no cambia

**Se agrega:**
- Columna/selector de **Tipo de recurrencia** (Fijo / Personalizado / Adicional) en formulario, tabla y modal de edición.
- Campo numérico condicional N (solo para Personalizado).
- Lógica de reinicio de periodo aplicada a Gastos Fijos (igual que Ingresos: Fijo se reaplica siempre salvo pausado; Personalizado se reaplica cada N; Adicional se borra).
- Nueva tarjeta "Gasto por categoría" con barras de progreso (sin tope configurable).

**No cambia:**
- "Día de pago" sigue siendo día de mes calendario fijo.
- Stats row, diff-pill, tabla base, modales de categoría — igual que hoy.
- Paleta de color (azul marino, sin acento morado).

## 9. Pendiente de confirmar

- ¿El gasto "Personalizado" debe **seguir apareciendo** en la tabla en los periodos que no le toca (badge "En espera"), o **desaparecer** hasta que le toque? (sección 1, propuesta a confirmar)
- ¿El comportamiento de Pausado (sección 2) es correcto para Gastos Fijos, o debe ser distinto al de Ingresos?