import { ICore, IJsonRpcHistory, IStore, CoreTypes } from "@walletconnect/types";
import EventEmitter from "events";
import { Logger } from "pino";
import { Expirer } from "../controllers/expirer";
import { Pairing } from "../controllers/pairing";
import { AuthEngineTypes } from "./engine";

import { IAuthEngine } from "../types";

export declare namespace AuthClientTypes {
  // ---------- Data Types ----------------------------------------------- //

  // TODO:

  // ---------- Event Types ----------------------------------------------- //

  type Event = "auth_request" | "auth_response" | "pairing_ping" | "pairing_delete";

  interface BaseEventArgs<T = unknown> {
    id: number;
    topic: string;
    params: T;
  }

  interface EventArguments {
    auth_request: BaseEventArgs<any>;
    auth_response: BaseEventArgs<any>;
    pairing_ping: BaseEventArgs<any>;
    pairing_delete: BaseEventArgs<any>;
  }

  interface Options extends CoreTypes.Options {
    metadata: Metadata;
    core?: ICore;
    iss?: string;
  }

  interface Metadata {
    name: string;
    description: string;
    url: string;
    icons: string[];
    redirect?: {
      native?: string;
      universal?: string;
    };
  }
}

export abstract class IAuthClient {
  public abstract readonly protocol: string;
  public abstract readonly version: number;
  public abstract readonly name: string;

  public abstract core: ICore;
  public abstract metadata: AuthClientTypes.Metadata;
  public abstract authKeys: IStore<string, { publicKey: string }>;
  public abstract pairingTopics: IStore<string, any>;
  public abstract requests: IStore<
    number,
    { id: number } & (AuthEngineTypes.Cacao | AuthEngineTypes.PendingRequest)
  >;

  public abstract pairing: Pairing;
  public abstract expirer: Expirer;
  public abstract events: EventEmitter;
  public abstract logger: Logger;
  public abstract engine: IAuthEngine;
  public abstract history: IJsonRpcHistory;
  public abstract address: string | undefined;

  constructor(public opts: AuthClientTypes.Options) {}

  // ---------- Public Methods ----------------------------------------------- //

  public abstract pair: IAuthEngine["pair"];
  public abstract request: IAuthEngine["request"];
  public abstract respond: IAuthEngine["respond"];
  public abstract getPendingRequests: IAuthEngine["getPendingRequests"];
  public abstract getPairings: IAuthEngine["getPairings"];
  public abstract ping: IAuthEngine["ping"];
  public abstract disconnect: IAuthEngine["disconnect"];

  // ---------- Event Handlers ----------------------------------------------- //

  public abstract emit: <E extends AuthClientTypes.Event>(
    event: E,
    args: AuthClientTypes.EventArguments[E],
  ) => boolean;

  public abstract on: <E extends AuthClientTypes.Event>(
    event: E,
    listener: (args: AuthClientTypes.EventArguments[E]) => any,
  ) => EventEmitter;

  public abstract once: <E extends AuthClientTypes.Event>(
    event: E,
    listener: (args: AuthClientTypes.EventArguments[E]) => any,
  ) => EventEmitter;

  public abstract off: <E extends AuthClientTypes.Event>(
    event: E,
    listener: (args: AuthClientTypes.EventArguments[E]) => any,
  ) => EventEmitter;

  public abstract removeListener: <E extends AuthClientTypes.Event>(
    event: E,
    listener: (args: AuthClientTypes.EventArguments[E]) => any,
  ) => EventEmitter;
}
