import {
  BLOCK_DEPTH_BITS,
  BLOCK_DEPTH_MASK,
  WAIT_FOR_FINALITY_FLAG,
  WAIT_FOR_SAFE_FLAG,
} from "./finalityCodecConstants";

/**
 * Returns a human-readable label for a bytes4 finality config value.
 * Mirrors FinalityConfigUtils.decodeModeLabel() from the Foundry project.
 */
export function decodeModeLabel(config: `0x${string}`): string {
  const value = parseInt(config.slice(2), 16);
  const depth = value & BLOCK_DEPTH_MASK;
  const flags = (value >>> BLOCK_DEPTH_BITS) & BLOCK_DEPTH_MASK;

  if (value === WAIT_FOR_FINALITY_FLAG)
    return "WAIT_FOR_FINALITY (default -- disables fast finality)";
  if (value === WAIT_FOR_SAFE_FLAG) return "WAIT_FOR_SAFE";
  if (depth > 0 && flags === 0) return `BLOCK_DEPTH (${depth} blocks)`;
  if (depth > 0 && flags === WAIT_FOR_SAFE_FLAG >>> BLOCK_DEPTH_BITS)
    return `WAIT_FOR_SAFE + BLOCK_DEPTH (${depth} blocks)`;
  return "Custom / Reserved flags";
}

/**
 * Logs a bytes4 finality config value with its raw encoding, mode label, and description.
 * Mirrors FinalityConfigUtils.logFinalityConfig() from the Foundry project.
 */
export function logFinalityConfig(config: `0x${string}`): void {
  const value = parseInt(config.slice(2), 16);
  const depth = value & BLOCK_DEPTH_MASK;
  const flags = (value >>> BLOCK_DEPTH_BITS) & BLOCK_DEPTH_MASK;

  console.log(`Allowed Finality Config (raw): ${config}`);
  console.log("");

  if (value === WAIT_FOR_FINALITY_FLAG) {
    console.log("Mode: WAIT_FOR_FINALITY (default)");
    console.log(
      "  Full finality is required. Fast finality transfers are disabled."
    );
  } else if (value === WAIT_FOR_SAFE_FLAG) {
    console.log("Mode: WAIT_FOR_SAFE");
    console.log("  Fast finality transfers wait for the `safe` head.");
  } else if (depth > 0 && flags === 0) {
    console.log(`Mode: BLOCK_DEPTH (${depth} blocks)`);
    console.log(
      "  Fast finality transfers wait for the configured number of block confirmations."
    );
  } else if (depth > 0 && flags === WAIT_FOR_SAFE_FLAG >>> BLOCK_DEPTH_BITS) {
    console.log(`Mode: WAIT_FOR_SAFE + BLOCK_DEPTH (${depth} blocks)`);
    console.log(
      "  The pool accepts either the `safe` head or the configured block depth."
    );
  } else {
    console.log("Mode: Custom / Reserved flags");
    console.log("  See the FinalityCodec library for encoding details.");
  }
}
