/** Web Push (M10-05) — browser-side plumbing: Service Worker registration, VAPID key decoding,
 * subscribe/unsubscribe. Pure browser API wrappers; the matching API calls live in `api.ts`. */

export function isPushSupported(): boolean {
  return (
    typeof navigator !== "undefined" && "serviceWorker" in navigator && "PushManager" in window
  );
}

function urlBase64ToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    bytes[i] = raw.charCodeAt(i);
  }
  return bytes;
}

async function getRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) return existing;
  return navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
}

export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const registration = await getRegistration();
  return registration.pushManager.getSubscription();
}

/** Throws if the user denies the notification permission prompt — callers show an error. */
export async function subscribeToPush(vapidPublicKey: string): Promise<PushSubscription> {
  const registration = await getRegistration();
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
  });
}

export async function unsubscribeFromPush(subscription: PushSubscription): Promise<void> {
  await subscription.unsubscribe();
}

export function toSubscriptionBody(subscription: PushSubscription): {
  endpoint: string;
  keys: { p256dh: string; auth: string };
} {
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
    throw new Error("PushSubscription thiếu endpoint/keys");
  }
  return { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } };
}
