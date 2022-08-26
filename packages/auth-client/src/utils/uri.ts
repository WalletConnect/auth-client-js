import { EngineTypes } from "@walletconnect/types";
import { formatRelayParams, parseRelayParams } from "@walletconnect/utils";
import * as qs from "query-string";

export function formatUri(params: EngineTypes.UriParameters): string {
  return (
    `${params.protocol}:auth-${params.topic}@${params.version}?` +
    qs.stringify({
      symKey: params.symKey,
      ...formatRelayParams(params.relay),
    })
  );
}

export function parseUri(str: string): EngineTypes.UriParameters {
  const pathStart: number = str.indexOf(":");
  const pathEnd: number | undefined = str.indexOf("?") !== -1 ? str.indexOf("?") : undefined;
  const protocol: string = str.substring(0, pathStart);
  const path: string = str.substring(pathStart + 1, pathEnd);
  const requiredValues = path.split("@");
  const queryString: string = typeof pathEnd !== "undefined" ? str.substring(pathEnd) : "";
  const queryParams = qs.parse(queryString);
  const result = {
    protocol,
    topic: requiredValues[0].split("-")[1],
    version: parseInt(requiredValues[1], 10),
    symKey: queryParams.symKey as string,
    relay: parseRelayParams(queryParams),
  };

  return result;
}
