# Spec — Ventanas "Deudas" y "Me Deben" — Mis Finanzas

> Documento autocontenido para pasar directo a Claude Code. Cubre el módulo compartido `src/ui/pages/deudas-shared.ts` (con sus envoltorios `deudas.ts` y `me-deben.ts`). Depende del sistema global de periodo (`spec-ingresos.md`) solo de forma indirecta — este módulo no se organiza por periodo, sino por deudas individuales con su propio ciclo de pago.

## 1. Nuevo: elegir el modo de la deuda al crearla

Se agrega un selector de **"Modo de deuda"** al formulario de agregar, con 2 opciones:

| Modo | Descripción |
|---|---|
| **Con cuotas** | Monto de la cuota, Número de cuotas — **no se pide "Monto original"**: el total a pagar es simplemente `montoCuota × numCuotas`. No se trackea interés (`montoOriginal` se guarda internamente igual a ese total, sin distinción de interés). |
| **Deuda simple** | Solo un **monto total** + abonos libres, sin cronograma de cuotas — para deudas informales. |

**Confirmado: este modo aplica igual a "Deudas" (yo debo) y a "Me Deben"**, ya que ambas comparten el mismo módulo (`deudas-shared.ts`) — el selector se agrega una sola vez en el formulario genérico y funciona igual en ambas direcciones.

## 2. Formulario "Agregar deuda/Me deben" según el modo

**Con cuotas**:
- Contraparte, Tipo, Monto de la cuota, Número de cuotas, Día de pago (opcional), Fecha de inicio, Notas.
- **Sin "Monto original"** — se quitó del formulario (creación y edición) porque no se quiere trackear interés por separado; el total se deriva de cuota × número de cuotas.

**Deuda simple**:
- Contraparte, Tipo, **Monto total**, Fecha de inicio, **Día de pago (opcional)**, Notas.
- Sin Monto de cuota, sin Número de cuotas (el "Monto total" es directamente el saldo inicial de la deuda).

> ⚠️ **Nota de coherencia a resolver:** el usuario confirmó que el campo "Día de pago" sí existe (opcional) en Deuda simple, pero también confirmó por separado que **no debe haber alertas de vencido/próximo** para este modo (sección 4). Se interpretó que el campo "Día de pago" en Deuda simple es **puramente informativo/de referencia personal** (ej. "sueles abonar el día 15"), sin disparar ningún badge de alerta ni entrar en el cálculo de "Pago vencido/próximo". **Confirmar si esta interpretación es correcta**, o si en realidad sí se esperaba algún tipo de alerta cuando se define ese día.

## 3. Diálogo de fusión por contraparte repetida

Sigue existiendo igual que hoy (si ya hay una deuda activa con la misma contraparte, se pregunta "¿Sumar a la existente o Crear separada?").

> ⚠️ **Caso no cubierto explícitamente — propuesta:** si la deuda existente es de un modo distinto al que se está creando (ej. existe una "Con cuotas" y se intenta agregar una "Deuda simple" para la misma contraparte, o viceversa), **no se ofrece la opción de "Sumar"** — solo se permite "Crear separada", ya que sumar montos entre un esquema de cuotas y uno de monto libre no tiene una forma clara de combinarse. El diálogo de fusión solo ofrece "Sumar" cuando ambas deudas son del **mismo modo**. *(Ajustar si se prefiere otro comportamiento.)*

## 4. Tarjeta de deuda activa (`.deuda-card`) — diferencias entre modos

**Encabezado** — igual en ambos modos: contraparte (negrita), insignia de tipo, botones editar/basura.

**Insignia de estado (alerta):**
- **Con cuotas** *(sin cambios)*: roja "Pago vencido" / naranja "Pago próximo" (según la fecha de la próxima cuota) o verde "Pagada".
- **Deuda simple** *(nuevo comportamiento)*: **sin insignia de vencido/próximo** — confirmado que no aplica, no hay fecha de pago fija que dispare esa lógica. Solo puede mostrar insignia neutra "Activa" o verde "Pagada".

**Cuerpo:**
- **Con cuotas**: barra de progreso, grilla de stats (Saldo restante / Total a pagar / Cuotas pagadas — **sin "Interés total"**, ya no se trackea), línea "Próximo pago: día N · Cuota $X", frase de proyección ("A este ritmo, se termina de pagar en aproximadamente N meses…").
- **Deuda simple** *(nuevo)*: barra de progreso (saldo restante vs. monto total), grilla de stats simplificada — **Saldo restante / Monto total / Abonos registrados** (se quita "Interés total" y "Cuotas pagadas", que no aplican sin cuotas). **Sin línea de "Próximo pago"** y **sin frase de proyección de meses** (no hay una cuota fija sobre la cual proyectar). *(Se podría agregar un dato suave como "Llevas N abonos" — no fue solicitado explícitamente, queda como posible extra si se quiere.)*

**Pie (botones)** — igual en ambos modos: "Registrar abono" (monto/fecha/nota), "Ver historial" (línea de tiempo de abonos), "Marcar como pagada" / "Reabrir".

## 5. Sección "Pagadas" y modal "Historial"

Funcionan igual para ambos modos (una deuda pagada también aparece en la colapsable "Pagadas" con su nombre, tipo, monto total y total pagado — el resumen usa "Monto total" en vez de "Monto original" para ambos modos).

## 6. Modal "Editar deuda"

Refleja el modo con el que fue creada la deuda: si es "Con cuotas" muestra los campos de cuotas; si es "Deuda simple" muestra solo Monto total/Fecha/Día de pago opcional/Notas. **No se permite cambiar de modo** después de creada *(propuesta razonable, no se preguntó explícitamente — cambiar de modo implicaría recalcular todo el historial de abonos contra un esquema distinto)*.

## 7. Impacto en otras pantallas (fuera de alcance de este documento, solo aviso)

- **Dashboard → "Resumen de Deudas"** (ya especificado en `spec-inicio-dashboard.md`): hoy dice "texto del próximo pago de cuota" — con Deuda simple existiendo, ese texto debería considerar que puede no haber ninguna "próxima cuota" que mostrar si las deudas activas son todas de tipo simple. No se modifica el spec del Dashboard aquí; queda anotado para revisar cuando se retome esa pantalla si hace falta.
- **Histórico**: los abonos de deudas simples se registran igual que los de cuotas para efectos de "Abonado a deudas" — sin cambios necesarios ahí.

## 8. Resumen de lo que se agrega vs. lo que no cambia

**Se agrega:**
- Selector de **Modo de deuda** (Con cuotas / Deuda simple) al crear.
- Formulario simplificado para Deuda simple (Monto total en vez de cuota+número+original).
- Tarjeta de deuda con grilla de stats y comportamiento de alertas distintos según el modo.
- Regla de fusión: solo se permite "Sumar" entre deudas del mismo modo.

**No cambia:**
- Todo el flujo "Con cuotas" (formulario, cálculo de interés, próximo pago, proyección, alertas).
- Botones de abono, historial, marcar como pagada/reabrir — iguales en ambos modos.
- Aplica igual a Deudas y Me Deben.

## 9. Pendiente de confirmar

- Si el campo "Día de pago" opcional en Deuda simple es puramente informativo (sin alerta) como se interpretó en la sección 2, o si sí debería disparar algún tipo de aviso.
- Si se permite o no "Sumar" entre deudas de modos distintos para la misma contraparte (sección 3) — se propuso que no.
- Si se permite cambiar el modo de una deuda ya creada al editarla (sección 6) — se propuso que no.