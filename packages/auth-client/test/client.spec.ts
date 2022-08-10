import { generateRandomBytes32 } from "@walletconnect/utils";
import { expect, describe, it, beforeAll, vi } from "vitest";
import { AuthClient } from "../src/client";

describe("AuthClient", () => {
  let client: AuthClient;
  let peer: AuthClient;

  beforeAll(async () => {
    client = await AuthClient.init({
      logger: "debug",
      relayUrl: "ws://0.0.0.0:5555",
      projectId: undefined,
      storageOptions: {
        database: ":memory:",
      },
    });

    peer = await AuthClient.init({
      logger: "debug",
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

    // Give enough time for the message to go through
    // TODO: Figure out a cleaner way to do this
    await new Promise((resolve) => {
      setTimeout(() => {
        resolve({});
      }, 1000);
    });

    // Ensure they paired
    expect(client.pairing.keys).to.eql(peer.pairing.keys);

    // Ensure each client published once (request and respond)
    expect(client.history.records.size).to.eql(peer.history.records.size);
    expect(client.history.records.size).to.eql(1);
  });
});
