import { expect, describe, it, beforeEach, beforeAll, vi, afterEach } from "vitest";
import ethers from "ethers";
import { AuthClient } from "../src/client";
import { AuthEngineTypes } from "../src/types";
import { hashKey } from "@walletconnect/utils";

const defaultRequestParams: AuthEngineTypes.PayloadParams = {
  aud: "http://localhost:3000/login",
  domain: "localhost:3000",
  chainId: "eip155:1",
  exp: new Date(new Date().getTime() + 50000).toISOString(),
  type: "eip4361",
  nonce: "nonce",
  iat: new Date().toISOString(),
  version: "1",
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
  let client: AuthClient;
  let peer: AuthClient;
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
      relayUrl: "ws://0.0.0.0:5555",
      projectId: undefined,
      storageOptions: {
        database: ":memory:",
      },
    });

    peer = await AuthClient.init({
      logger: "error",
      relayUrl: "ws://0.0.0.0:5555",
      projectId: undefined,
      storageOptions: {
        database: ":memory:",
      },
      iss: `did:pkh:eip155:1:${wallet.address}`,
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
    let hasPaired = false;

    let uri2: string;

    peer.on("auth_request", async (args) => {
      hasPaired = true;

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

    expect(uri1).to.eql(uri2);

    // Ensure they paired
    expect(client.pairing.keys).to.eql(peer.pairing.keys);
    expect(client.pairing.keys.length).to.eql(1);
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

    const { uri } = await client.request({
      aud: "http://localhost:3000/login",
      domain: "localhost:3000",
      chainId: "chainId",
      nonce: "nonce",
    });

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
      successfulResponse = Boolean(args.params.result?.signature);
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

  it("correctly retrieves complete requests", async () => {
    let peerHasResponded = false;
    const aud = "http://localhost:3000/login";
    const id = 42;
    client.requests.set(id, {
      id,
      payload: {
        aud,
      },
    } as any);

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

    await waitForEvent(() => peerHasResponded);

    const request = client.getResponse({ id });

    expect(request.payload.aud).to.eql(aud);
  });

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

  it("receives metadata", async () => {
    const metadataName = "Foo";
    let receivedMetadataName: string;
    client = await AuthClient.init({
      logger: "error",
      relayUrl: "ws://0.0.0.0:5555",
      projectId: undefined,
      metadata: {
        name: metadataName,
        description: "description",
        icons: [],
        url: "url",
      },
      storageOptions: {
        database: ":memory:",
      },
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
    expect(receivedMetadataName).to.eql(metadataName);
  });

  it("expires pairings", async () => {
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
