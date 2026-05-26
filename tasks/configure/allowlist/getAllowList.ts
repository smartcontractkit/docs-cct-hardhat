import { task } from "hardhat/config";
import type { HardhatRuntimeEnvironment } from "hardhat/types/hre";
import { isAddress, type Address } from "viem";
import { getConfigByNetworkName } from "../../../helper-config";

/**
 * Reads and displays the allowlist from an AdvancedPoolHooks contract.
 *
 * Usage:
 *   npx hardhat getAllowList --poolhooks 0xHooksAddress --network sepolia
 */
export const getAllowList = task(
  "getAllowList",
  "Reads the allowlist from an AdvancedPoolHooks contract"
)
  .addOption({
    name: "poolhooks",
    description: "AdvancedPoolHooks contract address",
    defaultValue: "",
  })
  .setAction(async () => ({
    default: async (
      { poolhooks }: { poolhooks: string },
      hre: HardhatRuntimeEnvironment
    ) => {
      if (!poolhooks) throw new Error("--poolhooks is required");
      if (!isAddress(poolhooks))
        throw new Error(`Invalid pool hooks address: ${poolhooks}`);

      const hooksAddress = poolhooks as Address;

      const networkConnection = await hre.network.getOrCreate();
      const { viem } = networkConnection;
      const networkName = networkConnection.networkName;
      const { chainName, explorerUrl } = getConfigByNetworkName(networkName);

      console.log("");
      console.log("========================================");
      console.log("🔎 Get AllowList");
      console.log("========================================");
      console.log(`Chain:        ${chainName}`);
      console.log(`Pool Hooks:   ${hooksAddress}`);
      console.log(`Action:       View allowlist`);
      console.log("========================================");
      console.log("");

      const hooksContract = await viem.getContractAt(
        "AdvancedPoolHooks",
        hooksAddress
      );
      const allowList = (await hooksContract.read.getAllowList()) as Address[];

      console.log(`AllowList count: ${allowList.length}`);
      for (const addr of allowList) {
        console.log(`  ${addr}`);
      }

      console.log("========================================");
      console.log(`Pool Hooks:   ${explorerUrl}/address/${hooksAddress}`);
      console.log("========================================");
      console.log("");
    },
  }))
  .build();
