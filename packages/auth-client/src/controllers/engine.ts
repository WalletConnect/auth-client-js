import { RELAYER_EVENTS } from "@walletconnect/core";
import {
  formatJsonRpcError,
  formatJsonRpcRequest,
  formatJsonRpcResult,
  isJsonRpcError,
  isJsonRpcRequest,
  isJsonRpcResponse,
  isJsonRpcResult,
} from "@walletconnect/jsonrpc-utils";
import { CoreTypes, RelayerTypes, Verify } from "@walletconnect/types";
import { getInternalError, hashKey, TYPE_1 } from "@walletconnect/utils";
import { AUTH_CLIENT_PUBLIC_KEY_NAME, ENGINE_RPC_OPTS } from "../constants";
import { AuthClientTypes, AuthEngineTypes, IAuthEngine, JsonRpcTypes } from "../types";
import { getDidAddress, getDidChainId, getNamespacedDidChainId } from "../utils/address";
import { verifySignature } from "../utils/signature";
import { getPendingRequest, getPendingRequests } from "../utils/store";
import { isValidRequest, isValidRespond } from "../utils/validators";
import { hashMessage } from "../utils/crypto";

export class AuthEngine extends IAuthEngine {
  private initialized = false;
  public name = "authEngine";

  constructor(client: IAuthEngine["client"]) {
    super(client);
  }

  public init: IAuthEngine["init"] = () => {
    if (!this.initialized) {
      this.registerRelayerEvents();
      this.client.core.pairing.register({ methods: Object.keys(ENGINE_RPC_OPTS) });
      this.initialized = true;
    }
  };

  // ---------- Public ------------------------------------------------ //

  public request: IAuthEngine["request"] = async (params, opts) => {
    this.isInitialized();

    if (!isValidRequest(params)) {
      throw new Error("Invalid request");
    }

    if (opts?.topic) {
      return await this.requestOnKnownPairing(opts.topic, params);
    }

    // SPEC: A will construct an authentication request.
    const { chainId, statement, aud, domain, nonce, type } = params;

    const { topic: pairingTopic, uri } = await this.client.core.pairing.create();

    this.client.logger.info({
      message: "Generated new pairing",
      pairing: { topic: pairingTopic, uri },
    });

    const publicKey = await this.client.core.crypto.generateKeyPair();
    const responseTopic = hashKey(publicKey);

    await this.client.authKeys.set(AUTH_CLIENT_PUBLIC_KEY_NAME, { responseTopic, publicKey });
    await this.client.pairingTopics.set(responseTopic, { topic: responseTopic, pairingTopic });

    // Subscribe to auth_response topic
    await this.client.core.relayer.subscribe(responseTopic);

    this.client.logger.info(`sending request to new pairing topic: ${pairingTopic}`);

    // SPEC: A encrypts reuqest with symKey S
    // SPEC: A publishes encrypted request to topic
    const id = await this.sendRequest(
      pairingTopic,
      "wc_authRequest",
      {
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
      },
      {},
      params.expiry,
    );

    this.client.logger.info(`sent request to new pairing topic: ${pairingTopic}`);

    return { uri, id };
  };

  public respond: IAuthEngine["respond"] = async (respondParams, iss) => {
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
      p: {
        ...pendingRequest.cacaoPayload,
        iss,
      },
      s: respondParams.signature,
    };

    const id = await this.sendResult<"wc_authRequest">(
      pendingRequest.id,
      responseTopic,
      cacao,
      encodeOpts,
    );

    await this.client.requests.update(id, { ...cacao });
  };

  public getPendingRequests: IAuthEngine["getPendingRequests"] = () => {
    const pendingRequests = getPendingRequests(this.client.requests);
    return pendingRequests;
  };

  public formatMessage = (cacao: AuthEngineTypes.CacaoPayload, iss: string) => {
    this.client.logger.debug(`formatMessage, cacao is: ${JSON.stringify(cacao)}`);

    const header = `${cacao.domain} wants you to sign in with your Ethereum account:`;
    const walletAddress = getDidAddress(iss);
    const statement = cacao.statement;
    const uri = `URI: ${cacao.aud}`;
    const version = `Version: ${cacao.version}`;
    const chainId = `Chain ID: ${getDidChainId(iss)}`;
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

  // ---------- Protected/Private Helpers --------------------------------------- //

  protected setExpiry: IAuthEngine["setExpiry"] = async (topic, expiry) => {
    if (this.client.core.pairing.pairings.keys.includes(topic)) {
      await this.client.core.pairing.updateExpiry({ topic, expiry });
    }
    this.client.core.expirer.set(topic, expiry);
  };

  protected sendRequest: IAuthEngine["sendRequest"] = async (
    topic,
    method,
    params,
    encodeOpts,
    expiry,
  ) => {
    const payload = formatJsonRpcRequest(method, params);
    const message = await this.client.core.crypto.encode(topic, payload, encodeOpts);
    const rpcOpts = ENGINE_RPC_OPTS[method].req;
    if (expiry) rpcOpts.ttl = expiry;
    this.client.core.history.set(topic, payload);
    await this.client.core.relayer.publish(topic, message, rpcOpts);

    return payload.id;
  };

  protected sendResult: IAuthEngine["sendResult"] = async (id, topic, result, encodeOpts) => {
    const payload = formatJsonRpcResult(id, result);
    const message = await this.client.core.crypto.encode(topic, payload, encodeOpts);
    const record = await this.client.core.history.get(topic, id);
    const rpcOpts = ENGINE_RPC_OPTS[record.request.method].res;

    await this.client.core.relayer.publish(topic, message, rpcOpts);
    await this.client.core.history.resolve(payload);

    return payload.id;
  };

  protected sendError: IAuthEngine["sendError"] = async (id, topic, params, encodeOpts) => {
    const payload = formatJsonRpcError(id, params.error);
    const message = await this.client.core.crypto.encode(topic, payload, encodeOpts);
    const record = await this.client.core.history.get(topic, id);
    const rpcOpts = ENGINE_RPC_OPTS[record.request.method].res;

    await this.client.core.relayer.publish(topic, message, rpcOpts);
    await this.client.core.history.resolve(payload);

    return payload.id;
  };

  private requestOnKnownPairing = async (topic: string, params: AuthEngineTypes.RequestParams) => {
    const knownPairing = this.client.core.pairing.pairings
      .getAll({ active: true })
      .find((pairing) => pairing.topic === topic);

    if (!knownPairing) throw new Error(`Could not find pairing for provided topic ${topic}`);

    const { publicKey } = this.client.authKeys.get(AUTH_CLIENT_PUBLIC_KEY_NAME);
    const { chainId, statement, aud, domain, nonce, type } = params;

    // Send request to existing pairing
    const id = await this.sendRequest(
      knownPairing.topic,
      "wc_authRequest",
      {
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
      },
      {},
      params.expiry,
    );

    this.client.logger.info(`sent request to known pairing topic: ${knownPairing.topic}`);
    return { id };
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

        // Retrieve the public key (if defined) to decrypt possible `auth_request` response
        const { responseTopic, publicKey } = this.client.authKeys.keys.includes(
          AUTH_CLIENT_PUBLIC_KEY_NAME,
        )
          ? this.client.authKeys.get(AUTH_CLIENT_PUBLIC_KEY_NAME)
          : { responseTopic: undefined, publicKey: undefined };

        // If there's an expected responseTopic/publicKey, we only proceed if this message's topic matches,
        // otherwise we're attempting to decrypt another client's TYPE_1 envelope with the wrong publicKey.
        if (responseTopic && topic !== responseTopic) {
          this.client.logger.debug("[Auth] Ignoring message from unknown topic", topic);
          return;
        }

        const payload = await this.client.core.crypto.decode(topic, message, {
          receiverPublicKey: publicKey,
        });
        if (isJsonRpcRequest(payload)) {
          this.client.core.history.set(topic, payload);
          this.onRelayEventRequest({ topic, payload });
        } else if (isJsonRpcResponse(payload)) {
          await this.client.core.history.resolve(payload);
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
    const record = await this.client.core.history.get(topic, payload.id);
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
    const {
      requester,
      payloadParams: { resources, statement, aud, domain, version, nonce, iat, chainId },
    } = payload.params;

    this.client.logger.info({ type: "onAuthRequest", topic, payload });

    try {
      const cacaoPayload: AuthEngineTypes.CacaoRequestPayload = {
        aud,
        domain,
        version,
        nonce,
        iat,
        statement,
        resources,
        chainId,
      };

      await this.client.requests.set(payload.id, {
        requester,
        pairingTopic: topic,
        id: payload.id,
        cacaoPayload,
      });
      const hash = hashMessage(JSON.stringify(cacaoPayload));
      const context = await this.getVerifyContext(hash, this.client.metadata);

      this.client.emit("auth_request", {
        id: payload.id,
        topic,
        params: {
          requester,
          cacaoPayload,
          context,
        },
      });
    } catch (err: any) {
      await this.sendError(payload.id, topic, err);
      this.client.logger.error(err);
    }
  };

  protected onAuthResponse: IAuthEngine["onAuthResponse"] = async (topic, response) => {
    const { id } = response;
    this.client.logger.info({ type: "onAuthResponse", topic, response });

    if (isJsonRpcResult(response)) {
      const { pairingTopic } = this.client.pairingTopics.get(topic);
      await this.client.core.pairing.activate({ topic: pairingTopic });

      const { s: signature, p: payload } = response.result;
      await this.client.requests.set(id, { id, pairingTopic, ...response.result });
      const reconstructed = this.formatMessage(payload, payload.iss);
      this.client.logger.debug("reconstructed message:\n", JSON.stringify(reconstructed));
      this.client.logger.debug("payload.iss:", payload.iss);
      this.client.logger.debug("signature:", signature);

      const walletAddress = getDidAddress(payload.iss);
      const chainId = getNamespacedDidChainId(payload.iss);

      if (!walletAddress) {
        throw new Error("Could not derive address from `payload.iss`");
      }
      if (!chainId) {
        throw new Error("Could not derive chainId from `payload.iss`");
      }
      this.client.logger.debug("walletAddress extracted from `payload.iss`:", walletAddress);

      const isValid = await verifySignature(
        walletAddress,
        reconstructed,
        signature,
        chainId,
        this.client.projectId,
      );

      if (!isValid) {
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

  private getVerifyContext = async (hash: string, metadata: AuthClientTypes.Metadata) => {
    const context: Verify.Context = {
      verified: {
        verifyUrl: metadata.verifyUrl || "",
        validation: "UNKNOWN",
        origin: metadata.url || "",
      },
    };

    try {
      const origin = await this.client.core.verify.resolve({
        attestationId: hash,
        verifyUrl: metadata.verifyUrl,
      });
      if (origin) {
        context.verified.origin = origin;
        context.verified.validation = origin === metadata.url ? "VALID" : "INVALID";
      }
    } catch (e) {
      this.client.logger.error(e);
    }

    this.client.logger.info(`Verify context: ${JSON.stringify(context)}`);
    return context;
  };
}
