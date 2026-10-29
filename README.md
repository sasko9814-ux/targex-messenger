# Welcome to your Lovable project

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Open your project in the [Lovable editor](https://lovable.dev) and keep building.

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: connect the project to GitHub and every change made in Lovable is committed straight to your repository.
- **Full ownership**: this code is yours. Push to your repository and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Built with

- TanStack Start
- TypeScript
- React
- Tailwind CSS

## TargeX — testing & security checks

Run unit tests (validation rules, error translation, routing):

    bun run test

Manual security checks:
1. Sign up two accounts A and B. Signed in as A, in the browser console run
   `supabase.from('profiles').select('*')` — only A's row must come back.
2. As A, try `update({display_name:'x'}).eq('id', <B id>)` — 0 rows affected.
3. Try registering a username that exists with different casing — it must be rejected.
4. Open `/profile` signed out — you must be redirected to `/auth`.
5. Passwords are handled only by Lovable Cloud auth (hashed); the app never stores them.

## Voice calls

Real browser WebRTC audio is connected to persistent participant-only Lovable Cloud signaling. The conversation phone button starts a call; incoming calls appear above any page while signed in. Accept/reject, ringing, mute/unmute, hang-up and 45-second unanswered timeout are implemented. Accepted calls heartbeat every 10 seconds; lost peers expire after 60 seconds. Media tracks, peer connections and subscriptions are disposed on exit/sign-out. Calls survive in-app navigation, but not reloads. Reloaded active calls are marked failed rather than showing a fake connected state.

HTTPS (or localhost), browser WebRTC support and microphone permission are required. Closed apps do not receive/wake for incoming calls; background mobile tabs may be suspended. Signaling contains SDP and ICE network metadata and is visible only to participants, not other users; audio is not stored in the database.

### Optional TURN relay setup

Without TURN, STUN-only direct connections may work but cannot be relied on across cellular, corporate, VPN or restrictive NAT networks. Obtain a TURN server supporting coturn-style REST HMAC-SHA1 credentials. In **Project Settings → Secrets**, add `TURN_URLS` (comma-separated `turn:`/`turns:` URLs) and `TURN_REST_SECRET` (the same shared secret configured on that server). Do not commit the shared secret. Publish after saving secrets for the published app to receive them. Credentials expire after one hour; longer calls needing an ICE restart are not supported in this milestone. No TURN service is provisioned by this code.

### Checks

Run `bunx vitest run` for unit/regression tests and `bun run lint` for lint. Lovable runs the build automatically. Manual two-account checks: call A→B while B is on profile, accept and verify speech both ways, mute/unmute each side, navigate during a call, hang up from each side, reject, wait 45 seconds unanswered, deny microphone, sign out, close/reload and simulate network loss. Verify no microphone indicator remains after each exit. Repeat between real Android devices on Wi-Fi/cellular with TURN; verify relay candidates and received RTP audio. Signed in as an unrelated third user, reads of call/ICE rows must return none and call RPCs must deny access. No production security audit, load test, closed-app wake-up or real-device push/call delivery is implied.
