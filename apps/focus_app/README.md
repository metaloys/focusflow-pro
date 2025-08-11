# Focus app (Flutter)

This directory will contain the Flutter application (mobile + desktop + web).

## Setup
1) Install Flutter: `https://docs.flutter.dev/get-started/install`
2) Verify: `flutter --version`
3) Create the app in-place:
```
flutter create --project-name focuskit --org com.focuskit .
```
4) Run in web or desktop during development:
```
flutter run -d chrome
```

Once created, we will add:
- Pomodoro timer with flexible presets
- Tasks with priorities and drag-and-drop reorder
- Break reminders with gentle tips
- Progress reports (weekly/monthly)
- Supabase auth + sync
- Design system with dark/light themes