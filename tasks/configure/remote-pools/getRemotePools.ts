import { task } from "hardhat/config";
import type { HardhatRuntimeEnvironment } from "hardhat/types/hre";
import { isAddress, decodeAbiParameters, type Address, type Hex } from "viem";
import {
  getConfigByNetworkName,
  getDeployedTokenPool,
} from "../../../helper-config";

/**
 * Reads and displays the remote pool addresses configured on a TokenPool for a given remote chain.
 *
 * Usage:
 *   npx hardhat getRemotePools --destchain fuji --network sepolia
 */
export const getRemotePools = task(
  "getRemotePools",
  "Reads the remote pool addresses configured on a pool for a given destination chain"
)
  .addOption({
    name: "destchain",
    description:
      "Destination chain name (e.g. MANTLE_SEPOLIA or mantleSepolia)",
    defaultValue: "",
  })
  .addOption({
    name: "tokenpool",
    description: "Token pool address (overrides env var)",
    defaultValue: "",
  })
  .setAction(async () => ({
    default: async (
      { destchain, tokenpool }: { destchain: string; tokenpool: string },
      hre: HardhatRuntimeEnvironment
    ) => {
      if (!destchain)
        throw new Error("--destchain is required (e.g. --destchain fuji)");

      const networkConnection = await hre.network.getOrCreate();
      const { viem } = networkConnection;
      const networkName = networkConnection.networkName;
      const sourceConfig = getConfigByNetworkName(networkName);
      const destConfig = getConfigByNetworkName(destchain);
      const { chainName, explorerUrl, chainId } = sourceConfig;
      const remoteChainSelector = BigInt(destConfig.chainSelector);

      let poolAddress: Address;
      if (tokenpool) {
        if (!isAddress(tokenpool))
          throw new Error(`Invalid pool address: ${tokenpool}`);
        poolAddress = tokenpool;
      } else {
        poolAddress = getDeployedTokenPool(chainId) as Address;
      }

      console.log("");
      console.log("========================================");
      console.log("🏊 Get Remote Pools");
      console.log("========================================");
      console.log(`Chain:        ${chainName}`);
      console.log(`Remote Chain: ${destConfig.chainName}`);
      console.log(`Token Pool:   ${poolAddress}`);
      console.log(`Action:       View remote pools`);
      console.log("========================================");
      console.log("");

      const poolContract = await viem.getContractAt(
        "BurnMintTokenPool",
        poolAddress
      );

      const isSupported = (await poolContract.read.isSupportedChain([
        remoteChainSelector,
      ])) as boolean;
      console.log(`Chain Supported: ${isSupported ? "Yes" : "No"}`);

      if (isSupported) {
        const remotePools = (await poolContract.read.getRemotePools([
          remoteChainSelector,
        ])) as Hex[];
        console.log(`Remote Pools:    ${remotePools.length}`);
        for (let i = 0; i < remotePools.length; i++) {
          // ABI-encoded EVM address is 32 bytes (66 hex chars including 0x prefix)
          if (remotePools[i].length === 66) {
            const [addr] = decodeAbiParameters(
              [{ type: "address" }],
              remotePools[i]
            );
            console.log(`  [${i}] ${addr}`);
          } else {
            console.log(`  [${i}] (raw) ${remotePools[i]}`);
          }
        }
      }

      console.log("");
      console.log("========================================");
      console.log(`Token Pool:   ${explorerUrl}/address/${poolAddress}`);
      console.log("========================================");
      console.log("");
    },
  }))
  .build();
