# Smoke Break

PWA that lets a group raise the flag for a smoke, with push notifications to everyone's phone (even when the browser is closed). Sign-in with Microsoft Entra. Stays on free tiers.

## Architecture

- **React + Vite + TypeScript** PWA, hosted on Firebase Hosting.
- **Firebase Auth** for sign-in (Microsoft provider — same OAuth backend as MSAL).
- **Firestore** for users, groups, invites, smokes.
- **Firebase Cloud Messaging** (web push) for notifications, with a `firebase-messaging-sw.js` service worker.
- **Cloudflare Worker** (`worker/`) as the push sender: keeps Firebase on the Spark plan. It validates the caller's Firebase ID token, re-reads Firestore as an admin with a service account, and calls FCM HTTP v1.

## One-time setup (you do this, I can't)

### 1. Firebase

1. Create a project at <https://console.firebase.google.com>. Keep the **Spark** plan.
2. **Build → Authentication → Sign-in method** → enable **Microsoft**.
   - It asks for an Azure app Client ID + secret. To get those:
     - Go to <https://portal.azure.com> → **App registrations** → **New registration**.
     - *Supported account types*: **Accounts in any organizational directory and personal Microsoft accounts**.
     - **Redirect URI (Web)**: `https://<YOUR-PROJECT>.firebaseapp.com/__/auth/handler`
     - After creation: copy the **Application (client) ID** into Firebase.
     - **Certificates & secrets → New client secret** → copy the **Value** into Firebase.
3. **Build → Firestore Database** → create in **production** mode.
4. **Project settings → General** → "Your apps" → add a web app → copy the config (apiKey, authDomain, projectId, appId, messagingSenderId). You'll paste these into `.env.local`.
5. **Project settings → Cloud Messaging** → Web configuration → **Generate key pair** (the VAPID key). Copy it.
6. **Project settings → Service accounts** → **Generate new private key** → download the JSON. This goes into the Cloudflare Worker only — **do not commit it**.

### 2. Cloudflare

1. Create a free account at <https://dash.cloudflare.com>.
2. `npm i -g wrangler && wrangler login`.

### 3. Project config

1. Copy `.env.local.example` → `.env.local` and fill in the Firebase values + VAPID key.
2. Set `VITE_PUSH_WORKER_URL` after step 5 below.

## Running

```bash
# From smoke-app/
npm install
npm run icons        # generates placeholder PWA icons (orange squares)
npm run dev          # open http://localhost:5173
```

## Deploying

### 4. Firestore rules + indexes

```bash
npm i -g firebase-tools
firebase login
firebase use <YOUR-PROJECT-ID>
firebase deploy --only firestore:rules,firestore:indexes
```

### 5. Cloudflare Worker

```bash
cd worker
npm install
wrangler secret put FIREBASE_PROJECT_ID       # paste the project id
wrangler secret put GCP_SERVICE_ACCOUNT_JSON  # paste the whole JSON from step 1.6
wrangler secret put ALLOWED_ORIGIN            # e.g. https://<your-project>.web.app
wrangler deploy
# Copy the deployed URL (e.g. https://smoke-push.<subdomain>.workers.dev)
# into VITE_PUSH_WORKER_URL in ../.env.local
```

### 6. Firebase Hosting

```bash
cd ..
npm run build
firebase deploy --only hosting
# → your app is live at https://<YOUR-PROJECT>.web.app
```

## Using it

1. Owner opens the app on desktop → signs in with Microsoft → creates a group → generates an invite link.
2. Sends the link in WhatsApp/Slack to friends.
3. Each friend opens the link on their phone:
   - **Android**: Sign in with Microsoft → allow notifications when prompted. Done.
   - **iPhone (iOS 16.4+)**: The app shows a prompt — tap **Share → Add to Home Screen**. Open the app from the new home-screen icon, sign in, allow notifications. iOS web push only works from an installed PWA.
4. Anyone in the group taps **🚬 Raise the flag** → picks a duration → confirm.
5. Everyone else's phone buzzes. Tap the notification → Accept or Deny.
6. Initiator gets a follow-up push for each response.

## Data model (Firestore)

See `firestore.rules` for the full security model.

```
users/{uid}
  displayName, email, photoURL, lastSeenAt
  fcmTokens: { [token]: { platform, createdAt } }

groups/{groupId}
  name, ownerUid, memberUids[], createdAt

groups/{groupId}/invites/{code}
  createdBy, createdAt, expiresAt, maxUses, uses

smokes/{smokeId}
  groupId, initiatorUid, startedAt, expiresAt, durationMinutes
  status: "open" | "closed"
  responses: { [uid]: { status, respondedAt } }
```

## Troubleshooting

- **No notification on iOS**: iOS requires the PWA be installed via *Share → Add to Home Screen* and opened from that icon. Notifications don't work in normal Safari tabs.
- **No notification on Android**: check Chrome *site settings → notifications* is allowed. Clear FCM token cache by signing out/in.
- **`firebase-messaging-sw.js` serves empty values**: the Vite plugin in `vite.config.ts` substitutes env tokens at dev/build time. Make sure `.env.local` has the Firebase config and restart the dev server.
- **Worker returns 401**: check the client is sending an up-to-date Firebase ID token. Tokens expire after 1 hour; `user.getIdToken()` refreshes automatically.
- **Worker returns 403 `not initiator`**: you tried to `/push-smoke` for a smoke you didn't create. Expected.
