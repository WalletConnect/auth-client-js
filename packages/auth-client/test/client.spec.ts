import { generateRandomBytes32 } from "@walletconnect/utils";
import { expect, describe, it, beforeEach, vi } from "vitest";
import { AuthClient } from "../src/client";

// TODO: Figure out a cleaner way to do this
const waitForRelay = async () =>
  await new Promise((resolve) => {
    setTimeout(() => {
      resolve({});
    }, 500);
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
    peer.on("auth_request", (args) => {
      console.log("PEER > on auth_request", args);
      console.log("PENDING:", peer.pendingRequests.keys);
    });
    client.on("auth_response", (args) => {
      console.log("CLIENT > on auth_response", args);
    });

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
      console.log("PEER > on auth_request", args);
      console.log("PENDING:", peer.pendingRequests.keys);
      await peer.respond({ id: args.id, signature: "mock signature" });
    });
    client.on("auth_response", (args) => {
      console.log("CLIENT > on auth_response", args);
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
