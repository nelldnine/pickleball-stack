import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

// Start calls getRouter() to build a fresh router instance per request (SSR).
export function getRouter() {
  const router = createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: "intent",
  });

  return router;
}
