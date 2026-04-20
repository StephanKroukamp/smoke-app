/**
 * Central allowlist for admin actions (currently: creating new groups).
 * Keep in sync with firestore.rules — the rules are the real enforcement;
 * this file only hides UI for users who aren't allowed.
 */
export const GROUP_CREATOR_EMAILS = ["stephan.kroukamp@gmail.com"];

export function canCreateGroups(email: string | null | undefined): boolean {
  if (!email) return false;
  return GROUP_CREATOR_EMAILS.includes(email.toLowerCase());
}
