import { task } from "hardhat/config";
import type { HardhatRuntimeEnvironment } from "hardhat/types/hre";
import { isAddress, type Address } from "viem";
import {
  getConfigByNetworkName,
  getDeployedTokenPool,
} from "../../../helper-config";

/**
 * Reads and displays the token transfer fee configuration for a pool on a given destination lane.
 * Only available on TokenPool v2.0 and later.
 *
 * Usage:
 *   npx hardhat getTokenTransferFeeConfig --destchain fuji --network sepolia
 *   npx hardhat getTokenTransferFeeConfig --destchain fuji --tokenpool 0xYourPool --network sepolia
 */
export const getTokenTransferFeeConfig = task(
  "getTokenTransferFeeConfig",
  "Reads the token transfer fee config for a pool on a given destination lane (v2+ only)"
)
  .addOption({
    name: "destchain",
    description:
      "Destination chain name (e.g. MANTLE_SEPOLIA or mantleSepolia)",
    defaultValue: "",
  })
  .addOption({
    name: "tokenpool",
    description: "Token pool address (overrides env var)",
    defaultValue: "",
  })
  .setAction(async () => ({
    default: async (
      { destchain, tokenpool }: { destchain: string; tokenpool: string },
      hre: HardhatRuntimeEnvironment
    ) => {
      if (!destchain)
        throw new Error("--destchain is required (e.g. --destchain fuji)");

      const networkConnection = await hre.network.getOrCreate();
      const { viem } = networkConnection;
      const networkName = networkConnection.networkName;
      const sourceConfig = getConfigByNetworkName(networkName);
      const destConfig = getConfigByNetworkName(destchain);
      const { chainName, explorerUrl, chainId } = sourceConfig;
      const destChainSelector = BigInt(destConfig.chainSelector);

      let poolAddress: Address;
      if (tokenpool) {
        if (!isAddress(tokenpool))
          throw new Error(`Invalid pool address: ${tokenpool}`);
        poolAddress = tokenpool;
      } else {
        poolAddress = getDeployedTokenPool(chainId) as Address;
      }

      console.log("");
      console.log("========================================");
      console.log("💰 Get Token Transfer Fee Config");
      console.log("========================================");
      console.log(`Chain:        ${chainName}`);
      console.log(`Remote Chain: ${destConfig.chainName}`);
      console.log(`Token Pool:   ${poolAddress}`);
      console.log(`Action:       View fee config`);
      console.log("========================================");
      console.log("");
      console.log(`Dest Chain Selector: ${destChainSelector}`);
      console.log("");

      const poolContract = await viem.getContractAt(
        "BurnMintTokenPool",
        poolAddress
      );

      try {
        const feeConfig = (await poolContract.read.getTokenTransferFeeConfig([
          "0x0000000000000000000000000000000000000000",
          destChainSelector,
          "0x00000000",
          "0x",
        ])) as {
          destGasOverhead: number;
          destBytesOverhead: number;
          finalityFeeUSDCents: number;
          fastFinalityFeeUSDCents: number;
          finalityTransferFeeBps: number;
          fastFinalityTransferFeeBps: number;
          isEnabled: boolean;
        };

        console.log("Fee Configuration:");
        console.log(`  isEnabled:                   ${feeConfig.isEnabled}`);
        console.log(
          `  destGasOverhead:             ${feeConfig.destGasOverhead}`
        );
        console.log(
          `  destBytesOverhead:           ${feeConfig.destBytesOverhead}`
        );
        console.log(
          `  finalityFeeUSDCents:         ${feeConfig.finalityFeeUSDCents}`
        );
        console.log(
          `  fastFinalityFeeUSDCents:     ${feeConfig.fastFinalityFeeUSDCents}`
        );
        console.log(
          `  finalityTransferFeeBps:      ${feeConfig.finalityTransferFeeBps}`
        );
        console.log(
          `  fastFinalityTransferFeeBps:  ${feeConfig.fastFinalityTransferFeeBps}`
        );

        if (!feeConfig.isEnabled) {
          console.log("");
          console.log("⚠️  Fee config is disabled for this lane.");
          console.log(
            "   The OnRamp will fall back to FeeQuoter defaults for this destination."
          );
        }
      } catch (err) {
        console.log(
          "❌ Error: getTokenTransferFeeConfig() reverted. Pool may be v1 (requires TokenPool v2.0+)."
        );
        if (err instanceof Error) console.log(`   ${err.message}`);
      }

      console.log("");
      console.log("========================================");
      console.log(`Token Pool:   ${explorerUrl}/address/${poolAddress}`);
      console.log("========================================");
      console.log("");
    },
  }))
  .build();
