import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";

const SW_SOURCE = "public/firebase-messaging-sw.js";
const SW_ROUTE = "/firebase-messaging-sw.js";

const TOKENS = [
  "FIREBASE_API_KEY",
  "FIREBASE_AUTH_DOMAIN",
  "FIREBASE_PROJECT_ID",
  "FIREBASE_APP_ID",
  "FIREBASE_MESSAGING_SENDER_ID",
];

function substituteSwTokens(source: string, env: Record<string, string>): string {
  let out = source;
  for (const key of TOKENS) {
    const placeholder = `__${key}__`;
    const value = env[`VITE_${key}`] ?? "";
    out = out.split(placeholder).join(value);
  }
  return out;
}

function firebaseSwPlugin(env: Record<string, string>): Plugin {
  return {
    name: "firebase-messaging-sw",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === SW_ROUTE) {
          const raw = readFileSync(resolve(SW_SOURCE), "utf8");
          res.setHeader("Content-Type", "application/javascript");
          res.setHeader("Service-Worker-Allowed", "/");
          res.end(substituteSwTokens(raw, env));
          return;
        }
        next();
      });
    },
    closeBundle() {
      const raw = readFileSync(resolve(SW_SOURCE), "utf8");
      const outPath = resolve("dist/firebase-messaging-sw.js");
      mkdirSync(dirname(outPath), { recursive: true });
      writeFileSync(outPath, substituteSwTokens(raw, env));
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react(), firebaseSwPlugin(env)],
    server: { port: 5173 },
  };
});
