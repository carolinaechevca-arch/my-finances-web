# Spec — Ventana "Ingresos" — Mis Finanzas

> Documento autocontenido para pasar directo a Claude Code. Cubre la ventana **Ingresos** (`src/ui/pages/ingresos.ts`) y el **nuevo sistema global de periodo**, que es un cambio de arquitectura transversal a toda la app (no solo a Ingresos). Contexto: SPA en TypeScript puro + Vite, sin framework, CSS plano, copy en español (es-CO), datos en Hoja de Google.

## 0. ⚠️ Cambio de arquitectura: el "mes" deja de ser la unidad de tiempo de la app

Confirmado con el usuario: **hoy toda la app gira en torno al mes calendario** (Dashboard "Resumen del Mes", Gastos Fijos por mes, Histórico por mes, etc.). Esto cambia:

- La app pasa a manejar un **"periodo"** configurable, con 4 modos posibles: **Semanal**, **Quincenal**, **Mensual**, o **Manual**.
- Es una **configuración única y global**, no por ingreso ni por módulo — vive en **Configuración** y aplica a toda la app (Ingresos, Gastos Fijos, Gastos y Compras, Deudas, Ahorros, Histórico, Dashboard).
- **Este documento especifica en detalle solo el impacto en Ingresos** (que es donde el usuario empezó a describir el cambio) y deja sentada la base técnica del sistema de periodo. **Los demás módulos (Gastos Fijos, Histórico, etc.) necesitan su propia pasada de spec** para adaptar su lógica de "mes" a "periodo" — no están cubiertos en detalle aquí, pero dependen de la misma base técnica descrita en la sección 1.

## 1. Sistema global de periodo (base técnica)

- **Configuración (nueva tarjeta "Periodo de la app"):** un selector con las 4 opciones — Semanal / Quincenal / Mensual / Manual.
- **Modos automáticos (Semanal/Quincenal/Mensual):** el periodo se reinicia solo, sin intervención del usuario, al llegar la fecha de corte correspondiente.
- **Modo Manual:** no hay reinicio automático. En su lugar, aparece un **botón "Reiniciar periodo"** en **Inicio (Dashboard)**, que:
  - Muestra una confirmación (`showConfirm`) antes de ejecutar.
  - Al confirmar, dispara **exactamente el mismo efecto** que el reinicio automático de los otros modos (ver sección 2).
- **Persistencia sugerida:** nueva pestaña global en la Hoja de Google, ej. `ConfigPeriodo`, con columnas:
  ```
  frecuencia | fechaUltimoReinicio
  ```
  Se lee al cargar la app para saber si toca reiniciar (modos automáticos) y para calcular el contador de días (ver sección 3).
- **Pendiente de definir (no bloqueante para Ingresos, pero se necesita antes de tocar otros módulos):** reglas exactas de corte por modo — ej. Semanal ¿empieza lunes o domingo?, Quincenal ¿corta los días 1 y 16, o 1 y 15?, Mensual ¿siempre el día 1? — no se resolvió en esta conversación, quedará para cuando se trabajen esos módulos si aplica, o se puede definir ahora si el usuario quiere adelantarlo.

## 2. Qué pasa exactamente al "reiniciar el periodo" (confirmado con el usuario)

- **Ingresos tipo "Fijo":** se **reaplican automáticamente** para el nuevo periodo (se genera de nuevo su instancia activa).
  - **Excepción:** si un ingreso "Fijo" está en estado **Pausado** al momento del reinicio, **no se reaplica, pero tampoco se elimina** — la definición del ingreso queda intacta y pausada, simplemente no genera una nueva instancia para el periodo que empieza. Si luego el usuario lo reactiva, vuelve a reaplicarse en el siguiente reinicio.
- **Ingresos tipo "Adicional":** **desaparecen/se limpian** al reiniciar — son de una sola vez, para el periodo en el que se registraron.

## 3. Cambios de copy en la fila de título (Ingresos, y patrón a replicar en otros módulos)

| Elemento | Antes | Ahora |
|---|---|---|
| Título | "💵 Ingresos Fijos" | Se mantiene igual (sin cambio de copy solicitado) |
| Insignia de mes | Mostraba el mes (ej. "Julio de 2026") | **Contador de días desde el último reinicio** (ej. "Día 12 desde el último reinicio" — *copy exacto ajustable, el usuario pidió específicamente un contador de días, no un rango de fechas ni el nombre del tipo de periodo*) |

Este mismo patrón de insignia (contador de días) reemplaza la insignia de mes en **todos los módulos que hoy muestran el mes**, no solo en Ingresos — aplicar el mismo componente reutilizable.

## 4. Cambios en el formulario "Agregar ingreso"

- **Se elimina por completo** la pregunta "¿Cada cuánto te pagan?" (Mensual/Quincenal/Semanal) y sus campos dependientes (día(s) de pago para Quincenal, día de la semana para Semanal). Esta lógica ya no aplica: la frecuencia ahora es global (sección 1), no por ingreso individual.
- **"¿Cada cuánto aplica?" se mantiene, pero renombrado:**
  - **Fijo** — se reaplica automáticamente en cada reinicio de periodo (antes: "Fijo (todos los meses)").
  - **Adicional** — se borra al reiniciar el periodo (antes: "UnicoMes (solo este mes)").
- El resto del formulario no cambia: **Tipo** (combo con crear/borrar), **Monto**, **Notas** (opcional), botón de envío.

## 5. Cambios en la fila de stats (3 stat-cards)

| Antes | Ahora |
|---|---|
| Total mensual vigente | **Total vigente** |
| Ingresos fijos recurrentes | Ingresos fijos recurrentes *(sin cambio)* |
| Balance disponible este mes | **Balance disponible** |

*(Solo se quita la palabra "mes"/"mensual" del copy, ya que el periodo ya no es necesariamente un mes. Sin cambio de lógica de cálculo.)*

## 6. Cambios en la tabla "Tus ingresos"

- **Título de la tabla:** "Tus ingresos" (se quita el sufijo "— {mes}").
- **Columnas:**
  - **Tipo** — sin cambio.
  - **Recurrencia** (insignia): **verde "Fijo"** vs. **naranja "Adicional"** *(antes: "Fijo"/"Fijo · Quincenal" vs. "Solo este mes")*. Ya no hay variantes de "· Quincenal" etc., porque la frecuencia por ingreso se eliminó.
  - **Notas** — sin cambio.
  - **Estado:** toggle tipo píldora verde **Activo/Pausado** para ingresos "Fijo" (sin cambio de comportamiento salvo lo descrito en la sección 2), o insignia neutra **"Adicional"** *(renombrada desde "Puntual", para ser consistente con la insignia de Recurrencia)* para ingresos de una sola vez.
  - **Monto** — se quita la nota "× N este mes" (ya no aplica, dependía de la frecuencia por ingreso que se eliminó).
  - **Acciones** — sin cambio (editar/basura).
- Comportamiento mobile (tarjetas apiladas con `data-label`) — sin cambio.

## 7. Modales

- **"Nuevo tipo de ingreso"** — sin cambio.
- **"Editar ingreso"** — mismo formulario simplificado que el de creación (sección 4): ya **no incluye** los campos de día-pago/Quincenal/Semanal que antes reflejaba.

## 8. Resumen de lo que se elimina vs. lo que se agrega

**Se elimina:**
- Campo "¿Cada cuánto te pagan?" (Mensual/Quincenal/Semanal) y sus sub-campos de día, tanto en el formulario de creación como en el de edición.
- Nota "× N este mes" en la columna Monto.
- Insignia "Fijo · Quincenal" / "Fijo · Semanal" (ya no existen esas variantes).

**Se renombra:**
- "UnicoMes" → **"Adicional"** (en el selector del formulario, en la insignia de Recurrencia, y en la insignia de Estado que antes decía "Puntual").
- Insignia de mes en la fila de título → **contador de días desde el último reinicio**.

**Se agrega:**
- Sistema global de periodo (Semanal/Quincenal/Mensual/Manual) configurado en Configuración.
- Botón "Reiniciar periodo" en Inicio, visible solo en modo Manual, con confirmación.
- Lógica de reinicio de periodo: reaplicar "Fijo" (salvo pausados), limpiar "Adicional".
- Nueva pestaña `ConfigPeriodo` en la Hoja de Google.

## 9. Pendiente / fuera de alcance de este documento

- Reglas exactas de corte de periodo por modo (día de inicio de semana, días de corte de quincena, etc.) — no bloqueante para Ingresos, pero necesario antes de tocar Gastos Fijos, Histórico, Dashboard, etc.
- Adaptación de los demás módulos (Gastos Fijos, Gastos y Compras, Deudas, Me Deben, Ahorros, Histórico) al nuevo concepto de periodo — cada uno necesita su propia revisión, ya que hoy todos calculan datos "del mes".