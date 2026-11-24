<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- antislop:start -->
## antislop & ponytail (ACTIVE MODE: DURING DEVELOPMENT)

### 1. antislop (Enforced during work)
Apply antislop principles directly while writing code, copy, and UI:
- **UI & Visual:** Craft designs intentionally; respect `--bg-card`, `--text-main`, and `--border-subtle` tokens across light and dark modes. Avoid sterile or flashy technique without purpose.
- **Copywriting:** Empathetic, respectful, ultra-concise (< 60 words for cold emails), zero AI buzzwords (no "unlock", "elevate", "revolutionary"), no accusatory tone ("I noticed you face challenges").
- **Accessibility & Contrast:** High readability across themes, visible focus rings, comfortable tap targets (>= 36-44px).
- **Mobile & Responsive:** Clean reflow from phone to desktop, no clipped content or awkward overflows, smooth drag/scroll navigation.
- **Code Comments Hygiene:** Delete generic AI-slop comments (`// loop through array`, `// handle click`); only document non-obvious business logic or technical edge cases.

### 2. ponytail (Enforced ladder: FULL)
Enforce the lazy senior dev ladder:
1. **YAGNI:** Does this need to exist at all? If speculative, skip it.
2. **Reuse Existing Code:** Reuse helpers in `lib/` and existing components before introducing new code.
3. **Native & Stdlib First:** Native platform features (CSS, DB constraints, standard library) before new dependencies.
4. **Deletion Over Addition:** Prefer removing code and reducing file complexity over adding boilerplate.
5. **Batching & Efficiency:** Never write sequential N+1 loops for database calls or network requests; use single-roundtrip batch operations (`db.batch`).
6. **Root Cause Over Symptom:** Fix bugs at their single source where all callers route through.
7. **Shortest Working Diff Wins:** Code first, followed by concise explanations.
<!-- antislop:end -->
