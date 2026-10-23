# Messenger web tester

A local-only second-user client for testing the Android app. It signs in to the
same Convex deployment as the phone, so a conversation can be driven from a
browser without adding a production auth bypass to the backend. The same test
user can also be driven by a CLI or a small local HTTP API, which is what an
agent uses when it should not open the browser.

This directory is not imported by the mobile app. It adds no JavaScript to the
APK and does not change the app's runtime.

## Start the website

```sh
npm run web:dev
```

Open <http://localhost:5174>. To use a phone on the same Wi-Fi network, open
`http://<this-computer's-LAN-IP>:5174`.

The reusable test account is:

```text
username: webtester_2026
password: see tools/web-tester/.env.local
```

The password is deliberately not committed. The account already exists on the
`striped-finch-559` development deployment. You can also create a new account
from the web sign-up form; put its username and password in
`tools/web-tester/.env.local` if you want the agent to use it.

For an immediate demo, the same local file also has the optional phone-side
account `phone_demo` (password in the file). Sign in with it on the APK and
`webtester_2026` on the web; the two accounts already share a conversation.

## What the web tester supports

- Username/password sign-in and account creation.
- Direct chats by username, group creation, and the conversation inbox.
- Text messages, image/video/audio/file attachments, replies, and reactions.
- Read state as conversations are opened.
- Live updates while the page is open, because it uses the same Convex queries
  and mutations as the mobile app.

It intentionally does not try to reproduce stories, calls, notifications, or
the mobile visual design. It is a test harness, not a second production client.

## Suggested two-user test

1. Install the APK on the phone and create an account, for example `phone_user`.
2. On the web, sign in as `webtester_2026` (or your own second account).
3. In the web sidebar, enter `phone_user` under **Message someone** and open the
   chat.
4. Send text, an image, a file, a reply, and a reaction from both sides.
5. Confirm the phone receives and displays each item, and that the web updates
   when the phone replies.

## Agent CLI

The CLI uses the username and password from `tools/web-tester/.env.local`, or
`--username` / `--password` overrides. It authenticates with a normal Convex
Auth password sign-in and refreshes the token when needed. There is no backend
test-only authentication path.

```sh
npm run web:agent -- whoami
npm run web:agent -- chats
npm run web:agent -- open phone_user
npm run web:agent -- send --to phone_user --text "hello from the web"
npm run web:agent -- read --to phone_user --limit 20
npm run web:agent -- upload --to phone_user --file .\photo.jpg --caption "from web"
npm run web:agent -- react --conversation <id> --message <messageId> --emoji "👍"
npm run web:agent -- group --title "Test group" --members phone_user,webtester_2026
```

`send`, `read`, and `upload` also accept `--conversation <id>` when you already
know the conversation ID. The thread header has a copy button for that ID.

Every command accepts `--json` for machine-readable output:

```sh
npm run web:agent -- read --to phone_user --limit 20 --json
```

`--reply-to <messageId>` adds a reply target to a text or upload command. Use
`--emoji none` to remove a reaction.

## Local control API

Start the API:

```sh
npm run web:control
```

It listens on `http://127.0.0.1:8787` by default and signs in as the same test
account. Routes:

| Method | Path | Body or query |
| --- | --- | --- |
| GET | `/health` | none |
| GET | `/chats` | `?limit=50` |
| POST | `/chats` | `{ "username": "phone_user" }` or `{ "title": "...", "usernames": ["a"] }` |
| GET | `/messages` | `?conversationId=...&limit=50` |
| POST | `/messages` | `{ "to": "phone_user", "text": "hello" }` |
| POST | `/files` | `{ "to": "phone_user", "path": "C:\\path\\photo.jpg", "caption": "hi" }` |
| POST | `/reactions` | `{ "conversationId": "...", "messageId": "...", "reactionKey": "👍" }` |
| POST | `/read` | `{ "conversationId": "...", "sequence": 12 }` |

`POST /messages`, `POST /files`, and the CLI accept either `to` (a username) or
`conversationId`. The file route reads a path from the local machine because
both the agent and the API run on this computer.

PowerShell examples:

```powershell
Invoke-RestMethod http://127.0.0.1:8787/chats
Invoke-RestMethod -Method Post http://127.0.0.1:8787/messages `
  -ContentType "application/json" `
  -Body '{"to":"phone_user","text":"hello from the control API"}'
```

curl examples:

```sh
curl http://127.0.0.1:8787/chats
curl -X POST http://127.0.0.1:8787/messages \
  -H "content-type: application/json" \
  -d '{"to":"phone_user","text":"hello from the control API"}'
```

## Safety

- The website and control API are development tools. Do not expose the control
  API to the internet.
- The control API binds to loopback by default. If you change
  `WEB_TESTER_CONTROL_HOST`, set `WEB_TESTER_CONTROL_TOKEN`; requests then need
  `Authorization: Bearer <token>`.
- `tools/web-tester/.env.local` contains a test password and is ignored by git.
  Do not reuse that password for a real account.
- The test account is a normal account on the development deployment. It cannot
  read or write anything that account is not a member of.

## Troubleshooting

- **"Convex URL is missing"**: set `EXPO_PUBLIC_CONVEX_URL` in the repository's
  `.env.local` and restart `npm run web:dev`.
- **Sign-in fails**: check `tools/web-tester/.env.local`, or create a new
  account from the web form. There is no signed-out password reset.
- **Phone cannot open the page**: make sure both devices are on the same
  network and allow Node through the Windows firewall for the private network.
  The dev server binds to `0.0.0.0` on port 5174.
- **Agent says the username is not found**: the phone account must be signed up
  first, and usernames are lowercase letters, numbers, and underscores.
- **Agent token expired**: the CLI signs in again automatically; the long-lived
  control server refreshes its token and retries once.
