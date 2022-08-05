import { Core } from "@walletconnect/core";
import {
  generateChildLogger,
  getDefaultLoggerOptions,
  getLoggerContext,
} from "@walletconnect/logger";
import { ISignClient, ISignClientEvents } from "@walletconnect/types";
import { EventEmitter } from "events";
import pino from "pino";
// import { SIGN_CLIENT_DEFAULT, SIGN_CLIENT_PROTOCOL, SIGN_CLIENT_VERSION } from "./constants";
// import { Engine, Expirer, JsonRpcHistory, Pairing, Proposal, Session } from "./controllers";

export class AuthClient {
  public readonly name = "authClient";

  public core: ISignClient["core"];
  public logger: ISignClient["logger"];
  public events: ISignClient["events"] = new EventEmitter();
  // public engine: ISignClient["engine"];
  // public pairing: ISignClient["pairing"];
  // public session: ISignClient["session"];
  // public proposal: ISignClient["proposal"];
  // public history: ISignClient["history"];
  // public expirer: ISignClient["expirer"];

  static async init(opts?: Record<string, any>) {
    const client = new AuthClient(opts);
    await client.initialize();

    return client;
  }

  constructor(opts?: Record<string, any>) {
    // FIXME: re-instate super after base abstract class is defined.
    // super(opts);

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
    // TODO:
    // this.pairing = new Pairing(this.core, this.logger);
    // this.proposal = new Proposal(this.core, this.logger);
    // this.history = new JsonRpcHistory(this.core, this.logger);
    // this.expirer = new Expirer(this.core, this.logger);
    // this.engine = new Engine(this);
  }

  get context() {
    return getLoggerContext(this.logger);
  }

  // ---------- Events ----------------------------------------------- //

  // TODO: update event handler typings to not be from ISignClient

  public on: ISignClientEvents["on"] = (name, listener) => {
    return this.events.on(name, listener);
  };

  public once: ISignClientEvents["once"] = (name, listener) => {
    return this.events.once(name, listener);
  };

  public off: ISignClientEvents["off"] = (name, listener) => {
    return this.events.off(name, listener);
  };

  public removeListener: ISignClientEvents["removeListener"] = (name, listener) => {
    return this.events.removeListener(name, listener);
  };

  // ---------- Engine ----------------------------------------------- //

  // for responder to pair a pairing created by a proposer
  // public pair(params: { uri: string }): Promise<Sequence>;

  // // request wallet authentication
  // public request(params: RequestParams): Promise<{ uri; id }>;

  // // respond wallet authentication
  // public respond(params: RespondParams): Promise<boolean>;

  // // query all pending requests
  // public getPendingRequests(): Promise<Record<number, PendingRequest>>;

  // // query cached request matching id
  // public getRequest(params: { id: number }): Promise<Cacao>;

  // ---------- Private ----------------------------------------------- //

  private async initialize() {
    this.logger.trace(`Initialized`);
    try {
      await this.core.start();
      // TODO:
      // await this.pairing.init();
      // await this.proposal.init();
      // await this.history.init();
      // await this.expirer.init();
      // await this.engine.init();
      this.logger.info(`AuthClient Initialization Success`);
    } catch (error: any) {
      this.logger.info(`AuthClient Initialization Failure`);
      this.logger.error(error.message);
      throw error;
    }
  }
}
