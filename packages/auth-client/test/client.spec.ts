import { generateRandomBytes32 } from "@walletconnect/utils";
import { expect, describe, it, beforeAll } from "vitest";
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

  it("can request auth", () => {
    client.request({
      aud: "http://localhost:3000/login",
      domain: "localhost:3000",
      chainId: "chainId",
      nonce: "nonce",
    });
  });
});
