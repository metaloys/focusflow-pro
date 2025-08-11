# FocusKit

A polished, local-first focus and productivity toolkit for remote workers. Cross-platform app (Flutter), distraction-blocking browser extension, and privacy-first sync/analytics via Supabase.

## What’s included (MVP scaffold)
- Distraction Blocker: Manifest V3 browser extension with dynamic rules to block sites during focus sessions
- Pomodoro in extension: focus/break/long break cycles, adjustable durations, auto-start next, live countdown
- Daily Tasks in extension: priorities, done toggles, delete, drag-and-drop reorder, quick Focus action
- Reports in extension: 7-day summary of focus time, sessions, and tasks done; CSV export
- Shortcuts: start/stop/toggle focus, start/stop Pomodoro (configurable in browser)
- Pause with reason: optional reason logging when stopping focus
- Flutter app scaffolded: Timer, Tasks, Reports, Settings with local persistence and Supabase auth/sync
- Cross-app sync: shared blocklists via Supabase; Flutter Reports pull last 7 days from focus sessions and tasks
- Backend: Supabase SQL schema with RLS for tasks, sessions, settings, and blocklists
- CI: Basic workflow to validate JSON and shell scripts
- Docs: Architecture and UX principles

## Cross-app sync
- Blocklists: manage in the Flutter app (Settings) or the extension (Options -> Cloud sync). Both read/write the same default blocklist in Supabase.
- Reports: the Flutter app aggregates the last 7 days from `focus_sessions` and done `tasks` to show cross-device productivity stats.

## Run the Flutter app
```
cd apps/focus_app
flutter pub get
flutter run -d chrome   # or any device
```

Configure Supabase in `apps/focus_app/assets/env.json`. In the extension Options page, you can set your Supabase URL/anon key and sign in to sync the blocklist.

## Shortcuts (defaults)
- Start focus: Ctrl+Shift+8
- Stop focus: Ctrl+Shift+9
- Toggle focus: Ctrl+Shift+0
- Start Pomodoro: Ctrl+Shift+7
- Stop Pomodoro: Ctrl+Shift+6

Change these in your browser’s extension shortcuts settings.

## Quickstart

### 1) Browser extension (blocker + Pomodoro + Tasks + Reports)
- Load in Chrome/Edge/Brave:
  1. Open `chrome://extensions`
  2. Toggle Developer Mode
  3. Load unpacked -> select `apps/browser_extension`
- Popup includes:
  - Quick Focus: start/stop one session with custom minutes
  - Pomodoro: adjustable focus/break/long break, sessions before long, auto-start toggle, live countdown
  - Daily Tasks: add with priority, mark done, drag to reorder, delete, quick Focus per task
  - Reports: 7-day summary of focus time, sessions, and tasks done; Export CSV
  - Options page to edit blocklist

### 2) Supabase backend
- Create a Supabase project (free tier works)
- In the SQL editor, paste and run `backend/supabase/schema.sql`
- This creates tables for tasks, focus sessions, user settings, and blocklists with Row Level Security (RLS) policies

### 3) Flutter app (to be created)
Install Flutter: `https://docs.flutter.dev/get-started/install`

Create the app in this monorepo:
```
flutter --version
flutter create --project-name focuskit --org com.focuskit apps/focus_app
cd apps/focus_app
flutter run -d chrome   # or -d macos / windows / linux / ios / android
```

We’ll wire the app to Supabase (auth + sync), implement the Pomodoro, tasks, reports, and a polished UI layer next.

## Roadmap
- Week 1–2: Flutter core (timer, tasks, clean UI shell), local-first storage, basic reports
- Week 3–4: Supabase sync, extension integration, break reminders, analytics
- Week 5–6: Desktop helper (Pro), polish motion/animations, E2E tests, store packaging

## Support & licensing
- Licensed MIT (see `LICENSE`)
- Issues and feature requests welcome. SLA-based support plans available.