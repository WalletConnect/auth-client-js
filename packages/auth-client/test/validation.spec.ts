import { Store } from "@walletconnect/core";
import { describe, expect, it } from "vitest";
import { AuthClient } from "../src/client";
import { getPendingRequest } from "../src/utils/store";
import { isValidPairUri, isValidRequest, isValidRespond } from "../src/utils/validators";

describe("Validation", () => {
  describe("Request Validation", () => {
    it("Validates happy case", () => {
      const iat = new Date().toISOString();
      const exp = new Date(new Date().getTime() + 50000).toISOString();
      const isValid = isValidRequest({
        aud: "https://foo.bar.com/login",
        domain: "bar.com",
        chainId: "eip191:1",
        iat,
        nonce: "nonce",
        type: "eip4361",
        version: "1",
        exp,
      });

      expect(isValid).to.eql(true);
    });

    it("Validates bad case", () => {
      const isValid = isValidRequest({
        aud: "bad url",
        domain: "bar.com",
        chainId: "ei",
        iat: new Date().toISOString(),
        nonce: "nonce",
        type: "eip4361",
        version: "1",
        exp: new Date().toISOString(),
      });

      expect(isValid).to.eql(false);
    });
  });

  describe("Pairing Validation", () => {
    it("Validates happy case", () => {
      const isValid = isValidPairUri("wc:auth-foo@2?relay-protocol=iridium&symKey=key");
      expect(isValid).to.eql(true);
    });
    it("Validates bad case (params)", () => {
      const isValid = isValidPairUri("wc:foo@2?rely-protocol=irn&symkey=key");
      expect(isValid).to.eql(false);
    });
    it("Validates bad case (topic)", () => {
      const isValid = isValidPairUri("wc:?rely-protocol=irn&symKey=key");
      expect(isValid).to.eql(false);
    });
  });

  describe("Respond Validation", () => {
    it("Validates happy case", async () => {
      const id = 1;
      const client = await AuthClient.init({
        logger: "error",
        relayUrl: "ws://0.0.0.0:5555",
        projectId: undefined,
        storageOptions: {
          database: ":memory:",
        },
      });

      await client.requests.set(1, {
        id: 1,
        message: "",
        requester: { publicKey: "" },
        cacaoPayload: {} as any,
      });

      const isValid = isValidRespond({ id, signature: {} as any }, client.requests);
      expect(isValid).to.eql(true);
    });

    it("Validates bad case", async () => {
      const client = await AuthClient.init({
        logger: "error",
        relayUrl: "ws://0.0.0.0:5555",
        projectId: undefined,
        storageOptions: {
          database: ":memory:",
        },
      });

      const isValid = isValidRespond({ id: 2, signature: {} as any }, client.requests);
      expect(isValid).to.eql(false);
    });
  });
});
