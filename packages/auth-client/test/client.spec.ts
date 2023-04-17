/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { expect, describe, it, beforeEach, afterEach, beforeAll } from "vitest";
import { Wallet } from "@ethersproject/wallet";
import { AuthClient, generateNonce, IAuthClient, AuthEngineTypes, AuthClientTypes } from "../src";
import { disconnectSocket } from "./helpers/ws";
import { RELAYER_EVENTS } from "@walletconnect/core";
import { RelayerTypes } from "@walletconnect/types";

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

const waitForRelay = async (waitTimeOverride?: number) => {
  await new Promise((resolve) => {
    setTimeout(() => {
      resolve({});
    }, waitTimeOverride ?? 500);
  });
};

// Polls boolean value every interval to check for an event callback having been triggered.
const waitForEvent = async (checkForEvent: (...args: any[]) => boolean) => {
  await new Promise((resolve) => {
    const intervalId = setInterval(() => {
      if (checkForEvent()) {
        clearInterval(intervalId);
        resolve({});
      }
    }, 100);
  });
};

describe("AuthClient", () => {
  let client: IAuthClient;
  let peer: IAuthClient;
  let wallet: Wallet;
  let iss: string;

  const relayUrl = process.env.TEST_RELAY_URL || "wss://staging.relay.walletconnect.com";

  // Set up a wallet to use as the external signer.
  beforeAll(() => {
    wallet = Wallet.createRandom();
  });

  console.log("projectId: ", process.env.TEST_PROJECT_ID);
  console.log("relayUrl: ", relayUrl);

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

    peer = await AuthClient.init({
      name: "testPeer",
      logger: "error",
      relayUrl,
      projectId: process.env.TEST_PROJECT_ID!,
      storageOptions: {
        database: ":memory:",
      },
      metadata: metadataResponder,
    });

    iss = `did:pkh:eip155:1:${wallet.address}`;
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
    let hasRequest = false;
    peer.once("auth_request", () => {
      hasRequest = true;
    });
    const { uri } = await client.request(defaultRequestParams);

    await peer.core.pairing.pair({ uri: uri!, activatePairing: true });
    await waitForEvent(() => hasRequest);

    // Ensure they paired
    expect(client.core.pairing.pairings.keys).to.eql(peer.core.pairing.pairings.keys);
    expect(client.core.pairing.pairings.keys.length).to.eql(1);

    // Ensure each client published once (request and respond)
    expect(client.core.history.records.size).to.eql(peer.core.history.records.size);
    expect(client.core.history.records.size).to.eql(1);

    // Ensure pairing is in expected state
    expect(peer.core.pairing.pairings.values[0].active).to.eql(true);
  });

  it("can use known pairings", async () => {
    const responses: AuthClientTypes.BaseEventArgs<AuthClientTypes.AuthResponseEventArgs>[] = [];

    peer.on("auth_request", async (args) => {
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
    });

    client.on("auth_response", (args) => {
      responses.push(args);
    });

    const { uri: uri1 } = await client.request(defaultRequestParams);

    await peer.core.pairing.pair({ uri: uri1! });

    await waitForEvent(() => responses.length === 1);

    const knownPairing = client.core.pairing.getPairings()[0];

    const { uri: uri2 } = await client.request(defaultRequestParams, { topic: knownPairing.topic });

    await waitForEvent(() => responses.length === 2);

    expect(uri2).toBeUndefined();

    // Ensure they paired correctly
    expect(client.core.pairing.pairings.keys.length).to.eql(1);
    expect(client.core.history.keys.length).to.eql(2);
    expect(peer.core.pairing.pairings.keys.length).to.eql(1);
    expect(peer.core.history.keys.length).to.eql(2);
    expect(responses[0].topic === responses[1].topic).toBe(true);
  });

  it("handles incoming auth requests", async () => {
    let receivedAuthRequest = false;

    peer.once("auth_request", () => {
      receivedAuthRequest = true;
    });

    const { uri } = await client.request(defaultRequestParams);

    await peer.core.pairing.pair({ uri: uri! });

    await waitForEvent(() => receivedAuthRequest);

    expect(peer.requests.length).to.eql(1);
  });

  it("handles error responses", async () => {
    let hasResponded = false;
    let errorResponse = false;
    peer.once("auth_request", async (args) => {
      await peer.respond(
        {
          id: args.id,
          error: {
            code: 14001,
            message: "Can not login",
          },
        },
        iss,
      );
    });

    client.once("auth_response", ({ params }) => {
      if ("error" in params) {
        errorResponse = Boolean(params.error.code);
      }
      hasResponded = true;
    });

    const { uri } = await client.request(defaultRequestParams);

    expect(client.core.pairing.getPairings().length).to.eql(1);
    expect(client.core.pairing.getPairings()[0].active).to.eql(false);

    await peer.core.pairing.pair({ uri: uri! });

    await waitForEvent(() => hasResponded);

    expect(client.core.pairing.getPairings()[0].active).to.eql(false);

    expect(hasResponded).to.eql(true);
    expect(errorResponse).to.eql(true);
  });

  it("handles successful responses", async () => {
    let hasResponded = false;
    let successfulResponse = false;
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
    });

    client.once("auth_response", ({ params }) => {
      if ("result" in params) {
        successfulResponse = Boolean(params.result?.s);
      }
      hasResponded = true;
    });

    const { uri } = await client.request(defaultRequestParams);

    expect(client.core.pairing.getPairings().length).to.eql(1);
    expect(client.core.pairing.getPairings()[0].active).to.eql(false);

    await peer.core.pairing.pair({ uri: uri! });

    await waitForEvent(() => hasResponded);

    expect(client.core.pairing.getPairings()[0].active).to.eql(true);

    expect(hasResponded).to.eql(true);
    expect(successfulResponse).to.eql(true);
  });

  it("should set custom request expiry", async () => {
    const expiry = 1000;
    let uri = "";
    await Promise.all([
      new Promise<void>((resolve) => {
        client.core.relayer.once(RELAYER_EVENTS.publish, (payload: RelayerTypes.PublishPayload) => {
          // ttl of the request should match the expiry
          expect(payload?.opts?.ttl).to.eq(expiry);
          resolve();
        });
      }),
      new Promise<void>(async (resolve) => {
        const response = await client.request({
          ...defaultRequestParams,
          expiry,
        });
        uri = response.uri!;
        resolve();
      }),
    ]);

    await Promise.all([
      new Promise<void>((resolve) => {
        peer.once("auth_request", async (args) => {
          const message = peer.formatMessage(args.params.cacaoPayload, iss);
          const signature = await wallet.signMessage(message);
          resolve(
            await peer.respond(
              {
                id: args.id,
                signature: {
                  s: signature,
                  t: "eip191",
                },
              },
              iss,
            ),
          );
        });
      }),
      peer.core.pairing.pair({ uri }),
    ]);
  });

  describe("getPendingRequests", () => {
    it("correctly retrieves pending requests", async () => {
      let receivedAuthRequest = false;
      const aud = "http://localhost:3000/login";

      peer.once("auth_request", () => {
        receivedAuthRequest = true;
      });

      const { uri } = await client.request(defaultRequestParams);

      await peer.core.pairing.pair({ uri: uri! });

      await waitForEvent(() => receivedAuthRequest);

      const requests = peer.getPendingRequests();

      expect(Object.values(requests)[0].pairingTopic).to.eql(
        peer.core.pairing.getPairings()[0].topic,
      );

      expect(Object.values(requests).length).to.eql(1);

      expect(Object.values(requests)[0].cacaoPayload.aud).to.eql(aud);
    });
  });

  describe("getPairings", () => {
    it("correctly retrieves pairings", async () => {
      let receivedAuthRequest = false;

      peer.once("auth_request", () => {
        receivedAuthRequest = true;
      });

      const { uri } = await client.request(defaultRequestParams);

      await peer.core.pairing.pair({ uri: uri! });

      await waitForEvent(() => receivedAuthRequest);

      const clientPairings = client.core.pairing.getPairings();
      const peerPairings = peer.core.pairing.getPairings();

      expect(clientPairings.length).to.eql(1);
      expect(peerPairings.length).to.eql(1);
      expect(clientPairings[0].topic).to.eql(peerPairings[0].topic);
    });
  });

  describe("ping", () => {
    it("can ping a peer on a known pairing", async () => {
      let receivedAuthRequest = false;
      let receivedClientPing = false;
      let receivedPeerPing = false;

      peer.once("auth_request", () => {
        receivedAuthRequest = true;
      });
      peer.core.pairing.events.once("pairing_ping", () => {
        receivedClientPing = true;
      });
      client.core.pairing.events.once("pairing_ping", () => {
        receivedPeerPing = true;
      });

      const { uri } = await client.request(defaultRequestParams);

      await peer.core.pairing.pair({ uri: uri! });

      await waitForEvent(() => receivedAuthRequest);

      const topic = client.core.pairing.pairings.keys[0];
      await client.core.pairing.ping({ topic });
      await peer.core.pairing.ping({ topic });

      await waitForEvent(() => receivedClientPing && receivedPeerPing);

      expect(receivedClientPing).to.eql(true);
      expect(receivedPeerPing).to.eql(true);
    });
  });

  describe("disconnect", () => {
    it("removes the disconnected pairing", async () => {
      let receivedAuthRequest = false;
      let peerDeletedPairing = false;

      peer.once("auth_request", () => {
        receivedAuthRequest = true;
      });
      peer.core.pairing.events.once("pairing_delete", () => {
        peerDeletedPairing = true;
      });

      const { uri } = await client.request(defaultRequestParams);

      await peer.core.pairing.pair({ uri: uri! });

      await waitForEvent(() => receivedAuthRequest);

      expect(client.core.pairing.pairings.keys.length).to.eql(1);
      expect(peer.core.pairing.pairings.keys.length).to.eql(1);
      expect(client.core.pairing.getPairings()[0].topic).to.eql(
        peer.core.pairing.getPairings()[0].topic,
      );

      await client.core.pairing.disconnect({ topic: client.core.pairing.getPairings()[0].topic });

      await waitForEvent(() => peerDeletedPairing);

      expect(client.core.pairing.pairings.keys.length).to.eql(0);
      expect(peer.core.pairing.pairings.keys.length).to.eql(0);
    });
  });

  it("receives metadata", async () => {
    let receivedMetadataName = "";
    client = await AuthClient.init({
      logger: "error",
      relayUrl,
      projectId: process.env.TEST_PROJECT_ID!,
      storageOptions: {
        database: ":memory:",
      },
      metadata: metadataRequester,
    });

    let hasResponded = false;
    peer.once("auth_request", async (args) => {
      receivedMetadataName = args.params.requester?.metadata?.name;
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
      hasResponded = true;
    });

    const { uri } = await client.request(defaultRequestParams);

    expect(client.core.pairing.getPairings().length).to.eql(1);
    expect(client.core.pairing.getPairings()[0].active).to.eql(false);

    await peer.core.pairing.pair({ uri: uri! });

    await waitForEvent(() => hasResponded);

    expect(client.core.pairing.getPairings()[0].active).to.eql(true);

    expect(hasResponded).to.eql(true);
    expect(receivedMetadataName).to.eql(metadataRequester.name);
  });

  // FIXME: this test flakes pass/fail. Figure out a reliable approach and reactivate.
  it.skip("expires pairings", async () => {
    let peerHasResponded = false;
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
      peerHasResponded = true;
    });

    const { uri } = await client.request(defaultRequestParams);

    await peer.core.pairing.pair({ uri: uri! });

    expect(client.core.pairing.pairings.keys).to.eql(peer.core.pairing.pairings.keys);
    expect(peer.core.pairing.pairings.keys.length).to.eql(1);
    expect(client.core.pairing.getPairings()[0].active).to.eql(false);

    await waitForEvent(() => peerHasResponded);

    expect(client.core.pairing.getPairings()[0].active).to.eql(true);

    await waitForRelay(5000);

    expect(peer.core.pairing.pairings.keys.length).to.eql(0);
    expect(client.core.pairing.pairings.keys.length).to.eql(0);
  });
});
