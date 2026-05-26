import { task } from "hardhat/config";
import type { HardhatRuntimeEnvironment } from "hardhat/types/hre";
import { isAddress, encodeAbiParameters, type Address } from "viem";
import {
  getConfigByNetworkName,
  getDeployedTokenPool,
} from "../../../helper-config";

/**
 * Adds a remote pool address to a TokenPool for a given remote chain.
 *
 * Use this when a pool has been upgraded on a remote chain. The old pool address is kept
 * to allow inflight messages to complete. Multiple remote pool addresses can be active
 * at the same time for the same chain selector.
 *
 * The remote chain must already be supported (added via applyChainUpdates) before calling this.
 *
 * Usage:
 *   npx hardhat addRemotePool --destchain fuji --remotepooladdress 0xNewPool --network sepolia
 */
export const addRemotePool = task(
  "addRemotePool",
  "Adds a remote pool address to a pool for a given destination chain"
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
    description: "Address of the new remote pool to add",
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

      const publicClient = await viem.getPublicClient();
      const [wallet] = await viem.getWalletClients();
      const poolContract = await viem.getContractAt(
        "BurnMintTokenPool",
        poolAddress
      );

      const isSupported = (await poolContract.read.isSupportedChain([
        remoteChainSelector,
      ])) as boolean;
      if (!isSupported) {
        throw new Error(
          `Remote chain ${destConfig.chainName} is not supported on this pool. Run applyChainUpdates first.`
        );
      }

      console.log("");
      console.log("========================================");
      console.log("➕ Add Remote Pool");
      console.log("========================================");
      console.log(`Chain:        ${chainName}`);
      console.log(`Remote Chain: ${destConfig.chainName}`);
      console.log(`Token Pool:   ${poolAddress}`);
      console.log(`Action:       Add remote pool`);
      console.log("========================================");
      console.log("");
      console.log(`New Remote Pool: ${remotepooladdress}`);
      console.log("");

      // Show current remote pools before adding
      const currentPools = (await poolContract.read.getRemotePools([
        remoteChainSelector,
      ])) as `0x${string}`[];
      console.log(`Current Remote Pools: ${currentPools.length}`);
      for (let i = 0; i < currentPools.length; i++) {
        console.log(`  [${i}] ${currentPools[i]}`);
      }
      console.log("");

      console.log(`[Step 1] Adding remote pool on ${chainName}`);
      const encoded = encodeAbiParameters(
        [{ type: "address" }],
        [remotepooladdress as Address]
      );
      const txHash = await poolContract.write.addRemotePool(
        [remoteChainSelector, encoded],
        { account: wallet.account }
      );
      console.log(`⏳ Tx: ${explorerUrl}/tx/${txHash}`);
      await publicClient.waitForTransactionReceipt({
        hash: txHash,
        confirmations,
      });
      console.log("✅ Remote pool added successfully!");

      console.log("");
      console.log("========================================");
      console.log(`✅ Complete on ${chainName}!`);
      console.log("========================================");
      console.log(`Token Pool:      ${explorerUrl}/address/${poolAddress}`);
      console.log(`Remote Chain:    ${destConfig.chainName}`);
      console.log(`Added Pool:      ${remotepooladdress}`);
      console.log(`Transaction:     ${explorerUrl}/tx/${txHash}`);
      console.log("========================================");
      console.log("");
    },
  }))
  .build();
