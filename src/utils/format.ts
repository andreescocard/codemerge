export function formatMtime(mtimeMs: number, now = Date.now()) {
  if (!mtimeMs) {
    return "deleted";
  }

  const delta = now - mtimeMs;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (delta < minute) {
    return "just now";
  }
  if (delta < hour) {
    return `${Math.floor(delta / minute)}m ago`;
  }
  if (delta < day) {
    return `${Math.floor(delta / hour)}h ago`;
  }
  if (delta < 14 * day) {
    return `${Math.floor(delta / day)}d ago`;
  }

  return new Date(mtimeMs).toLocaleDateString();
}
