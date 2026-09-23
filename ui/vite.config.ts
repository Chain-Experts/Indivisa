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
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

interface UiConfig {
  participants: Record<string, { jsonApi: string; token?: string }>;
  // true when the JSON API sits behind a self-signed or private-CA certificate (a VPN-only validator)
  insecureTls?: boolean;
  // Client credentials, when the network's tokens are short-lived. DevNet's
  // live 300 seconds, so a token written into this file is stale before a
  // seat finishes; the proxy mints its own and refreshes it instead.
  auth?: { tokenUrl: string; clientId: string; clientSecret?: string; scope?: string };
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

const network = process.env.INDIVISA_NETWORK ?? "localnet";
const netDir = resolve(`../infra/${network}`);
const uiPath = resolve(netDir, "ui.json");
// Only the dev server needs the network config: it is the proxy. A production
// build is static files, and nginx does the proxying from its own config, so
// `vite build` must work on a machine that has no ui.json at all.
const ui: UiConfig | null = existsSync(uiPath) ? (JSON.parse(readFileSync(uiPath, "utf8")) as UiConfig) : null;

const seatPath = resolve(process.env.INDIVISA_SEAT ?? resolve(netDir, "demo", `seat-${process.env.INDIVISA_TAG ?? "demo"}.json`));
const mapPath = resolve(netDir, "participants-with-parties.json");

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
          body = JSON.stringify({ network, party_participants: full.party_participants ?? {} });
        }
        if (body === null) return next();
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "no-store");
        res.end(body);
      });
    },
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

  return {
  plugins: [react(), serveDemoFiles()],
  server: {
    port: 5173,
    proxy: Object.fromEntries(
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
  },
  };
});
