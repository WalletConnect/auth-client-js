/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { expect, describe, it, beforeEach, afterEach, beforeAll } from "vitest";
import { Wallet } from "@ethersproject/wallet";
import {
  AuthClient,
  generateNonce,
  IAuthClient,
  AuthEngineTypes,
  AuthClientTypes,
  IAuthEngine,
} from "../src";
import { disconnectSocket } from "./helpers/ws";
import { RELAYER_EVENTS } from "@walletconnect/core";
import { RelayerTypes } from "@walletconnect/types";
import { P } from "pino";
import { AuthEngine } from "../src/controllers";

const relayUrl = process.env.TEST_RELAY_URL || "wss://staging.relay.walletconnect.com";

const metadataRequester = {
  name: "client (requester)",
  description: "Test Client as Requester",
  url: "www.walletconnect.com",
  icons: [],
};

const metadataResponder = {
  name: "peer (responder)",
  description: "Test Client as Peer/Responder",
  url: "www.walletconnect.com",
  icons: [],
};

const defaultRequestParams: AuthEngineTypes.RequestParams = {
  aud: "http://localhost:3000/login",
  domain: "localhost:3000",
  chainId: "eip155:1",
  nonce: generateNonce(),
};

describe("AuthEngine", () => {
  let engine: IAuthEngine;
  let client: IAuthClient;

  beforeEach(async () => {
    client = await AuthClient.init({
      name: "testClient",
      logger: "error",
      relayUrl,
      projectId: process.env.TEST_PROJECT_ID!,
      storageOptions: {
        database: ":memory:",
      },
      metadata: metadataRequester,
    });

    engine = new AuthEngine(client);
  });

  it("should create a new instance", () => {
    expect(engine).toBeDefined();
  });
});
