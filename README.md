# DA-Bubble – Angular Chat Application

This real-time messaging application was developed as a practical demonstration and learning project to explore advanced concepts in modern front-end development. Inspired by Slack, the app enables dynamic real-time team communication.

Built on Angular 21 and Firebase, the application combines a high-performance user interface with a cloud-based backend. The result is a fully functional platform for modern team communication, covering key messenger features such as public channels, direct messages, threaded replies, emoji reactions and live notifications.

[🚀 Live Demo](https://da-bubble.marcel-lukas.com/)

---

## 📋 Table of Contents

- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Prerequisites](#-prerequisites)
- [Getting Started](#-getting-started)
- [Firebase Setup](#-firebase-setup)
- [Environment Variables](#-environment-variables)
- [Project Structure](#-project-structure)
- [Routing & Guards](#-routing--guards)
- [Key Services](#-key-services)
- [Notifications](#-notifications)
- [Responsive Design](#-responsive-design)
- [Build for Production](#-build-for-production)
- [Notes](#-notes)
- [Helpful Documentation](#-helpful-documentation)
- [Contact & Support](#-contact--support)

---

## ✨ Features

- **E-mail / Password registration** with avatar selection flow
- **Google Sign-In** and **Guest login** (anonymous Firebase Auth)
- Public **channels** with member management (add/remove, leave, delete)
- **Direct messages** between registered users and active guests
- **Thread replies** on any message within a channel
- **Emoji reactions** on messages via ngx-emoji-mart
- **Real-time updates** for messages, channels and user presence (Firestore `onSnapshot`)
- **Notification system** – sound + blinking unread indicator for new messages, even for messages missed while offline (`uLastSeen` heartbeat)
- **Search** across channels and users via the header search bar
- **User profiles** – editable display name, avatar and online status
- **Route guards** – authenticated users are forwarded away from the login page; unauthenticated users cannot access the chat
- Orphaned guest cleanup on every new guest login
- Lazy-loaded route chunks for fast initial load
- Fully **responsive** layout (mobile / desktop)

---

## 🛠 Tech Stack

| Technology | Version |
|---|---|
| Angular | 21.2.x |
| @angular/fire | 21.0.0-rc.0 |
| Firebase (JS SDK) | 12.14.x |
| RxJS | 7.8.x |
| @ctrl/ngx-emoji-mart | 9.2.x |
| @angular/cdk | 21.2.x |
| Node.js | 20+ |
| Backend | Firebase (Firestore + Authentication) |

---

## 📦 Prerequisites

- **Node.js** 20 or higher (includes `npm`)
- **Angular CLI** 21 (`npm install -g @angular/cli@21`)
- A **Firebase project** with Firestore and Authentication enabled (see [Firebase Setup](#-firebase-setup))
- *(Optional)* **Firebase CLI** for deploying Firestore security rules and indexes

---

## 🚀 Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/Marcel-Lukas/DA-Bubble-2.0.git
cd DA-Bubble-2.0
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment files

```bash
cp src/environments/environment.example.ts src/environments/environment.ts
cp src/environments/environment.example.ts src/environments/environment.prod.ts
```

Fill in your Firebase credentials in both files (see [Environment Variables](#-environment-variables)).

### 4. Deploy Firestore indexes (required)

```bash
firebase deploy --only firestore:indexes --project <YOUR_PROJECT_ID>
```

Without this step some queries (e.g. notification queries with compound filters) will fail with a `failed-precondition` error.

### 5. Start the development server

```bash
npm start
```

The application is now available at `http://localhost:4200/`.

---

## 🔥 Firebase Setup

1. Go to the [Firebase Console](https://console.firebase.google.com/) and create a new project.
2. Enable **Authentication** → Sign-in methods:
   - E-mail / Password
   - Google
   - Anonymous
3. Enable **Firestore Database** and create it in production mode.
4. Copy your web app credentials from  
   *Project Settings → General → Your apps → Web app → SDK setup and configuration*.
5. Paste the values into `src/environments/environment.ts` (and `environment.prod.ts` for production).
6. *(Recommended)* Deploy the Firestore Security Rules and Indexes from the repository:

```bash
firebase deploy --only firestore --project <YOUR_PROJECT_ID>
```

---

## 🔧 Environment Variables

All Firebase credentials are read from the environment files in `src/environments/`.  
The template is located at `src/environments/environment.example.ts`:

```typescript
export const environment = {
  production: false,
  firebase: {
    apiKey:            'YOUR_API_KEY',
    authDomain:        'YOUR_PROJECT.firebaseapp.com',
    projectId:         'YOUR_PROJECT_ID',
    storageBucket:     'YOUR_PROJECT.firebasestorage.app',
    messagingSenderId: 'YOUR_SENDER_ID',
    appId:             'YOUR_APP_ID',
  },
};
```

> **Note:** Even though Firebase web API keys are not strictly secret, keep them out of source control and rely on **Firestore Security Rules** to protect your data.

---

## 📁 Project Structure

```
DA-Bubble/
│
├── public/
│   └── assets/
│       ├── font/                       # Custom font files
│       ├── icons/                      # SVG / PNG icons
│       ├── img/                        # Images and avatars
│       └── sounds/                     # Notification sound (new-message-sound.wav)
│
├── src/
│   ├── environments/
│   │   ├── environment.example.ts      # Template – copy to environment.ts
│   │   ├── environment.ts              # Dev credentials (git-ignored)
│   │   └── environment.prod.ts         # Prod credentials (git-ignored)
│   │
│   └── app/
│       ├── app.config.ts               # Angular application config (provideFirebaseApp, etc.)
│       ├── app.routes.ts               # Top-level lazy routes
│       │
│       ├── features/
│       │   ├── access/                 # Public authentication shell
│       │   │   ├── login/              # Login form
│       │   │   ├── create-account/     # Registration form
│       │   │   ├── select-avatar/      # Avatar picker (registration step 2)
│       │   │   ├── confirm-email/      # "Check your inbox" screen
│       │   │   ├── confirm-password/   # Password reset form
│       │   │   ├── go-to-email/        # "Link sent" screen
│       │   │   ├── imprint/            # Legal imprint page
│       │   │   └── privacy/            # Privacy policy page
│       │   │
│       │   ├── general-components/     # Shared UI building blocks
│       │   │   ├── add-new-members/    # Dialog – add users to a channel
│       │   │   ├── button/             # Generic button component
│       │   │   ├── channel-leave/      # Leave-channel confirmation
│       │   │   ├── custom-input/       # Styled text input wrapper
│       │   │   ├── member-list/        # List of channel members
│       │   │   ├── permanent-delete/   # Delete-channel confirmation
│       │   │   ├── profil/             # User profile view / edit dialog
│       │   │   └── success-indicator/  # Animated success toast
│       │   │
│       │   └── main-content/           # Authenticated chat shell
│       │       ├── contact-bar/        # Left sidebar
│       │       │   ├── channels/       # Channel list + create channel
│       │       │   ├── direct-message/ # DM list (online indicator)
│       │       │   └── header-bar/     # Sidebar header (logo, new message)
│       │       ├── header/             # Top header (search, user menu)
│       │       ├── message-area/       # Central chat area
│       │       │   ├── message/        # Individual message (edit, delete, reactions)
│       │       │   ├── message-composer/ # Composer (text, emoji, send)
│       │       │   └── channel-members/  # Members popover
│       │       └── search-information/ # Search results overlay
│       │
│       └── shared/
│           ├── guards/
│           │   └── auth.guard.ts       # authGuard + publicOnlyGuard
│           ├── interfaces/             # TypeScript interfaces (Channel, Message, Reaction, User)
│           ├── scss/                   # Global variables, mixins, base styles
│           └── services/
│               ├── authentification.service.ts  # Firebase Auth (login, register, guest, Google)
│               ├── channel.service.ts           # Firestore channel CRUD + realtime listener
│               ├── message.service.ts           # Firestore message CRUD + realtime listener
│               ├── user.service.ts              # Firestore user CRUD + realtime listener
│               ├── notification.service.ts      # Unread-message tracking + sound playback
│               ├── component-switcher.service.ts# UI state (active chat, open panels)
│               ├── visible-button.service.ts    # Hover-button visibility state
│               └── responsive.ts               # Breakpoint / responsive helper
│
├── firebase.json                       # Firebase CLI config (firestore rules/indexes only)
├── firestore.indexes.json              # Composite Firestore indexes
├── angular.json
├── package.json
└── tsconfig.json
```

---

## 🔐 Routing & Guards

| Path | Guard | Description |
|---|---|---|
| `/` | — | Redirects to `/access` |
| `/access` | `publicOnlyGuard` | Login / registration shell; signed-in users are redirected to `/home` |
| `/home` | `authGuard` | Main chat shell; unauthenticated users are redirected to `/access` |
| `/home/:activeUserId` | `authGuard` | Same shell with an active user context (e.g. DM deeplink) |
| `/**` | — | Wildcard redirect to `/access` |

Both guards run **inside `runInInjectionContext`** to avoid Firebase "called outside of an injection context" errors after `await` boundaries.

---

## ⚙️ Key Services

| Service | Purpose |
|---|---|
| `AuthentificationService` | Sign-up, login (email/Google/guest), logout, password reset, anonymous guest cleanup |
| `ChannelService` | Create, update, delete channels; real-time `onSnapshot` listener; owner permission check |
| `MessageService` | Create, edit, delete messages and thread replies; `onSnapshot` listener |
| `UserService` | Load and update user profiles; real-time presence via `onSnapshot` |
| `NotificationService` | Tracks unread messages (even from offline periods via `uLastSeen`), plays sound, exposes `unread$` BehaviorSubject |
| `ComponentSwitcherService` | Manages which panel/chat is currently active; coordinates sidebar ↔ message-area ↔ thread |
| `ResponsiveService` | Provides breakpoint signals for conditional mobile/desktop rendering |

---

## 🔔 Notifications

The `NotificationService` implements a full offline-aware unread tracking system:

- On **start**, it reads `uLastSeen` from the user's Firestore document (fallback: `now()`) and opens Firestore listeners for messages created _after_ that timestamp.
- A **heartbeat** (`setInterval` every 15 s + `beforeunload` handler) persists `uLastSeen` continuously – but only when there are no pending unread messages, preventing them from being silently discarded.
- On every incoming message the service checks sender, thread-reply flag and active chat before marking the conversation as **unread** and playing `new-message-sound.wav`.
- The `unread$` `BehaviorSubject<Set<string>>` (channel IDs / sender UIDs) is consumed by the channel list and DM list to show a **blinking dot** indicator.
- Marking a conversation **read** happens automatically when the user opens that chat.

---

## 📱 Responsive Design

The application uses a fully responsive layout that adapts to different screen sizes:

- On **mobile**, the sidebar and the message area are shown alternately; the thread panel slides in as an overlay.
- On **desktop**, sidebar, message area and thread panel are displayed side by side.
- Breakpoints are managed centrally via `ResponsiveService` and SCSS variables in `src/app/shared/scss/_variables.scss`.

---

## 🏗 Build for Production

```bash
npm run build
```

The optimized output is written to the `dist/` directory.  
Before deploying, make sure `src/environments/environment.prod.ts` contains your production Firebase credentials and `production: true`.

---

## 📝 Notes

- The Firebase API key is intentionally committed in `environment.example.ts` as a placeholder only. Never commit your real credentials to source control.
- Firestore Security Rules are configured to restrict read/write access to authenticated users only. Always review and tighten the rules before going to production.
- The `@angular/fire` package used is a **release candidate** (`21.0.0-rc.0`). It bundles `firebase@12`. Make sure `package.json` specifies `firebase@^12.x` to prevent duplicate installations and `_Query` type mismatch errors (`npm ls firebase` should show exactly one version).
- The `NG0751` console warning about `@defer` + HMR eager loading is a **development-only** warning and does not affect the production build.
- Guest sessions are cleaned up automatically on each new guest login via `cleanupOrphanedGuests()`. Guests that close the tab without logging out are hidden in the DM list when their online status becomes `false`.

---

## 🔗 Helpful Documentation

- [Angular Documentation](https://angular.dev/)
- [@angular/fire Documentation](https://github.com/angular/angularfire)
- [Firebase Documentation](https://firebase.google.com/docs)
- [Firestore Documentation](https://firebase.google.com/docs/firestore)
- [Firebase Authentication](https://firebase.google.com/docs/auth)
- [Firebase Security Rules](https://firebase.google.com/docs/rules)
- [ngx-emoji-mart](https://github.com/scttcper/ngx-emoji-mart)
- [RxJS Documentation](https://rxjs.dev/)

---

## 📧 Contact & Support

This is an application developed using Angular and Firebase, intended primarily as a demo project. If you find any bugs or have suggestions for improvements, please create an issue in the repository.

⬆️ [Scroll up](#da-bubble--angular-chat-application)
