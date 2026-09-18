// Dev server for the four panes.
//
// The JSON Ledger API sets no CORS headers, so the browser cannot call five
// participants directly; the dev server proxies /api/<participant>/... to
// each one. In production nginx does the same job; there is still no
// application backend. The seat file and the party map are served from the
// repo so the UI knows which parties to show and which node hosts each.
//
//   INDIVISA_SEAT=../infra/localnet/demo/seat-sep18.json npm run dev
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const participants: Record<string, number> = {
  registry: 5013,
  agent: 5023,
  alice: 5033,
  bob: 5043,
  charlie: 5053,
};

const seatPath = resolve(process.env.INDIVISA_SEAT ?? "../infra/localnet/demo/seat-ui6.json");
const mapPath = resolve("../infra/localnet/participants-with-parties.json");

function serveDemoFiles(): Plugin {
  return {
    name: "indivisa-demo-files",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const file =
          req.url === "/demo/seat.json" ? seatPath :
          req.url === "/demo/participants.json" ? mapPath : null;
        if (!file) return next();
        if (!existsSync(file)) {
          res.statusCode = 404;
          res.end(JSON.stringify({ error: `not found: ${file}` }));
          return;
        }
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "no-store");
        res.end(readFileSync(file));
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), serveDemoFiles()],
  server: {
    port: 5173,
    proxy: Object.fromEntries(
      Object.entries(participants).map(([name, port]) => [
        `/api/${name}`,
        { target: `http://localhost:${port}`, changeOrigin: true, rewrite: (p: string) => p.replace(`/api/${name}`, "") },
      ]),
    ),
  },
});
