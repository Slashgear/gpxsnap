---
"gpxsnap": patch
---

Replace the internal `const enum ColorType` (PNG decoder) with a plain object + type alias. TypeScript enums have runtime semantics that can't be erased by type-stripping alone, which broke importing gpxsnap's raw `.ts` source directly under Node.js (>=22.18) and Deno — both now work, verified by a cross-runtime e2e check (`test/e2e/render.e2e.ts`) run in CI against Bun, Node 20/22/24, and Deno.
