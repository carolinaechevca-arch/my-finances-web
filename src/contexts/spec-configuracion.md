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

## 4. Tarjeta "Preferencias de la app"

- Selector de tema (claro/oscuro/automático) — misma lógica que el interruptor flotante existente (`theme-toggle.ts`, `localStorage` key `mf-theme`), presentado también aquí como control adicional.
- (Opcional) Selector de moneda/locale — por ahora fijo en COP/es-CO, solo texto informativo.

## 5. Tarjeta "Categorías y tipos"

- Acceso centralizado para gestionar (crear/renombrar/borrar) los combos hoy dispersos por módulo: tipos de ingreso, categorías de gastos fijos, categorías de gastos y compras, tipos de deuda, tipos de meta.
- Reutiliza `tipo-combo.ts` y los modales de "Nuevo tipo" ya existentes en cada módulo — no duplica lógica.

## 6. Tarjeta "Tu cuenta"

- Correo de la cuenta de Google conectada.
- Enlace directo a la Hoja de Cálculo en Drive (mismo enlace que la tarjeta del dashboard).
- Botón de cerrar sesión (redundante con el del pie del sidebar, o se podría mover aquí y quitarlo de allá — a decidir en implementación, no bloqueante).

## 7. Tarjeta "Datos" (opcional)

- Botón para exportar todos los datos a CSV (extensión del CSV anual de Histórico, pero para todo el histórico completo) — no implementado.

## 7.1 Tarjeta "Zona peligrosa" — "Limpiar todo" *(implementado)*

- Botón `.btn-danger` "Limpiar todo" con modal de confirmación (`showConfirm`, `danger: true`), que explica exactamente qué se borra y aclara que no se puede deshacer.
- Borra el contenido de las hojas de **datos financieros** (`limpiarTodosLosDatos` en `src/api/spreadsheet-bootstrap.ts`, vía `values:batchClear` — un solo request para todos los rangos, no una petición por hoja) y vuelve a sembrar los valores por defecto (categorías, tipos de deuda, historial inicial) — como si el spreadsheet se acabara de crear.
- **`ConfigDashboard` y `ConfigPeriodo` quedan excluidas a propósito** — son preferencias de la app (personalización del dashboard, frecuencia del periodo), no datos financieros; "Limpiar todo" no debe reiniciarlas (confirmado con el usuario tras un reporte de que se le borraba la frecuencia configurada). Para restablecer el dashboard existe el botón aparte "Restablecer a valores por defecto".
- Tras limpiar, se vuelve a renderizar la página completa de Configuración.

## 8. Pendiente / dependencias externas

- Reglas exactas de corte de periodo (sección 2) — ver `spec-ingresos.md`.
- Formato de etiqueta de periodo en Histórico — ver `spec-historico.md`.