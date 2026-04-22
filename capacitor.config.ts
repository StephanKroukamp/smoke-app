import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.smokesignal.smokebreak",
  appName: "Smoke Break",
  // APK bundles the built web app (dist/) inside itself. No reliance on
  // Firebase Hosting — the native app is fully self-contained.
  webDir: "dist",
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
