import { task } from "hardhat/config";
import type { HardhatRuntimeEnvironment } from "hardhat/types/hre";
import { isAddress, type Address } from "viem";
import {
  getConfigByNetworkName,
  getDeployedTokenPool,
} from "../../../helper-config";

/**
 * Updates the AdvancedPoolHooks contract attached to a token pool.
 * Only available on TokenPool v2.0 and later. Callable only by the pool owner.
 *
 * Usage:
 *   npx hardhat updateAdvancedPoolHooks --newhook 0xHooksAddress --network sepolia
 *   npx hardhat updateAdvancedPoolHooks --newhook 0xHooksAddress --tokenpool 0xPoolAddress --network sepolia
 */
export const updateAdvancedPoolHooks = task(
  "updateAdvancedPoolHooks",
  "Updates the AdvancedPoolHooks contract attached to a token pool (v2+ only)"
)
  .addOption({
    name: "tokenpool",
    description: "Token pool address (overrides env var)",
    defaultValue: "",
  })
  .addOption({
    name: "newhook",
    description: "New AdvancedPoolHooks contract address",
    defaultValue: "",
  })
  .setAction(async () => ({
    default: async (
      { tokenpool, newhook }: { tokenpool: string; newhook: string },
      hre: HardhatRuntimeEnvironment
    ) => {
      if (!newhook) throw new Error("--newhook is required");
      if (!isAddress(newhook))
        throw new Error(`Invalid hooks address: ${newhook}`);

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

      const newHookAddress = newhook as Address;
      const [wallet] = await viem.getWalletClients();

      console.log("");
      console.log("========================================");
      console.log("🔄 Update Advanced Pool Hooks");
      console.log("========================================");
      console.log(`Chain:        ${chainName}`);
      console.log(`Token Pool:   ${poolAddress}`);
      console.log(`Action:       Update pool hooks`);
      console.log("========================================");
      console.log("");
      console.log(`New Pool Hooks: ${newHookAddress}`);
      console.log("");

      const poolContract = await viem.getContractAt(
        "BurnMintTokenPool",
        poolAddress
      );
      const publicClient = await viem.getPublicClient();

      console.log(`[Step 1] Updating AdvancedPoolHooks on ${chainName}`);
      try {
        const txHash = await poolContract.write.updateAdvancedPoolHooks(
          [newHookAddress],
          { account: wallet.account }
        );
        console.log(`⏳ Tx: ${explorerUrl}/tx/${txHash}`);
        await publicClient.waitForTransactionReceipt({
          hash: txHash,
          confirmations,
        });
        console.log("✅ AdvancedPoolHooks updated successfully!");
      } catch (err) {
        console.log("❌ Error: updateAdvancedPoolHooks() reverted.");
        if (err instanceof Error) {
          console.log(`   ${err.message}`);
          if (err.message.includes("OnlyCallableByOwner")) {
            console.log(
              "   Ensure the wallet sending the transaction is the pool owner."
            );
          }
        }
        console.log(
          "   The pool may be v1 — this function requires TokenPool v2.0+."
        );
        throw err;
      }

      console.log("");
      console.log("========================================");
      console.log(`✅ Pool hooks updated on ${chainName}!`);
      console.log("========================================");
      console.log(`Token Pool:     ${explorerUrl}/address/${poolAddress}`);
      console.log(`New Pool Hooks: ${explorerUrl}/address/${newHookAddress}`);
      console.log("========================================");
      console.log("");
    },
  }))
  .build();
