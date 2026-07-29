# Spec — Cálculo unificado de "Dinero Disponible" y traspaso entre periodos — Mis Finanzas

> Documento autocontenido para pasar directo a Claude Code. Cubre `src/domain/balance.ts` (nuevo), y su uso en Inicio (`dashboard.ts`), Ingresos (`ingresos.ts`) y el reinicio de periodo (`domain/periodo.ts`). Depende del sistema global de periodo (`spec-ingresos.md`).

## 0. Motivo — auditoría solicitada por el usuario

El usuario pidió revisar que **todas las compras, gastos y ahorros que registra resten correctamente de su dinero disponible**. La auditoría encontró:

- **Gastos Fijos**: restaban el *total comprometido* del periodo, incluso lo todavía Pendiente. **Corregido tras aclaración del usuario**: un gasto fijo pendiente no debe restar hasta que se marca como Pagado — igual que ya funcionaba Gastos y Compras.
- **Gastos y Compras**: ya restaban correctamente (solo lo marcado como Pagado). Sin cambios.
- **Ahorros (aportes a metas)**: no restaban de "disponible" en ningún lado. Hueco real, corregido.
- **Deudas**: Inicio restaba la *cuota programada* de deudas "Con cuotas" (sin importar si ya se pagó), y una "Deuda simple" (sin cuota fija, ver `spec-deudas.md`) no restaba nada. Ingresos ni siquiera restaba deudas. Ambos corregidos y unificados.

Antes de este cambio, Inicio e Ingresos calculaban "disponible" con **fórmulas distintas entre sí** — quedan unificadas en una sola función. El principio final, confirmado con el usuario: **"disponible" solo se mueve con dinero que realmente ya entró o salió** — nada de montos programados/proyectados, en ningún módulo.

## 1. Nueva función única: `calcularDisponible` (`src/domain/balance.ts`)

Reemplaza los cálculos duplicados/inconsistentes de Inicio e Ingresos. Fórmula:

```
disponible = ingresos
  − gastos fijos REALMENTE PAGADOS este periodo (no el total comprometido)   [CORREGIDO]
  − gastos y compras REALMENTE PAGADOS este periodo (sin cambio de lógica)
  − abonos REALES a deudas propias (YoDebo) este periodo                    [NUEVO — antes era la cuota programada]
  + cobros REALES de deudas "Me Deben" este periodo                         [NUEVO]
  − aportes REALES a metas de ahorro este periodo                          [NUEVO]
  + retiros REALES de metas de ahorro este periodo                         [NUEVO — no confirmado explícitamente, ver sección 5]
```

- "Real" significa: el monto de eventos con fecha ya ocurrida dentro del periodo actual (`fechaUltimoReinicio` → hoy) — nunca lo programado/proyectado. Un gasto fijo "Pendiente" no resta nada hasta que lo marcas Pagado; en ese momento resta lo realmente pagado (`montoPagado`, que puede diferir del monto esperado).
- Aplica igual a deudas "Con cuotas" y "Deuda simple": ambas se miden por abono real, no por cuota.
- Usado por: la tarjeta "Balance" de Inicio, el stat "Balance disponible" de Ingresos, y el cálculo de traspaso al reiniciar periodo (sección 2).

## 2. Traspaso de saldo al reiniciar el periodo

Confirmado con el usuario: **el dinero disponible que sobra o falta al cerrar un periodo ya no se pierde** — se traspasa automáticamente al periodo siguiente.

- **Si sobra dinero** (`disponible > 0` al momento del reinicio): se crea automáticamente un ingreso **"Adicional"** por ese monto, con tipo "Sobrante de periodo" y nota "Traspasado automáticamente del periodo anterior". Mismo mecanismo tanto en reinicio automático como manual.
- **Si queda en negativo** (`disponible < 0`, gastaste de más):
  - **Reinicio automático** (Semanal/Quincenal/Mensual, sin usuario presente para preguntar): se traspasa por defecto como un ingreso "Adicional" **negativo** (mismo mecanismo, monto negativo), con nota indicando que el periodo anterior cerró en negativo.
  - **Reinicio manual** (botón en Inicio, solo visible en modo Manual): antes de ejecutar el reinicio, si el disponible es negativo, se le pregunta al usuario (`showTraspasoNegativoDialog`) cómo prefiere manejarlo — **queda a su discreción**:
    - **"Traspasar como ingreso negativo"** — mismo comportamiento que el automático.
    - **"Registrar como deuda"** — crea una Deuda nueva, dirección `YoDebo`, modo **"Simple"** (ver `spec-deudas.md`), contraparte y tipo "Sobregiro de periodo", monto = valor absoluto del déficit, con nota indicando que se generó automáticamente. Así el usuario puede decidir "trátalo como que me debo a mí mismo" en vez de simplemente descontarlo del próximo periodo.
    - **"Cancelar reinicio"** — no reinicia el periodo.

## 3. Dónde vive la lógica

- `domain/balance.ts` — `calcularDisponible(spreadsheetId, periodoInicio)`, sin dependencia de UI.
- `domain/periodo.ts` — `ejecutarReinicioPeriodo(spreadsheetId, nuevaFecha, traspasoDeficit?)` calcula el disponible del periodo que cierra (con `calcularDisponible`), y luego **primero** mueve la fecha de reinicio (`ConfigPeriodo`) y registra el traspaso del sobrante/déficit, y **solo después** archiva ingresos "Adicional" abiertos y reaplica Gastos Fijos (que pueden ser muchas escrituras seguidas, una por cada serie). Ese orden es a propósito: si la API de Sheets corta la operación a mitad de camino por el límite de peticiones por minuto, el periodo ya quedó bien movido — lo único que puede quedar a medias son los efectos secundarios (visibles y corregibles a mano), no la fecha del periodo en sí.
- `src/ui/components/dialogs.ts` — `showTraspasoNegativoDialog(montoDeficit)`, mismo patrón que los demás diálogos de la app (basado en promesas, `.modal`).
- `dashboard.ts` — botón "Reiniciar periodo": si el disponible actual es negativo, muestra el diálogo de la sección 2 antes de ejecutar el reinicio.

## 4. Impacto en otras pantallas

- **Inicio**: la tarjeta "Balance" ahora usa `calcularDisponible` en vez de su fórmula propia (que restaba cuota programada de deudas, no abono real).
- **Ingresos**: el stat "Balance disponible" ahora usa `calcularDisponible` en vez de su fórmula propia (que no restaba deudas en absoluto).
- **Deudas/Me Deben, Ahorros y Metas**: sin cambios funcionales — sus propias pantallas siguen mostrando totales acumulados de siempre (saldo pendiente, total ahorrado, etc.). Solo cambia qué eventos de esas pantallas alimentan el cálculo de "disponible" en Inicio/Ingresos.
- **Histórico**: sin cambios — su "Balance del periodo" (`resumenPeriodo`) sigue siendo el cálculo histórico ya existente (ingresos − gastos), no incluye deudas/ahorros; queda fuera de alcance de este documento.

## 5. Pendiente / asunción no confirmada explícitamente

- **Retiros de ahorro sumando a disponible**: se agregó por simetría (si un aporte resta, un retiro —que devuelve el dinero a lo disponible— debería sumar), pero el usuario no lo pidió explícitamente. Avisar si se prefiere que los retiros no afecten "disponible".
