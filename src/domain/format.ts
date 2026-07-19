const moneyFormatter = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const monthFormatter = new Intl.DateTimeFormat("es-CO", { month: "long", year: "numeric" });

export function formatMoney(amount: number): string {
  return `$${moneyFormatter.format(Math.round(amount))}`;
}

export function formatMonthLabel(date: Date = new Date()): string {
  const label = monthFormatter.format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Clave "YYYY-MM" del mes de una fecha, usada para agrupar registros por mes. */
export function monthKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Parsea un valor "YYYY-MM-DD" (de un <input type="date">) como fecha LOCAL,
 * evitando el corrimiento de día que da `new Date(string)` (lo interpreta
 * como UTC medianoche, que en zonas horarias negativas cae en el día
 * anterior al mostrarlo en local).
 */
export function parseDateInput(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
