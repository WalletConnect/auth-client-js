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
  getInternalError,
  hashKey,
  TYPE_1,
  // getSdkError,
  // isExpired,
} from "@walletconnect/utils";
import ethers from "ethers";
import { JsonRpcTypes, IAuthEngine, AuthEngineTypes } from "../types";
import { /*EXPIRER_EVENTS,*/ AUTH_CLIENT_PUBLIC_KEY_NAME, ENGINE_RPC_OPTS } from "../constants";
import { getDidAddress, getDidAddressSegments, getDidChainId } from "../utils/address";
import fs from "fs";

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
  public request: IAuthEngine["request"] = async <T>(params: AuthEngineTypes.PayloadParams) => {
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
    const publicKey = await this.client.core.crypto.generateKeyPair();
    const responseTopic = hashKey(publicKey);

    this.client.authKeys.set(AUTH_CLIENT_PUBLIC_KEY_NAME, publicKey);

    // Subscribe to response topic
    await this.client.core.relayer.subscribe(responseTopic);

    // SPEC: A will construct an authentication request.
    // TODO: Fill out the rest of the properties here
    const { chainId, aud, domain, nonce } = params;

    // SPEC: A encrypts reuqest with symKey S
    // SPEC: A publishes encrypted request to topic
    const id = await this.sendRequest(pairingTopic, "wc_authRequest", {
      chainId,
      aud,
      domain,
      version: "1",
      iss: this.client.address,
      nonce,
      requester: { publicKey },
    });
    return { uri, id };
  };

  public respond: IAuthEngine["respond"] = async (respondParams) => {
    this.isInitialized();
    // await this.isValidRespond(params);

    const payload = this.client.pendingRequests.get(respondParams.id);

    const receiverPublicKey = payload.requester.publicKey;
    const senderPublicKey = await this.client.core.crypto.generateKeyPair();
    const responseTopic = hashKey(receiverPublicKey);

    await this.sendResult<"wc_authRequest">(
      payload.id,
      responseTopic,
      {
        payload,
        signature: respondParams.signature,
      },
      {
        type: TYPE_1,
        receiverPublicKey,
        senderPublicKey,
      },
    );
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
        const receiverPublicKey = this.client.authKeys.keys.includes(AUTH_CLIENT_PUBLIC_KEY_NAME)
          ? this.client.authKeys.get(AUTH_CLIENT_PUBLIC_KEY_NAME)
          : "";
        const payload = await this.client.core.crypto.decode(topic, message, {
          receiverPublicKey,
        });
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

  // ---------- Helpers ---------------------------------------------- //
  protected constructEip4361Message = (cacao: AuthEngineTypes.CacaoPayload) => {
    const header = `${cacao.domain} wants you to sign in with your wallet:`;
    const walletAddress = getDidAddress(cacao.iss);
    const statement = cacao.statement;
    const uri = `URI: ${cacao.aud}`;
    const version = `Version: ${cacao.version}`;
    const chainId = `Chain ID: ${getDidChainId(cacao.iss)}`;
    const nonce = `Nonce: ${cacao.nonce}`;
    // const issuedAt = `Issued at: ${cacao.iat}`;
    const issuedAt = `Issued at: `;
    const resources = `\n`;

    const message = [
      header,
      walletAddress,
      "\n",
      statement,
      "\n",
      uri,
      version,
      chainId,
      nonce,
      issuedAt,
      resources,
    ].join("\n");

    fs.writeFileSync("/tmp/message-o", message);

    return message;
  };

  // ---------- Relay Event Handlers --------------------------------- //

  protected onAuthRequest: IAuthEngine["onAuthRequest"] = async (topic, payload) => {
    const { requester, iss, aud, domain, version, nonce } = payload.params;
    try {
      const fullCacao: AuthEngineTypes.CacaoPayload = {
        iss,
        aud,
        domain,
        version,
        nonce,
        iat: new Date().toISOString(),
        statement: "",
      };

      await this.client.pendingRequests.set(payload.id, {
        requester,
        id: payload.id,
        ...fullCacao,
      });

      this.client.emit("auth_request", {
        id: payload.id,
        topic,
        params: {
          message: this.constructEip4361Message(fullCacao),
        },
      });
    } catch (err: any) {
      await this.sendError(payload.id, topic, err);
      this.client.logger.error(err);
    }
  };

  protected onAuthResponse: IAuthEngine["onAuthResponse"] = (topic, response) => {
    const { id } = response;

    if (isJsonRpcResult(response)) {
      const { signature, payload } = response.result;
      const reconstructed = this.constructEip4361Message(payload);
      fs.writeFileSync("/tmp/message-r", reconstructed);
      const address = ethers.utils.verifyMessage(reconstructed, signature.s);
      const walletAddress = getDidAddress(payload.iss);
      if (address !== walletAddress) {
        console.log({ address, walletAddress });
        this.client.emit("auth_response", { id, topic, params: new Error("Invalid Signature") });
      } else {
        this.client.emit("auth_response", { id, topic, params: response });
      }
    } else if (isJsonRpcError(response)) {
      this.client.emit("auth_response", { id, topic, params: response });
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
