<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# Architecture rules
- Auth and data go through Lovable Cloud (Supabase) browser client with RLS; never use the service-role client for user reads/writes — RLS is the authorization boundary.
- `public.profiles` rows are created only by the `handle_new_user` trigger on signup; clients may SELECT/UPDATE only their own row (no INSERT/DELETE grants) — keeps profile ownership server-enforced.
- Username uniqueness is enforced by a unique index on lower(username); the `is_username_available` RPC is only a UX pre-check.
- All user input is validated with zod schemas in `src/lib/validation.ts` (mirrored by DB CHECK constraints) — one source of truth for client rules.
- Protected pages live under `src/routes/_authenticated/` (client-only gate) — session lives in browser storage.
- App ships as an installable PWA (manifest only, no service worker); no native APK tooling exists in this project.
