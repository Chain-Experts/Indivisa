// Dev server for the four panes.
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
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

interface UiConfig {
  participants: Record<string, { jsonApi: string; token?: string }>;
}

const network = process.env.INDIVISA_NETWORK ?? "localnet";
const netDir = resolve(`../infra/${network}`);
const uiPath = resolve(netDir, "ui.json");
if (!existsSync(uiPath)) throw new Error(`no ${uiPath}; copy ui.example.json and fill it in`);
const ui = JSON.parse(readFileSync(uiPath, "utf8")) as UiConfig;

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

export default defineConfig({
  plugins: [react(), serveDemoFiles()],
  server: {
    port: 5173,
    proxy: Object.fromEntries(
      Object.entries(ui.participants).map(([name, p]) => [
        `/api/${name}/`,
        {
          target: p.jsonApi.replace(/\/+$/, ""),
          changeOrigin: true,
          rewrite: (path: string) => path.replace(`/api/${name}`, ""),
          headers: p.token ? { Authorization: `Bearer ${p.token}` } : undefined,
        },
      ]),
    ),
  },
});
