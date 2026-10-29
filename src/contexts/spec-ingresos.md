# Spec — Fuentes y movimientos de ingresos

## Principio financiero

La configuración de una fuente representa dinero **esperado**. El balance disponible solo aumenta cuando el usuario registra un pago como **recibido**, usando su fecha y monto reales.

## Persistencia

### `IngresosFijos` — fuentes

Conserva las columnas legadas y agrega `ProximaFecha`, `CuentaDestino`, `Modelo` y `Nombre`. Las fuentes nuevas guardan `Modelo=Fuente`.

Modalidades admitidas:

- `Mensual`
- `Quincenal`: dos días por mes, configurados en `DiaPago` (por defecto `15,30`).
- `Semanal`
- `PagoUnico`

Reglas de calendario:

- Mensual conserva como ancla el día de la primera fecha esperada. Si ese día no existe, usa el último día del mes sin perder el ancla (`31 ene → 28 feb → 31 mar`).
- Quincenal no solicita una fecha esperada: calcula automáticamente la próxima fecha igual o posterior a hoy a partir de los dos días elegidos. Conserva esos dos días y, si uno no existe, lo ajusta al último día del mes (`15,31 → 15,28 en febrero`). Si ambos terminan en la misma fecha (`30,31 → 28,28`), se conservan como dos pagos separados: la fecha avanza solo después de procesar ambos.
- Los días quincenales se guardan en Sheets como texto protegido (`D15-D30`) para impedir que `15,30` sea convertido por la hoja en el decimal `15,3`.
- Semanal avanza siete días desde la fecha esperada, no desde la fecha real en que el usuario confirmó el pago.
- Un recurrente vencido permanece marcado como atrasado hasta registrarlo u omitirlo; no avanza solo. Los pagos únicos no se marcan como atrasados.
- Pausar conserva la fuente pero la excluye de próximos pagos. Al reactivarla se descartan las fechas acumuladas durante la pausa: Mensual y Semanal reinician desde el día de reactivación; Quincenal calcula la siguiente de sus dos fechas configuradas que sea igual o posterior a ese día.

### `MovimientosIngresos` — pagos reales

Columnas: `Id`, `FuenteId`, `FuenteNombre`, `Categoria`, `FechaEsperada`, `FechaRecibida`, `MontoEstimado`, `MontoReal`, `Estado`, `Notas`, `PeriodoId`.

El histórico y el balance usan movimientos con `Estado=Recibido`. `PeriodoId` guarda la fecha de inicio del periodo donde el usuario confirmó u omitió el pago; evita arrastrar movimientos al periodo nuevo cuando el reinicio ocurre el mismo día. Los pagos pendientes se derivan de la próxima fecha de cada fuente y no afectan el disponible.

## Pantalla

- La pantalla muestra dos tarjetas: total realmente recibido en el periodo y disponible real después de los movimientos de salida. Un único botón de ojo oculta o muestra ambos montos; la tarjeta Disponible usa fondo blanco.
- Formulario para crear fuentes con nombre, categoría, modalidad, monto estimado, próxima fecha, cuenta destino y notas.
- Las categorías se administran con el mismo selector usado en Gastos Fijos: se pueden crear desde «Nueva categoría…» y eliminar con la papelera de cada opción. Una categoría en uso por alguna fuente no se puede eliminar hasta editar o eliminar esas fuentes.
- Lista de fuentes con estado atrasado, edición, pausa/reactivación, eliminación y acciones `Registrar recibido` y `Omitir`.
- Al registrar un pago se permite modificar la fecha y el monto reales.
- Después de recibirlo, la próxima fecha avanza según la modalidad. Un pago único se cierra y su fuente se elimina al reiniciar el periodo, conservando el movimiento histórico.
- Omitir un pago registra el estado `Omitido`, no suma al disponible y también avanza la programación.
- La lista de movimientos de Ingresos muestra solo el periodo actual y comienza vacía después de reiniciar; los periodos anteriores permanecen en el Histórico general.

## Migración

Al subir el esquema, las fuentes existentes se conservan salvo las de modalidad `Variable`, que se eliminan. Las fuentes mensuales y semanales reciben su ancla de calendario a partir de la próxima fecha que ya tenían. Para evitar que el disponible cambie repentinamente, cada ingreso vigente del modelo anterior genera una vez un movimiento recibido en el periodo actual. Histórico continúa reconstruyendo periodos legados y evita duplicar los movimientos migrados.

## Periodo global

El periodo de la app se reinicia únicamente de forma manual. La modalidad individual de una fuente de ingreso sigue siendo independiente del periodo global.
