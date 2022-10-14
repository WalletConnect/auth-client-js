import { EngineTypes } from "@walletconnect/types";
import { formatRelayParams } from "@walletconnect/utils";
import * as qs from "query-string";
const SDK = "auth";
// TODO(Celine): Move these into walletconnect-monorepo and make a function
// that takes the target (sign/auth) as a param

export function formatUri(params: EngineTypes.UriParameters): string {
  return (
    `${params.protocol}:${SDK}-${params.topic}@${params.version}?` +
    qs.stringify({
      symKey: params.symKey,
      ...formatRelayParams(params.relay),
    })
  );
}

export function prepareUri(uri: string): string {
  return uri.replace(`${SDK}-`, "");
}
