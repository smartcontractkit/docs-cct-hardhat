import { task } from "hardhat/config";
import type { HardhatRuntimeEnvironment } from "hardhat/types/hre";
import { isAddress, type Address } from "viem";
import { getConfigByNetworkName } from "../../../helper-config";

/**
 * Checks if an address is allowlisted in an AdvancedPoolHooks contract.
 * Uses checkAllowList() which reverts if the address is not allow-listed.
 *
 * Usage:
 *   npx hardhat isAllowListed --poolhooks 0xHooksAddress --checkaddress 0xAddressToCheck --network sepolia
 */
export const isAllowListed = task(
  "isAllowListed",
  "Checks if an address is allowlisted in an AdvancedPoolHooks contract"
)
  .addOption({
    name: "poolhooks",
    description: "AdvancedPoolHooks contract address",
    defaultValue: "",
  })
  .addOption({
    name: "checkaddress",
    description: "Address to check against the allowlist",
    defaultValue: "",
  })
  .setAction(async () => ({
    default: async (
      { poolhooks, checkaddress }: { poolhooks: string; checkaddress: string },
      hre: HardhatRuntimeEnvironment
    ) => {
      if (!poolhooks) throw new Error("--poolhooks is required");
      if (!isAddress(poolhooks))
        throw new Error(`Invalid pool hooks address: ${poolhooks}`);
      if (!checkaddress) throw new Error("--checkaddress is required");
      if (!isAddress(checkaddress))
        throw new Error(`Invalid check address: ${checkaddress}`);

      const hooksAddress = poolhooks as Address;
      const checkAddress = checkaddress as Address;

      const networkConnection = await hre.network.getOrCreate();
      const { viem } = networkConnection;
      const networkName = networkConnection.networkName;
      const { chainName, explorerUrl } = getConfigByNetworkName(networkName);

      console.log("");
      console.log("========================================");
      console.log("🔎 Is AllowListed?");
      console.log("========================================");
      console.log(`Chain:         ${chainName}`);
      console.log(`Pool Hooks:    ${hooksAddress}`);
      console.log(`Check Address: ${checkAddress}`);
      console.log(`Action:        Check allowlist`);
      console.log("========================================");
      console.log("");

      const hooksContract = await viem.getContractAt(
        "AdvancedPoolHooks",
        hooksAddress
      );

      let listed = false;
      try {
        await hooksContract.read.checkAllowList([checkAddress]);
        listed = true;
      } catch {
        listed = false;
      }

      if (listed) {
        console.log("✅ Address IS allowlisted.");
      } else {
        console.log("❌ Address is NOT allowlisted.");
      }

      console.log("========================================");
      console.log(`Pool Hooks:   ${explorerUrl}/address/${hooksAddress}`);
      console.log("========================================");
      console.log("");
    },
  }))
  .build();
