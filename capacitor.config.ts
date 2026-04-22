import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.smokesignal.smokebreak",
  appName: "Smoke Break",
  webDir: "dist",
  // Load the hosted web app directly so Capacitor is just a thin native shell.
  // This way the web app updates take effect immediately without rebuilding
  // the APK, and the native layer only exists to provide native push.
  server: {
    url: "https://smokesignal-c2668.web.app",
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
