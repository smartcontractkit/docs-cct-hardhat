import { task } from "hardhat/config";
import type { HardhatRuntimeEnvironment } from "hardhat/types/hre";
import { isAddress, type Address, decodeAbiParameters, hexToBytes } from "viem";
import bs58 from "bs58";
import {
  getConfigByNetworkName,
  getDeployedTokenPool,
  getChainNameBySelector,
} from "../../helper-config";

/**
 * Reads and displays all remote chains supported by a TokenPool.
 *
 * Usage:
 *   npx hardhat getSupportedChains --network sepolia
 *   npx hardhat getSupportedChains --tokenpool 0xYourPool --network sepolia
 */
export const getSupportedChains = task(
  "getSupportedChains",
  "Reads and displays all remote chains supported by a TokenPool"
)
  .addOption({
    name: "tokenpool",
    description: "Token pool address (overrides env var)",
    defaultValue: "",
  })
  .setAction(async () => ({
    default: async (
      { tokenpool }: { tokenpool: string },
      hre: HardhatRuntimeEnvironment
    ) => {
      const networkConnection = await hre.network.getOrCreate();
      const { viem } = networkConnection;
      const networkName = networkConnection.networkName;
      const networkConfig = getConfigByNetworkName(networkName);
      const { chainName, explorerUrl } = networkConfig;

      let poolAddress: Address;
      if (tokenpool) {
        if (!isAddress(tokenpool))
          throw new Error(`Invalid pool address: ${tokenpool}`);
        poolAddress = tokenpool;
      } else {
        poolAddress = getDeployedTokenPool(networkConfig.chainId) as Address;
      }

      console.log("");
      console.log("========================================");
      console.log("🔗 Get Supported Chains");
      console.log("========================================");
      console.log(`Chain:        ${chainName}`);
      console.log(`Token Pool:   ${poolAddress}`);
      console.log(`Action:       View supported chains`);
      console.log("========================================");
      console.log("");

      const poolContract = await viem.getContractAt(
        "BurnMintTokenPool",
        poolAddress
      );

      const supportedChains = await poolContract.read.getSupportedChains();

      console.log(`Supported Remote Chains: ${supportedChains.length}`);
      console.log("");

      for (let i = 0; i < supportedChains.length; i++) {
        const selector = supportedChains[i];
        const remotePools = await poolContract.read.getRemotePools([selector]);
        const remoteChainName = getChainNameBySelector(selector.toString());

        console.log(`  [${i}] ${remoteChainName} (${selector})`);
        console.log(`       Remote Pools: ${remotePools.length}`);

        for (let j = 0; j < remotePools.length; j++) {
          const rawBytes = remotePools[j];
          // ABI-encoded EVM address: 32 bytes with 12 leading zero bytes.
          // Raw SVM pubkey: 32 bytes, all significant — no leading-zero padding.
          const bytes = hexToBytes(rawBytes);
          if (bytes.length === 32 && bytes.slice(0, 12).every((b) => b === 0)) {
            const [decoded] = decodeAbiParameters(
              [{ type: "address" }],
              rawBytes
            );
            console.log(`         [${j}] ${decoded}`);
          } else if (bytes.length === 32) {
            // Raw SVM (Solana) public key — display as base58
            console.log(`         [${j}] ${bs58.encode(bytes)}`);
          } else {
            console.log(`         [${j}] (raw) ${rawBytes}`);
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
