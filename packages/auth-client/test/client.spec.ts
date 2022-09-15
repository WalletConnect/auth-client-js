import { expect, describe, it, beforeEach, beforeAll, vi } from "vitest";
import ethers from "ethers";
import { AuthClient, generateNonce, IAuthClient, AuthEngineTypes } from "../src";

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
  let wallet: ethers.Wallet;

  // Mocking five minutes to be five seconds to test expiry.
  // Modified constant instead of functions to be as close as possible to actual
  // expiry logic
  vi.mock("@walletconnect/time", async () => {
    const constants: Record<string, any> = await vi.importActual("@walletconnect/time");
    return { ...constants, FIVE_MINUTES: 5, FOUR_WEEKS: 5 };
  });

  // Set up a wallet to use as the external signer.
  beforeAll(() => {
    wallet = ethers.Wallet.createRandom();
  });

  beforeEach(async () => {
    client = await AuthClient.init({
      logger: "error",
      relayUrl: process.env.TEST_RELAY_URL || "wss://staging.relay.walletconnect.com",
      projectId: process.env.TEST_PROJECT_ID,
      storageOptions: {
        database: ":memory:",
      },
      metadata: metadataRequester,
    });

    peer = await AuthClient.init({
      logger: "error",
      relayUrl: process.env.TEST_RELAY_URL || "wss://staging.relay.walletconnect.com",
      projectId: process.env.TEST_PROJECT_ID,
      storageOptions: {
        database: ":memory:",
      },
      iss: `did:pkh:eip155:1:${wallet.address}`,
      metadata: metadataResponder,
    });
  });

  it("can be instantiated", () => {
    expect(client instanceof AuthClient).toBe(true);
    expect(client.core).toBeDefined();
    expect(client.events).toBeDefined();
    expect(client.logger).toBeDefined();
    expect(client.expirer).toBeDefined();
    expect(client.history).toBeDefined();
    expect(client.pairing).toBeDefined();
  });

  it("Pairs", async () => {
    let hasPaired = false;
    peer.once("auth_request", () => {
      hasPaired = true;
    });
    const { uri } = await client.request(defaultRequestParams);

    await peer.pair({ uri });
    await waitForEvent(() => hasPaired);

    // Ensure they paired
    expect(client.pairing.keys).to.eql(peer.pairing.keys);
    expect(client.pairing.keys.length).to.eql(1);

    // Ensure each client published once (request and respond)
    expect(client.history.records.size).to.eql(peer.history.records.size);
    expect(client.history.records.size).to.eql(1);
  });

  it("Uses existing pairings", async () => {
    let uri2 = "";

    peer.on("auth_request", async (args) => {
      const signature = await wallet.signMessage(args.params.message);
      await peer.respond({
        id: args.id,
        signature: {
          s: signature,
          t: "eip191",
        },
      });
    });

    client.on("auth_response", async () => {
      const { uri } = await client.request(defaultRequestParams);
      uri2 = uri;
    });

    const { uri: uri1 } = await client.request(defaultRequestParams);

    await peer.pair({ uri: uri1 });

    await waitForEvent(() => !!uri2);

    expect(uri1).not.to.eql(uri2);

    // Ensure they paired
    expect(peer.pairing.keys.length).to.eql(1);
    expect(peer.history.keys.length).to.eql(2);
  });

  it("handles incoming auth requests", async () => {
    let receivedAuthRequest = false;

    peer.once("auth_request", () => {
      receivedAuthRequest = true;
    });

    const { uri } = await client.request(defaultRequestParams);

    await peer.pair({ uri });

    await waitForEvent(() => receivedAuthRequest);

    expect(peer.requests.length).to.eql(1);
  });

  it("handles error responses", async () => {
    let hasResponded = false;
    let errorResponse = false;
    peer.once("auth_request", async (args) => {
      await peer.respond({
        id: args.id,
        error: {
          code: 14001,
          message: "Can not login",
        },
      });
    });

    client.once("auth_response", (args) => {
      errorResponse = Boolean(args.params.error.code);
      hasResponded = true;
    });

    const { uri } = await client.request(defaultRequestParams);

    expect(client.pairing.values.length).to.eql(1);
    expect(client.pairing.values[0].active).to.eql(false);

    await peer.pair({ uri });

    await waitForEvent(() => hasResponded);

    expect(client.pairing.values[0].active).to.eql(true);

    expect(hasResponded).to.eql(true);
    expect(errorResponse).to.eql(true);
  });

  it("handles successful responses", async () => {
    let hasResponded = false;
    let successfulResponse = false;
    peer.once("auth_request", async (args) => {
      const signature = await wallet.signMessage(args.params.message);
      await peer.respond({
        id: args.id,
        signature: {
          s: signature,
          t: "eip191",
        },
      });
    });

    client.once("auth_response", (args) => {
      successfulResponse = Boolean(args.params.result?.s);
      hasResponded = true;
    });

    const { uri } = await client.request(defaultRequestParams);

    expect(client.pairing.values.length).to.eql(1);
    expect(client.pairing.values[0].active).to.eql(false);

    await peer.pair({ uri });

    await waitForEvent(() => hasResponded);

    expect(client.pairing.values[0].active).to.eql(true);

    expect(hasResponded).to.eql(true);
    expect(successfulResponse).to.eql(true);
  });

  describe("getPendingRequests", () => {
    it("correctly retrieves pending requests", async () => {
      let receivedAuthRequest = false;
      const aud = "http://localhost:3000/login";

      peer.once("auth_request", () => {
        receivedAuthRequest = true;
      });

      const { uri } = await client.request(defaultRequestParams);

      await peer.pair({ uri });

      await waitForEvent(() => receivedAuthRequest);

      const requests = peer.getPendingRequests();

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

      await peer.pair({ uri });

      await waitForEvent(() => receivedAuthRequest);

      const clientPairings = client.getPairings();
      const peerPairings = peer.getPairings();

      expect(clientPairings.length).to.eql(1);
      expect(peerPairings.length).to.eql(1);
      expect(clientPairings[0].topic).to.eql(peerPairings[0].topic);
    });
  });

  describe("disconnect", () => {
    it("removes the disconnected pairing", async () => {
      let receivedAuthRequest = false;
      let peerDeletedPairing = false;

      peer.once("auth_request", () => {
        receivedAuthRequest = true;
      });
      peer.once("pairing_delete", () => {
        peerDeletedPairing = true;
      });

      const { uri } = await client.request(defaultRequestParams);

      await peer.pair({ uri });

      await waitForEvent(() => receivedAuthRequest);

      expect(client.pairing.keys.length).to.eql(1);
      expect(peer.pairing.keys.length).to.eql(1);
      expect(client.pairing.values[0].topic).to.eql(peer.pairing.values[0].topic);

      await client.disconnect({ topic: client.pairing.values[0].topic });

      await waitForEvent(() => peerDeletedPairing);

      expect(client.pairing.keys.length).to.eql(0);
      expect(peer.pairing.keys.length).to.eql(0);
    });
  });

  it("receives metadata", async () => {
    let receivedMetadataName = "";
    client = await AuthClient.init({
      logger: "error",
      relayUrl: process.env.TEST_RELAY_URL || "wss://staging.relay.walletconnect.com",
      projectId: process.env.TEST_PROJECT_ID,
      storageOptions: {
        database: ":memory:",
      },
      metadata: metadataRequester,
    });

    let hasResponded = false;
    peer.once("auth_request", async (args) => {
      receivedMetadataName = args.params.requester?.metadata?.name;
      const signature = await wallet.signMessage(args.params.message);
      await peer.respond({
        id: args.id,
        signature: {
          s: signature,
          t: "eip191",
        },
      });
      hasResponded = true;
    });

    const { uri } = await client.request(defaultRequestParams);

    expect(client.pairing.values.length).to.eql(1);
    expect(client.pairing.values[0].active).to.eql(false);

    await peer.pair({ uri });

    await waitForEvent(() => hasResponded);

    expect(client.pairing.values[0].active).to.eql(true);

    expect(hasResponded).to.eql(true);
    expect(receivedMetadataName).to.eql(metadataRequester.name);
  });

  // FIXME: this test flakes pass/fail. Figure out a reliable approach and reactivate.
  it.skip("expires pairings", async () => {
    let peerHasResponded = false;
    peer.once("auth_request", async (args) => {
      const signature = await wallet.signMessage(args.params.message);
      await peer.respond({
        id: args.id,
        signature: {
          s: signature,
          t: "eip191",
        },
      });
      peerHasResponded = true;
    });

    const { uri } = await client.request(defaultRequestParams);

    await peer.pair({ uri });

    expect(client.pairing.keys).to.eql(peer.pairing.keys);
    expect(peer.pairing.keys.length).to.eql(1);
    expect(client.pairing.values[0].active).to.eql(false);

    await waitForEvent(() => peerHasResponded);

    expect(client.pairing.values[0].active).to.eql(true);

    await waitForRelay(5000);

    expect(peer.pairing.keys.length).to.eql(0);
    expect(client.pairing.keys.length).to.eql(0);
  });
});
