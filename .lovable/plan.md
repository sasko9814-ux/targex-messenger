# Real voice calls for TargeX

Add browser-to-browser audio calls while preserving the existing Ukrainian dark interface, authentication, profiles, and messaging.

## What changes
- A small call button in each one-to-one conversation.
- A global incoming-call overlay on any page for signed-in users, with accept/reject.
- Outgoing ringing, connection status, mute/unmute, hang up, missed-call timeout, and clear error states.
- Persistent private signaling through Lovable Cloud, with live updates and recovery reads.
- Media and connection cleanup on rejection, hang-up, errors, timeout, sign-out, and navigation away from the app. Calls remain active during navigation within the app.

## Technical details
- Use the browser's native WebRTC audio engine; persist call state, offer/answer, and ICE candidates in participant-only tables.
- Enforce conversation membership, caller/recipient actions, valid state transitions, and busy handling in database functions/policies.
- Add authenticated short-lived TURN credentials using optional owner-configured TURN REST secrets. Without TURN, direct connections can work, but restrictive networks may fail.
- Keep one call controller above all routes; subscribe only while signed in and dispose subscriptions on sign-out.
- Test state rules and cleanup, verify the signaling schema, and exercise the audio flow in two browser sessions where test accounts are available. Run existing tests and inspect automatic build results.

## Limitations to report
- Browser microphone permission and HTTPS are required.
- Incoming calls are supported while the app is open; closed/background mobile wake-up is not part of this milestone.
- Real-device/network testing and TURN delivery are not claimed unless actually tested.