// Production entry: serve the built TanStack Start fetch handler on Node.
// `vite build` emits a Web `fetch` handler (dist/server/server.js); this binds
// it to an HTTP listener via @hono/node-server. Used by `npm start`.
import { serve } from "@hono/node-server";
import handler from "./dist/server/server.js";

const port = Number(process.env.PORT) || 3000;

serve({ fetch: handler.fetch, port }, ({ port }) => {
  console.log(`▲ Pickleball Stack ready on http://localhost:${port}`);
});
