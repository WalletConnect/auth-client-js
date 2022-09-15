import { JsonRpcTypes, RpcOpts } from "../types";

export const ENGINE_RPC_OPTS: Record<JsonRpcTypes.WcMethod, RpcOpts> = {
  wc_pairingDelete: {
    req: {
      // ttl: ONE_DAY,
      prompt: false,
      tag: 1000,
    },
    res: {
      // ttl: ONE_DAY,
      prompt: false,
      tag: 1001,
    },
  },
  wc_pairingPing: {
    req: {
      // ttl: 30,
      prompt: false,
      tag: 1002,
    },
    res: {
      // ttl: 30,
      prompt: false,
      tag: 1003,
    },
  },
  wc_authRequest: {
    req: {
      // ttl: ONE_DAY,
      prompt: true,
      tag: 3000,
    },
    res: {
      // ttl: ONE_DAY,
      prompt: false,
      tag: 3001,
    },
  },
};
