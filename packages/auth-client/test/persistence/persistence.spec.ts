/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { expect, describe, it, beforeEach, afterEach, beforeAll } from "vitest";
import { Wallet } from "@ethersproject/wallet";
import { AuthClient, generateNonce, IAuthClient, AuthEngineTypes } from "../../src";
import { disconnectSocket } from "../helpers/ws";
import { uploadCanaryResultsToCloudWatch } from "../utils";

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

const TEST_RELAY_URL = process.env.TEST_RELAY_URL || "wss://relay.walletconnect.com";

const dbName = "./tmp/test.db";
describe("AuthClient persistence tests", () => {
  let wallet: Wallet;
  let iss: string;

  // Set up a wallet to use as the external signer.
  beforeAll(() => {
    wallet = Wallet.createRandom();
  });

  it("Pairs", async () => {
    const client = await AuthClient.init({
      name: "testClient",
      logger: "error",
      relayUrl: TEST_RELAY_URL,
      projectId: process.env.TEST_PROJECT_ID!,
      storageOptions: {
        database: ":memory:",
      },
      metadata: metadataRequester,
    });

    let peer = await AuthClient.init({
      name: "testPeer",
      logger: "error",
      relayUrl: TEST_RELAY_URL,
      projectId: process.env.TEST_PROJECT_ID!,
      storageOptions: {
        database: dbName,
      },
      metadata: metadataResponder,
    });

    iss = `did:pkh:eip155:1:${wallet.address}`;

    const request = await client.request(defaultRequestParams);
    // receive the request and ignore it
    await Promise.all([
      new Promise<void>((resolve) => {
        peer.once("auth_request", (args) => {
          expect(args.params).to.exist;
          expect(args.topic).to.exist;
          expect(args.verifyContext).to.exist;
          resolve();
        });
      }),
      new Promise<void>(async (resolve) => {
        await peer.core.pairing.pair({ uri: request.uri! });
        resolve();
      }),
    ]);

    // disconnect peer
    await disconnectSocket(peer.core);

    peer = await AuthClient.init({
      name: "testPeer",
      logger: "error",
      relayUrl: TEST_RELAY_URL,
      projectId: process.env.TEST_PROJECT_ID!,
      storageOptions: {
        database: dbName,
      },
      metadata: metadataResponder,
    });
    // pair with the same URI
    // should be able to process the request normally
    await Promise.all([
      new Promise<void>((resolve) => {
        peer.once("auth_request", async (args) => {
          const message = peer.formatMessage(args.params.cacaoPayload, iss);
          const signature = await wallet.signMessage(message);
          await peer.respond(
            {
              id: args.id,
              signature: {
                s: signature,
                t: "eip191",
              },
            },
            iss,
          );
          resolve();
        });
      }),
      new Promise<void>((resolve) => {
        client.once("auth_response", (args) => {
          expect(args.id).to.equal(request.id);
          resolve();
        });
      }),
      new Promise<void>(async (resolve) => {
        await peer.core.pairing.pair({ uri: request.uri! });
        resolve();
      }),
    ]);

    await Promise.all([
      new Promise<void>((resolve) => {
        peer.core.pairing.events.once("pairing_ping", () => {
          resolve();
        });
      }),
      new Promise<void>((resolve) => {
        client.core.pairing.events.once("pairing_ping", () => {
          resolve();
        });
      }),
      new Promise<void>(async (resolve) => {
        const topic = client.core.pairing.pairings.keys[0];
        await client.core.pairing.ping({ topic });
        await peer.core.pairing.ping({ topic });
        resolve();
      }),
    ]);

    await Promise.all([
      new Promise<void>((resolve) => {
        peer.core.pairing.events.once("pairing_delete", () => {
          resolve();
        });
      }),
      new Promise<void>(async (resolve) => {
        await client.core.pairing.disconnect({ topic: client.core.pairing.getPairings()[0].topic });
        resolve();
      }),
    ]);

    await disconnectSocket(client.core);
    await disconnectSocket(peer.core);
  });
});
