import { RelayerTypes, CryptoTypes, PairingTypes } from "@walletconnect/types";

import {
  ErrorResponse as CommonErrorResponse,
  JsonRpcError,
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcResult,
} from "@walletconnect/jsonrpc-utils";
import { IAuthClient } from "./client";
import { JsonRpcTypes } from "./jsonrpc";

export interface RpcOpts {
  req: RelayerTypes.PublishOptions;
  res: RelayerTypes.PublishOptions;
}

export declare namespace AuthEngineTypes {
  interface EventCallback<T extends JsonRpcRequest | JsonRpcResponse> {
    topic: string;
    payload: T;
  }

  interface Pairing {
    relay: RelayerTypes.ProtocolOptions;
    expiry: number;
    active: boolean;
  }

  // https://github.com/ChainAgnostic/CAIPs/pull/74
  interface RequestParams {
    chainId: string;
    domain: string;
    nonce: string;
    aud: string;
    type?: string;
    nbf?: string;
    exp?: string;
    statement?: string;
    requestId?: string;
    resources?: string[];
  }

  interface PayloadParams {
    type: CacaoHeader["t"];
    chainId: string;
    domain: string;
    aud: string;
    version: string;
    nonce: string;
    iat: string;
    nbf?: string;
    exp?: string;
    statement?: string;
    requestId?: string;
    resources?: string[];
  }

  interface CacaoPayload {
    iss: string;
    domain: string;
    aud: string;
    version: string;
    nonce: string;
    iat: string;
    nbf?: string;
    exp?: string;
    statement?: string;
    requestId?: string;
    resources?: string[];
  }

  interface CacaoHeader {
    t: "eip4361";
  }

  interface CacaoSignature {
    t: "eip191";
    s: string;
    m?: string;
  }

  interface Cacao {
    h: CacaoHeader;
    p: CacaoPayload;
    s: CacaoSignature;
  }

  interface PendingRequest {
    id: number;
    requester: {
      publicKey: string;
    };
    cacaoPayload: CacaoPayload;
    message: string;
  }

  interface ResultResponse {
    id: number;
    signature: CacaoSignature;
  }

  interface ErrorResponse {
    id: number;
    error: CommonErrorResponse;
  }

  type RespondParams = ResultResponse | ErrorResponse;
}

// TODO: define missing param and data types
export abstract class IAuthEngine {
  constructor(public client: IAuthClient) {}

  public abstract init(): Promise<void>;

  public abstract pair(params: { uri: string }): Promise<AuthEngineTypes.Pairing>;

  public abstract request(
    params: AuthEngineTypes.RequestParams,
  ): Promise<{ uri: string; id: number }>;

  public abstract respond(params: AuthEngineTypes.RespondParams): Promise<void>;

  public abstract getPendingRequests(): Record<number, AuthEngineTypes.PendingRequest>;

  public abstract getPairings(): PairingTypes.Struct[];

  public abstract ping(params: { topic: string }): Promise<void>;

  public abstract disconnect(params: { topic: string }): Promise<void>;

  // ---------- Protected Helpers --------------------------------------- //

  protected abstract sendRequest<M extends JsonRpcTypes.WcMethod>(
    topic: string,
    method: M,
    params: JsonRpcTypes.RequestParams[M],
    encodeOpts?: CryptoTypes.EncodeOptions,
  ): Promise<number>;

  protected abstract sendResult<M extends JsonRpcTypes.WcMethod>(
    id: number,
    topic: string,
    result: JsonRpcTypes.Results[M],
    encodeOpts?: CryptoTypes.EncodeOptions,
  ): Promise<number>;

  protected abstract sendError(
    id: number,
    topic: string,
    error: AuthEngineTypes.ErrorResponse,
    opts?: CryptoTypes.EncodeOptions,
  ): Promise<number>;

  protected abstract setExpiry(topic: string, expiry: number): Promise<void>;

  protected abstract cleanup(): Promise<void>;

  // ---------- Protected Relay Event Methods ----------------------------------- //

  protected abstract onRelayEventRequest(
    event: AuthEngineTypes.EventCallback<JsonRpcRequest>,
  ): void;

  protected abstract onRelayEventResponse(
    event: AuthEngineTypes.EventCallback<JsonRpcResponse>,
  ): Promise<void>;

  // ---------- Protected Relay Event Handlers --------------------------------- //

  protected abstract onAuthRequest(
    topic: string,
    payload: JsonRpcRequest<JsonRpcTypes.RequestParams["wc_authRequest"]>,
  ): Promise<void>;

  protected abstract onAuthResponse(
    topic: string,
    payload: JsonRpcResult<JsonRpcTypes.Results["wc_authRequest"]> | JsonRpcError,
  ): void;

  protected abstract onPairingPingRequest(
    topic: string,
    payload: JsonRpcRequest<JsonRpcTypes.RequestParams["wc_pairingPing"]>,
  ): Promise<void>;

  protected abstract onPairingPingResponse(
    topic: string,
    payload: JsonRpcResult<JsonRpcTypes.Results["wc_pairingPing"]> | JsonRpcError,
  ): void;

  protected abstract onPairingDeleteRequest(
    topic: string,
    payload: JsonRpcRequest<JsonRpcTypes.RequestParams["wc_pairingDelete"]>,
  ): Promise<void>;
}
