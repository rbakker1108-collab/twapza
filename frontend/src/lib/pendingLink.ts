/**
 * A YouTube link pasted on the website before signing up (hero link box). It waits in this browser
 * until the visitor is in the app, where it is filled into the import form; the import itself still
 * needs the rights checkbox. Kept for 3 days (the email confirmation link is valid for 48 hours).
 */
const KEY = "twapza.pendingLink";
const MAX_AGE_MS = 3 * 24 * 3600 * 1000;

export function savePendingLink(url: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ url, at: Date.now() }));
  } catch {
    /* storage blocked: the visitor pastes it again in the app */
  }
}

export function readPendingLink(): string | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const { url, at } = JSON.parse(raw) as { url?: unknown; at?: unknown };
    if (typeof url === "string" && typeof at === "number" && Date.now() - at < MAX_AGE_MS) return url;
    localStorage.removeItem(KEY);
  } catch {
    /* unreadable */
  }
  return null;
}

export function clearPendingLink() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
