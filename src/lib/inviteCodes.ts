import { customAlphabet } from "nanoid";

const nanoid = customAlphabet("0123456789abcdefghijkmnpqrstuvwxyz", 10);

export function newInviteCode() {
  return nanoid();
}
