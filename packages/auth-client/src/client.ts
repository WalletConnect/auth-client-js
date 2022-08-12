import { Core, Store } from "@walletconnect/core";
import {
  generateChildLogger,
  getDefaultLoggerOptions,
  getLoggerContext,
} from "@walletconnect/logger";
import { EventEmitter } from "events";
import pino from "pino";

import { IAuthClient } from "./types";
import { JsonRpcHistory, AuthEngine } from "./controllers";
import { AUTH_CLIENT_PROTOCOL, AUTH_CLIENT_STORAGE_PREFIX, AUTH_CLIENT_VERSION } from "./constants";
import { Pairing } from "./controllers/pairing";
import { Expirer } from "./controllers/expirer";

export class AuthClient extends IAuthClient {
  public readonly protocol = AUTH_CLIENT_PROTOCOL;
  public readonly version = AUTH_CLIENT_VERSION;
  public readonly name = "authClient";

  public core: IAuthClient["core"];
  public logger: IAuthClient["logger"];
  public events: IAuthClient["events"] = new EventEmitter();
  public engine: IAuthClient["engine"];
  public pairing: IAuthClient["pairing"];
  public expirer: IAuthClient["expirer"];
  public history: IAuthClient["history"];
  public authKeys: IAuthClient["authKeys"];
  public pendingRequests: IAuthClient["pendingRequests"];
  public address: IAuthClient["address"];

  static async init(opts?: Record<string, any>) {
    const client = new AuthClient(opts);
    await client.initialize();

    return client;
  }

  constructor(opts?: Record<string, any>) {
    super(opts);

    const logger =
      typeof opts?.logger !== "undefined" && typeof opts?.logger !== "string"
        ? opts.logger
        : pino(
            getDefaultLoggerOptions({
              level: opts?.logger || "error",
            }),
          );

    this.core = opts?.core || new Core(opts);
    this.logger = generateChildLogger(logger, this.name);
    this.authKeys = new Store(this.core, this.logger, "authKeys", AUTH_CLIENT_STORAGE_PREFIX);
    this.pendingRequests = new Store(
      this.core,
      this.logger,
      "pendingRequests",
      AUTH_CLIENT_STORAGE_PREFIX,
    );
    this.pairing = new Pairing(this.core, this.logger);
    this.expirer = new Expirer(this.core, this.logger);
    this.engine = new AuthEngine(this);
    this.history = new JsonRpcHistory(this.core, this.logger);
    this.address = opts?.address;
  }

  get context() {
    return getLoggerContext(this.logger);
  }

  // ---------- Events ----------------------------------------------- //

  public emit: IAuthClient["emit"] = (name, listener) => {
    return this.events.emit(name, listener);
  };

  public on: IAuthClient["on"] = (name, listener) => {
    return this.events.on(name, listener);
  };

  public once: IAuthClient["once"] = (name, listener) => {
    return this.events.once(name, listener);
  };

  public off: IAuthClient["off"] = (name, listener) => {
    return this.events.off(name, listener);
  };

  public removeListener: IAuthClient["removeListener"] = (name, listener) => {
    return this.events.removeListener(name, listener);
  };

  // ---------- Engine ----------------------------------------------- //

  // for responder to pair a pairing created by a proposer
  public pair: IAuthClient["pair"] = async (params) => {
    try {
      return await this.engine.pair(params);
    } catch (error: any) {
      this.logger.error(error.message);
      throw error;
    }
  };

  // request wallet authentication
  public request: IAuthClient["request"] = async (params) => {
    try {
      return await this.engine.request(params);
    } catch (error: any) {
      this.logger.error(error.message);
      throw error;
    }
  };

  // respond wallet authentication
  public respond: IAuthClient["respond"] = async (params) => {
    try {
      return await this.engine.respond(params);
    } catch (error: any) {
      this.logger.error(error.message);
      throw error;
    }
  };

  public getPendingRequests: IAuthClient["getPendingRequests"] = async () => {
    try {
      return await this.engine.getPendingRequests();
    } catch (error: any) {
      this.logger.error(error.message);
      throw error;
    }
  };

  public getRequest: IAuthClient["getRequest"] = async (params) => {
    try {
      return await this.engine.getRequest(params);
    } catch (error: any) {
      this.logger.error(error.message);
      throw error;
    }
  };

  // ---------- Private ----------------------------------------------- //

  private async initialize() {
    this.logger.trace(`Initialized`);
    try {
      await this.core.start();
      await this.pairing.init();
      await this.authKeys.init();
      await this.pendingRequests.init();
      await this.expirer.init();
      await this.history.init();
      await this.engine.init();
      this.logger.info(`AuthClient Initialization Success`);
    } catch (error: any) {
      this.logger.info(`AuthClient Initialization Failure`);
      this.logger.error(error.message);
      throw error;
    }
  }
}
