import { IStore } from "@walletconnect/types";
import { getInternalError, isValidRequestExpiry, isValidUrl } from "@walletconnect/utils";
import { AUTH_REQUEST_EXPIRY_BOUNDARIES } from "../constants";
import { AuthEngineTypes } from "../types";
import { getPendingRequest } from "./store";

export function isValidRequest(params: AuthEngineTypes.RequestParams): boolean {
  const validAudience = isValidUrl(params.aud);
  // FIXME: disabling this temporarily since it's failing expected values like `chainId: "1"`
  // const validChainId = isValidChainId(params.chainId);
  const domainInAud = new RegExp(`${params.domain}`).test(params.aud);
  const hasNonce = !!params.nonce;
  const hasValidType = params.type ? params.type === "eip4361" : true;
  const expiry = params.expiry;
  if (expiry && !isValidRequestExpiry(expiry, AUTH_REQUEST_EXPIRY_BOUNDARIES)) {
    const { message } = getInternalError(
      "MISSING_OR_INVALID",
      `request() expiry: ${expiry}. Expiry must be a number (in seconds) between ${AUTH_REQUEST_EXPIRY_BOUNDARIES.min} and ${AUTH_REQUEST_EXPIRY_BOUNDARIES.max}`,
    );
    throw new Error(message);
  }

  return !!(validAudience /*&& validChainId*/ && domainInAud && hasNonce && hasValidType);
}

export function isValidRespond(
  params: AuthEngineTypes.RespondParams,
  pendingResponses: IStore<number, any>,
): boolean {
  const validId = getPendingRequest(pendingResponses, params.id);

  return !!validId;
}
