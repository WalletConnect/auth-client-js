import { ICore } from "@walletconnect/types";

export async function disconnectSocket(core: ICore) {
  // wait a bit for all ACK requests to be processed
  await new Promise<void>((resolve) => setTimeout(resolve, 1000));
  await core.relayer.transportClose();
}
