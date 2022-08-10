import EventEmitter from "events";
import { RELAYER_EVENTS, RELAYER_DEFAULT_PROTOCOL } from "@walletconnect/core";
import {
  formatJsonRpcRequest,
  formatJsonRpcResult,
  formatJsonRpcError,
  isJsonRpcRequest,
  isJsonRpcResponse,
  isJsonRpcResult,
  isJsonRpcError,
} from "@walletconnect/jsonrpc-utils";
import { FIVE_MINUTES } from "@walletconnect/time";
import {
  RelayerTypes,
  /*ExpirerTypes,*/
} from "@walletconnect/types";
import {
  calcExpiry,
  formatUri,
  generateRandomBytes32,
  parseUri,
  createDelayedPromise,
  getInternalError,
  hashKey,
  // getSdkError,
  // isExpired,
} from "@walletconnect/utils";

import { engineEvent } from "../utils/engineUtil";
import { JsonRpcTypes, IAuthEngine } from "../types";
import { /*EXPIRER_EVENTS,*/ ENGINE_RPC_OPTS } from "../constants";

export class AuthEngine extends IAuthEngine {
  private events = new EventEmitter();
  private initialized = false;
  public name = "authEngine";

  constructor(client: IAuthEngine["client"]) {
    super(client);
  }

  public init: IAuthEngine["init"] = async () => {
    if (!this.initialized) {
      await this.cleanup();
      this.registerRelayerEvents();
      // this.registerExpirerEvents();
      this.initialized = true;
    }
  };

  // ---------- Public ------------------------------------------------ //

  // TODO: taken as-is from Sign, needs review
  public pair: IAuthEngine["pair"] = async (params) => {
    this.isInitialized();
    // TODO: Check this out after happy path is complete
    // this.isValidPair(params);
    const { topic, symKey, relay } = parseUri(params.uri);
    const expiry = calcExpiry(FIVE_MINUTES);
    const pairing = { relay, expiry, active: true };
    await this.client.pairing.set(topic, {
      topic,
      ...pairing,
    });
    await this.client.core.crypto.setSymKey(symKey, topic);
    await this.client.core.relayer.subscribe(topic, { relay });

    await this.setExpiry(topic, expiry);

    return pairing;
  };

  // TODO: taken as-is from Sign, needs review
  public request: IAuthEngine["request"] = async <T>(params) => {
    this.isInitialized();
    // await this.isValidRequest(params);

    // SPEC: A creates random symKey S for pairing topic
    const symKey = generateRandomBytes32();

    // SPEC: Pairing topic is the hash of symkey S
    const pairingTopic = await this.client.core.crypto.setSymKey(symKey);

    const expiry = calcExpiry(FIVE_MINUTES);
    const relay = { protocol: RELAYER_DEFAULT_PROTOCOL };

    // Preparing pairing URI
    const pairing = { topic: pairingTopic, expiry, relay, active: false };
    const uri = formatUri({
      protocol: this.client.protocol,
      version: this.client.version,
      topic: pairingTopic,
      symKey,
      relay,
    });
    await this.client.pairing.set(pairingTopic, pairing);

    // SPEC: A generates keyPair X and generates response topic
    const pubKey = await this.client.core.crypto.generateKeyPair();
    const responseTopic = hashKey(pubKey);

    // Subscribe to response topic
    await this.client.core.relayer.subscribe(responseTopic);

    // SPEC: A will construct an authentication request.
    // TODO: Fill out the rest of the properties here
    const { chainId, request } = params;

    // SPEC: A encrypts reuqest with symKey S
    // SPEC: A publishes encrypted request to topic
    const id = await this.sendRequest(pairingTopic, "wc_authRequest", { request, chainId });
    return { uri, id };
  };

  public respond: IAuthEngine["respond"] = async (params) => {
    this.isInitialized();
    // await this.isValidRespond(params);
    const { topic, response } = params;
    const { id } = response;
    if (isJsonRpcResult(response)) {
      await this.sendResult(id, topic, response.result);
    } else if (isJsonRpcError(response)) {
      await this.sendError(id, topic, response.error);
    }
  };

  public getPendingRequests: IAuthEngine["getPendingRequests"] = async () =>
    await Promise.resolve({});

  public getRequest: IAuthEngine["getRequest"] = async () => await Promise.resolve({});

  // ---------- Private Helpers --------------------------------------- //

  private deletePairing = async (topic: string) => {
    await Promise.all([
      this.client.core.relayer.unsubscribe(topic),
      // this.client.pairing.delete(topic, getSdkError("USER_DISCONNECTED")),
      this.client.core.crypto.deleteSymKey(topic),
      // this.client.expirer.del(topic),
    ]);
  };

  protected setExpiry: IAuthEngine["setExpiry"] = async (topic, expiry) => {
    if (this.client.pairing.keys.includes(topic)) {
      await this.client.pairing.update(topic, { expiry });
    }
    this.client.expirer.set(topic, expiry);
  };

  protected sendRequest: IAuthEngine["sendRequest"] = async (topic, method, params, encodeOpts) => {
    const payload = formatJsonRpcRequest(method, params);
    const message = await this.client.core.crypto.encode(topic, payload, encodeOpts);
    const rpcOpts = ENGINE_RPC_OPTS[method].req;
    await this.client.core.relayer.publish(topic, message, rpcOpts);
    this.client.history.set(topic, payload);

    return payload.id;
  };

  protected sendResult: IAuthEngine["sendResult"] = async (id, topic, result, encodeOpts) => {
    const payload = formatJsonRpcResult(id, result);
    const message = await this.client.core.crypto.encode(topic, payload, encodeOpts);
    const record = await this.client.history.get(topic, id);
    const rpcOpts = ENGINE_RPC_OPTS[record.request.method].res;
    await this.client.core.relayer.publish(topic, message, rpcOpts);
    await this.client.history.resolve(payload);
  };

  protected sendError: IAuthEngine["sendError"] = async (id, topic, error, encodeOpts) => {
    const payload = formatJsonRpcError(id, error);
    const message = await this.client.core.crypto.encode(topic, payload, encodeOpts);
    const record = await this.client.history.get(topic, id);
    const rpcOpts = ENGINE_RPC_OPTS[record.request.method].res;
    await this.client.core.relayer.publish(topic, message, rpcOpts);
    await this.client.history.resolve(payload);
  };

  protected cleanup: IAuthEngine["cleanup"] = async () => {
    const pairingTopics: string[] = [];
    // this.client.pairing.getAll().forEach((pairing) => {
    //   if (isExpired(pairing.expiry)) pairingTopics.push(pairing.topic);
    // });
    await Promise.all([...pairingTopics.map(this.deletePairing)]);
  };

  private isInitialized() {
    if (!this.initialized) {
      const { message } = getInternalError("NOT_INITIALIZED", this.name);
      throw new Error(message);
    }
  }

  // ---------- Relay Events Router ----------------------------------- //

  private registerRelayerEvents() {
    this.client.core.relayer.on(
      RELAYER_EVENTS.message,
      async (event: RelayerTypes.MessageEvent) => {
        const { topic, message } = event;
        const payload = await this.client.core.crypto.decode(topic, message);
        if (isJsonRpcRequest(payload)) {
          this.client.history.set(topic, payload);
          this.onRelayEventRequest({ topic, payload });
        } else if (isJsonRpcResponse(payload)) {
          await this.client.history.resolve(payload);
          this.onRelayEventResponse({ topic, payload });
        }
      },
    );
  }

  protected onRelayEventRequest: IAuthEngine["onRelayEventRequest"] = (event) => {
    const { topic, payload } = event;
    const reqMethod = payload.method as JsonRpcTypes.WcMethod;

    switch (reqMethod) {
      case "wc_authRequest":
        return this.onAuthRequest(topic, payload);
      default:
        return this.client.logger.info(`Unsupported request method ${reqMethod}`);
    }
  };

  protected onRelayEventResponse: IAuthEngine["onRelayEventResponse"] = async (event) => {
    const { topic, payload } = event;
    const record = await this.client.history.get(topic, payload.id);
    const resMethod = record.request.method as JsonRpcTypes.WcMethod;

    switch (resMethod) {
      case "wc_authRequest":
        return this.onAuthResponse(topic, payload);

      default:
        return this.client.logger.info(`Unsupported response method ${resMethod}`);
    }
  };

  // ---------- Relay Event Handlers --------------------------------- //

  protected onAuthRequest: IAuthEngine["onAuthRequest"] = async (topic, payload) => {
    try {
      const { id, params } = payload;
      // console.log("onAuthRequest > payload:", payload);
      await this.sendResult<"wc_authRequest">(payload.id, topic, true);
      this.client.emit("auth_request", {
        id,
        topic,
        params,
      });
    } catch (err: any) {
      await this.sendError(payload.id, topic, err);
      this.client.logger.error(err);
    }
  };

  protected onAuthResponse: IAuthEngine["onAuthResponse"] = (topic, payload) => {
    const { id } = payload;
    if (isJsonRpcResult(payload)) {
      this.events.emit(engineEvent("auth_request", id), { result: payload.result });
      this.client.emit("auth_response", { id, topic, params: payload });
    } else if (isJsonRpcError(payload)) {
      this.events.emit(engineEvent("auth_request", id), { error: payload.error });
    }
  };

  // ---------- Expirer Events ---------------------------------------- //

  // private registerExpirerEvents() {
  //   this.client.expirer.on(EXPIRER_EVENTS.expired, async (event: ExpirerTypes.Expiration) => {
  //     const { topic, id } = parseExpirerTarget(event.target);
  //     if (topic) {
  //       if (this.client.session.keys.includes(topic)) {
  //         await this.deleteSession(topic);
  //         this.client.events.emit("session_expire", { topic });
  //       } else if (this.client.pairing.keys.includes(topic)) {
  //         await this.deletePairing(topic);
  //         this.client.events.emit("pairing_expire", { topic });
  //       }
  //     } else if (id) {
  //       await this.deleteProposal(id);
  //     }
  //   });
  // }

  // ---------- TODO: (post-alpha) Validation  ------------------------------------------- //
}
