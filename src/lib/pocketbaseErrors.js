export function pocketBaseErrorMessage(error, fallback = 'PocketBase could not save this change.') {
  const parts = [];
  const message = error?.data?.message || error?.message;

  if (message) parts.push(message);

  const fieldErrors = error?.data?.data;
  if (fieldErrors && typeof fieldErrors === 'object') {
    Object.entries(fieldErrors).forEach(([field, details]) => {
      const fieldMessage = details?.message || details?.data?.message;
      if (fieldMessage) parts.push(`${field}: ${fieldMessage}`);
    });
  }

  return parts.length ? [...new Set(parts)].join(' · ') : fallback;
}
