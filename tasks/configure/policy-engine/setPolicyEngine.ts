import { task } from "hardhat/config";
import type { HardhatRuntimeEnvironment } from "hardhat/types/hre";
import { isAddress, zeroAddress, type Address } from "viem";
import { getConfigByNetworkName } from "../../../helper-config";

/**
 * Sets the ACE Policy Engine on an AdvancedPoolHooks contract, or disconnects
 * the engine by passing the zero address. Only the hooks owner can call it.
 *
 * The hook calls attach() on the new engine, which starts ACE target detection.
 * When an old engine is set, setPolicyEngine calls detach() on it first and
 * reverts PolicyEngineDetachReverted if that call reverts; the on-chain recovery
 * path for that case is setPolicyEngineAllowFailedDetach on the hook itself.
 *
 * Usage:
 *   npx hardhat setPolicyEngine --poolhooks 0xHooksAddress --policyengine 0xEngineAddress --network sepolia
 *   npx hardhat setPolicyEngine --poolhooks 0xHooksAddress --policyengine 0x0000000000000000000000000000000000000000 --network sepolia
 */
export const setPolicyEngine = task(
  "setPolicyEngine",
  "Sets the ACE Policy Engine on an AdvancedPoolHooks contract (zero address disconnects)"
)
  .addOption({
    name: "poolhooks",
    description: "AdvancedPoolHooks contract address",
    defaultValue: "",
  })
  .addOption({
    name: "policyengine",
    description:
      "ACE Policy Engine address on the same chain, or the zero address to disconnect",
    defaultValue: "",
  })
  .setAction(async () => ({
    default: async (
      { poolhooks, policyengine }: { poolhooks: string; policyengine: string },
      hre: HardhatRuntimeEnvironment
    ) => {
      if (!poolhooks) throw new Error("--poolhooks is required");
      if (!isAddress(poolhooks))
        throw new Error(`Invalid pool hooks address: ${poolhooks}`);
      if (!policyengine) throw new Error("--policyengine is required");
      if (!isAddress(policyengine))
        throw new Error(`Invalid policy engine address: ${policyengine}`);

      const hooksAddress = poolhooks as Address;
      const newEngineAddress = policyengine as Address;

      const networkConnection = await hre.network.getOrCreate();
      const { viem } = networkConnection;
      const networkName = networkConnection.networkName;
      const { confirmations, chainName, explorerUrl } =
        getConfigByNetworkName(networkName);

      const hooksContract = await viem.getContractAt(
        "AdvancedPoolHooks",
        hooksAddress
      );
      const publicClient = await viem.getPublicClient();
      const [wallet] = await viem.getWalletClients();

      const currentEngine = (await hooksContract.read.getPolicyEngine()) as Address;

      if (newEngineAddress === currentEngine) {
        throw new Error(
          `--policyengine equals the current engine (${currentEngine}). setPolicyEngine would be a no-op. Pass a different address.`
        );
      }

      console.log("");
      console.log("========================================");
      console.log("🔗 Set Policy Engine");
      console.log("========================================");
      console.log(`Chain:        ${chainName}`);
      console.log(`Pool Hooks:   ${hooksAddress}`);
      console.log(`Action:       Set policy engine`);
      console.log("========================================");
      console.log("");
      console.log(`Current Policy Engine: ${currentEngine}`);
      console.log(`New Policy Engine:     ${newEngineAddress}`);
      if (newEngineAddress === zeroAddress) {
        console.log(
          "   The zero address disconnects the engine and stops policy checks."
        );
      }
      console.log("");

      console.log(`[Step 1] Setting policy engine on ${chainName}`);
      try {
        const txHash = await hooksContract.write.setPolicyEngine(
          [newEngineAddress],
          { account: wallet.account }
        );
        console.log(`⏳ Tx: ${explorerUrl}/tx/${txHash}`);
        await publicClient.waitForTransactionReceipt({
          hash: txHash,
          confirmations,
        });
        console.log("✅ Policy engine set successfully!");
      } catch (err) {
        console.log("❌ Error: setPolicyEngine() reverted.");
        if (err instanceof Error) {
          console.log(`   ${err.message}`);
          if (err.message.includes("OnlyCallableByOwner")) {
            console.log(
              "   Ensure the wallet sending the transaction is the hooks owner."
            );
          }
          if (err.message.includes("PolicyEngineDetachReverted")) {
            console.log(
              "   The old engine's detach() reverted. The on-chain recovery path is setPolicyEngineAllowFailedDetach on the hook itself."
            );
          }
        }
        throw err;
      }

      console.log("");
      console.log("========================================");
      console.log(`✅ Policy engine set on ${chainName}!`);
      console.log("========================================");
      console.log(`Pool Hooks:   ${explorerUrl}/address/${hooksAddress}`);
      console.log("========================================");
      console.log("");
    },
  }))
  .build();
