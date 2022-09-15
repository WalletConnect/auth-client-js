import { AuthClientTypes } from "./client";
import { AuthEngineTypes } from "./engine";

export declare namespace JsonRpcTypes {
  export type WcMethod = "wc_authRequest" | "wc_pairingDelete" | "wc_pairingPing";

  // ---- JSON-RPC Requests -----------------------------
  export interface RequestParams {
    wc_authRequest: {
      payloadParams: AuthEngineTypes.PayloadParams;
      requester: {
        publicKey: string;
        metadata: AuthClientTypes.Metadata;
      };
    };
    wc_pairingDelete: {
      code: number;
      message: string;
    };
    wc_pairingPing: Record<string, never>;
  }

  // ---- JSON-RPC Responses -----------------------------
  export interface Results {
    wc_authRequest: AuthEngineTypes.Cacao;
    wc_pairingDelete: true;
    wc_pairingPing: true;
  }
}
