#!/usr/bin/env bash
set -euo pipefail

echo "Installing Flutter SDK..."
FLUTTER_VERSION="3.22.2"
ARCHIVE_URL="https://storage.googleapis.com/flutter_infra_release/releases/stable/linux/flutter_linux_${FLUTTER_VERSION}-stable.tar.xz"
mkdir -p "$NETLIFY_BUILD_BASE/flutter"
curl -L "$ARCHIVE_URL" | tar -xJ -C "$NETLIFY_BUILD_BASE/flutter"
export PATH="$NETLIFY_BUILD_BASE/flutter/flutter/bin:$PATH"

flutter --version
flutter config --enable-web

cd apps/focus_app
flutter pub get

# Optionally inject Supabase env into assets/env.json if provided via env vars
if [[ -n "${SUPABASE_URL:-}" && -n "${SUPABASE_ANON_KEY:-}" ]]; then
  echo "Injecting Supabase env into assets/env.json"
  cat > assets/env.json <<JSON
{
  "supabaseUrl": "${SUPABASE_URL}",
  "supabaseAnonKey": "${SUPABASE_ANON_KEY}"
}
JSON
fi

flutter build web --release --web-renderer canvaskit --pwa-strategy offline-first