/**
 * TypeScript mirror of the public constants from FinalityCodec.sol.
 *
 * FinalityCodec.sol is compiled as part of this project (see npmFilesToBuild in tasks/index.ts),
 * providing ABI-level access to the library. These constants duplicate the compile-time values so
 * they can be used in TypeScript without an on-chain call.
 *
 * Keep in sync with:
 *   @chainlink/contracts-ccip/contracts/libraries/FinalityCodec.sol
 */

/** Number of bits the block depth occupies (lower 16 bits). Mirrors FinalityCodec.BLOCK_DEPTH_BITS. */
export const BLOCK_DEPTH_BITS = 16;

/** Maximum encodable block depth (0xFFFF = 65535). Mirrors FinalityCodec.MAX_BLOCK_DEPTH. */
export const MAX_BLOCK_DEPTH = 0xffff;

/** Bitmask to extract the lower 16 bits (block depth). Mirrors FinalityCodec.BLOCK_DEPTH_MASK. */
export const BLOCK_DEPTH_MASK = 0xffff;

/** 0x00000000 — wait for full finality (default, disables fast finality). Mirrors FinalityCodec.WAIT_FOR_FINALITY_FLAG. */
export const WAIT_FOR_FINALITY_FLAG = 0x00000000;

/** 0x00010000 — wait for the `safe` head (bit 16 set). Mirrors FinalityCodec.WAIT_FOR_SAFE_FLAG. */
export const WAIT_FOR_SAFE_FLAG = 1 << BLOCK_DEPTH_BITS; // 0x00010000
