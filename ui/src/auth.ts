// Operator sign-in.
//
// Two different identities meet in this application and it is worth being
// clear about which is which:
//
//   The PAYING AGENT is a ledger party. Its credential is a service account,
//   it lives on the server, and the browser never sees it. That is what
//   signs the settlement.
//
//   The OPERATOR is a person. They sign in here, and the proxy refuses to
//   carry anything for a request that does not prove it. That is what makes
//   "who pressed settle" a question with an answer.
//
// Conflating them is what left this application open: a product whose claim
// is that no single party releases a payout unchecked cannot leave its own
// front door unlatched.
//
// Authorization code with PKCE against the same Keycloak realm that issues
// the ledger credential. No client secret: this is a browser app and a
// secret in one is not a secret. The refresh token keeps a session alive, so
// nobody is signed out mid-settlement.

import { setOperatorToken } from "./ledger/client";

const TOKEN = "indivisa_operator_token";
const REFRESH = "indivisa_operator_refresh";
const VERIFIER = "indivisa_pkce_verifier";
const STATE = "indivisa_oidc_state";

export interface OperatorAuth {
  issuer: string;
  clientId: string;
}

export interface Operator {
  name: string;
  token: string;
}

function store(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null; // a browser with site data blocked; sign-in simply will not work
  }
}

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomString(): string {
  return b64url(crypto.getRandomValues(new Uint8Array(48)));
}

async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return b64url(new Uint8Array(digest));
}

/** The name to show, read from the token. Never trusted for anything else. */
function nameFrom(token: string): string {
  try {
    const p = token.split(".")[1];
    const json = atob(p.replace(/-/g, "+").replace(/_/g, "/"));
    const c = JSON.parse(json) as { name?: string; preferred_username?: string; email?: string };
    return c.name ?? c.preferred_username ?? c.email ?? "signed in";
  } catch {
    return "signed in";
  }
}

/**
 * Store a token and hand it to the request headers in the same breath.
 *
 * Every write goes through here. The first version stored the refreshed
 * token and left `operatorHeaders()` holding the old one, so the page kept
 * presenting an expired operator token after about three minutes and the
 * proxy refused it - with the session apparently still signed in.
 */
function keep(token: string | null, refresh?: string | null): void {
  const s = store();
  if (!s) return;
  if (token) s.setItem(TOKEN, token);
  else s.removeItem(TOKEN);
  if (refresh) s.setItem(REFRESH, refresh);
  setOperatorToken(token);
}

/** Seconds left on a token, from its own `exp`. 0 if it cannot be read. */
function secondsLeft(token: string): number {
  try {
    const c = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))) as { exp?: number };
    return c.exp ? Math.max(0, c.exp - Math.floor(Date.now() / 1000)) : 0;
  } catch {
    return 0;
  }
}

export function currentToken(): string | null {
  return store()?.getItem(TOKEN) ?? null;
}

export function currentOperator(): Operator | null {
  const t = currentToken();
  return t ? { name: nameFrom(t), token: t } : null;
}

/** Send the browser to the identity provider. */
export async function signIn(auth: OperatorAuth): Promise<void> {
  const s = store();
  if (!s) throw new Error("this browser is blocking site data, so sign-in cannot work");
  const verifier = randomString();
  const state = randomString();
  s.setItem(VERIFIER, verifier);
  s.setItem(STATE, state);
  const url = new URL(`${auth.issuer.replace(/\/+$/, "")}/protocol/openid-connect/auth`);
  url.searchParams.set("client_id", auth.clientId);
  url.searchParams.set("redirect_uri", window.location.origin + "/");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid profile email");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", await challengeFor(verifier));
  url.searchParams.set("code_challenge_method", "S256");
  window.location.assign(url.toString());
}

export function signOut(): void {
  keep(null);
  store()?.removeItem(REFRESH);
}

/**
 * Pick up a session already in this tab, on a reload that is not a redirect
 * back from the identity provider.
 *
 * Without this the operator is signed in for whatever is left of one token
 * and then silently stops being able to write, because nothing had scheduled
 * the refresh: only completeSignIn did, and this page load did not run it.
 */
export function resumeSession(auth: OperatorAuth): Operator | null {
  const token = currentToken();
  if (!token) return null;
  const left = secondsLeft(token);
  // A token with under half a minute left is no use to a settlement.
  if (left < 30) {
    signOut();
    return null;
  }
  setOperatorToken(token);
  scheduleRefresh(auth, left);
  return { name: nameFrom(token), token };
}

/**
 * Finish a sign-in, if this page load is the redirect back.
 *
 * Returns true when a token was obtained, so the caller re-renders. The code
 * and state are stripped from the address bar either way: a leftover
 * authorization code in history is a credential lying in the open.
 */
export async function completeSignIn(auth: OperatorAuth): Promise<boolean> {
  const s = store();
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const state = params.get("state");
  if (!code || !s) return false;

  const clean = () => window.history.replaceState({}, "", window.location.pathname);
  const expected = s.getItem(STATE);
  const verifier = s.getItem(VERIFIER);
  s.removeItem(STATE);
  s.removeItem(VERIFIER);
  if (!expected || state !== expected || !verifier) {
    clean();
    throw new Error("the sign-in response did not match this browser's request");
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: auth.clientId,
    redirect_uri: window.location.origin + "/",
    code_verifier: verifier,
  });
  const r = await fetch(`${auth.issuer.replace(/\/+$/, "")}/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  clean();
  if (!r.ok) throw new Error(`sign-in failed: ${r.status} ${(await r.text()).slice(0, 200)}`);
  const j = (await r.json()) as { access_token: string; refresh_token?: string; expires_in?: number };
  keep(j.access_token, j.refresh_token);
  scheduleRefresh(auth, j.expires_in ?? 300);
  return true;
}

/**
 * Keep the session alive.
 *
 * Access tokens live five minutes here. Without this an operator is signed
 * out in the middle of a settlement, which on a recording is the worst
 * possible moment.
 */
export function scheduleRefresh(auth: OperatorAuth, lifetime: number): void {
  const s = store();
  if (!s) return;
  const next = Math.max(30, Math.floor(lifetime * 0.66));
  window.setTimeout(async () => {
    const rt = s.getItem(REFRESH);
    if (!rt) return;
    try {
      const r = await fetch(`${auth.issuer.replace(/\/+$/, "")}/protocol/openid-connect/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: rt, client_id: auth.clientId }),
      });
      if (!r.ok) throw new Error(String(r.status));
      const j = (await r.json()) as { access_token: string; refresh_token?: string; expires_in?: number };
      keep(j.access_token, j.refresh_token);
      scheduleRefresh(auth, j.expires_in ?? 300);
    } catch {
      // Let it lapse rather than loop: the next request gets a 401 and the
      // page asks the operator to sign in again, which is the honest outcome.
    }
  }, next * 1000);
}
