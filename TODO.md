# TODO

## Firebase migration

- [ ] Finish replacing Supabase wiring in `src/App.tsx` with Firebase helpers from `src/lib/firebaseData.ts`.
  - [ ] Replace auth subscription (use Firebase `onAuthStateChanged`) and remove Supabase session logic.
  - [ ] Replace `handleAuth` to call Firebase auth signup/signin and write/load profile.
  - [ ] Replace `togglePhase` to call `togglePhaseDone`.
  - [ ] Replace leaderboard loading to call `loadLeaderboard`.
  - [ ] Remove Supabase imports/flags (`isSupabaseConfigured`, `supabase`, etc.) and any remaining UI mentions.
- [ ] Fix `src/lib/firebaseData.ts` Firestore rules/queries assumptions (optional): ensure leaderboard query strategy matches your Firestore billing/perf needs.
- [ ] Run `npm run build` again after App rewrite.
- [ ] Provide recommended Firestore security rules for `profiles`, `progress`, `progress_summary`.

