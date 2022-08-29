import { AuthEngineTypes, IAuthClient } from "../types";

export function getPendingRequests(store: IAuthClient["requests"]) {
  return store.getAll().filter((request) => "requester" in request) as ({
    id: number;
  } & AuthEngineTypes.PendingRequest)[];
}

export function getCompleteRequests(store: IAuthClient["requests"]) {
  return store.getAll().filter((request) => !("requester" in request)) as ({
    id: number;
  } & AuthEngineTypes.Cacao)[];
}

export function getPendingRequest(store: IAuthClient["requests"], id: number) {
  return getPendingRequests(store).find(
    (request) => request.id === id,
  ) as AuthEngineTypes.PendingRequest;
}

export function getCompleteResponse(store: IAuthClient["requests"], id: number) {
  return getCompleteRequests(store).find((request) => request.id === id) as AuthEngineTypes.Cacao;
}
