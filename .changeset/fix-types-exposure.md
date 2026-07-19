---
"gpxsnap": patch
---

Fix type resolution and declared runtime compatibility:

- Added explicit `types` conditions to `exports` and a top-level `types` field. Previously TypeScript could only resolve gpxsnap's types under specific resolver configurations; verified with `@arethetypeswrong/cli` that both entry points now resolve correctly under `bundler` and `node16`/`nodenext` (ESM) resolution.
- `engines` now also declares `node` (`>=22.18.0`, the real floor for native TypeScript type-stripping) and `deno` (`>=1.0.0`) instead of only `bun` — the package always worked under Node/Deno, `engines` just didn't say so.
- Narrowed two internal `Uint8Array` parameter types to `Uint8Array<ArrayBuffer>` in the PNG codec, fixing a type error consumers would hit under a standard DOM-lib tsconfig (TypeScript 5.7+ made typed arrays generic over buffer type; `BlobPart` requires a concrete `ArrayBuffer`).
