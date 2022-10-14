export function getDidAddressSegments(iss: string) {
  return iss?.split(":");
}

export function getDidChainId(iss: string) {
  const segments = iss && getDidAddressSegments(iss);
  if (segments) {
    return segments[3];
  }
  return undefined;
}

export function getNamespacedDidChainId(iss: string) {
  const segments = iss && getDidAddressSegments(iss);
  if (segments) {
    return segments[2] + ":" + segments[3];
  }
  return undefined;
}

export function getDidAddress(iss: string) {
  const segments = iss && getDidAddressSegments(iss);
  if (segments) {
    return segments.pop();
  }
  return undefined;
}
