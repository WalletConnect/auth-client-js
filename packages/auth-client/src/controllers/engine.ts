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
import { FIVE_MINUTES, FOUR_WEEKS } from "@walletconnect/time";
import { ExpirerTypes, RelayerTypes } from "@walletconnect/types";
import {
  calcExpiry,
  generateRandomBytes32,
  getInternalError,
  hashKey,
  TYPE_1,
  parseExpirerTarget,
  isExpired,
  getSdkError,
} from "@walletconnect/utils";
import { utils } from "ethers";
import { JsonRpcTypes, IAuthEngine, AuthEngineTypes } from "../types";
import { EXPIRER_EVENTS, AUTH_CLIENT_PUBLIC_KEY_NAME, ENGINE_RPC_OPTS } from "../constants";
import { getDidAddress, getDidChainId } from "../utils/address";
import { getPendingRequest, getPendingRequests } from "../utils/store";
import { isValidPairUri, isValidRequest, isValidRespond } from "../utils/validators";
import { formatUri, parseUri } from "../utils/uri";

export class AuthEngine extends IAuthEngine {
  private initialized = false;
  public name = "authEngine";

  constructor(client: IAuthEngine["client"]) {
    super(client);
  }

  public init: IAuthEngine["init"] = async () => {
    if (!this.initialized) {
      await this.cleanup();
      this.registerRelayerEvents();
      this.registerExpirerEvents();
      this.initialized = true;
    }
  };

  // ---------- Public ------------------------------------------------ //

  public pair: IAuthEngine["pair"] = async ({ uri }) => {
    this.isInitialized();

    if (!isValidPairUri) {
      throw new Error("Invalid pair uri");
    }

    const { topic, symKey, relay } = parseUri(uri);
    const expiry = calcExpiry(FOUR_WEEKS);
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

  public request: IAuthEngine["request"] = async (params: AuthEngineTypes.PayloadParams) => {
    this.isInitialized();

    if (!isValidRequest(params)) {
      throw new Error("Invalid request");
    }

    const existingPairings = this.client.pairing.getAll({ active: true });
    const relay = { protocol: RELAYER_DEFAULT_PROTOCOL };

    // SPEC: A creates random symKey S for pairing topic

    let pairingTopic: string;
    let symKey = "";

    if (existingPairings.length > 0) {
      const pairing = existingPairings[0];
      pairingTopic = pairing.topic;
      symKey = this.client.core.crypto.keychain.get(pairingTopic);
    } else {
      // SPEC: A generates keyPair X and generates response topic
      symKey = generateRandomBytes32();

      // SPEC: Pairing topic is the hash of symkey S
      pairingTopic = await this.client.core.crypto.setSymKey(symKey);

      const expiry = calcExpiry(FIVE_MINUTES);

      // Preparing pairing URI
      const pairing = { topic: pairingTopic, expiry, relay, active: false };
      await this.client.pairing.set(pairingTopic, pairing);

      this.setExpiry(pairingTopic, expiry);
    }

    const publicKey = await this.client.core.crypto.generateKeyPair();

    this.client.authKeys.set(AUTH_CLIENT_PUBLIC_KEY_NAME, { publicKey });

    const responseTopic = hashKey(publicKey);

    await this.client.pairingTopics.set(responseTopic, { pairingTopic });

    // Subscribe to response topic
    await this.client.core.relayer.subscribe(responseTopic);

    // SPEC: A will construct an authentication request.
    // TODO: Fill out the rest of the properties here
    const { chainId, statement, aud, domain, nonce, type } = params;

    // SPEC: A encrypts reuqest with symKey S
    // SPEC: A publishes encrypted request to topic
    const id = await this.sendRequest(pairingTopic, "wc_authRequest", {
      payloadParams: {
        type: type ?? "eip4361",
        chainId,
        statement,
        aud,
        domain,
        version: "1",
        nonce,
        iat: new Date().toISOString(),
      },
      requester: { publicKey, metadata: this.client.metadata },
    });

    const uri = formatUri({
      protocol: this.client.protocol,
      version: this.client.core.version,
      topic: pairingTopic,
      symKey,
      relay,
    });

    return { uri, id };
  };

  public respond: IAuthEngine["respond"] = async (respondParams) => {
    this.isInitialized();

    if (!isValidRespond(respondParams, this.client.requests)) {
      throw new Error("Invalid response");
    }

    const pendingRequest = getPendingRequest(this.client.requests, respondParams.id);

    const receiverPublicKey = pendingRequest.requester.publicKey;
    const senderPublicKey = await this.client.core.crypto.generateKeyPair();
    const responseTopic = hashKey(receiverPublicKey);
    const encodeOpts = {
      type: TYPE_1,
      receiverPublicKey,
      senderPublicKey,
    };

    if ("error" in respondParams) {
      await this.sendError(pendingRequest.id, responseTopic, respondParams, encodeOpts);
      return;
    }

    const cacao: AuthEngineTypes.Cacao = {
      h: {
        t: "eip4361",
      },
      p: pendingRequest.cacaoPayload,
      s: respondParams.signature,
    };

    const id = await this.sendResult<"wc_authRequest">(
      pendingRequest.id,
      responseTopic,
      cacao,
      encodeOpts,
    );

    await this.client.requests.set(id, { id, ...cacao });
  };

  public getPendingRequests: IAuthEngine["getPendingRequests"] = () => {
    const pendingRequests = getPendingRequests(this.client.requests);
    return pendingRequests;
  };

  // ---------- Private Helpers --------------------------------------- //

  private deletePairing = async (topic: string) => {
    await Promise.all([
      this.client.core.relayer.unsubscribe(topic),
      this.client.pairing.delete(topic, getSdkError("USER_DISCONNECTED")),
      this.client.core.crypto.deleteSymKey(topic),
      this.client.expirer.del(topic),
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

    return payload.id;
  };

  protected sendError: IAuthEngine["sendError"] = async (id, topic, params, encodeOpts) => {
    const payload = formatJsonRpcError(id, params.error);
    const message = await this.client.core.crypto.encode(topic, payload, encodeOpts);
    const record = await this.client.history.get(topic, id);
    const rpcOpts = ENGINE_RPC_OPTS[record.request.method].res;

    await this.client.core.relayer.publish(topic, message, rpcOpts);
    await this.client.history.resolve(payload);

    return payload.id;
  };

  protected cleanup: IAuthEngine["cleanup"] = async () => {
    const pairingTopics: string[] = [];
    this.client.pairing.getAll().forEach((pairing) => {
      if (isExpired(pairing.expiry)) pairingTopics.push(pairing.topic);
    });
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
          ? this.client.authKeys.get(AUTH_CLIENT_PUBLIC_KEY_NAME).publicKey
          : "";

        const opts = receiverPublicKey
          ? {
              receiverPublicKey,
            }
          : {};

        const payload = await this.client.core.crypto.decode(topic, message, opts);
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
    console.log("constructEip4361Message, cacao is:", cacao);

    const header = `${cacao.domain} wants you to sign in with your Ethereum account:`;
    const walletAddress = getDidAddress(cacao.iss);
    const statement = cacao.statement;
    const uri = `URI: ${cacao.aud}`;
    const version = `Version: ${cacao.version}`;
    const chainId = `Chain ID: ${getDidChainId(cacao.iss)}`;
    const nonce = `Nonce: ${cacao.nonce}`;
    const issuedAt = `Issued At: ${cacao.iat}`;
    const resources =
      cacao.resources && cacao.resources.length > 0
        ? `Resources:\n${cacao.resources.map((resource) => `- ${resource}`).join("\n")}`
        : undefined;

    const message = [
      header,
      walletAddress,
      ``,
      statement,
      ``,
      uri,
      version,
      chainId,
      nonce,
      issuedAt,
      resources,
    ]
      .filter((val) => val !== undefined && val !== null) // remove unnecessary empty lines
      .join("\n");

    return message;
  };

  // ---------- Relay Event Handlers --------------------------------- //

  protected onAuthRequest: IAuthEngine["onAuthRequest"] = async (topic, payload) => {
    const {
      requester,
      payloadParams: { resources, statement, aud, domain, version, nonce, iat },
    } = payload.params;

    console.log("onAuthRequest:", topic, payload);

    try {
      const cacaoPayload: AuthEngineTypes.CacaoPayload = {
        iss: this.client.address || "",
        aud,
        domain,
        version,
        nonce,
        iat,
        statement,
        resources,
      };

      const message = this.constructEip4361Message(cacaoPayload);

      await this.client.requests.set(payload.id, {
        requester,
        id: payload.id,
        message,
        cacaoPayload,
      });

      this.client.emit("auth_request", {
        id: payload.id,
        topic,
        params: {
          requester,
          message: this.constructEip4361Message(cacaoPayload),
        },
      });
    } catch (err: any) {
      await this.sendError(payload.id, topic, err);
      this.client.logger.error(err);
    }
  };

  protected onAuthResponse: IAuthEngine["onAuthResponse"] = async (topic, response) => {
    const { id } = response;

    console.log("onAuthResponse", topic, response);

    const { pairingTopic } = this.client.pairingTopics.get(topic);

    const newExpiry = calcExpiry(FOUR_WEEKS);
    this.client.pairing.update(pairingTopic, {
      active: true,
      expiry: newExpiry,
    });
    this.setExpiry(pairingTopic, newExpiry);

    if (isJsonRpcResult(response)) {
      const { s: signature, p: payload } = response.result;

      await this.client.requests.set(id, { id, ...response.result });

      const reconstructed = this.constructEip4361Message(payload);
      console.log("reconstructed message:\n", JSON.stringify(reconstructed));
      console.log("payload.iss:", payload.iss);
      console.log("signature:", signature);

      const address = utils.verifyMessage(reconstructed, signature.s);
      const walletAddress = getDidAddress(payload.iss);

      console.log("Recovered address from signature:", address);
      console.log("walletAddress extracted from `payload.iss`:", walletAddress);

      if (address !== walletAddress) {
        this.client.emit("auth_response", {
          id,
          topic,
          params: { message: "Invalid signature", code: -1 },
        });
      } else {
        this.client.emit("auth_response", { id, topic, params: response });
      }
    } else if (isJsonRpcError(response)) {
      this.client.emit("auth_response", { id, topic, params: response });
    }
  };

  // ---------- Expirer Events ---------------------------------------- //

  private registerExpirerEvents() {
    this.client.expirer.on(EXPIRER_EVENTS.expired, async (event: ExpirerTypes.Expiration) => {
      const { topic } = parseExpirerTarget(event.target);
      if (topic) {
        if (this.client.pairing.keys.includes(topic)) {
          await this.deletePairing(topic);
          this.client.events.emit("pairing_expire", { topic });
        }
      }
    });
  }
}
