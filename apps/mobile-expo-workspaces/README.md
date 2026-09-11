# mobile-expo-workspaces

The **workspaces**-aware Expo mobile app from
[simple-auth-kit](https://github.com/shahriar-ratul/simple-auth-kit) — a deliberate copy of
[`mobile-expo`](../mobile-expo) rather than a shared abstraction, since a consumer installs
one variant, not both. Sends `X-Workspace-Id` on every workspace-scoped request, and gates on
selecting/creating a workspace before showing the main app.

## Clone just this folder

```bash
npx degit shahriar-ratul/simple-auth-kit/apps/mobile-expo-workspaces mobile-expo-workspaces
cd mobile-expo-workspaces
```

## Setup

```bash
npm install
```

Set `EXPO_PUBLIC_API_BASE_URL` if your workspaces-variant backend isn't at
`http://localhost:3005` — on an Android emulator that's `http://10.0.2.2:3005`, not `localhost`.

## Run

```bash
npm start        # opens Expo dev tools — android/ios/web from there
```

## Environment variables

| Variable | Required | Notes |
|---|---|---|
| `EXPO_PUBLIC_API_BASE_URL` | no | a workspaces-variant backend's URL — defaults to `http://localhost:3005` |

## Source

[simple-auth-kit](https://github.com/shahriar-ratul/simple-auth-kit)
