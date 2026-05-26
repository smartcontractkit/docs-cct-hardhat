// Shared helpers for encoding CCIP ExtraArgs.

import { encodePacked } from "viem";

// bytes4(keccak256("CCIP EVMExtraArgsV3"))
const GENERIC_EXTRA_ARGS_V3_TAG = "0xa69dd4aa" as `0x${string}`;

/**
 * Encodes GenericExtraArgsV3 with only gasLimit and blockDepth set (all other fields zeroed).
 * Layout: tag(4) + gasLimit(4) + blockDepth(2) + zeros(7) = 17 bytes
 *
 * @param gasLimit    Gas limit for the callback on the destination chain (0 for token-only transfers).
 * @param blockDepth  Block depth for fast finality (0 = default finality, uses WAIT_FOR_FINALITY).
 */
export function buildExtraArgs(
  gasLimit: number,
  blockDepth: number
): `0x${string}` {
  return encodePacked(
    ["bytes4", "uint32", "uint16", "bytes7"],
    [GENERIC_EXTRA_ARGS_V3_TAG, gasLimit, blockDepth, "0x00000000000000"]
  );
}
