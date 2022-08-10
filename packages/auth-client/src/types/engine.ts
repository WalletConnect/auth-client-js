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
}

// TODO: define missing param and data types
export abstract class IAuthEngine {
  constructor(public client: IAuthClient) {}

  public abstract init(): Promise<void>;

  public abstract pair(params: { uri: string }): Promise</*Sequence*/ any>;

  public abstract request(
    params: AuthEngineTypes.RequestParams,
  ): Promise<{ uri: string; id: number }>;

  public abstract respond(params: /*RespondParams*/ any): Promise<void>;

  public abstract getPendingRequests(): Promise<Record<number, /*PendingRequest*/ any>>;

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

  protected abstract onAuthRequest(topic: string, payload: JsonRpcRequest<any>): Promise<void>;

  protected abstract onAuthResponse(
    topic: string,
    payload: JsonRpcResult<boolean> | JsonRpcError,
  ): void;
}
