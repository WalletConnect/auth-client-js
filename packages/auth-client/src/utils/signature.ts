import { JsonRpcProvider, Provider } from "@ethersproject/providers";
import { hashMessage } from "@ethersproject/hash";
import { recoverAddress } from "@ethersproject/transactions";
import { Contract } from "@ethersproject/contracts";
import { arrayify } from "@ethersproject/bytes";

import { AuthEngineTypes } from "../types";
import { DEFAULT_RPC_URL } from "../constants/defaults";

export async function verifySignature(
  address: string,
  reconstructedMessage: string,
  cacaoSignature: AuthEngineTypes.CacaoSignature,
  chainId: string,
  projectId: string,
): Promise<boolean> {
  // Determine if this address is an EOA or a contract.

  switch (cacaoSignature.t) {
    case "eip191":
      return isValidEip191Signature(address, reconstructedMessage, cacaoSignature.s);
    case "eip1271":
      return await isValidEip1271Signature(
        address,
        reconstructedMessage,
        cacaoSignature.s,
        new JsonRpcProvider(`${DEFAULT_RPC_URL}/?chainId=${chainId}&projectId=${projectId}`),
      );
    default:
      throw new Error(
        `verifySignature failed: Attempted to verify CacaoSignature with unknown type: ${cacaoSignature.t}`,
      );
  }
}

function isValidEip191Signature(address: string, message: string, signature: string): boolean {
  const recoveredAddress = recoverAddress(hashMessage(message), signature);
  console.log("Recovered address from EIP-191 signature:", address);
  return recoveredAddress.toLowerCase() === address.toLowerCase();
}

async function isValidEip1271Signature(
  address: string,
  reconstructedMessage: string,
  signature: string,
  provider: Provider,
  abi = eip1271.abi,
  magicValue = eip1271.magicValue,
): Promise<boolean> {
  try {
    const recoveredValue = await new Contract(address, abi, provider).isValidSignature(
      arrayify(hashMessage(reconstructedMessage)),
      signature,
    );
    console.log("Recovered magic value from EIP-1271 signature:", recoveredValue);
    return recoveredValue.toLowerCase() === magicValue.toLowerCase();
  } catch (e) {
    return false;
  }
}

const eip1271 = {
  magicValue: "0x1626ba7e",
  abi: [
    {
      constant: true,
      inputs: [
        {
          name: "_hash",
          type: "bytes32",
        },
        {
          name: "_sig",
          type: "bytes",
        },
      ],
      name: "isValidSignature",
      outputs: [
        {
          name: "magicValue",
          type: "bytes4",
        },
      ],
      payable: false,
      stateMutability: "view",
      type: "function",
    },
  ],
};
