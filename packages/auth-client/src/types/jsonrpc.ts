import { AuthClientTypes } from "./client";
import { AuthEngineTypes } from "./engine";

export declare namespace JsonRpcTypes {
  export type WcMethod = "wc_authRequest";

  // ---- JSON-RPC Requests -----------------------------
  export interface RequestParams {
    wc_authRequest: {
      payloadParams: AuthEngineTypes.PayloadParams;
      requester: {
        publicKey: string;
        metadata?: AuthClientTypes.Metadata;
      };
    };
  }

  // ---- JSON-RPC Responses -----------------------------
  export interface Results {
    wc_authRequest: AuthEngineTypes.Cacao;
  }
}
