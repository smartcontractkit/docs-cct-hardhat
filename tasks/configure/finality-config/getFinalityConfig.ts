import { task } from "hardhat/config";
import type { HardhatRuntimeEnvironment } from "hardhat/types/hre";
import { isAddress, type Address } from "viem";
import {
  getConfigByNetworkName,
  getDeployedTokenPool,
} from "../../../helper-config";
import {
  decodeModeLabel,
  logFinalityConfig,
} from "../../../utils/finalityConfigUtils";

/**
 * Reads and displays the allowed finality configuration on a TokenPool.
 * Only available on TokenPool v2.0 and later.
 *
 * Encoded as a bytes4 value per the FinalityCodec library:
 *   0x00000000  — WAIT_FOR_FINALITY (default): full finality required; fast finality transfers disabled.
 *   0x00010000  — WAIT_FOR_SAFE: fast finality transfers wait for the `safe` head.
 *   0x0000NNNN  — BLOCK_DEPTH(N): fast finality transfers wait for N block confirmations (1–65535).
 *
 * Usage:
 *   npx hardhat getFinalityConfig --network sepolia
 *   npx hardhat getFinalityConfig --tokenpool 0xYourPool --network sepolia
 */
export const getFinalityConfig = task(
  "getFinalityConfig",
  "Reads the allowed finality configuration on a TokenPool (v2+ only)"
)
  .addOption({
    name: "tokenpool",
    description: "Token pool address (overrides env var)",
    defaultValue: "",
  })
  .setAction(async () => ({
    default: async (
      { tokenpool }: { tokenpool: string },
      hre: HardhatRuntimeEnvironment
    ) => {
      const networkConnection = await hre.network.getOrCreate();
      const { viem } = networkConnection;
      const networkName = networkConnection.networkName;
      const networkConfig = getConfigByNetworkName(networkName);
      const { chainName, explorerUrl } = networkConfig;

      let poolAddress: Address;
      if (tokenpool) {
        if (!isAddress(tokenpool))
          throw new Error(`Invalid pool address: ${tokenpool}`);
        poolAddress = tokenpool;
      } else {
        poolAddress = getDeployedTokenPool(networkConfig.chainId) as Address;
      }

      console.log("");
      console.log("========================================");
      console.log("⏱️  Get Finality Config");
      console.log("========================================");
      console.log(`Chain:        ${chainName}`);
      console.log(`Token Pool:   ${poolAddress}`);
      console.log(`Action:       View finality config`);
      console.log("========================================");
      console.log("");

      const poolContract = await viem.getContractAt(
        "BurnMintTokenPool",
        poolAddress
      );

      try {
        const allowedFinality =
          (await poolContract.read.getAllowedFinalityConfig()) as `0x${string}`;
        logFinalityConfig(allowedFinality);
      } catch (err) {
        console.log(
          "❌ Error: getAllowedFinalityConfig() reverted. Pool may be v1 (requires TokenPool v2.0+)."
        );
        if (err instanceof Error) console.log(`  ${err.message}`);
      }

      console.log("");
      console.log("========================================");
      console.log(`Token Pool:   ${explorerUrl}/address/${poolAddress}`);
      console.log("========================================");
      console.log("");
    },
  }))
  .build();
