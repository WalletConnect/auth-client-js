import { Core, Store } from "@walletconnect/core";
import {
  generateChildLogger,
  getDefaultLoggerOptions,
  getLoggerContext,
} from "@walletconnect/logger";
import { EventEmitter } from "events";
import pino from "pino";

import { AuthClientTypes, IAuthClient } from "./types";
import { AuthEngine } from "./controllers";
import {
  AUTH_CLIENT_PROTOCOL,
  AUTH_CLIENT_STORAGE_PREFIX,
  AUTH_CLIENT_VERSION,
  AUTH_CLIENT_DEFAULT_NAME,
} from "./constants";

export class AuthClient extends IAuthClient {
  public readonly protocol = AUTH_CLIENT_PROTOCOL;
  public readonly version = AUTH_CLIENT_VERSION;

  public name: IAuthClient["name"] = AUTH_CLIENT_DEFAULT_NAME;
  public core: IAuthClient["core"];
  public metadata: IAuthClient["metadata"];
  public address: IAuthClient["address"];
  public projectId: IAuthClient["projectId"];
  public logger: IAuthClient["logger"];
  public events: IAuthClient["events"] = new EventEmitter();
  public engine: IAuthClient["engine"];
  public authKeys: IAuthClient["authKeys"];
  public pairingTopics: IAuthClient["pairingTopics"];
  public requests: IAuthClient["requests"];

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
    this.projectId = opts.projectId;
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
    this.engine = new AuthEngine(this);
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

  // request wallet authentication
  public request: IAuthClient["request"] = async (params, opts) => {
    try {
      return await this.engine.request(params, opts);
    } catch (error: any) {
      this.logger.error(error.message);
      throw error;
    }
  };

  // respond wallet authentication
  public respond: IAuthClient["respond"] = async (params, iss) => {
    try {
      return await this.engine.respond(params, iss);
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

  public formatMessage: IAuthClient["formatMessage"] = (payload, iss) => {
    try {
      return this.engine.formatMessage(payload, iss);
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
      await this.authKeys.init();
      await this.requests.init();
      await this.pairingTopics.init();
      await this.engine.init();
      this.logger.info(`AuthClient Initialization Success`);
    } catch (error: any) {
      this.logger.info(`AuthClient Initialization Failure`);
      this.logger.error(error.message);
      throw error;
    }
  }
}
