import { task } from "hardhat/config";
import type { HardhatRuntimeEnvironment } from "hardhat/types/hre";
import { isAddress, type Address } from "viem";
import {
  getConfigByNetworkName,
  getDeployedTokenPool,
} from "../../../helper-config";

/**
 * Updates the allowlist on an AdvancedPoolHooks contract (v2+) or a TokenPool v1 directly.
 *
 * If --poolhooks is provided, applyAllowListUpdates() is called on the AdvancedPoolHooks contract.
 * Otherwise, applyAllowListUpdates() is called directly on the token pool (v1 pools only).
 * For v2+ pools without --poolhooks, the call will fail with guidance on deploying hooks.
 *
 * Usage:
 *   npx hardhat updateAllowList --poolhooks 0xHooksAddress --add "0xA,0xB" --network sepolia
 *   npx hardhat updateAllowList --poolhooks 0xHooksAddress --remove "0xA" --network sepolia
 *   npx hardhat updateAllowList --add "0xA" --remove "0xB" --network sepolia
 */
export const updateAllowList = task(
  "updateAllowList",
  "Updates the allowlist on an AdvancedPoolHooks contract or TokenPool v1"
)
  .addOption({
    name: "tokenpool",
    description:
      "Token pool address (overrides env var, used as v1 fallback when --poolhooks is not set)",
    defaultValue: "",
  })
  .addOption({
    name: "poolhooks",
    description:
      "AdvancedPoolHooks address — if set, updates on hooks; otherwise updates on pool directly (v1)",
    defaultValue: "",
  })
  .addOption({
    name: "add",
    description: "Comma-separated addresses to add to the allowlist",
    defaultValue: "",
  })
  .addOption({
    name: "remove",
    description: "Comma-separated addresses to remove from the allowlist",
    defaultValue: "",
  })
  .setAction(async () => ({
    default: async (
      {
        tokenpool,
        poolhooks,
        add,
        remove,
      }: { tokenpool: string; poolhooks: string; add: string; remove: string },
      hre: HardhatRuntimeEnvironment
    ) => {
      if (!add && !remove)
        throw new Error("At least one of --add or --remove is required");

      const networkConnection = await hre.network.getOrCreate();
      const { viem } = networkConnection;
      const networkName = networkConnection.networkName;
      const { confirmations, chainName, explorerUrl, chainId } =
        getConfigByNetworkName(networkName);

      let poolAddress: Address;
      if (tokenpool) {
        if (!isAddress(tokenpool))
          throw new Error(`Invalid pool address: ${tokenpool}`);
        poolAddress = tokenpool;
      } else {
        poolAddress = getDeployedTokenPool(chainId) as Address;
      }

      let hooksAddress: Address | undefined;
      if (poolhooks) {
        if (!isAddress(poolhooks))
          throw new Error(`Invalid pool hooks address: ${poolhooks}`);
        hooksAddress = poolhooks as Address;
      }

      function parseAddressList(csv: string): Address[] {
        return csv
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .map((addr) => {
            if (!isAddress(addr)) throw new Error(`Invalid address: ${addr}`);
            return addr as Address;
          });
      }

      const adds: Address[] = add ? parseAddressList(add) : [];
      const removes: Address[] = remove ? parseAddressList(remove) : [];

      const [wallet] = await viem.getWalletClients();

      console.log("");
      console.log("========================================");
      console.log("📝 Update AllowList");
      console.log("========================================");
      console.log(`Chain:        ${chainName}`);
      console.log(`Token Pool:   ${poolAddress}`);
      if (hooksAddress) console.log(`Pool Hooks:   ${hooksAddress}`);
      console.log(`Action:       Update allowlist`);
      console.log("========================================");
      console.log("");

      const publicClient = await viem.getPublicClient();

      console.log(`[Step 1] Updating allowlist on ${chainName}`);

      if (hooksAddress) {
        // v2 path — call on AdvancedPoolHooks
        const hooksContract = await viem.getContractAt(
          "AdvancedPoolHooks",
          hooksAddress
        );
        try {
          const txHash = await hooksContract.write.applyAllowListUpdates(
            [removes, adds],
            { account: wallet.account }
          );
          console.log(`⏳ Tx: ${explorerUrl}/tx/${txHash}`);
          await publicClient.waitForTransactionReceipt({
            hash: txHash,
            confirmations,
          });
          console.log("✅ AllowList updated successfully!");
        } catch (err) {
          console.log(
            "❌ Error: applyAllowListUpdates() reverted on AdvancedPoolHooks."
          );
          if (err instanceof Error) {
            console.log(`   ${err.message}`);
            if (err.message.includes("OnlyCallableByOwner")) {
              console.log(
                "   Ensure the wallet sending the transaction is the hooks contract owner."
              );
            }
          }
          throw err;
        }
      } else {
        // v1 path — call directly on TokenPool
        const v1Abi = [
          {
            name: "applyAllowListUpdates",
            type: "function",
            inputs: [
              { name: "removes", type: "address[]" },
              { name: "adds", type: "address[]" },
            ],
            outputs: [],
            stateMutability: "nonpayable",
          },
        ] as const;

        try {
          const txHash = await wallet.writeContract({
            address: poolAddress,
            abi: v1Abi,
            functionName: "applyAllowListUpdates",
            args: [removes, adds],
          });
          console.log(`⏳ Tx: ${explorerUrl}/tx/${txHash}`);
          await publicClient.waitForTransactionReceipt({
            hash: txHash,
            confirmations,
          });
          console.log("✅ AllowList updated successfully!");
        } catch (err) {
          console.log(
            "❌ Error: applyAllowListUpdates() reverted on TokenPool."
          );
          if (err instanceof Error) console.log(`   ${err.message}`);
          console.log(
            "   If the function is missing, the pool may be v2.0+ which requires AdvancedPoolHooks."
          );
          console.log(
            "   Deploy one with:  npx hardhat deployAdvancedPoolHooks"
          );
          console.log(
            "   Attach it with:   npx hardhat updateAdvancedPoolHooks --newhook <address>"
          );
          console.log(
            '   Then retry with:  npx hardhat updateAllowList --poolhooks <address> --add "..."'
          );
          throw err;
        }
      }

      console.log("");
      console.log("========================================");
      console.log(`✅ Allowlist updated on ${chainName}!`);
      console.log("========================================");
      console.log(`Token Pool:   ${explorerUrl}/address/${poolAddress}`);
      if (hooksAddress)
        console.log(`Pool Hooks:   ${explorerUrl}/address/${hooksAddress}`);
      console.log("========================================");
      console.log("");
    },
  }))
  .build();
