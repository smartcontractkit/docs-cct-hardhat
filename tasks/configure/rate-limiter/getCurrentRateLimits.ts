import { task } from "hardhat/config";
import type { HardhatRuntimeEnvironment } from "hardhat/types/hre";
import { isAddress, type Address } from "viem";
import {
  getConfigByNetworkName,
  getDeployedTokenPool,
} from "../../../helper-config";
import {
  isV2Pool,
  logRateLimiterState,
  logRateLimiterStateWithFallback,
} from "../../../utils/rateLimiterUtils";

/**
 * Reads and displays the current rate limiter state for a TokenPool, compatible with v1 and v2 pools.
 *
 * Usage:
 *   npx hardhat getCurrentRateLimits --destchain fuji --network sepolia
 *   npx hardhat getCurrentRateLimits --destchain fuji --fastfinality --network sepolia
 */
export const getCurrentRateLimits = task(
  "getCurrentRateLimits",
  "Reads the current rate limiter state for a pool on a given destination lane (v1 and v2 compatible)"
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
  .addFlag({
    name: "fastfinality",
    description:
      "Read the fast finality bucket (v2 only; falls back to standard per direction if not enabled)",
  })
  .setAction(async () => ({
    default: async (
      {
        destchain,
        tokenpool,
        fastfinality,
      }: { destchain: string; tokenpool: string; fastfinality: boolean },
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
      const destChainSelector = BigInt(destConfig.chainSelector);

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
      console.log("📊 Get Current Rate Limits");
      console.log("========================================");
      console.log(`Chain:        ${chainName}`);
      console.log(`Remote Chain: ${destConfig.chainName}`);
      console.log(`Token Pool:   ${poolAddress}`);
      console.log(`Action:       View rate limits`);
      if (fastfinality) {
        console.log(
          "Bucket:       Fast finality (standard finality fallback per direction if not enabled)"
        );
      } else {
        console.log("Bucket:       Standard finality");
      }
      console.log("========================================");
      console.log("");

      const poolContract = await viem.getContractAt(
        "BurnMintTokenPool",
        poolAddress
      );
      const publicClient = await viem.getPublicClient();

      // Helpful guard: common failure is passing a pool address from a different chain than --network.
      // In that case, the call will return "0x" (no bytecode / no data), which is confusing.
      const bytecode = await publicClient.getBytecode({ address: poolAddress });
      if (bytecode === undefined || bytecode === null || bytecode === "0x") {
        throw new Error(
          [
            `No contract bytecode found at ${poolAddress} on network "${networkName}".`,
            "This usually means the token pool address is from a different chain than --network.",
            "",
            "Fix:",
            `- If the pool is on Ethereum Sepolia: use --network sepolia and --destchain mantleSepolia`,
            `- If the pool is on Mantle Sepolia: use --network mantleSepolia and --destchain sepolia`,
          ].join("\n")
        );
      }
      const v2 = await isV2Pool(poolContract, destChainSelector);

      console.log(`Pool Version: ${v2 ? "v2" : "v1"}`);
      console.log("");

      if (fastfinality && v2) {
        await logRateLimiterStateWithFallback(
          poolContract,
          poolAddress,
          publicClient,
          destChainSelector,
          v2
        );
      } else {
        await logRateLimiterState(
          poolContract,
          poolAddress,
          publicClient,
          destChainSelector,
          fastfinality,
          v2
        );
      }

      console.log("========================================");
      console.log(`Token Pool:   ${explorerUrl}/address/${poolAddress}`);
      console.log("========================================");
      console.log("");
    },
  }))
  .build();
