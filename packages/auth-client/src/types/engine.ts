import { RelayerTypes, CryptoTypes } from "@walletconnect/types";

import {
  ErrorResponse,
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
    m?: any;
  }

  interface Cacao {
    header: CacaoHeader;
    payload: CacaoPayload;
    signature: CacaoSignature;
  }

  interface PendingRequest {
    id: number;
    requester: {
      publicKey: string;
    };
    cacaoPayload: CacaoPayload;
    message: string;
  }

  interface RespondParams {
    id: number;
    signature: CacaoSignature;
  }
}

// TODO: define missing param and data types
export abstract class IAuthEngine {
  constructor(public client: IAuthClient) {}

  public abstract init(): Promise<void>;

  public abstract pair(params: { uri: string }): Promise</*Sequence*/ any>;

  public abstract request(
    params: AuthEngineTypes.RequestParams,
  ): Promise<{ uri: string; id: number }>;

  public abstract respond(params: AuthEngineTypes.RespondParams): Promise<void>;

  public abstract getPendingRequests(): Record<number, AuthEngineTypes.PendingRequest>;

  public abstract getRequest(params: { id: number }): AuthEngineTypes.Cacao;

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
    error: ErrorResponse,
    opts?: CryptoTypes.EncodeOptions,
  ): Promise<void>;

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
}
