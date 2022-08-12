import { generateRandomBytes32 } from "@walletconnect/utils";
import { expect, describe, it, beforeEach, vi } from "vitest";
import ethers from "ethers";
import { AuthClient } from "../src/client";

// TODO: Figure out a cleaner way to do this
const waitForRelay = async () =>
  await new Promise((resolve) => {
    setTimeout(() => {
      resolve({});
    }, 1000);
  });

describe("AuthClient", () => {
  let client: AuthClient;
  let peer: AuthClient;

  beforeEach(async () => {
    client = await AuthClient.init({
      logger: "error",
      relayUrl: "ws://0.0.0.0:5555",
      projectId: undefined,
      storageOptions: {
        database: ":memory:",
      },
      iss: "did:pkh:eip155:0xdE80F109b4923415655274dADB17b73876861c56",
    });

    peer = await AuthClient.init({
      logger: "error",
      relayUrl: "ws://0.0.0.0:5555",
      projectId: undefined,
      storageOptions: {
        database: ":memory:",
      },
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

    await peer.pair({ uri });

    await waitForRelay();

    expect(hasResponded).to.eql(true);
    expect(successfulResponse).to.eql(true);
  });
});
