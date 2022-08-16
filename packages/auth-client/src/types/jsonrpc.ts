import { AuthEngineTypes } from "./engine";

export declare namespace JsonRpcTypes {
  export type WcMethod = "wc_authRequest";

  // ---- JSON-RPC Requests -----------------------------
  export interface RequestParams {
    wc_authRequest: {
      payloadParams: AuthEngineTypes.PayloadParams;
      requester: {
        publicKey: string;
        // TODO: define metadata type and enable param.
        // metadata: Metadata;
      };
    };
  }

  // ---- JSON-RPC Responses -----------------------------
  export interface Results {
    wc_authRequest: AuthEngineTypes.Cacao;
  }
}
