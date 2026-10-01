// Dev server for the settlement console.
//
// The JSON Ledger API sets no CORS headers, so the browser cannot call the
// participants directly; the dev server proxies /api/<participant>/... to
// each one and adds the participant's bearer token, if it has one, on the
// way through. Tokens therefore stay in infra/<network>/ui.json on the
// machine running the dev server; the browser never sees them. In
// production nginx does the same job; there is still no application backend.
//
// The seat file and the party map are served from the repo so the UI knows
// which parties to show and which node hosts each. The map is reduced to
// party -> participant name before it leaves the server.
//
//   INDIVISA_NETWORK=localnet INDIVISA_TAG=sep18 npm run dev     (defaults: localnet, demo)
//   INDIVISA_SEAT=<path to a seat file>                          overrides the tag
import { defineConfig, type Plugin, type ProxyOptions, type UserConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { resolve } from "node:path";

interface UiConfig {
  participants: Record<string, { jsonApi: string; token?: string }>;
  // true when the JSON API sits behind a self-signed or private-CA certificate (a VPN-only validator)
  insecureTls?: boolean;
  // Client credentials, when the network's tokens are short-lived. DevNet's
  // live 300 seconds, so a token written into this file is stale before a
  // seat finishes; the proxy mints its own and refreshes it instead.
  auth?: { tokenUrl: string; clientId: string; clientSecret?: string; scope?: string };
  // The Decentralization Manager that holds the approvers' votes, when this
  // network has one. The page reads the vote through it and executes through
  // it; it never settles the run itself, because the authority to do that
  // belongs to the decentralised party and not to us.
  decman?: { url: string; party: string };
  // Operator sign-in. Present means the proxy carries nothing for a request
  // that does not prove a signed-in person; absent means an unauthenticated
  // deployment (LocalNet, the judges' stack), where there is no identity
  // provider to sign in against and nothing but this machine to reach it.
  operator?: { issuer: string; clientId: string };
}

/**
 * An override for the Decentralization Manager's bearer token.
 *
 * Normally none is needed: DecMan validates bearer tokens as OIDC JWTs
 * against its configured Keycloak realm's JWKS, and
 * `crates/decman/src/auth/validators/jwt.rs` sets `validate_aud = false`
 * deliberately, so the token we already mint for the ledger is accepted as
 * it stands. `DECPM_ADMIN_ROLE` is optional and, unset, makes every
 * authenticated caller an admin.
 *
 * So the file exists only for the cases where that is not true: a DecMan
 * pointed at a different realm, or one that does require a role our service
 * account lacks. Then an operator pastes in a token from the browser console
 * on the DecMan tab:
 *
 *   sessionStorage.getItem("dec_party_manager_token")
 *
 * Reading it per request rather than at startup means a fresh one can be
 * pasted while the page is open, without restarting. Either way the token
 * stays on the machine running the server; the browser never sees it.
 */
function decmanToken(netDir: string, decmanUrl: string) {
  const accessPath = resolve(netDir, "decman-token.txt");
  const refreshPath = resolve(netDir, "decman-refresh.txt");
  let minted = "";
  let timer: NodeJS.Timeout | undefined;

  const readFile = (p: string) => (existsSync(p) ? readFileSync(p, "utf8").trim() : "");

  /**
   * Trade the stored refresh token for an access token.
   *
   * DecMan publishes everything needed at /auth-config, unauthenticated, so
   * nothing about the identity provider is hardcoded here and this works
   * against any deployment. Keycloak rotates refresh tokens, so the new one
   * is written straight back: miss that and the next refresh fails with a
   * token that was valid thirty seconds ago.
   */
  const refresh = async (): Promise<number> => {
    const rt = readFile(refreshPath);
    if (!rt) throw new Error(`no refresh token at ${refreshPath}`);
    const cfgRes = await fetch(`${decmanUrl.replace(/\/+$/, "")}/auth-config`);
    if (!cfgRes.ok) throw new Error(`/auth-config answered ${cfgRes.status}`);
    const cfg = (await cfgRes.json()) as { keycloak_host?: string; keycloak_realm?: string; keycloak_client_id?: string };
    if (!cfg.keycloak_host || !cfg.keycloak_realm || !cfg.keycloak_client_id) {
      throw new Error("/auth-config did not name a Keycloak host, realm and client");
    }
    const url = `${cfg.keycloak_host.replace(/\/+$/, "")}/realms/${cfg.keycloak_realm}/protocol/openid-connect/token`;
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: rt, client_id: cfg.keycloak_client_id }),
    });
    if (!r.ok) throw new Error(`refresh failed ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const j = (await r.json()) as { access_token: string; refresh_token?: string; expires_in?: number };
    minted = j.access_token;
    if (j.refresh_token && j.refresh_token !== rt) writeFileSync(refreshPath, j.refresh_token + "\n");
    return j.expires_in ?? 300;
  };

  const schedule = (lifetime: number) => {
    const next = Math.max(30, Math.floor(lifetime * 0.66));
    timer?.unref?.();
    timer = setTimeout(() => {
      refresh()
        .then(schedule)
        .catch((e) => {
          console.warn(`[indivisa] DecMan token refresh failed, retrying in 20s: ${e}`);
          schedule(30);
        });
    }, next * 1000);
    timer.unref?.();
  };

  return {
    accessPath,
    refreshPath,
    hasRefresh: () => readFile(refreshPath).length > 0,
    /**
     * The minted token wins. A pasted access token is only a fallback for
     * when there is no refresh token to mint from - preferring it meant a
     * stale one left in the folder quietly beat a live one (1 Oct).
     */
    get: (): string | null => minted || readFile(accessPath) || null,
    start: async () => {
      const lifetime = await refresh();
      console.log(`[indivisa] DecMan token minted from the refresh token, lives ${lifetime}s`);
      schedule(lifetime);
    },
  };
}

/**
 * A bearer token that keeps itself current.
 *
 * The proxy has to set the header synchronously as each request goes past,
 * so the token cannot be fetched per request. Instead it is minted once at
 * startup and refreshed in the background at two thirds of its lifetime,
 * which for a 300-second DevNet token is every 200 seconds.
 */
function tokenSource(auth: NonNullable<UiConfig["auth"]>, fallback?: string) {
  let current = fallback ?? "";
  let timer: NodeJS.Timeout | undefined;

  const mint = async (): Promise<number> => {
    const secret = process.env.INDIVISA_CLIENT_SECRET ?? auth.clientSecret;
    if (!secret) throw new Error("no client secret: set INDIVISA_CLIENT_SECRET or auth.clientSecret in ui.json");
    const body = new URLSearchParams({
      client_id: auth.clientId,
      client_secret: secret,
      grant_type: "client_credentials",
      scope: auth.scope ?? "daml_ledger_api",
    });
    const r = await fetch(auth.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!r.ok) throw new Error(`token endpoint answered ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const j = (await r.json()) as { access_token: string; expires_in?: number };
    current = j.access_token;
    return j.expires_in ?? 300;
  };

  const schedule = (lifetime: number) => {
    // Two thirds of the lifetime, and never less than 30s, so a very short
    // token does not turn into a request storm.
    const next = Math.max(30, Math.floor(lifetime * 0.66));
    timer?.unref?.();
    timer = setTimeout(() => {
      mint()
        .then(schedule)
        .catch((e) => {
          // Keep the old token and try again shortly: it may still be valid.
          console.warn(`[indivisa] token refresh failed, retrying in 15s: ${e}`);
          schedule(23);
        });
    }, next * 1000);
    timer.unref?.();
  };

  return {
    get: () => current,
    start: async () => {
      const lifetime = await mint();
      console.log(`[indivisa] ledger token minted, lives ${lifetime}s, refreshing every ${Math.max(30, Math.floor(lifetime * 0.66))}s`);
      schedule(lifetime);
    },
  };
}

// Settings come from ui/.env.local before the environment, so running the
// console is `npm run dev` and nothing else. A back-office tool should not
// need variables typed into a shell to start, and the operator of a real
// deployment would never see one.
//
// Precedence: a real environment variable still wins, because a container or
// a service manager sets them that way and should not be overridden by a file
// left in a checkout.
loadDotEnv(resolve("./.env.local"));

const network = process.env.INDIVISA_NETWORK ?? "localnet";
const netDir = resolve(`../infra/${network}`);
const uiPath = resolve(netDir, "ui.json");
// Only the dev server needs the network config: it is the proxy. A production
// build is static files, and nginx does the proxying from its own config, so
// `vite build` must work on a machine that has no ui.json at all.
const ui: UiConfig | null = existsSync(uiPath) ? (JSON.parse(readFileSync(uiPath, "utf8")) as UiConfig) : null;

const seatPath = resolve(process.env.INDIVISA_SEAT ?? resolve(netDir, "demo", `seat-${process.env.INDIVISA_TAG ?? "demo"}.json`));
const mapPath = resolve(netDir, "participants-with-parties.json");

/**
 * Refuse proxied requests that do not carry a signed-in operator.
 *
 * Registered from `configureServer` directly, which Vite runs BEFORE its own
 * middlewares - including the proxy. A check that ran after the proxy would
 * be a check on the way out.
 *
 * `/demo/*` stays open: it carries the party map and the seat, and the page
 * needs the sign-in configuration from it before it can sign in at all.
 * Nothing there is a credential.
 */
function operatorGate(operator: NonNullable<UiConfig["operator"]>): Plugin {
  const guard = operatorGuard(operator);
  return {
    name: "indivisa-operator-gate",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? "";
        if (!url.startsWith("/api/") && !url.startsWith("/decman/")) return next();
        guard(req as never)
          .then((problem) => {
            if (!problem) {
              // Checked here, and it stops here. The operator token is proof
              // for us; forwarding it would hand a live credential for our
              // realm to the participant and - worse - to a Decentralization
              // Manager somebody else operates.
              delete req.headers["x-indivisa-operator"];
              return next();
            }
            res.statusCode = 401;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "not signed in", detail: problem }));
          })
          .catch((e) => {
            // A failure to reach the identity provider is not permission.
            res.statusCode = 503;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "could not check the operator token", detail: String(e) }));
          });
      });
    },
  };
}

function serveDemoFiles(): Plugin {
  return {
    name: "indivisa-demo-files",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        let body: string | null = null;
        if (req.url === "/demo/seat.json") {
          if (!existsSync(seatPath)) return notFound(res, seatPath);
          body = readFileSync(seatPath, "utf8");
        } else if (req.url === "/demo/participants.json") {
          if (!existsSync(mapPath)) return notFound(res, mapPath);
          // Only the party -> participant map; the file also carries ledger tokens.
          const full = JSON.parse(readFileSync(mapPath, "utf8"));
          // The decentralised party is public (it is a party id on a shared
          // ledger); the token that talks to DecMan is not, and stays here.
          // The ledger user to submit as. On an authenticated network Canton
          // takes the user from the token's `sub` claim and refuses a command
          // that names a different one - with "a security-sensitive error has
          // been received", which says nothing, because saying more would leak
          // (1 Oct). The map already knows the right one.
          const anyParticipant = Object.values(full.participants ?? {})[0] as { user_id?: string } | undefined;
          body = JSON.stringify({
            network,
            party_participants: full.party_participants ?? {},
            decman: ui?.decman ? { party: ui.decman.party } : null,
            userId: anyParticipant?.user_id ?? null,
            // How to sign in. Public by nature: an issuer and a public
            // client id are what a browser needs to start the flow, and
            // neither is a secret.
            operator: ui?.operator ?? null,
          });
        }
        if (body === null) return next();
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "no-store");
        res.end(body);
      });
    },
  };
}

/**
 * KEY=value lines from a file into process.env, without a dependency.
 *
 * Blank lines and `#` comments are skipped, surrounding quotes are stripped,
 * and an existing environment variable is never overwritten. Values are taken
 * literally: a secret with a `#` or a space in it needs quoting, and nothing
 * is interpolated.
 */
function loadDotEnv(path: string) {
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    if (process.env[key] !== undefined) continue;
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

/**
 * Refuse anything that does not carry a signed-in operator.
 *
 * The point of the proxy is that it holds credentials the browser must not:
 * the paying agent's ledger token and the Decentralization Manager's. So the
 * proxy is exactly where the question "who is asking?" has to be answered.
 * Checking it in the page would be theatre - anyone can skip a page.
 *
 * The signature is verified against the realm's published keys. Nothing is
 * taken on trust from the token itself except after that check, and the
 * issuer must match the one configured: a correctly signed token from
 * somewhere else is still somebody else's.
 */
function operatorGuard(operator: NonNullable<UiConfig["operator"]>) {
  const issuer = operator.issuer.replace(/\/+$/, "");
  const jwks = createRemoteJWKSet(new URL(`${issuer}/protocol/openid-connect/certs`));
  return async (req: { headers: Record<string, string | string[] | undefined> }): Promise<string | null> => {
    const raw = req.headers["x-indivisa-operator"];
    const header = Array.isArray(raw) ? raw[0] : raw;
    const token = header?.replace(/^Bearer\s+/i, "").trim();
    if (!token) return "no operator token";
    try {
      const { payload } = await jwtVerify(token, jwks, { issuer });
      // `azp` is the client the token was issued to. A token minted for a
      // different client of the same realm is not this application's.
      if (payload.azp && payload.azp !== operator.clientId) return "token issued to another client";
      return null;
    } catch (e) {
      return `token rejected: ${(e as Error).message}`;
    }
  };
}

function notFound(res: { statusCode: number; end: (s: string) => void }, file: string) {
  res.statusCode = 404;
  res.end(JSON.stringify({ error: `not found: ${file}` }));
}

export default defineConfig(async ({ command }): Promise<UserConfig> => {
  if (command === "build" && !ui) {
    // Nothing to warn about: the build has no network in it.
  } else if (!ui) {
    throw new Error(`no ${uiPath}; copy ui.example.json and fill it in`);
  }
  // One source for every participant: on a one-validator network they share
  // a token anyway, and on several they share an issuer.
  const tokens = command === "serve" && ui?.auth ? tokenSource(ui.auth) : null;
  if (tokens) await tokens.start();

  const dec = command === "serve" && ui?.decman ? decmanToken(netDir, ui.decman.url) : null;
  if (dec) {
    if (dec.hasRefresh()) {
      // Paste the refresh token once and the proxy keeps itself current. The
      // ledger's own token is no use here: DecMan introspects, and a
      // client-credentials token for a different client reads as inactive.
      await dec.start().catch((e) => console.warn(`[indivisa] DecMan refresh failed at startup: ${e}`));
    } else if (dec.get()) {
      console.log(`[indivisa] DecMan: using the access token at ${dec.accessPath}. It will expire; for a session that`);
      console.log(`           keeps itself alive, put the REFRESH token in ${dec.refreshPath} instead:`);
      console.log(`             sessionStorage.getItem("dec_party_manager_refresh_token")`);
    } else {
      console.warn(`[indivisa] DecMan: no token. The page will show the vote as unavailable.`);
      console.warn(`           On the DecMan tab's console, and into ${dec.refreshPath}:`);
      console.warn(`             sessionStorage.getItem("dec_party_manager_refresh_token")`);
    }
  }

  const decmanProxy: Record<string, ProxyOptions> = ui?.decman
    ? {
        "/decman/": {
          target: ui.decman.url.replace(/\/+$/, ""),
          changeOrigin: true,
          rewrite: (path: string) => path.replace("/decman", ""),
          configure: (proxy) => {
            proxy.on("proxyReq", (proxyReq) => {
              // The override first, then the token already minted for the
              // ledger: DecMan trusts the same Keycloak realm and does not
              // check the audience, so one credential serves both.
              const t = dec?.get() || tokens?.get();
              if (t) proxyReq.setHeader("Authorization", `Bearer ${t}`);
            });
          },
          secure: !ui?.insecureTls,
        },
      }
    : {};

  return {
  plugins: [react(), ...(ui?.operator ? [operatorGate(ui.operator)] : []), serveDemoFiles()],
  server: {
    port: 5173,
    proxy: {
      ...Object.fromEntries(
        Object.entries(ui?.participants ?? {}).map(([name, p]): [string, ProxyOptions] => [
          `/api/${name}/`,
          {
            target: p.jsonApi.replace(/\/+$/, ""),
            changeOrigin: true,
            rewrite: (path: string) => path.replace(`/api/${name}`, ""),
            // Set per request, not once at startup, so a refreshed token is
            // picked up without restarting the dev server.
            configure: (proxy) => {
              proxy.on("proxyReq", (proxyReq) => {
                const bearer = tokens?.get() || p.token;
                if (bearer) proxyReq.setHeader("Authorization", `Bearer ${bearer}`);
              });
            },
            secure: !ui?.insecureTls,
          },
        ]),
      ),
      ...decmanProxy,
    },
  },
  };
});
