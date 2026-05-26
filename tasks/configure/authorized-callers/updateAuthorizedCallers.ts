import { task } from "hardhat/config";
import type { HardhatRuntimeEnvironment } from "hardhat/types/hre";
import { isAddress, type Address } from "viem";
import { getConfigByNetworkName } from "../../../helper-config";

/**
 * Adds or removes authorized callers on an ERC20LockBox or AdvancedPoolHooks contract.
 * At least one of --add or --remove must be provided.
 *
 * Usage:
 *   npx hardhat updateAuthorizedCallers --lockbox 0xLockBox --add 0xPool --network sepolia
 *   npx hardhat updateAuthorizedCallers --poolhooks 0xHooks --add 0xA,0xB --remove 0xC --network sepolia
 *   npx hardhat updateAuthorizedCallers --lockbox 0xLockBox --remove 0xOldPool --network sepolia
 */
export const updateAuthorizedCallers = task(
  "updateAuthorizedCallers",
  "Adds or removes authorized callers on an ERC20LockBox or AdvancedPoolHooks contract"
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
  .addOption({
    name: "add",
    description: "Comma-separated addresses to add as authorized callers",
    defaultValue: "",
  })
  .addOption({
    name: "remove",
    description: "Comma-separated addresses to remove from authorized callers",
    defaultValue: "",
  })
  .setAction(async () => ({
    default: async (
      {
        lockbox,
        poolhooks,
        add,
        remove,
      }: {
        lockbox: string;
        poolhooks: string;
        add: string;
        remove: string;
      },
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

      const parseAddresses = (csv: string, flag: string): Address[] =>
        csv
          ? csv
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
              .map((s) => {
                if (!isAddress(s))
                  throw new Error(`Invalid address in ${flag}: ${s}`);
                return s as Address;
              })
          : [];

      const addCallers = parseAddresses(add, "--add");
      const removeCallers = parseAddresses(remove, "--remove");

      if (addCallers.length === 0 && removeCallers.length === 0)
        throw new Error("At least one of --add or --remove must be provided");

      const label = lockbox ? "LockBox" : "Pool Hooks";

      const networkConnection = await hre.network.getOrCreate();
      const { viem } = networkConnection;
      const networkName = networkConnection.networkName;
      const { chainName, explorerUrl, confirmations } =
        getConfigByNetworkName(networkName);

      console.log("");
      console.log("========================================");
      console.log("📝 Update Authorized Callers");
      console.log("========================================");
      console.log(`Chain:        ${chainName}`);
      console.log(`${(label + ":").padEnd(14)}${contractAddress}`);
      console.log(`Action:       Update authorized callers`);
      console.log("========================================");
      console.log("");

      if (addCallers.length > 0) {
        console.log(`Adding ${addCallers.length} caller(s):`);
        addCallers.forEach((c, i) => console.log(`  [${i}] ${c}`));
      }
      if (removeCallers.length > 0) {
        console.log(`Removing ${removeCallers.length} caller(s):`);
        removeCallers.forEach((c, i) => console.log(`  [${i}] ${c}`));
      }
      console.log("");

      const publicClient = await viem.getPublicClient();
      const [wallet] = await viem.getWalletClients();

      console.log(
        `[Step 1] Applying authorized caller updates on ${chainName}`
      );
      const contract = await viem.getContractAt(
        "AuthorizedCallers",
        contractAddress
      );
      const txHash = await contract.write.applyAuthorizedCallerUpdates(
        [{ addedCallers: addCallers, removedCallers: removeCallers }],
        { account: wallet.account }
      );
      console.log(`⏳ Tx: ${explorerUrl}/tx/${txHash}`);
      await publicClient.waitForTransactionReceipt({
        hash: txHash,
        confirmations,
      });

      console.log("");
      console.log("========================================");
      console.log(`✅ Authorized callers updated on ${chainName}!`);
      console.log("========================================");
      console.log(
        `${(label + ":").padEnd(14)}${explorerUrl}/address/${contractAddress}`
      );
      console.log(`Transaction:  ${explorerUrl}/tx/${txHash}`);
      console.log("========================================");
      console.log("");
    },
  }))
  .build();
