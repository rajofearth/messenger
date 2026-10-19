# Update feed backend

Two internal functions and one HTTP endpoint, on Convex:

- `GET https://<deployment>.convex.site/updates/manifest?versionCode=N`
  answers `{"upToDate":true}` or the newest release manifest. The app validates
  that document in `src/domain/updates.ts` and treats anything else as
  unreadable.
- `releases:publish` (internal mutation) validates a release and stores it.
- `releases:latest` (internal query) is what the endpoint reads.

The APK is not stored here. It stays on the GitHub release, which has free
egress; Convex only answers the small JSON document. Convex storage is reserved
for the future OTA bundle tier.

## One-time setup

1. From the repository root, run `npx convex dev` and finish the browser login.
   The CLI creates the project, writes `.env.local`, and generates
   `convex/_generated/` (which stays untracked). Stop it once it is up.
2. Copy the deployment's site URL into the app's feed variable:

   ```sh
   EXPO_PUBLIC_UPDATE_FEED_URL=https://<deployment>.convex.site/updates/manifest
   ```

   That value is baked in at build time. Set the same name as a repository
   **variable** (not a secret) so the release workflow passes it to the build;
   without it the app ships with the updater unconfigured.
3. In the Convex dashboard, create a production deploy key under
   **Settings → Deploy keys** with `deployment:deploy` and
   `deployment:functions:runInternalMutations`. Save it as the
   `CONVEX_DEPLOY_KEY` GitHub Actions secret.

`npx convex deploy` in the release workflow pushes `schema.ts` and the
functions. Publishing a release is then just:

```sh
npm run android:build
node scripts/update-manifest.mjs \
  --url "https://github.com/<owner>/<repo>/releases/download/v0.0.4/messenger-0.0.4-arm64-v8a.apk"
npx convex run --prod releases:publish '<the JSON it printed>'
```

The release workflow runs all three steps after the GitHub release exists. A
missing deploy key produces a warning and skips the feed publish; it does not
fail the release.

## Rules

- `versionCode` is the only ordering key. Android compares it when installing
  one build over another, and a publish below the current head is rejected.
  Re-publishing the same version code replaces that row, which makes workflow
  retries safe.
- `releaseProblem` in `lib/manifest.ts` mirrors the client parser and runs
  before every insert, so an invalid release is never served.
- `minVersionCode` defaults to `versionCode` when a document omits it (an
  omitted floor is treated as mandatory by the app). The release script always
  sends an explicit floor, `1` by default.
- The endpoint is unauthenticated on purpose: it is a public download pointer,
  contains no secrets, and the APK is public too.
- `notes` is plain text, at most 1000 characters. `scripts/update-manifest.mjs`
  takes the matching `CHANGELOG.md` section, makes it plain text and truncates
  it.

To inspect a deployment by hand:

```sh
curl -s "https://<deployment>.convex.site/updates/manifest?versionCode=0"
```
