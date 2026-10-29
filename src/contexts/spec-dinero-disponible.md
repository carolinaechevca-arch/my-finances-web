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
disponible = pagos de ingresos REALMENTE RECIBIDOS en el periodo
  − gastos fijos REALMENTE PAGADOS este periodo (no el total comprometido)   [CORREGIDO]
  − gastos y compras REALMENTE PAGADOS este periodo (sin cambio de lógica)
  − abonos REALES a deudas propias (YoDebo) este periodo                    [NUEVO — antes era la cuota programada]
  + cobros REALES de deudas "Me Deben" este periodo                         [NUEVO]
  − aportes REALES a metas de ahorro este periodo                          [NUEVO]
  + retiros REALES de metas de ahorro este periodo                         [NUEVO — no confirmado explícitamente, ver sección 5]
```

- "Real" significa: el monto de eventos con fecha ya ocurrida dentro del periodo actual (`fechaUltimoReinicio` → hoy) — nunca lo programado/proyectado. Una fuente de ingreso no suma hasta registrar su pago recibido; de igual forma, un gasto fijo "Pendiente" no resta hasta que lo marcas Pagado.
- Aplica igual a deudas "Con cuotas" y "Deuda simple": ambas se miden por abono real, no por cuota.
- Usado por: la tarjeta "Balance" de Inicio, el stat "Balance disponible" de Ingresos, y el cálculo de traspaso al reiniciar periodo (sección 2).

## 2. Traspaso de saldo al reiniciar el periodo

El periodo se reinicia únicamente de forma manual. Antes de ejecutarlo, la app muestra el disponible calculado y pregunta si ese fue el sobrante real. El usuario puede aceptarlo o corregirlo si hubo ingresos o gastos sin registrar.

- El sobrante real debe ser igual o mayor que cero.
- Si es mayor que cero, se crea en el periodo nuevo un pago único recibido llamado **"Lo que sobró del periodo anterior"**, categoría **"Sobrante anterior"**.
- Si es cero, no se crea ningún pago único.
- Las fuentes de pago único del periodo que termina se eliminan durante el reinicio, pero sus movimientos permanecen en el historial.
- Cancelar el diálogo cancela también el reinicio.

## 3. Dónde vive la lógica

- `domain/balance.ts` — `calcularDisponible(spreadsheetId, periodoInicio)`, sin dependencia de UI.
- `domain/periodo.ts` — `ejecutarReinicioPeriodo(spreadsheetId, nuevaFecha, sobranteReal)` valida el monto confirmado, mueve la fecha de reinicio, elimina fuentes de pago único anteriores, crea el nuevo sobrante cuando corresponde y reaplica Gastos Fijos.
- `src/ui/components/dialogs.ts` — `showConfirmarSobranteDialog(disponibleCalculado)` permite aceptar el cálculo o ingresar el monto real, incluido cero pero nunca negativo.
- `configuracion.ts` — el botón "Reiniciar periodo" calcula el disponible y abre siempre el diálogo de confirmación antes de ejecutar el reinicio.

## 4. Impacto en otras pantallas

- **Inicio**: la tarjeta "Balance" ahora usa `calcularDisponible` en vez de su fórmula propia (que restaba cuota programada de deudas, no abono real).
- **Ingresos**: el stat "Balance disponible" ahora usa `calcularDisponible` en vez de su fórmula propia (que no restaba deudas en absoluto).
- **Deudas/Me Deben y Bolsillos de Ahorro**: sus pantallas muestran sus saldos acumulados. Los depósitos y retiros de bolsillos también alimentan el cálculo de "disponible" en Inicio/Ingresos.
- **Histórico**: sin cambios — su "Balance del periodo" (`resumenPeriodo`) sigue siendo el cálculo histórico ya existente (ingresos − gastos), no incluye deudas/ahorros; queda fuera de alcance de este documento.

## 5. Pendiente / asunción no confirmada explícitamente

- **Retiros de ahorro sumando a disponible**: se agregó por simetría (si un aporte resta, un retiro —que devuelve el dinero a lo disponible— debería sumar), pero el usuario no lo pidió explícitamente. Avisar si se prefiere que los retiros no afecten "disponible".
