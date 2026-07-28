# Spec — Componentes Compartidos, Íconos y Sistema de Diseño — Mis Finanzas

> Documento de referencia autocontenido, sin cambios funcionales nuevos — consolida lo ya acordado para que Claude Code tenga el contexto transversal de la app en un solo lugar. Aplica a todas las ventanas.

## 1. Componentes de UI reutilizables

- **`src/ui/components/dialogs.ts`** — reemplazos de `alert`/`confirm`/`prompt` nativos basados en promesas, estilizados vía `.modal`: `showConfirm`, `showAlert`, `showMontoPagadoDialog`, `showCompletarGastoDialog`, `showMergeChoice`, `showAbonoDialog`, `showRetiroDialog`, `showConvertirMetaDialog`. Cada uno se crea dinámicamente, se agrega al `<body>`, y se elimina al cerrarse.
- **`src/ui/components/tipo-combo.ts`** — `createOptionCombo()`: desplegable personalizado (no `<select>` nativo) para tipos/categorías/contrapartes. Botón disparador con valor actual + `chevron-down` (rota 180° al abrir); panel con marca de verificación en la opción seleccionada y borrado con ícono de basura al hover; fila de pie "+ Nuevo tipo…" dispara el modal de creación de la página padre. Cierra con clic fuera o Escape.
- **`src/ui/components/charts.ts`** — `renderBarChart` / `renderLineChart`, gráficos SVG de barras/línea hechos a mano (sin librería externa).

## 2. Botones

- `.btn` — sólido primario, bordes redondeados tipo píldora.
- `.btn-secondary` — contorneado, fondo transparente.
- `.btn-danger` — rojo sólido.
- `.icon-btn` — variantes `--edit` (tinte primario) / `--delete` (tinte rojo), cuadrado 32px, para íconos de editar/basura en tablas y tarjetas.
- `.btn-toggle` — contorno tipo píldora, alterna "encendido" (verde éxito) / "apagado", usado en Activo/Pausado y Pagado/Pendiente.
- `.diff-pill` — botón tipo píldora redondeado (Gastos Fijos).

## 3. Tarjetas

- `.card` — genérica: superficie blanca/oscura, `border-radius: 14px`, sombra suave (`--shadow-card`).
- `.stat-card` — número grande centrado + etiqueta; variante `--primary` rellena con color de marca sólido y texto blanco.
- `.deuda-card` — reutilizada por Deudas/Me Deben/Ahorros para tarjetas de entidad.
- `.card-grid` — grilla responsive auto-fit para filas de stats.
- `.dashboard-grid` / `.card--span2` *(NUEVO — ver `spec-inicio-dashboard.md`)* — clases de grilla bento usadas solo en el Dashboard.

## 4. Tablas

- `.data-table` — encabezados en mayúsculas apagadas, filas planas sin hover.
- `.badge` — variantes `--fijo` (verde), `--unico`/`--adicional` (naranja), `--neutral` (gris), `--today` (naranja), `--vencido` (rojo).
- `.is-today` / `.is-vencido` — clases de resaltado de fila.
- En pantallas ≤780px, las tablas se reacomodan en layout "una tarjeta por fila" usando `data-label` como pseudo-encabezados.

## 5. Formularios

- `.form` — grilla responsive auto-fit de etiqueta/input.
- `.field` — etiqueta arriba del input/select, estilo apagado tipo small-caps.
- Estilo de input consistente con contorno de foco en color de acento.

## 6. Set de íconos — dos sistemas conviven

- **Set principal:** SVG inline en `src/icon/*.svg`, importados con el sufijo `?raw` de Vite, estilo Tabler-icons de línea. Es el estándar para nav, botones e íconos generales de toda la app.
  - Set actual: `businessplan`, `calendar-month`, `cash-banknote-plus`, `cash-minus`, `cash`, `chevron-down`, `edit`, `eye`, `file-time`, `finance`, `fixed-costs` (no usado en nav actual — ¿legado?), `home-dollar`, `logout`, `menu-2`, `moneybag-plus`, `moon`, `pig-money`, `receipt-2` (probablemente reservado), `shopping-cart`, `sun`, `trash-x`, y **`settings`** (nuevo, provisto por el usuario).
  - Íconos coloreados vía `currentColor`/CSS (`.nav-icon--white` fuerza blanco en el sidebar oscuro; `icon-btn` tiñe editar=primario, borrar=peligro).
- **Excepción puntual — Bootstrap Icons:** vía CDN (clase `bi bi-nombre`), agregado **únicamente** para los íconos de severidad de Alertas en el Dashboard (ver `spec-inicio-dashboard.md`, sección 6.1). Requiere el `<link>` del CDN en `index.html`. No reemplaza el set SVG existente en ningún otro lugar de la app.

## 7. Tipografía

- Poppins, vía stack de fuentes del sistema como respaldo — no hay `@font-face` ni enlace de Google Fonts; depende de que el SO tenga la fuente, o cae a `system-ui`.

## 8. Sistema de color (`src/styles/theme.css`)

**Claro:**
- Fondo `#eef1f7`, superficie blanca, texto `#0a1330`, primario `#2c4a7c`, acento `#6b83b8`, sidebar `#0a1330`.

**Oscuro:**
- Fondo `#0e1a3c`, superficie `#17264f`, texto `#eaeefa`, primario `#7691c9`, sidebar `#081029`.

**Semánticos:**
- Éxito `#2e9e5b`, peligro `#c1443c`, advertencia `#c98a1f` — reutilizados en insignias, progreso, indicadores de vencido/pendiente.

**Radios:** sm 8px / md 14px / lg 22px; `--shadow-card` compartido.

**Login:** sobreescribe localmente `--color-accent`/`--color-primary` a `#3b82f6`/`#1d4ed8`, independiente del resto de la app.

> Confirmado en las conversaciones de Inicio y Gastos Fijos: **esta paleta se mantiene sin cambios** pese a las referencias visuales compartidas (Finai, KangCokor, Finance App UI) — esas referencias solo aportaron estilo de tarjeta y layout, nunca color.

## 9. Convenciones de layout

- Sidebar 240px + contenido flexible (28–32px padding, 18px en móvil).
- `.page-title-row` — ícono+título a la izquierda, insignia de periodo (o nada) a la derecha, en la parte superior de cada módulo.
- Bloques `.card` apilados verticalmente con 20px de espacio *(excepto Dashboard, que usa grilla bento — ver `spec-inicio-dashboard.md`)*.
- Filas de stats: grillas responsive auto-fit (mínimo 160px por casilla).
- Barras de progreso: divs tipo píldora de 8px con barra interna rellena, reutilizadas en deudas y metas de ahorro.

## 10. Notas transversales del proyecto (resumen de dependencias entre specs)

- **Sistema de periodo global** (Semanal/Quincenal/Mensual/Manual) — definido en `spec-ingresos.md`, configurado en `spec-configuracion.md`, con botón de reinicio manual en `spec-inicio-dashboard.md`. Afecta a Ingresos, Gastos Fijos, Gastos y Compras, e Histórico.
- **Modelo de recurrencia (Fijo/Personalizado/Adicional)** — definido primero en Gastos Fijos (`spec-gastos-fijos.md`), reutilizado con matices en Gastos y Compras (`spec-gastos-y-compras.md`, donde nunca es obligatorio).
- **Modelo de deuda (Con cuotas / Deuda simple)** — definido en `spec-deudas-me-deben.md`, aplica igual a Deudas y Me Deben.
- **Personalización del Dashboard** — definida en `spec-inicio-dashboard.md`, configurada desde `spec-configuracion.md`.