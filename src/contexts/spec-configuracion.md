# Spec — Ventana "Configuración" — Mis Finanzas

> Documento autocontenido para pasar directo a Claude Code. Cubre `src/ui/pages/configuracion.ts` (archivo nuevo a crear). Consolida todo lo ya acordado en conversaciones anteriores — sin cambios nuevos en esta pasada.

## 1. General

- Título "⚙️ Configuración" (ícono `settings`, importado igual que el resto desde `src/icon/settings.svg`, provisto ya descargado por el usuario — mismo patrón `?raw` que el resto del set SVG inline).
- Sin insignia de mes/periodo — esta pantalla no depende del periodo seleccionado.
- Ícono de navegación en el sidebar: `settings.svg` (9ª sección de `NAV_SECTIONS`).

## 2. Tarjeta "Periodo de la app" *(NUEVA — base del sistema global de periodo, ver `spec-ingresos.md`)*

- Selector con 4 opciones: **Semanal / Quincenal / Mensual / Manual**.
- Es una configuración **única y global**, aplica a toda la app (Ingresos, Gastos Fijos, Gastos y Compras, Deudas, Me Deben, Ahorros, Histórico, Dashboard).
- Persistencia: pestaña `ConfigPeriodo` en la Hoja de Google (`frecuencia | fechaUltimoReinicio`).
- El botón de reinicio manual ("Reiniciar periodo") **vive aquí**, junto al selector de Frecuencia, y solo aparece cuando el modo es **Manual**. Si ya se reinició hoy, el botón queda deshabilitado ("Ya reiniciaste hoy", en blanco/`.btn-secondary`; activo se ve azul/`.btn`) y aparece un botón secundario "Forzar reinicio de todas formas" con una advertencia explícita, por si de verdad hace falta reiniciar dos veces el mismo día. Antes vivía en Inicio (Dashboard); se movió aquí. Ver `spec-ingresos.md` sección 1.
- Reglas exactas de corte por modo (inicio de semana, días de corte de quincena, etc.) — pendientes de definir, ver `spec-ingresos.md` sección 1.

## 3. Tarjeta "Personalizar dashboard"

- Lista de **todas** las tarjetas del dashboard (sin excepción), cada una como fila con:
  - Switch mostrar/ocultar.
  - Control segmentado de 2 opciones de color: **Primario** (azul) / **Neutro**.
  - Ícono de arrastre (`bi-grip-vertical` o similar) para reordenar por drag & drop.
- **IDs de tarjeta:** `balance`, `alertas`, `resumenGastosFijos`, `resumenDeudas`, `resumenMeDeben`, `resumenAhorros`, `gastosPorCategoria`, `comparativoMesAnterior`, `ultimosMovimientos`, `cta`, `hojaDrive`.
- **Persistencia:** pestaña `ConfigDashboard` en la Hoja de Google (`cardId | visible | color | orden`). Se crea automáticamente con valores por defecto (todas visibles, `balance` en Primario, resto en Neutro, orden actual) si no existe aún.
- Botón "Restablecer a valores por defecto".

## 4. Tarjeta "Preferencias de la app" *(implementado)*

- Selector de tema (claro/oscuro/automático), reutilizando la misma lógica del interruptor flotante existente (`theme-toggle.ts`, `localStorage` key `mf-theme`) — se le agregaron `getThemeMode()`/`setThemeMode()` exportados para que ambos controles compartan la lógica en vez de duplicarla. "Automático" = sin preferencia guardada, sigue el tema del sistema.
- Selector de moneda/locale: **no es un selector**, solo texto informativo fijo ("Moneda: Peso colombiano (COP)"), como decía la nota original.

## 5. Tarjeta "Categorías y tipos" *(implementado — solo crear/borrar, sin renombrar)*

- Acceso centralizado para gestionar los 6 listados hoy dispersos por módulo: tipos de ingreso, categorías de gastos fijos, categorías de gastos y compras, tipos de deuda (Yo debo), tipos de deuda (Me deben), tipos de meta. Cada uno en su propia mini-lista de chips con "×" para borrar y un input para agregar.
- **Confirmado con el usuario: solo crear/borrar por ahora, sin renombrar** — ningún módulo de la app soporta renombrar categorías/tipos hoy (sería funcionalidad nueva de cero, no reutilización), así que se dejó fuera de esta pasada.
- Reutiliza las funciones `crear*`/`eliminar*`/`list*` ya existentes de cada dominio (`gastos.ts`, `gastos-y-compras.ts`, `ingresos.ts`, `deudas.ts`, `metas.ts`) — no duplica lógica de negocio, solo la UI.

## 6. Tarjeta "Tu cuenta" *(implementado)*

- Correo de la cuenta de Google conectada (`user.email`, pasado a `renderConfiguracion` desde `main.ts`).
- Enlace directo a la Hoja de Cálculo en Drive (mismo formato de URL que la tarjeta del dashboard).
- Botón de cerrar sesión — se agregó aquí como botón adicional; el del pie del sidebar **no se quitó** (quedan ambos).

## 7. Tarjeta "Datos" *(implementado)*

- Botón "Exportar todo el histórico (CSV)" — extensión de `descargarResumenAnualCSV` (`descargarHistoricoCompletoCSV` en `domain/historico.ts`): una fila de totales por cada año con datos, más las facturas de todos los años combinadas en una sola tabla.

## 7.1 Tarjeta "Zona peligrosa" — "Limpiar todo" *(implementado)*

- Botón `.btn-danger` "Limpiar todo" con modal de confirmación (`showConfirm`, `danger: true`), que explica exactamente qué se borra y aclara que no se puede deshacer.
- Borra el contenido de las hojas de **datos financieros** (`limpiarTodosLosDatos` en `src/api/spreadsheet-bootstrap.ts`, vía `values:batchClear` — un solo request para todos los rangos, no una petición por hoja) y vuelve a sembrar los valores por defecto (categorías, tipos de deuda, historial inicial) — como si el spreadsheet se acabara de crear.
- **`ConfigDashboard` y `ConfigPeriodo` quedan excluidas a propósito** — son preferencias de la app (personalización del dashboard, frecuencia del periodo), no datos financieros; "Limpiar todo" no debe reiniciarlas (confirmado con el usuario tras un reporte de que se le borraba la frecuencia configurada). Para restablecer el dashboard existe el botón aparte "Restablecer a valores por defecto".
- Tras limpiar, se vuelve a renderizar la página completa de Configuración.

## 8. Pendiente / dependencias externas

- Reglas exactas de corte de periodo (sección 2) — ver `spec-ingresos.md`.
- Formato de etiqueta de periodo en Histórico — ver `spec-historico.md`.