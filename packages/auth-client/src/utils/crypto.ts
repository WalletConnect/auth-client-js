import { randomStringForEntropy } from "@stablelib/random";
import { hash } from "@stablelib/sha256";
import { fromString, toString } from "uint8arrays";

export const BASE10 = "base10";
export const BASE16 = "base16";
export const BASE64 = "base64pad";
export const UTF8 = "utf8";

// Reference implementation:
// https://github.com/spruceid/siwe/blob/38140330e54af91b1fab8ba1a8169e1fcbd8d271/packages/siwe/lib/utils.ts#L44
export function generateNonce(): string {
  return randomStringForEntropy(96);
}

export function hashMessage(message: string): string {
  const result = hash(fromString(message, UTF8));
  return toString(result, BASE16);
}
