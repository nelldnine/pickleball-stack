<!-- BEGIN:tanstack-start-agent-rules -->
# This app runs on TanStack Start (not Next.js)

This project was migrated from Next.js to **TanStack Start** (full-stack SSR on
TanStack Router + Vite). Do not reach for Next.js APIs (`next/link`,
`next/navigation`, `"use server"` actions, `app/` routing, `revalidatePath`,
`next/font`) — they are gone.

Key conventions:
- **Routes** are file-based in `src/routes` (`$id` = dynamic param, `__root.tsx`
  is the document shell). `src/routeTree.gen.ts` is generated — never edit it.
- **Data** goes through **server functions** (`createServerFn`) in `lib/actions.ts`.
  Route `loader`s are **isomorphic** (run on client too) — never read the DB or
  secrets in a loader; call a server function. `lib/prisma.ts` is server-only.
- **Navigation**: `Link`/`redirect`/`notFound` come from `@tanstack/react-router`;
  call server functions from components via `useServerFn` and refresh with
  `router.invalidate()`.

Before writing code, consult the TanStack Start docs (the `tanstack-start` skill,
or https://tanstack.com/start/latest) and verify APIs against the installed
`@tanstack/react-start` / `@tanstack/react-router` versions.
<!-- END:tanstack-start-agent-rules -->
