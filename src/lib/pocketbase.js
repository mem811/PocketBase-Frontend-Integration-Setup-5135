import PocketBase from 'pocketbase';

const url = import.meta.env.VITE_POCKETBASE_URL;
export const pb = new PocketBase(url || 'https://trainer-db.mealplanner.cloud');
pb.autoCancellation(false);

export function currentUser() {
  return pb.authStore.model;
}

export function clearSession() {
  pb.authStore.clear();
}

export function dateOnly(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function money(value = 0) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(Number(value) || 0);
}

export function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

export function formatTime(value) {
  if (!value) return '';
  const [hour, minute] = value.split(':').map(Number);
  return new Date(2000, 0, 1, hour, minute).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit'
  });
}

export function dayKey(value) {
  return value ? new Date(value).toISOString().slice(0, 10) : '';
}

export function isUpcoming(record) {
  return !['completed', 'cancelled', 'no-show'].includes(record.status);
}

export function sessionSlot(session) {
  return session.expand?.slot || {};
}

export function sessionClient(session) {
  return session.expand?.client || {};
}

export function clientOpenSlots(slots, sessions) {
  const busy = new Set(
    sessions
      .filter((session) => !['cancelled', 'no-show'].includes(session.status))
      .map((session) => session.slot)
  );
  return slots.filter((slot) => slot.status === 'open' && !busy.has(slot.id));
}
