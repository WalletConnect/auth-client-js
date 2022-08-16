import { generateRandomBytes32 } from "@walletconnect/utils";
import { expect, describe, it, beforeEach, vi, afterEach } from "vitest";
import ethers from "ethers";
import { AuthClient } from "../src/client";
import { AUTH_CLIENT_STORAGE_PREFIX } from "../src/constants";

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
    return { ...constants, FIVE_MINUTES: 5, FOUR_WEEKS: 5 };
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
      iss: "did:pkh:eip155:1:0x7Be83ef7451916aacb71DDD5978f7fD2D00A6E6a",
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

    expect(peer.requests.length).to.eql(1);
  });

  it("handles responses", async () => {
    let hasResponded = false;
    let successfulResponse = false;
    peer.on("auth_request", async (args) => {
      const signature =
        "0x2f4f830299e832cd35cd33e43ea1242ecc72850be417351a74747430df3dd89075f141779592562829385840349a48b54b155c50071e919fdcdfd2cbd492d6fd1c";
      await peer.respond({
        id: args.id,
        signature: {
          s: signature,
          t: "eip191",
        },
      });
    });

    client.on("auth_response", (args) => {
      successfulResponse = Boolean(args.params.result?.signature);
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

  it("correctly retreives complete requests", async () => {
    const storageKey = AUTH_CLIENT_STORAGE_PREFIX + "0.3" + "//" + "requests";
    const aud = "http://localhost:3000/login";
    const id = 42;
    client.requests.set(id, {
      id,
      payload: {
        aud,
      },
    } as any);

    peer.on("auth_request", async (args) => {
      const signature =
        "0x2f4f830299e832cd35cd33e43ea1242ecc72850be417351a74747430df3dd89075f141779592562829385840349a48b54b155c50071e919fdcdfd2cbd492d6fd1c";
      await peer.respond({
        id: args.id,
        signature: {
          s: signature,
          t: "eip191",
        },
      });
    });

    const { uri } = await client.request({
      aud,
      domain: "localhost:3000",
      chainId: "chainId",
      nonce: "nonce",
    });

    await peer.pair({ uri });

    await waitForRelay();

    const request = client.getRequest({ id });

    expect(request.payload.aud).to.eql(aud);
  });

  it("correctly retreives pending requests", async () => {
    const aud = "http://localhost:3000/login";
    const { uri } = await client.request({
      aud,
      domain: "localhost:3000",
      chainId: "chainId",
      nonce: "nonce",
    });

    await peer.pair({ uri });

    await waitForRelay();

    const requests = peer.getPendingRequests();

    expect(Object.values(requests).length).to.eql(1);

    expect(Object.values(requests)[0].cacaoPayload.aud).to.eql(aud);
  });

  it("expires pairings", async () => {
    peer.on("auth_request", async (args) => {
      const signature =
        "0x2f4f830299e832cd35cd33e43ea1242ecc72850be417351a74747430df3dd89075f141779592562829385840349a48b54b155c50071e919fdcdfd2cbd492d6fd1c";
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

    expect(client.pairing.keys).to.eql(peer.pairing.keys);
    expect(peer.pairing.keys.length).to.eql(1);
    expect(client.pairing.values[0].active).to.eql(false);

    await waitForRelay(500);

    expect(client.pairing.values[0].active).to.eql(true);

    await waitForRelay(5000);

    expect(peer.pairing.keys.length).to.eql(0);
    expect(client.pairing.keys.length).to.eql(0);
  });
});
