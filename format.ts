export function initials(firstName?: string | null, lastName?: string | null): string {
  return `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase() || '?';
}

export function formatDate(value?: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${value.slice(0, 10)}T12:00:00`));
}

export function formatCurrency(value?: number | null): string {
  if (value == null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: import.meta.env.VITE_CURRENCY || 'USD', maximumFractionDigits: 0 }).format(value);
}

export function displayError(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}
