# Falcon Student Mobile

Expo Router app for the Falcon Student iOS and Android experience.

## Environment

Create a local `.env` from `.env.example`:

```sh
EXPO_PUBLIC_API_URL=http://localhost:4000
EXPO_PUBLIC_DEFAULT_TENANT_SUBDOMAIN=sgvu
```

For phone browser or device testing against a local backend, replace `localhost` with the computer's LAN IP address because physical phones cannot reach the laptop through `localhost`.

Example for this machine:

```sh
EXPO_PUBLIC_API_URL=http://192.168.1.125:4000
```

## Phase 1: Instant Local Testing (Web + LAN)

Expo Go on the Play Store may lag behind the project SDK. Prefer web preview or a custom dev client instead of Expo Go.

### Web preview on your phone browser

1. Ensure phone and laptop are on the same Wi-Fi.
2. Set `EXPO_PUBLIC_API_URL` in `.env` to your laptop LAN IP (not `localhost`).
3. Start the LAN web server:

```sh
npm run start:web:lan
```

4. Open on your phone browser:

```text
http://192.168.1.125:8081
```

Live reload still works for rapid UI reviews.

### Expo Go (optional)

Only use Expo Go when its store version matches the project SDK.

```sh
npm run start:go
```

## Phase 2: Staging And QA Distribution With EAS Build

Use this when QA needs a standalone app outside Expo Go.

### Custom Development Client (recommended)

Because Falcon uses `expo-secure-store` and `expo-notifications`, use an Expo Development Build instead of Expo Go.

Build a permanent installable Android APK:

```sh
npm run dev:build:android
```

EAS returns a secure URL. Install the APK on your phone once, then connect it to the Metro dev server with:

```sh
npm run start:lan
```

For staging QA without Metro, use the preview profile:

```sh
npm run qa:preview:android
```

Android QA acceptance:

- APK installs without Expo Go.
- Login succeeds against the configured staging API.
- Home, Academics, ID Card, and Profile tabs open.

### iOS TestFlight

iOS standalone testing requires a University Apple Developer Account.

1. Purchase or use the University Apple Developer Account.
2. Create the Falcon app record in App Store Connect.
3. Replace `REPLACE_WITH_APP_STORE_CONNECT_APP_ID` in `eas.json`.
4. Build and submit to TestFlight:

```sh
npm run qa:testflight:ios
```

5. Invite testers from App Store Connect. Testers install the Falcon app through Apple's TestFlight app.

iOS QA acceptance:

- TestFlight build is available to invited testers.
- The app installs without Expo Go.
- Login and bottom tabs work on a real iPhone.

## Phase 3: Automated API And Stress Testing

Run these checks before broad rollout.

### Offline Mode

Goal: verify cached student data remains available when connectivity drops.

1. Log in successfully.
2. Open Home and ID Card so timetable and QR data have been rendered.
3. Enable Airplane Mode.
4. Force close and reopen the app.
5. Confirm the app does not crash and still renders cached screens.
6. Disable Airplane Mode and confirm data refreshes silently.

Offline acceptance:

- Home opens while offline.
- ID Card QR code opens while offline.
- No infinite spinners or crashes appear.
- Data refreshes after reconnect.

### Token Expiry

Goal: verify expired JWTs return the student to Login instead of leaving the app in a broken state.

1. Log in successfully.
2. Replace the stored token with an expired JWT or configure the backend to reject the current token.
3. Trigger an authenticated request from a tab.
4. Confirm the app clears the local session and redirects to Login.
5. Log in again and confirm normal navigation resumes.

Token-expiry acceptance:

- A `401` response clears SecureStore auth.
- The live Zustand auth state updates immediately.
- Expo Router redirects to `(auth)/login`.
- No infinite loading spinner remains.

### Load And API Stress

Use backend load tooling against the staging API before inviting large cohorts.

Recommended API targets:

- `POST /api/auth/local-login`
- `GET /api/auth/me`
- `GET /api/academics/student/timetable`
- `GET /api/academics/student/attendance`
- `PATCH /api/users/me/device-token`

Stress acceptance:

- Auth and timetable endpoints remain within agreed latency targets.
- Failed requests return clear API errors.
- Mobile retries do not amplify server failures into request storms.
