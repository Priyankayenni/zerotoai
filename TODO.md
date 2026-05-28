# TODO - Supabase backend verification + leaderboard privacy

## Plan
- [ ] Verify Supabase runtime behavior by inspecting schema/RLS and matching frontend queries.
- [ ] Ensure leaderboard visibility works while keeping personal details private.
- [ ] Adjust RLS policies so leaderboard shows only `profiles.name` + a computed progress count/rank.
- [ ] Restrict `profiles.class` to owner-only (or remove from public select).
- [ ] Restrict `progress` rows to owner-only; allow leaderboard via an aggregated view/function.
- [ ] Update frontend leaderboard query so it only fetches `profiles.name` and aggregated progress counts.
- [ ] Leave progress tracking (toggle) behavior unchanged.

## Progress
- [x] Reviewed `src/App.tsx` storage calls and `supabase/schema.sql`.
- [x] Identified privacy mismatch: current `select using (true)` exposes `progress` and `profiles.class` publicly.
- [x] Installed required dependencies for Supabase SSR helpers (if you later add Next.js): `npm install @supabase/supabase-js @supabase/ssr`.
- [ ] Implement SQL/RLS + frontend changes.
- [x] Restrict leaderboard to logged-in users via RLS (raw tables) + safe view.
- [x] Update frontend leaderboard query to use `public.leaderboard` only.
- [x] Remove showing `class` in leaderboard UI.
- [x] Final verification step prepared: ensure `public.leaderboard` is queryable under RLS without leaking fields.
- [x] Re-tested by querying leaderboard after signing in.



