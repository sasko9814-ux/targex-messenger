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
- Voice calls use a root identity-keyed provider, native WebRTC audio, and participant-only persistent signaling; this keeps calls alive across page navigation and disposes media on sign-out.
- Voice-call mutations use authenticated database RPCs with server-enforced transitions and participant locks; clients cannot directly modify call state.
- Optional TURN REST credentials are issued by an authenticated server function using Web Crypto and request-scoped secrets; shared TURN secrets never reach browser bundles.
- The generated .env holds only public publishable settings and must stay versioned so published builds can connect; private secrets live only in hosting Secrets.
- Appearance uses whitelisted root data-theme tokens with pre-paint restoration and a shared local-preference provider; all surfaces inherit tokens to prevent inconsistent themes.
- Outbound ICE signaling is serialized per disposable media session and reconciliations are generation-scoped; stale async work cannot corrupt a subsequent call.
- Vite normalizes only the generated browser client's public auth environment accesses before replacement; this preserves generated files and keeps server secrets out of browser bundles.
