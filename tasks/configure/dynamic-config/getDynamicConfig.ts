import { task } from "hardhat/config";
import type { HardhatRuntimeEnvironment } from "hardhat/types/hre";
import { isAddress, type Address } from "viem";
import {
  getConfigByNetworkName,
  getDeployedTokenPool,
} from "../../../helper-config";

/**
 * Reads and displays the dynamic configuration of a TokenPool (router, rateLimitAdmin, feeAdmin).
 *
 * Usage:
 *   npx hardhat getDynamicConfig --network sepolia
 *   npx hardhat getDynamicConfig --tokenpool 0xYourPool --network sepolia
 */
export const getDynamicConfig = task(
  "getDynamicConfig",
  "Reads the dynamic configuration of a TokenPool (router, rateLimitAdmin, feeAdmin)"
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
      const sourceConfig = getConfigByNetworkName(networkName);
      const { chainName, explorerUrl, chainId } = sourceConfig;

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
      console.log("⚙️  Get Dynamic Config");
      console.log("========================================");
      console.log(`Chain:        ${chainName}`);
      console.log(`Token Pool:   ${poolAddress}`);
      console.log(`Action:       View dynamic config`);
      console.log("========================================");
      console.log("");

      const poolContract = await viem.getContractAt(
        "BurnMintTokenPool",
        poolAddress
      );

      const [router, rateLimitAdmin, feeAdmin] =
        (await poolContract.read.getDynamicConfig()) as [
          Address,
          Address,
          Address
        ];

      console.log("Dynamic Configuration:");
      console.log(`  Router:           ${router}`);
      console.log(`  Rate Limit Admin: ${rateLimitAdmin}`);
      console.log(`  Fee Admin:        ${feeAdmin}`);

      console.log("");
      console.log("========================================");
      console.log(`Token Pool:   ${explorerUrl}/address/${poolAddress}`);
      console.log("========================================");
      console.log("");
    },
  }))
  .build();
