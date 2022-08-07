import { JsonRpcTypes, RpcOpts } from "../types";

export const ENGINE_RPC_OPTS: Record<JsonRpcTypes.WcMethod, RpcOpts> = {
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
