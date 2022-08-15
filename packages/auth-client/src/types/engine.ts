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
    type: string; // same as Cacao Header type (t)
    iss: string;
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
    requester: {
      publicKey: string;
    };
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
    t: string;
  }

  interface CacaoSignature {
    t: string;
    s: string;
    m?: any;
  }

  interface Cacao {
    header: any;
    payload: CacaoPayload;
    signature: CacaoSignature;
  }

  interface PendingRequest {
    id: number;
    payloadParams: PayloadParams;
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

  public abstract getPendingRequests(): Promise<Record<number, AuthEngineTypes.PendingRequest>>;

  public abstract getRequest(params: { id: number }): Promise</*Cacao*/ any>;

  // ---------- Protected Helpers --------------------------------------- //

  protected abstract sendRequest<M extends JsonRpcTypes.WcMethod>(
    topic: string,
    method: M,
    // params: JsonRpcTypes.RequestParams[M]
    params: any,
    encodeOpts?: CryptoTypes.EncodeOptions,
  ): Promise<number>;

  // @ts-expect-error - needs Results interface
  protected abstract sendResult<M extends JsonRpcTypes.WcMethod>(
    id: number,
    topic: string,
    // result: JsonRpcTypes.Results[M]
    result: any,
    encodeOpts?: CryptoTypes.EncodeOptions,
  ): Promise<void>;

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
    payload: JsonRpcRequest<AuthEngineTypes.PayloadParams>,
  ): Promise<void>;

  protected abstract onAuthResponse(
    topic: string,
    payload: JsonRpcResult<AuthEngineTypes.Cacao> | JsonRpcError,
  ): void;
}
