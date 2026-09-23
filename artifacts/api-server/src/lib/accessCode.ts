import * as crypto from "crypto";

// Deliberately excludes visually ambiguous characters (0/O, 1/I/L) -- a
// client has to type this by hand from an email or chat message. Shared
// between client-access.ts's "Share with Client" link minting and the
// workflow executor's "Client Feedback" node, which mints the same kind of
// link programmatically -- both need the exact same code space/entropy.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateAccessCode(length = 8): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  }
  return code;
}
