## Architecture overview

- Core app: Flutter (iOS, Android, Web, macOS, Windows, Linux)
- Distraction blocker: Manifest V3 extension using Declarative Net Request dynamic rules
- Backend: Supabase (Postgres + RLS), local-first client with offline cache

### Data model (high level)
- `profiles`: 1:1 with `auth.users`
- `user_settings`: Pomodoro, theme, notification prefs
- `tasks`: Daily to-dos with priority and status
- `focus_sessions`: Completed or in-progress focus sessions
- `blocklists` + `blocklist_items`: Named sets of domains/patterns

### Sync
- Client writes locally first, then syncs to Supabase with conflict resolution favoring latest updated_at

### Privacy & security
- RLS everywhere
- Optional client-side encryption for notes (future)

### Modules
- App UI (Flutter): timer, tasks, reports, settings
- Extension: focus toggle, blocklists, session timer via alarms
- Analytics: privacy-first event aggregation (future)