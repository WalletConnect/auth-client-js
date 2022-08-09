import { ICore, IJsonRpcHistory } from "@walletconnect/types";
import EventEmitter from "events";
import { Logger } from "pino";
import { Expirer } from "../controllers/expirer";
import { Pairing } from "../controllers/pairing";

import { IAuthEngine } from "../types";

export declare namespace AuthClientTypes {
  // ---------- Data Types ----------------------------------------------- //

  // TODO:

  // ---------- Event Types ----------------------------------------------- //

  type Event = "auth_request" | "auth_response";

  interface BaseEventArgs<T = unknown> {
    id: number;
    topic: string;
    params: T;
  }

  interface EventArguments {
    auth_request: BaseEventArgs<any>;
    auth_response: BaseEventArgs<any>;
  }
}

export abstract class IAuthClient {
  public abstract readonly protocol: string;
  public abstract readonly version: number;
  public abstract readonly name: string;

  public abstract core: ICore;
  public abstract pairing: Pairing;
  public abstract expirer: Expirer;
  public abstract events: EventEmitter;
  public abstract logger: Logger;
  public abstract engine: IAuthEngine;
  public abstract history: IJsonRpcHistory;

  constructor(public opts?: Record<string, any>) {}

  // ---------- Public Methods ----------------------------------------------- //

  public abstract pair: IAuthEngine["pair"];
  public abstract request: IAuthEngine["request"];
  public abstract respond: IAuthEngine["respond"];
  public abstract getPendingRequests: IAuthEngine["getPendingRequests"];
  public abstract getRequest: IAuthEngine["getRequest"];

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
