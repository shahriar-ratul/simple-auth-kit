# `registry/mobile-apps/` — mobile app templates

Two products, same `shared/` + `variants/{base,workspaces}` composition and byte-identical
hoisting rule as `registry/admin-apps/`, `installMode: "scaffold"` (see
`registry/admin-apps/README.md` for what that means concretely — a whole standalone app written
into the target directory, not a fragment merged into a host project).

| Product | `kind` in `cli/registry.json` | Extracted from |
|---|---|---|
| `mobile-expo` | `mobile` | `apps/mobile-expo` + `apps/mobile-expo-workspaces` |
| `mobile-bare-rn` | `mobile` | `apps/mobile-bare-rn` + `apps/mobile-bare-rn-workspaces` |

Both decompose cleanly — the base/workspaces split in the source apps already *was* conceptually a
shared+variant pair (each source app's own `package.json` description says as much: "a deliberate
copy... rather than a shared abstraction"). The same 5 source files carry the workspace-scoping
diff in both products (`api/authClient.ts`, `navigation/RootNavigator.tsx`, `navigation/types.ts`,
`screens/HomeScreen.tsx`, `store/authStore.ts`), and the same 3 files are pure workspaces-only
additions (`screens/WorkspaceSelectScreen.tsx`, `store/workspaceStore.ts`,
`workspace/activeWorkspace.ts`). Dependencies are byte-identical between each product's own two
source apps.

## `mobile-bare-rn`: native identity retemplating

This is the one place a plain copy isn't enough. Bare React Native bakes a fixed app identity into
its native scaffolding: Android `applicationId`/package folder (`com.mobilebarern`), iOS Xcode
project/scheme/bundle id (`MobileBareRn`). In the source apps this is byte-identical between `base`
and `workspaces` — which only works because the two are never built side by side. Copying either
one's `android/`/`ios/` verbatim into every generated app would mean **every app this combo
generates collides on the same `applicationId`/bundle id**, which is silently fine until someone
tries to install two of them on the same device or submit both to an app store.

`cli/lib/rename-native.ts` fixes this as a post-copy step, run only for this combo (via the
`nativeIdentity` field on its `cli/registry.json` entry — `{ name: "MobileBareRn", package:
"com.mobilebarern" }`), driven by `--name`:

1. Moves the Android Kotlin package folder (`android/app/src/main/java/com/mobilebarern/` →
   `.../com/<newpackage>/`).
2. Renames every file or directory anywhere under `ios/` whose name is the old identity or starts
   with `<oldName>.` — the `.xcodeproj`, the source folder, the `.xcscheme` — not a hardcoded list
   of three paths, so it keeps working if a future RN version's template adds another
   identity-named file.
3. Blanket string-replaces the old name/package with the new ones across every remaining text file
   under `android/`/`ios/`, plus the root `app.json` — `build.gradle`, `settings.gradle`,
   `strings.xml`, `project.pbxproj`, `Podfile`, `Info.plist`. This mirrors what `react-native
   rename` tooling does; surgically parsing a semi-structured `.pbxproj` for no real benefit isn't
   worth the fragility.
4. Reconciles `auth.lock.json`'s manifest to follow every rename (chaining a nested file's own
   move with its parent directory's later move — e.g. a scheme file renamed while still inside the
   old-named `.xcodeproj`, whose folder is itself renamed one step after), so a future re-sync
   doesn't see every native file as spuriously removed or user-modified.

`mobile-expo` has none of this — Expo's managed workflow has no `ios/`/`android/` folders at all,
so its copy is exactly as simple as the backend combos'.

**Not verified**: the actual native (Xcode/Gradle) build of a generated `mobile-bare-rn` app. This
environment has no Xcode/Android SDK. What's verified is that the identity strings end up
consistent and unique per generated app (confirmed by generating two apps with different `--name`
values and diffing their `applicationId`/bundle id/package paths) and that the TypeScript side
installs and typechecks cleanly. If a native build ever fails on a freshly generated app, start by
checking whether some other identity-bearing file wasn't caught by step 2 or 3 above.

## Known limitation: `@easy-auth/auth-client`

Same as `registry/admin-apps/README.md` — `"@easy-auth/auth-client": "workspace:*"` only resolves
inside this monorepo's pnpm workspace. Called out in both combos' `postInstall` notes.
