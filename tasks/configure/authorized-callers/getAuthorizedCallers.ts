import { task } from "hardhat/config";
import type { HardhatRuntimeEnvironment } from "hardhat/types/hre";
import { isAddress, type Address } from "viem";
import { getConfigByNetworkName } from "../../../helper-config";

/**
 * Reads and prints the authorized callers from an ERC20LockBox or AdvancedPoolHooks contract.
 *
 * Usage:
 *   npx hardhat getAuthorizedCallers --lockbox 0xLockBoxAddress --network sepolia
 *   npx hardhat getAuthorizedCallers --poolhooks 0xPoolHooksAddress --network sepolia
 */
export const getAuthorizedCallers = task(
  "getAuthorizedCallers",
  "Reads the authorized callers from an ERC20LockBox or AdvancedPoolHooks contract"
)
  .addOption({
    name: "lockbox",
    description: "ERC20LockBox address",
    defaultValue: "",
  })
  .addOption({
    name: "poolhooks",
    description: "AdvancedPoolHooks address",
    defaultValue: "",
  })
  .setAction(async () => ({
    default: async (
      { lockbox, poolhooks }: { lockbox: string; poolhooks: string },
      hre: HardhatRuntimeEnvironment
    ) => {
      if (!lockbox && !poolhooks)
        throw new Error("--lockbox or --poolhooks is required");
      if (lockbox && poolhooks)
        throw new Error(
          "Only one of --lockbox or --poolhooks can be specified"
        );

      const contractAddress = (lockbox || poolhooks) as Address;
      if (!isAddress(contractAddress))
        throw new Error(`Invalid address: ${contractAddress}`);

      const label = lockbox ? "LockBox" : "Pool Hooks";

      const networkConnection = await hre.network.getOrCreate();
      const { viem } = networkConnection;
      const networkName = networkConnection.networkName;
      const { chainName, explorerUrl } = getConfigByNetworkName(networkName);

      console.log("");
      console.log("========================================");
      console.log("🔎 Get Authorized Callers");
      console.log("========================================");
      console.log(`Chain:        ${chainName}`);
      console.log(`${(label + ":").padEnd(14)}${contractAddress}`);
      console.log(`Action:       View authorized callers`);
      console.log("========================================");
      console.log("");

      const contract = await viem.getContractAt(
        "AuthorizedCallers",
        contractAddress
      );
      const callers =
        (await contract.read.getAllAuthorizedCallers()) as Address[];

      console.log(`Authorized Callers count: ${callers.length}`);
      callers.forEach((c, i) => console.log(`  [${i}] ${c}`));

      console.log("");
      console.log("========================================");
      console.log(
        `${(label + ":").padEnd(14)}${explorerUrl}/address/${contractAddress}`
      );
      console.log("========================================");
      console.log("");
    },
  }))
  .build();
