// Production entry: serve the built TanStack Start app on Node.
//
// `vite build` produces two things:
//   - dist/client/**  → static assets (CSS, JS bundles, favicon)
//   - dist/server/server.js → the SSR / server-function Web `fetch` handler
//
// This binds them together: static files are served from dist/client, and
// anything else falls through to the SSR handler. Used by `npm start`.
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import handler from "./dist/server/server.js";

const port = Number(process.env.PORT) || 3000;

const app = new Hono();

// 1. Serve built client assets (hashed CSS/JS, favicon). serveStatic calls
//    next() when no matching file exists, so routes fall through below.
app.use("/*", serveStatic({ root: "./dist/client" }));

// 2. Everything else is handled by the app (SSR pages + server functions).
app.all("/*", (c) => handler.fetch(c.req.raw));

serve({ fetch: app.fetch, port }, ({ port }) => {
  console.log(`▲ Pickleball Stack ready on http://localhost:${port}`);
});
