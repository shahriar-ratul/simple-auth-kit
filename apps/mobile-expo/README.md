# mobile-expo

An Expo end-user mobile app from [simple-auth-kit](https://github.com/shahriar-ratul/simple-auth-kit)
consuming the plain (non-workspaces) backend variant — login, 2FA, profile, sessions.

## Clone just this folder

```bash
npx degit shahriar-ratul/simple-auth-kit/apps/mobile-expo mobile-expo
cd mobile-expo
```

## Setup

```bash
npm install
```

Set `EXPO_PUBLIC_API_BASE_URL` if your backend isn't at `http://localhost:3001` — on an
Android emulator that's `http://10.0.2.2:3001`, not `localhost`.

## Run

```bash
npm start        # opens Expo dev tools — android/ios/web from there
npm run android
npm run ios
npm run web
```

## Environment variables

| Variable | Required | Notes |
|---|---|---|
| `EXPO_PUBLIC_API_BASE_URL` | no | backend URL — defaults to `http://localhost:3001` |

## Source

[simple-auth-kit](https://github.com/shahriar-ratul/simple-auth-kit)
