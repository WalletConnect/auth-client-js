import { ONE_DAY, FIVE_MINUTES, SEVEN_DAYS } from "@walletconnect/time";
import { JsonRpcTypes, RpcOpts } from "../types";

export const ENGINE_RPC_OPTS: Record<JsonRpcTypes.WcMethod, RpcOpts> = {
  wc_authRequest: {
    req: {
      ttl: ONE_DAY,
      prompt: true,
      tag: 3000,
    },
    res: {
      ttl: ONE_DAY,
      prompt: false,
      tag: 3001,
    },
  },
};

export const AUTH_REQUEST_EXPIRY_BOUNDARIES = {
  min: FIVE_MINUTES,
  max: SEVEN_DAYS,
};
