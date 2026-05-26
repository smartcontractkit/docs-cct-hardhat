import bs58 from "bs58";
import { isAddress, encodeAbiParameters } from "viem";

export type ChainFamily = "evm" | "svm";

export class InvalidAddressError extends Error {
  constructor(
    public readonly address: string,
    public readonly chainFamily: ChainFamily,
    public readonly reason?: string
  ) {
    super(
      `Invalid ${chainFamily} address: ${address}${
        reason ? ` (${reason})` : ""
      }`
    );
    this.name = "InvalidAddressError";
  }
}

export class UnsupportedChainFamilyError extends Error {
  constructor(public readonly chainFamily: string) {
    super(`Unsupported chain family: ${chainFamily}`);
    this.name = "UnsupportedChainFamilyError";
  }
}

interface ChainAddressHandler {
  validateAddress(address: string): boolean;
  prepareAddressData(address: string): `0x${string}`;
}

class EvmAddressHandler implements ChainAddressHandler {
  validateAddress(address: string): boolean {
    return isAddress(address);
  }

  prepareAddressData(address: string): `0x${string}` {
    if (!this.validateAddress(address)) {
      throw new InvalidAddressError(
        address,
        "evm",
        "Invalid EVM address format"
      );
    }
    return encodeAbiParameters(
      [{ type: "address" }],
      [address as `0x${string}`]
    );
  }
}

class SvmAddressHandler implements ChainAddressHandler {
  validateAddress(address: string): boolean {
    try {
      const decoded = bs58.decode(address);
      return decoded.length === 32;
    } catch {
      return false;
    }
  }

  prepareAddressData(address: string): `0x${string}` {
    if (!this.validateAddress(address)) {
      throw new InvalidAddressError(
        address,
        "svm",
        "Invalid Solana address format"
      );
    }
    const bytes = bs58.decode(address);
    return ("0x" + Buffer.from(bytes).toString("hex")) as `0x${string}`;
  }
}

const chainHandlers: Record<ChainFamily, ChainAddressHandler> = {
  evm: new EvmAddressHandler(),
  svm: new SvmAddressHandler(),
};

function getChainHandler(chainFamily: ChainFamily): ChainAddressHandler {
  const handler = chainHandlers[chainFamily];
  if (!handler) throw new UnsupportedChainFamilyError(chainFamily);
  return handler;
}

export function validateChainAddress(
  address: string,
  chainFamily: ChainFamily
): void {
  const handler = getChainHandler(chainFamily);
  if (!handler.validateAddress(address)) {
    throw new InvalidAddressError(address, chainFamily);
  }
}

export function prepareChainAddressData(
  address: string,
  chainFamily: ChainFamily
): `0x${string}` {
  return getChainHandler(chainFamily).prepareAddressData(address);
}
