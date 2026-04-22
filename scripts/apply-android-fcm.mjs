/**
 * Patches the freshly-generated Capacitor Android project to pull in Firebase
 * Cloud Messaging:
 *   - root build.gradle  → add google-services classpath
 *   - app  build.gradle  → add firebase-bom + firebase-messaging deps,
 *                          apply the google-services plugin at the bottom
 *
 * Used by .github/workflows/build-android.yml. The `sed` one-liners it
 * replaces were too brittle when Capacitor's generated gradle changed shape
 * between versions.
 */
import { readFileSync, writeFileSync } from "node:fs";

const rootGradle = "android/build.gradle";
const appGradle = "android/app/build.gradle";
const GOOGLE_SERVICES_CLASSPATH =
  "classpath 'com.google.gms:google-services:4.4.2'";
const APPLY_PLUGIN_LINE = "apply plugin: 'com.google.gms.google-services'";
const FIREBASE_DEPS = [
  "implementation platform('com.google.firebase:firebase-bom:33.7.0')",
  "implementation 'com.google.firebase:firebase-messaging'",
];

function patchRootGradle() {
  let text = readFileSync(rootGradle, "utf8");
  if (text.includes(GOOGLE_SERVICES_CLASSPATH)) return;
  // Insert classpath into the first `dependencies { ... }` block of the
  // buildscript section. That block only exists in the root gradle.
  text = text.replace(
    /(buildscript[\s\S]*?dependencies\s*\{)/,
    `$1\n        ${GOOGLE_SERVICES_CLASSPATH}`
  );
  writeFileSync(rootGradle, text);
}

function patchAppGradle() {
  let text = readFileSync(appGradle, "utf8");
  if (!text.includes(FIREBASE_DEPS[0])) {
    // Add firebase deps to the first `dependencies { ... }` block. The app
    // gradle's dependencies block is at the top level, so targeting the
    // first one works.
    text = text.replace(
      /(^dependencies\s*\{)/m,
      `$1\n    ${FIREBASE_DEPS.join("\n    ")}`
    );
  }
  if (!text.includes(APPLY_PLUGIN_LINE)) {
    text = text.trimEnd() + "\n\n" + APPLY_PLUGIN_LINE + "\n";
  }
  writeFileSync(appGradle, text);
}

function bumpMinSdk() {
  // Firebase Auth 23.x requires minSdk 23; Capacitor defaults to 22.
  const path = "android/variables.gradle";
  let text = readFileSync(path, "utf8");
  text = text.replace(/minSdkVersion\s*=\s*\d+/, "minSdkVersion = 23");
  writeFileSync(path, text);
}

patchRootGradle();
patchAppGradle();
bumpMinSdk();
console.log("Patched Android gradle for FCM.");
