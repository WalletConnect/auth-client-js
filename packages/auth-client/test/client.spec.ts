import { generateRandomBytes32 } from "@walletconnect/utils";
import { expect, describe, it, beforeEach, vi, afterEach } from "vitest";
import ethers from "ethers";
import { AuthClient } from "../src/client";

// TODO: Figure out a cleaner way to do this
const waitForRelay = async (waitTimeOverride?: number) => {
  await new Promise((resolve) => {
    setTimeout(() => {
      resolve({});
    }, waitTimeOverride ?? 500);
  });
};

describe("AuthClient", () => {
  let client: AuthClient;
  let peer: AuthClient;

  // Mocking five minutes to be five seconds to test expiry.
  // Modified constant instead of functions to be as close as possible to actual
  // expiry logic
  vi.mock("@walletconnect/time", async () => {
    const constants: Record<string, any> = await vi.importActual("@walletconnect/time");
    return { ...constants, FIVE_MINUTES: 2 };
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
      iss: "did:pkh:eip155:1:0xdE80F109b4923415655274dADB17b73876861c56",
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
    const { uri } = await client.request({
      aud: "http://localhost:3000/login",
      domain: "localhost:3000",
      chainId: "chainId",
      nonce: "nonce",
    });

    await peer.pair({ uri });

    await waitForRelay();

    // Ensure they paired
    expect(client.pairing.keys).to.eql(peer.pairing.keys);
    expect(client.pairing.keys.length).to.eql(1);

    // Ensure each client published once (request and respond)
    expect(client.history.records.size).to.eql(peer.history.records.size);
    expect(client.history.records.size).to.eql(1);
  });

  it("handles incoming auth requests", async () => {
    const { uri } = await client.request({
      aud: "http://localhost:3000/login",
      domain: "localhost:3000",
      chainId: "chainId",
      nonce: "nonce",
    });

    await peer.pair({ uri });

    await waitForRelay();

    expect(peer.pendingRequests.length).to.eql(1);
  });

  it("handles responses", async () => {
    let hasResponded = false;
    let successfulResponse = false;
    peer.on("auth_request", async (args) => {
      const signature =
        "0x09088b6230b7c1295b703cec3afbbd65e06b7d32e122454d544f6ea3b387566616bd76b854c7bc3bf1ea8534bf69029f97dc5e84d54953aff203bb8b70b3c01e1c";
      await peer.respond({
        id: args.id,
        signature: {
          s: signature,
          t: "eip191",
        },
      });
    });

    client.on("auth_response", (args) => {
      successfulResponse = !(args.params instanceof Error);
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

    await waitForRelay();

    expect(client.pairing.values[0].active).to.eql(true);

    expect(hasResponded).to.eql(true);
    expect(successfulResponse).to.eql(true);
  });

  it("expires pairings", async () => {
    peer.on("auth_request", async (args) => {
      const signature =
        "0x09088b6230b7c1295b703cec3afbbd65e06b7d32e122454d544f6ea3b387566616bd76b854c7bc3bf1ea8534bf69029f97dc5e84d54953aff203bb8b70b3c01e1c";
      await peer.respond({
        id: args.id,
        signature: {
          s: signature,
          t: "eip191",
        },
      });
    });

    const { uri } = await client.request({
      aud: "http://localhost:3000/login",
      domain: "localhost:3000",
      chainId: "chainId",
      nonce: "nonce",
    });

    await peer.pair({ uri });

    await waitForRelay(100);

    expect(client.pairing.keys).to.eql(peer.pairing.keys);
    expect(peer.pairing.keys.length).to.eql(1);

    await waitForRelay(5000);

    expect(peer.pairing.keys.length).to.eql(0);
    expect(client.pairing.keys.length).to.eql(0);
  });
});
