# TargeX roadmap — security, calls and appearance
## Current request — TypeScript fixes and checks
- [x] Correct strict typing in appearance provider, call signaling and appearance tests without changing behavior
- [x] Run tests and lint; inspect harness typecheck/build results — 28 tests passed, automatic typecheck/build OK, scoped lint has no errors; repository lint still has 138 existing formatting errors and 8 warnings outside this targeted fix

- [x] Remove tracked environment file; ignore local configuration without changing hosted settings
- [ ] Audit and fix real voice-call races, cleanup, validation and permissions
- [ ] Add four persistent app-wide themes and Settings appearance controls
- [ ] Run tests/lint and inspect automatic build; verify desktop/mobile flows
- [ ] Document rotation requirement, TURN availability and verification limits

## Earlier voice milestone
- [ ] Inspect existing app and backend; preserve existing features/design
- [ ] Persistent private call signaling and safe participant permissions
- [ ] Global real WebRTC audio, incoming/outgoing controls, timeout and cleanup
- [ ] Voice-call tests and browser verification; document TURN setup and limitations
- [ ] Proceed directly with applied code/database changes; no further planning pause

## Previous milestone (outside this task)
- [ ] Auth/profile hardening (signup username race, tests)
- [ ] 1:1 messaging schema + RLS + realtime
- [ ] Chats list, start by username, chat view w/ pagination, send, live updates
- [ ] In-app notifications for new messages
- [ ] Web Push (SW, subscriptions, server sender) — needs owner VAPID secrets
- [ ] PWA install instructions
- [ ] Android APK: document limitation (no JDK/Android SDK in sandbox)
- [ ] Tests, typecheck, lint, build, security scan, README checklists
