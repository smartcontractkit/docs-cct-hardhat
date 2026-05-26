import { task } from "hardhat/config";
import type { HardhatRuntimeEnvironment } from "hardhat/types/hre";
import { isAddress, zeroAddress, type Address } from "viem";
import {
  getConfigByNetworkName,
  getDeployedTokenPool,
} from "../../../helper-config";

/**
 * Reads and displays the AdvancedPoolHooks contract attached to a token pool.
 * Only available on TokenPool v2.0 and later.
 *
 * Usage:
 *   npx hardhat getAdvancedPoolHooks --network sepolia
 *   npx hardhat getAdvancedPoolHooks --tokenpool 0xPoolAddress --network sepolia
 */
export const getAdvancedPoolHooks = task(
  "getAdvancedPoolHooks",
  "Reads the AdvancedPoolHooks contract attached to a token pool (v2+ only)"
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
      const { chainName, explorerUrl, chainId } =
        getConfigByNetworkName(networkName);

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
      console.log("🪝 Get Advanced Pool Hooks");
      console.log("========================================");
      console.log(`Chain:        ${chainName}`);
      console.log(`Token Pool:   ${poolAddress}`);
      console.log(`Action:       View pool hooks`);
      console.log("========================================");
      console.log("");

      const poolContract = await viem.getContractAt(
        "BurnMintTokenPool",
        poolAddress
      );

      try {
        const hooksAddress =
          (await poolContract.read.getAdvancedPoolHooks()) as Address;
        if (!hooksAddress || hooksAddress === zeroAddress) {
          console.log(
            "No AdvancedPoolHooks contract is attached to this pool."
          );
          console.log(
            "   Deploy one with:  npx hardhat deployAdvancedPoolHooks"
          );
          console.log(
            "   Attach it with:   npx hardhat updateAdvancedPoolHooks --newhook <address>"
          );
        } else {
          console.log("✅ AdvancedPoolHooks:");
          console.log(`   ${hooksAddress}`);
        }
      } catch (err) {
        console.log("❌ Error: getAdvancedPoolHooks() reverted.");
        if (err instanceof Error) console.log(`   ${err.message}`);
        console.log(
          "   The pool may be v1 — this function requires TokenPool v2.0+."
        );
      }

      console.log("");
      console.log("========================================");
      console.log(`Token Pool:   ${explorerUrl}/address/${poolAddress}`);
      console.log("========================================");
      console.log("");
    },
  }))
  .build();
