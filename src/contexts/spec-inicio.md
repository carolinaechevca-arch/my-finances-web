# Spec — Ventana "Inicio" (Dashboard) — Mis Finanzas

> Documento autocontenido para pasar directo a Claude Code. Cubre únicamente la ventana **Inicio** (`src/ui/pages/dashboard.ts`). Contexto de la app: SPA en TypeScript puro + Vite, sin framework, sin Tailwind (CSS plano en `src/styles/theme.css`/`layout.css`), copy en español (es-CO), datos persistidos en una Hoja de Google del propio Drive del usuario.

## 1. Contexto y referencias visuales

El usuario compartió dos capturas de dashboards de referencia (Finai — fintech claro con acentos verdes/negros, y KangCokor — panel de reservas con sidebar oscura) **únicamente como inspiración visual**, no como funcionalidad a copiar. Confirmado con el usuario:

- **Se toma:** el estilo visual de tarjeta (bordes redondeados, ícono pequeño junto al título, tipografía limpia, espaciado generoso) **y** el layout general en grilla/bento (varias tarjetas por fila, tamaños mixtos), en vez del apilado vertical actual.
- **No se toma:** el indicador de "% de cambio vs. mes anterior" que aparece en las stat-cards de Finai — el usuario aclaró que era solo inspiración de estilo de tarjeta, no una funcionalidad a agregar. La funcionalidad de comparación ya existe aparte como la tarjeta "Comparativo" (ver sección 3 más abajo) y no cambia.
- **Paleta de color:** se mantiene la paleta azul marino/blanco actual de la app (`--color-primary #2c4a7c` claro / `#7691c9` oscuro, etc. — sin cambios). No se adopta la paleta verde de Finai ni la negra/roja de KangCokor.

## 2. Cambios de copy en la fila de título

| Elemento | Antes | Ahora |
|---|---|---|
| Título | "📅 Resumen del Mes" | **"📅 Cómo van mis finanzas"** |
| Insignia | Solo el mes (ej. "Julio de 2026") | **Fecha completa del día actual** (ej. "27 de Julio de 2026") |

## 3. Inventario de tarjetas (contenido — sin cambios funcionales salvo lo indicado)

Estas son todas las tarjetas del dashboard hoy. Su **contenido y lógica de negocio no cambian** en este spec — lo que cambia es cómo se ven y se organizan (ver secciones 4-6):

1. **Balance** — número grande "Disponible este mes" = ingresos − gastos fijos − gastos variables − cuotas de deudas activas. Es una `stat-card` (número + etiqueta centrados).
2. **Alertas** — filas clicables para gastos fijos vencidos/próximos, cuotas de deuda vencidas/próximas, gastos-y-compras pendientes, compromisos "me deben" vencidos. Click navega a esa sección. Muestra "Todo al día ✅" (o su versión con ícono, ver sección 6) cuando está vacía.
3. **Resumen de Gastos Fijos** — mini grilla Total/Pagado/Falta, barra de progreso, hasta 3 ítems próximos, botón "Ver módulo".
4. **Resumen de Deudas** — total pendiente, próximo pago, hasta 3 barras de progreso por contraparte.
5. **Resumen de Me Deben** — total que te deben, advertencia si hay algo vencido.
6. **Resumen de Ahorros y Metas** (oculta si no hay metas activas) — total ahorrado, top 3 barras de progreso, "Ver todas".
7. **Gastos del mes por categoría** — barras horizontales por categoría, descendente.
8. **Comparativo** (oculta sin datos del mes anterior) — frase de variación % vs. mes anterior. *(Esta es la única tarjeta con lógica de comparación porcentual — no se agrega ese indicador a ninguna otra tarjeta.)*
9. **Últimos movimientos** — feed de las 6 transacciones más recientes.
10. **CTA** (oculta si hay ingresos) — invitación a agregar el primer ingreso fijo.
11. **Tu Hoja de Cálculo en Drive** — estado de conexión + botón "Abrir en Google Sheets".

## 4. Personalización desde Configuración

Todas las 11 tarjetas de arriba, **sin excepción**, son configurables por el usuario desde **Configuración → "Personalizar dashboard"** (ver también la spec de Configuración). Por cada tarjeta:

- **Visibilidad:** switch mostrar/ocultar.
- **Color:** control segmentado de 2 opciones — **Primario** (fondo azul sólido, texto blanco) o **Neutro** (`.card` blanco/oscuro estándar) — a discreción del usuario, independientemente de si la app la considera "importante" por defecto. Hoy solo Balance es Primario por defecto; el usuario puede cambiar cualquier tarjeta a Primario o dejar Balance en Neutro si quiere.
- **Orden:** arrastrable (drag & drop) mediante un ícono de agarre (`bi-grip-vertical`).

**IDs estables de tarjeta** (para guardar configuración aunque cambien etiquetas visibles): `balance`, `alertas`, `resumenGastosFijos`, `resumenDeudas`, `resumenMeDeben`, `resumenAhorros`, `gastosPorCategoria`, `comparativoMesAnterior`, `ultimosMovimientos`, `cta`, `hojaDrive`.

**Persistencia:** nueva pestaña en la Hoja de Google del usuario, ej. `ConfigDashboard`, con columnas:

```
cardId | visible | color | orden
```

Al cargar el dashboard se lee esta pestaña para decidir qué tarjetas mostrar, en qué color y en qué orden. Si no existe (usuario nuevo o primera vez), se crea automáticamente con los valores por defecto actuales (todas visibles, Balance en Primario, resto en Neutro, orden actual de la lista de arriba).

## 5. Layout — de columna vertical a grilla bento

**Cambio confirmado:** el dashboard deja de apilar las tarjetas en una sola columna vertical (`margin-bottom: 20px` entre cada una) y pasa a un **layout de grilla tipo bento** — varias tarjetas por fila, con tamaños mixtos, inspirado en las referencias compartidas.

Propuesta de tamaño por tarjeta (ajustable en implementación, ya que el usuario no controla tamaño manualmente — solo visibilidad/color/orden):

| Tarjeta | Tamaño sugerido en grilla |
|---|---|
| Balance | Ancha (span 2 columnas) — es la más importante |
| Alertas | Alta, 1 columna |
| Resumen Gastos Fijos | Normal, 1 columna |
| Resumen Deudas | Normal, 1 columna |
| Resumen Me Deben | Normal, 1 columna |
| Resumen Ahorros y Metas | Normal, 1 columna |
| Gastos por categoría | Ancha (span 2 columnas) — barras horizontales necesitan espacio |
| Comparativo | Ancha, baja altura (span 2 columnas, 1 línea de texto) |
| Últimos movimientos | Alta, 1 columna |
| CTA | Normal, 1 columna |
| Tu Hoja de Cálculo en Drive | Normal, 1 columna |

Implementación técnica sugerida: CSS Grid (`display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr))`) con clases modificadoras `.card--span2` para las anchas, en vez del actual `.cards` de apilado simple. En móvil (<780px) todo colapsa a 1 columna (comportamiento ya usado en el resto de la app para tablas, se replica aquí).

El **orden por drag & drop** (sección 4) determina la posición de cada tarjeta dentro de la grilla, respetando su tamaño (ancha ocupa 2 slots, normal ocupa 1).

## 6. Iconografía en cada tarjeta

Cada tarjeta del dashboard —no solo Balance— lleva ahora un **ícono pequeño junto a su título**, dentro de un círculo de color, siguiendo el estilo de la referencia Finai. Se reutiliza el set de íconos SVG inline ya existente en la app (`src/icon/*.svg`) para mantener consistencia — **no** se usa Bootstrap Icons aquí (Bootstrap Icons se reserva únicamente para los íconos de severidad de Alertas, ver sección 6.1).

| Tarjeta | Ícono propuesto (del set existente `src/icon/`) |
|---|---|
| Balance | `finance` |
| Alertas | *(ver 6.1 — usa Bootstrap Icons, no este set)* |
| Resumen Gastos Fijos | `cash-minus` |
| Resumen Deudas | `pig-money` |
| Resumen Me Deben | `businessplan` |
| Resumen Ahorros y Metas | `moneybag-plus` |
| Gastos por categoría | *(nuevo — proponer `bi-pie-chart` de Bootstrap Icons o un SVG nuevo `pie-chart.svg`, a definir)* |
| Comparativo | *(nuevo — proponer `bi-graph-up` o SVG nuevo, a definir)* |
| Últimos movimientos | `cash` |
| CTA | `home-dollar` |
| Tu Hoja de Cálculo en Drive | *(nuevo — proponer ícono de hoja de cálculo, a definir/descargar)* |

> ⚠️ Tres íconos no existen aún en el set (`pie-chart`, `graph-up`/tendencia, hoja de cálculo/spreadsheet) — quedan marcados como pendientes de definir antes de implementar (¿SVG nuevo a agregar al set existente, o Bootstrap Icons puntual como excepción igual que Alertas?).

### 6.1 Alertas — íconos de severidad (ya definido previamente, se repite aquí por completitud)

Ya no se usan emojis (🔴🟠🟡🟢). En su lugar:

- **Bootstrap Icons** vía CDN (clase `bi bi-nombre`) — requiere agregar el `<link>` del CDN en `index.html`.
- El **ícono mismo lleva el color de severidad** (vía CSS `color`), sin punto de color aparte.
- **Un ícono distinto por tipo de alerta:**

| Tipo de alerta | Ícono Bootstrap propuesto |
|---|---|
| Gasto fijo vencido/próximo | `bi-cash-coin` |
| Cuota de deuda vencida/próxima | `bi-credit-card` |
| Gasto y compra pendiente | `bi-cart` |
| Compromiso "me deben" vencido | `bi-people` |
| Estado "Todo al día" | `bi-check-circle` (verde) |

## 7. Resumen de assets/dependencias nuevas a agregar

- CDN de **Bootstrap Icons** en `index.html` (solo para íconos de Alertas).
- Definir y agregar 3 íconos SVG nuevos al set existente (o resolver como excepción Bootstrap Icons): gráfico de torta/categorías, tendencia/comparativo, hoja de cálculo/Drive.
- Nueva pestaña `ConfigDashboard` en la Hoja de Google (creación automática con valores por defecto si no existe).
- CSS nuevo: clases de grilla bento (`.dashboard-grid`, `.card--span2`, etc.) reemplazando el apilado vertical simple solo en esta página.
- Librería o implementación propia de drag & drop para reordenar tarjetas (a criterio de Claude Code — puede ser nativa con `draggable="true"` + eventos, sin necesidad de librería externa dado que el resto de la app no usa dependencias de UI).