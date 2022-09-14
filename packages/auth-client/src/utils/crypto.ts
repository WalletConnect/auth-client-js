import { randomStringForEntropy } from "@stablelib/random";

// Reference implementation:
// https://github.com/spruceid/siwe/blob/38140330e54af91b1fab8ba1a8169e1fcbd8d271/packages/siwe/lib/utils.ts#L44
export function generateNonce(): string {
  return randomStringForEntropy(96);
}
