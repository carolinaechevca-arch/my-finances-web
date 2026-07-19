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
