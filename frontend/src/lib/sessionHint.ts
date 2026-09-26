/**
 * "This browser signed in before" hint, so a first-time visitor triggers no refresh request (and no 401).
 * Only a hint: the session itself lives in httpOnly cookies the page cannot read.
 */
const KEY = "smyou.signedIn";

export function markSignedIn(): void {
  try {
    window.localStorage.setItem(KEY, "1");
  } catch {
    // storage blocked (private mode): the app still works, it just asks the server on every load
  }
}

export function clearSignedIn(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // nothing stored
  }
}

export function hasSignedIn(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return true;
  }
}
