export function getMonday(dateInput: Date = new Date()): Date {
  const d = new Date(dateInput);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function formatISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatFRDate(date: Date): string {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

/** Formate une date YYYY-MM-DD ou ISO en JJ/MM/AAAA */
export function formatShortFRDate(dateStr: string): string {
  if (!dateStr) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
  }
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return formatFRDate(d);
}

/** Formate une date ISO en français (fuseau Europe/Paris), ex: "dimanche 22/11/2026 à 20:00" */
export function formatFRDateTime(isoString: string): string {
  if (!isoString) return 'Non définie';
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return isoString;

  try {
    const datePart = new Intl.DateTimeFormat('fr-FR', {
      timeZone: 'Europe/Paris',
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(d);

    const timePart = new Intl.DateTimeFormat('fr-FR', {
      timeZone: 'Europe/Paris',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(d);

    return `${datePart} à ${timePart}`;
  } catch {
    return isoString;
  }
}

export function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

export const DAYS_CONFIG = [
  { dayIndex: 0, dayName: 'Lundi' },
  { dayIndex: 1, dayName: 'Mardi' },
  { dayIndex: 2, dayName: 'Mercredi' },
  { dayIndex: 3, dayName: 'Jeudi' },
  { dayIndex: 4, dayName: 'Vendredi' },
  { dayIndex: 5, dayName: 'Samedi' },
  { dayIndex: 6, dayName: 'Dimanche' },
];
