# Convex backend

The app's server lives here: Convex Auth accounts, profiles, devices,
conversations and their members, conversation preferences, the relay queue,
files, 24-hour stories and the public update feed.

## What runs where

- `auth.ts` and `auth.config.ts` configure Convex Auth's Password provider. The
  username is normalized and used as the provider account id, so sign-in needs
  no email delivery. There is deliberately no signed-out password reset.
- `profiles.ts` owns the public name, username, bio and uploaded avatar.
  `profiles.ensure` runs once after the first sign-in; `profiles.update` checks
  username uniqueness, renames the auth account and deletes a replaced avatar.
- `conversations.ts` owns conversation creation and the inbox list. A
  conversation is one `conversations` row (kind, title, direct-chat key and the
  per-conversation sequence counter) plus one `conversationMembers` row per
  member; the document id is the conversation id the client passes back.
  `createDirect` reuses the row with the same `externalKey`, so both sides share
  one thread, and `createGroup` needs at least one other member.
- `relay.ts` is the message path: `send`, `react`, `remove`, `pull`, `ack` and
  the internal `purgeExpired` sweep. Each relayed item is one `relayQueue` row
  per recipient, holding an envelope and an optional attachment. Membership and
  block rules live in `lib/relayStore.ts`; a delivered or expired row is deleted
  and its blob released.
- `devices.ts` ties an installation's stable SecureStore id to its auth session.
  A device must be registered for 24 hours before it can remove other devices.
- `preferences.ts` stores mute, block, gallery visibility, cleared history and
  the hidden-until-newer-message state per user.
- `files.ts` finalizes uploads and records owner and metadata. Storage's real
  size must be non-zero and at most 25 MiB, and the declared MIME type must
  match the upload kind. An image upload may also carry up to three rendered
  widths, stored in `mediaVariants` after a per-width size, MIME and dimension
  check. Message media stays in Convex storage only while a relay queue row
  points at it; readers receive signed URLs through the queue pull and the
  membership-checked story queries, and a variant row keeps the URL resolved
  when it was written.
- `stories.ts` creates, lists, marks and removes stories. The list is capped to
  the newest rows first, and `crons.ts` deletes expired rows hourly, including
  their storage objects, variants and views.
- `http.ts` keeps the public `/updates/manifest` release feed next to the auth
  HTTP routes.

## One-time setup

1. From the repository root, run `npx convex dev` and finish the browser login.
   The CLI creates the project, writes `.env.local` (including
   `EXPO_PUBLIC_CONVEX_URL`), and generates `convex/_generated/`. Stop it once
   it is up.
2. Add the auth key pair to the development deployment:

   ```sh
   npx @convex-dev/auth
   ```

   This sets `JWT_PRIVATE_KEY` and `JWKS`. `SITE_URL` is only needed for OAuth
   or email flows; this app uses passwords only. Confirm with:

   ```sh
   npx convex env list
   ```

3. For a production deployment, run `npx convex deploy` and then
   `npx @convex-dev/auth --prod`. Keep `CONVEX_DEPLOY_KEY` as a GitHub Actions
   secret; the release workflow uses it to push the schema and functions.

The app reads `EXPO_PUBLIC_CONVEX_URL` at build time. Set it, and optionally
`EXPO_PUBLIC_CONVEX_SITE_URL`, as repository **variables** for the release and
CI builds. The Convex client derives the `.convex.site` auth routes itself; the
site URL variable is kept for reference and for other tooling.

## Development

```sh
npx convex dev          # watch functions and regenerate types
npx convex dev --once   # deploy and regenerate once, then exit
```

Run the app against the same development deployment. Sign up two accounts to
test contacts, direct chats, groups, blocks, the relay round trip and story
visibility.
Media downloads go through Convex storage, so a missing deployment or a
signed-out session is the first thing to check when the app shows cached data
but cannot send.

## Release feed

`releases:publish` (internal mutation) validates a release and stores it;
`releases:latest` (internal query) feeds the endpoint. The APK itself stays on
the GitHub release, so Convex only answers the small JSON document.

```text
GET https://<deployment>.convex.site/updates/manifest?versionCode=N
```

Answers `{"upToDate":true}` or the newest release manifest. Publishing is:

```sh
npm run android:build
node scripts/update-manifest.mjs \
  --url "https://github.com/<owner>/<repo>/releases/download/vX.Y.Z/messenger-X.Y.Z-arm64-v8a.apk"
npx convex run --prod releases:publish '<the JSON it printed>'
```

Rules:

- `versionCode` is the only ordering key. A publish below the current head is
  rejected, and re-publishing the same version code replaces that row, which
  makes workflow retries safe.
- `lib/manifest.ts` mirrors the client parser and runs before every insert, so
  an invalid release is never served.
- `minVersionCode` defaults to `versionCode` when omitted; the release script
  always sends an explicit floor, `1` by default.
- The endpoint is unauthenticated on purpose: it is a public download pointer,
  contains no secrets, and the APK is public too.
- `notes` is plain text, at most 1000 characters. `scripts/update-manifest.mjs`
  takes the matching `CHANGELOG.md` section and truncates it.

To inspect a deployment by hand:

```sh
curl -s "https://<deployment>.convex.site/updates/manifest?versionCode=0"
```
