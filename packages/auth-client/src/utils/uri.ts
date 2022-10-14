import { EngineTypes } from "@walletconnect/types";
import { formatRelayParams } from "@walletconnect/utils";
import * as qs from "query-string";
// TODO(Celine): Move these into walletconnect-monorepo and make a function
// that takes the target (sign/auth) as a param

export function formatUri(params: EngineTypes.UriParameters): string {
  return (
    `${params.protocol}:${params.topic}@${params.version}?` +
    qs.stringify({
      symKey: params.symKey,
      ...formatRelayParams(params.relay),
    })
  );
}
