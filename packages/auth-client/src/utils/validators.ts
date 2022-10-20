import { IStore } from "@walletconnect/types";
import { isValidUrl } from "@walletconnect/utils";
import { AuthEngineTypes } from "../types";
import { getPendingRequest } from "./store";

export function isValidRequest(params: AuthEngineTypes.RequestParams): boolean {
  const validAudience = isValidUrl(params.aud);
  // FIXME: disabling this temporarily since it's failing expected values like `chainId: "1"`
  // const validChainId = isValidChainId(params.chainId);
  const domainInAud = new RegExp(`${params.domain}`).test(params.aud);
  const hasNonce = !!params.nonce;
  const hasValidType = params.type ? params.type === "eip4361" : true;

  return !!(validAudience /*&& validChainId*/ && domainInAud && hasNonce && hasValidType);
}

export function isValidRespond(
  params: AuthEngineTypes.RespondParams,
  pendingResponses: IStore<number, any>,
): boolean {
  const validId = getPendingRequest(pendingResponses, params.id);

  return !!validId;
}
