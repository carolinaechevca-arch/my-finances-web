# Spec — Bolsillos de ahorro

## 1. Concepto

Ahorros funciona como los bolsillos de una cuenta bancaria. Cada bolsillo tiene nombre, categoría opcional, saldo propio y, si el usuario quiere, una meta y fecha límite. La meta no es obligatoria para poder guardar dinero.

## 2. Operaciones

- **Meter plata:** registra fecha, monto y nota opcional. Resta ese dinero del disponible del periodo.
- **Retirar:** registra fecha, monto y motivo, sin permitir retirar más que el saldo. Devuelve ese dinero al disponible del periodo.
- Cada depósito y retiro queda en el historial del bolsillo y en el Histórico general.
- El historial del bolsillo muestra el saldo resultante después de cada movimiento.

## 3. Bolsillos

- El total superior suma los saldos de todos los bolsillos.
- Cada tarjeta muestra siempre el saldo disponible.
- Si tiene meta, también muestra barra, monto objetivo, porcentaje y fecha límite opcional.
- Se ordenan por mayor saldo, cercanía a la meta o fecha límite.
- Un bolsillo puede pausarse, reanudarse, cerrarse o reabrirse.
- Un bolsillo con movimientos no se elimina: se cierra para conservar su nombre y trazabilidad histórica.

## 4. Compras vinculadas

Una compra pendiente puede crear un bolsillo con una meta igual al valor de la compra. Al financiarla, se puede marcar la compra como pagada o deshacer la vinculación.

## 5. Compatibilidad

Las hojas internas conservan los nombres `Metas` y `MovimientosMetas` para no romper los datos existentes. Los antiguos `AporteAutomatico` se leen como depósitos automáticos históricos, pero ya no se crean.
