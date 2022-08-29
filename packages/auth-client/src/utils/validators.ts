import { IStore } from "@walletconnect/types";
import { isValidChainId, isValidUrl } from "@walletconnect/utils";
import { AuthEngineTypes } from "../types";
import { getPendingRequest } from "./store";

export function isValidPairUri(uri: string): boolean {
  const url = new URL(uri);
  const validProtocol = url.protocol === "wc:";
  const hasTopic = !!url.pathname;
  const hasSymKey = !!url.searchParams.get("symKey");
  const hasRelayProtocol = !!url.searchParams.get("relay-protocol");

  return !!(validProtocol && hasTopic && hasSymKey && hasRelayProtocol);
}

export function isValidRequest(params: AuthEngineTypes.PayloadParams): boolean {
  const validAudience = isValidUrl(params.aud);
  const validChainId = isValidChainId(params.chainId);
  const domainInAud = new RegExp(`${params.domain}`).test(params.aud);
  const validExpiry = params.exp && new Date(params.iat).getTime() < new Date(params.exp).getTime();
  const hasNonce = !!params.nonce;
  const includedType = params.type === "eip4361";

  console.log({ validAudience, validChainId, domainInAud, validExpiry, hasNonce, includedType });

  return !!(
    validAudience &&
    validChainId &&
    domainInAud &&
    validExpiry &&
    hasNonce &&
    includedType
  );
}

export function isValidRespond(
  params: AuthEngineTypes.RespondParams,
  pendingResponses: IStore<number, any>,
): boolean {
  const validId = getPendingRequest(pendingResponses, params.id);

  return !!validId;
}
