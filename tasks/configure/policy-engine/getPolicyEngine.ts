import { task } from "hardhat/config";
import type { HardhatRuntimeEnvironment } from "hardhat/types/hre";
import { isAddress, zeroAddress, type Address } from "viem";
import { getConfigByNetworkName } from "../../../helper-config";

/**
 * Reads and displays the ACE Policy Engine address set on an
 * AdvancedPoolHooks contract.
 *
 * Usage:
 *   npx hardhat getPolicyEngine --poolhooks 0xHooksAddress --network sepolia
 */
export const getPolicyEngine = task(
  "getPolicyEngine",
  "Reads the ACE Policy Engine set on an AdvancedPoolHooks contract"
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
      console.log("🔎 Get Policy Engine");
      console.log("========================================");
      console.log(`Chain:        ${chainName}`);
      console.log(`Pool Hooks:   ${hooksAddress}`);
      console.log(`Action:       View policy engine`);
      console.log("========================================");
      console.log("");

      const hooksContract = await viem.getContractAt(
        "AdvancedPoolHooks",
        hooksAddress
      );
      const policyEngine = (await hooksContract.read.getPolicyEngine()) as Address;

      if (!policyEngine || policyEngine === zeroAddress) {
        console.log("No policy engine is set on these hooks.");
        console.log(
          "   Policy checks are disabled: preflightCheck/postflightCheck skip the engine."
        );
        console.log(
          "   Set one with: npx hardhat setPolicyEngine --poolhooks <address> --policyengine <address>"
        );
      } else {
        console.log("✅ Policy Engine:");
        console.log(`   ${policyEngine}`);
      }

      console.log("");
      console.log("========================================");
      console.log(`Pool Hooks:   ${explorerUrl}/address/${hooksAddress}`);
      console.log("========================================");
      console.log("");
    },
  }))
  .build();
