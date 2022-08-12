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
    peer.on("auth_request", async (args) => {
      const signature =
        "0x5441969d62b8379ddd7bb5a3516e00a74c7662e07f94a52c15fb4f63435515db239613496c91e552f6e4e1e1240012ce6cd048d60f8fcd0dc392f493c22bbdad1b";
      await peer.respond({ id: args.id, signature } as any);
    });

    client.on("auth_response", (args) => {
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
  });
});
