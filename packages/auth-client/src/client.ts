import { Core, Store } from "@walletconnect/core";
import {
  generateChildLogger,
  getDefaultLoggerOptions,
  getLoggerContext,
} from "@walletconnect/logger";
import { EventEmitter } from "events";
import pino from "pino";

import { AuthClientTypes, IAuthClient } from "./types";
import { JsonRpcHistory, AuthEngine } from "./controllers";
import {
  AUTH_CLIENT_PROTOCOL,
  AUTH_CLIENT_STORAGE_PREFIX,
  AUTH_CLIENT_VERSION,
  AUTH_CLIENT_DEFAULT_NAME,
} from "./constants";
import { Pairing } from "./controllers/pairing";
import { Expirer } from "./controllers/expirer";

export class AuthClient extends IAuthClient {
  public readonly protocol = AUTH_CLIENT_PROTOCOL;
  public readonly version = AUTH_CLIENT_VERSION;

  public name: IAuthClient["name"] = AUTH_CLIENT_DEFAULT_NAME;
  public core: IAuthClient["core"];
  public metadata: IAuthClient["metadata"];
  public logger: IAuthClient["logger"];
  public events: IAuthClient["events"] = new EventEmitter();
  public engine: IAuthClient["engine"];
  public pairing: IAuthClient["pairing"];
  public expirer: IAuthClient["expirer"];
  public history: IAuthClient["history"];
  public authKeys: IAuthClient["authKeys"];
  public pairingTopics: IAuthClient["pairingTopics"];
  public requests: IAuthClient["requests"];
  public address: IAuthClient["address"];

  static async init(opts: AuthClientTypes.Options) {
    const client = new AuthClient(opts);
    await client.initialize();

    return client;
  }

  constructor(opts: AuthClientTypes.Options) {
    super(opts);

    const logger =
      typeof opts.logger !== "undefined" && typeof opts.logger !== "string"
        ? opts.logger
        : pino(
            getDefaultLoggerOptions({
              level: opts.logger || "error",
            }),
          );

    this.name = opts?.name || AUTH_CLIENT_DEFAULT_NAME;
    this.metadata = opts.metadata;
    this.core = opts.core || new Core(opts);
    this.logger = generateChildLogger(logger, this.name);
    this.authKeys = new Store(this.core, this.logger, "authKeys", AUTH_CLIENT_STORAGE_PREFIX);
    this.pairingTopics = new Store(
      this.core,
      this.logger,
      "pairingTopics",
      AUTH_CLIENT_STORAGE_PREFIX,
    );
    this.requests = new Store(this.core, this.logger, "requests", AUTH_CLIENT_STORAGE_PREFIX);
    this.pairing = new Pairing(this.core, this.logger);
    this.expirer = new Expirer(this.core, this.logger);
    this.engine = new AuthEngine(this);
    this.history = new JsonRpcHistory(this.core, this.logger);
    this.address = opts.iss;
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

  public getPendingRequests: IAuthClient["getPendingRequests"] = () => {
    try {
      return this.engine.getPendingRequests();
    } catch (error: any) {
      this.logger.error(error.message);
      throw error;
    }
  };

  public getPairings: IAuthClient["getPairings"] = () => {
    try {
      return this.engine.getPairings();
    } catch (error: any) {
      this.logger.error(error.message);
      throw error;
    }
  };

  public ping: IAuthClient["ping"] = async (params) => {
    try {
      return await this.engine.ping(params);
    } catch (error: any) {
      this.logger.error(error.message);
      throw error;
    }
  };

  public disconnect: IAuthClient["disconnect"] = async (params) => {
    try {
      return await this.engine.disconnect(params);
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
      await this.requests.init();
      await this.pairingTopics.init();
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
