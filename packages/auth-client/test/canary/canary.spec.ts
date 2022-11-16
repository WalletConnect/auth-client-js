import { expect, describe, it, beforeEach, afterEach, beforeAll } from "vitest";
import { Wallet } from "@ethersproject/wallet";
import { AuthClient, generateNonce, IAuthClient, AuthEngineTypes } from "./../../src";
import { disconnectSocket } from "./../helpers/ws";

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

describe("AuthClient canary", () => {
  let client: IAuthClient;
  let peer: IAuthClient;
  let wallet: Wallet;

  // Set up a wallet to use as the external signer.
  beforeAll(() => {
    wallet = Wallet.createRandom();
  });

  beforeEach(async () => {
    client = await AuthClient.init({
      name: "testClient",
      logger: "error",
      relayUrl: process.env.TEST_RELAY_URL || "wss://relay.walletconnect.com",
      projectId: process.env.TEST_PROJECT_ID!,
      storageOptions: {
        database: ":memory:",
      },
      metadata: metadataRequester,
    });

    peer = await AuthClient.init({
      name: "testPeer",
      logger: "error",
      relayUrl: process.env.TEST_RELAY_URL || "wss://relay.walletconnect.com",
      projectId: process.env.TEST_PROJECT_ID!,
      storageOptions: {
        database: ":memory:",
      },
      iss: `did:pkh:eip155:1:${wallet.address}`,
      metadata: metadataResponder,
    });
  });

  afterEach(async () => {
    await disconnectSocket(client.core);
    await disconnectSocket(peer.core);
  });

  it("can be instantiated", () => {
    expect(client instanceof AuthClient).toBe(true);
    expect(client.core).toBeDefined();
    expect(client.events).toBeDefined();
    expect(client.logger).toBeDefined();
    expect(client.core.expirer).toBeDefined();
    expect(client.core.history).toBeDefined();
    expect(client.core.pairing).toBeDefined();
  });

  it("Pairs", async () => {
    let request = await client.request(defaultRequestParams);

    await Promise.all([
      new Promise<void>((resolve) => {
        peer.once("auth_request", async (args) => {
          const signature = await wallet.signMessage(args.params.message);
          await peer.respond({
            id: args.id,
            signature: {
              s: signature,
              t: "eip191",
            },
          });
          resolve();
        });
      }),
      new Promise<void>((resolve) => {
        client.on("auth_response", (args) => {
          expect(args.id).to.equal(request.id);
          resolve();
        });
      }),
      new Promise<void>(async (resolve) => {
        await peer.core.pairing.pair({ uri: request.uri, activatePairing: true });
        resolve();
      }),
    ]);

    // Ensure they paired
    expect(client.core.pairing.pairings.keys).to.eql(peer.core.pairing.pairings.keys);
    expect(client.core.pairing.pairings.keys.length).to.eql(1);

    // Ensure each client published once (request and respond)
    expect(client.core.history.records.size).to.eql(peer.core.history.records.size);
    expect(client.core.history.records.size).to.eql(1);

    // Ensure pairing is in expected state
    expect(peer.core.pairing.pairings.values[0].active).to.eql(true);

    request = await client.request(defaultRequestParams);
    let errorResponse = false;
    await Promise.all([
      new Promise<void>((resolve) => {
        peer.once("auth_request", async (args) => {
          await peer.respond({
            id: args.id,
            error: {
              code: 14001,
              message: "Can not login",
            },
          });
          resolve();
        });
      }),
      new Promise<void>((resolve) => {
        client.once("auth_response", ({ params }) => {
          if ("error" in params) {
            errorResponse = Boolean(params.error.code);
          }
          resolve();
        });
      }),
      new Promise<void>(async (resolve) => {
        await peer.core.pairing.pair({ uri: request.uri });
        resolve();
      }),
    ]);

    expect(client.core.pairing.getPairings().length).to.eql(2);
    expect(client.core.pairing.getPairings()[0].active).to.eql(true);
    expect(errorResponse).to.eql(true);

    const aud = "http://localhost:3000/login";

    request = await client.request(defaultRequestParams);

    await Promise.all([
      new Promise<void>((resolve) => {
        peer.once("auth_request", () => {
          resolve();
        });
      }),
      new Promise<void>(async (resolve) => {
        await peer.core.pairing.pair({ uri: request.uri });
        resolve();
      }),
    ]);

    await peer.core.pairing.pair({ uri: request.uri });

    const requests = peer.getPendingRequests();

    expect(Object.values(requests).length).to.eql(3);

    expect(Object.values(requests)[0].cacaoPayload.aud).to.eql(aud);

    await Promise.all([
      new Promise<void>((resolve) => {
        peer.once("auth_request", () => {
          resolve();
        });
      }),
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
        request = await client.request(defaultRequestParams);
        await peer.core.pairing.pair({ uri: request.uri });
        const topic = client.core.pairing.pairings.keys[0];
        await client.core.pairing.ping({ topic });
        await peer.core.pairing.ping({ topic });
        resolve();
      }),
    ]);

    expect(client.core.pairing.pairings.keys.length).to.eql(4);
    expect(peer.core.pairing.pairings.keys.length).to.eql(4);
    expect(client.core.pairing.getPairings()[0].topic).to.eql(
      peer.core.pairing.getPairings()[0].topic,
    );

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

    expect(client.core.pairing.pairings.keys.length).to.eql(3);
    expect(peer.core.pairing.pairings.keys.length).to.eql(3);
  });
});
