import { task } from "hardhat/config";
import type { HardhatRuntimeEnvironment } from "hardhat/types/hre";
import { isAddress, encodeAbiParameters, type Address } from "viem";
import {
  getConfigByNetworkName,
  getDeployedTokenPool,
} from "../../../helper-config";

/**
 * Removes a remote pool address from a TokenPool for a given remote chain.
 *
 * WARNING: All inflight transactions from the removed pool will be rejected after removal.
 * Ensure there are no inflight transactions from the pool before removing it to avoid loss of funds.
 *
 * Usage:
 *   npx hardhat removeRemotePool --destchain fuji --remotepooladdress 0xOldPool --network sepolia
 */
export const removeRemotePool = task(
  "removeRemotePool",
  "Removes a remote pool address from a pool for a given destination chain"
)
  .addOption({
    name: "destchain",
    description:
      "Destination chain name (e.g. MANTLE_SEPOLIA or mantleSepolia)",
    defaultValue: "",
  })
  .addOption({
    name: "tokenpool",
    description: "Source token pool address (overrides env var)",
    defaultValue: "",
  })
  .addOption({
    name: "remotepooladdress",
    description: "Address of the remote pool to remove",
    defaultValue: "",
  })
  .setAction(async () => ({
    default: async (
      {
        destchain,
        tokenpool,
        remotepooladdress,
      }: { destchain: string; tokenpool: string; remotepooladdress: string },
      hre: HardhatRuntimeEnvironment
    ) => {
      if (!destchain)
        throw new Error("--destchain is required (e.g. --destchain fuji)");
      if (!remotepooladdress)
        throw new Error("--remotepooladdress is required");
      if (!isAddress(remotepooladdress))
        throw new Error(`Invalid remote pool address: ${remotepooladdress}`);

      const networkConnection = await hre.network.getOrCreate();
      const { viem } = networkConnection;
      const networkName = networkConnection.networkName;
      const sourceConfig = getConfigByNetworkName(networkName);
      const destConfig = getConfigByNetworkName(destchain);
      const { chainName, explorerUrl, confirmations, chainId } = sourceConfig;
      const remoteChainSelector = BigInt(destConfig.chainSelector);

      let poolAddress: Address;
      if (tokenpool) {
        if (!isAddress(tokenpool))
          throw new Error(`Invalid pool address: ${tokenpool}`);
        poolAddress = tokenpool;
      } else {
        poolAddress = getDeployedTokenPool(chainId) as Address;
      }

      const poolContract = await viem.getContractAt(
        "BurnMintTokenPool",
        poolAddress
      );

      const isSupported = (await poolContract.read.isSupportedChain([
        remoteChainSelector,
      ])) as boolean;
      if (!isSupported) {
        throw new Error(
          `Remote chain ${destConfig.chainName} is not supported on this pool.`
        );
      }

      const encoded = encodeAbiParameters(
        [{ type: "address" }],
        [remotepooladdress as Address]
      );
      const isRegistered = (await poolContract.read.isRemotePool([
        remoteChainSelector,
        encoded,
      ])) as boolean;
      if (!isRegistered) {
        throw new Error(
          `Remote pool ${remotepooladdress} is not configured for chain ${destConfig.chainName}.`
        );
      }

      console.log("");
      console.log("========================================");
      console.log("➖ Remove Remote Pool");
      console.log("========================================");
      console.log(`Chain:        ${chainName}`);
      console.log(`Remote Chain: ${destConfig.chainName}`);
      console.log(`Token Pool:   ${poolAddress}`);
      console.log(`Action:       Remove remote pool`);
      console.log("========================================");
      console.log("");
      console.log(`Pool to Remove: ${remotepooladdress}`);
      console.log("");
      console.log(
        "⚠️  WARNING: All inflight transactions from this pool will be rejected after removal."
      );
      console.log(
        "   Ensure there are no inflight transactions before proceeding."
      );
      console.log("");

      // Show current remote pools before removing
      const currentPools = (await poolContract.read.getRemotePools([
        remoteChainSelector,
      ])) as `0x${string}`[];
      console.log(`Current Remote Pools: ${currentPools.length}`);
      for (let i = 0; i < currentPools.length; i++) {
        console.log(`  [${i}] ${currentPools[i]}`);
      }
      console.log("");

      const publicClient = await viem.getPublicClient();
      const [wallet] = await viem.getWalletClients();

      console.log(`[Step 1] Removing remote pool on ${chainName}`);
      const txHash = await poolContract.write.removeRemotePool(
        [remoteChainSelector, encoded],
        { account: wallet.account }
      );
      console.log(`⏳ Tx: ${explorerUrl}/tx/${txHash}`);
      await publicClient.waitForTransactionReceipt({
        hash: txHash,
        confirmations,
      });
      console.log("✅ Remote pool removed successfully!");

      console.log("");
      console.log("========================================");
      console.log(`✅ Complete on ${chainName}!`);
      console.log("========================================");
      console.log(`Token Pool:      ${explorerUrl}/address/${poolAddress}`);
      console.log(`Remote Chain:    ${destConfig.chainName}`);
      console.log(`Removed Pool:    ${remotepooladdress}`);
      console.log(`Transaction:     ${explorerUrl}/tx/${txHash}`);
      console.log("========================================");
      console.log("");
    },
  }))
  .build();
