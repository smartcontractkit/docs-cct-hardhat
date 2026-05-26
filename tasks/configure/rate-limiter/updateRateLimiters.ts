import { task } from "hardhat/config";
import type { HardhatRuntimeEnvironment } from "hardhat/types/hre";
import { isAddress, type Address } from "viem";
import {
  getConfigByNetworkName,
  getDeployedTokenPool,
} from "../../../helper-config";
import {
  buildRateLimitUpdate,
  directionLabel,
  getCurrentConfigs,
  isV2Pool,
  logNewConfig,
  logRateLimiterState,
  tokenPoolV1Abi,
  type RateLimiterConfig,
} from "../../../utils/rateLimiterUtils";

/**
 * Updates rate limiter configuration on a TokenPool, compatible with both v1 and v2 pools.
 *
 * Direction is inferred automatically: set outbound options to update outbound,
 * inbound options to update inbound, or both sets to update both.
 * At least one direction must be specified.
 *
 * Usage:
 *   npx hardhat updateRateLimiters --destchain fuji \
 *     --outboundcapacity 1000000000000000000000 --outboundrate 100000000000000000 \
 *     --inboundcapacity 1000000000000000000000 --inboundrate 100000000000000000 \
 *     --network sepolia
 *
 *   # Disable outbound only:
 *   npx hardhat updateRateLimiters --destchain fuji --outboundenabled false --network sepolia
 *
 *   # Update fast finality bucket (v2 only):
 *   npx hardhat updateRateLimiters --destchain fuji --fastfinality \
 *     --outboundcapacity 500000000000000000000 --outboundrate 50000000000000000 \
 *     --network sepolia
 */
export const updateRateLimiters = task(
  "updateRateLimiters",
  "Updates rate limiter configuration on a pool for a destination lane (v1 and v2 compatible)"
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
      "Update the fast finality bucket (v2 only; ignored on v1 pools)",
  })
  .addOption({
    name: "outboundcapacity",
    description:
      "Outbound token bucket capacity (uint128) — triggers outbound update",
    defaultValue: "",
  })
  .addOption({
    name: "outboundrate",
    description:
      "Outbound token bucket refill rate per second (uint128) — triggers outbound update",
    defaultValue: "",
  })
  .addOption({
    name: "outboundenabled",
    description:
      "Outbound isEnabled override: 'true' or 'false' — triggers outbound update",
    defaultValue: "",
  })
  .addOption({
    name: "inboundcapacity",
    description:
      "Inbound token bucket capacity (uint128) — triggers inbound update",
    defaultValue: "",
  })
  .addOption({
    name: "inboundrate",
    description:
      "Inbound token bucket refill rate per second (uint128) — triggers inbound update",
    defaultValue: "",
  })
  .addOption({
    name: "inboundenabled",
    description:
      "Inbound isEnabled override: 'true' or 'false' — triggers inbound update",
    defaultValue: "",
  })
  .setAction(async () => ({
    default: async (
      {
        destchain,
        tokenpool,
        fastfinality,
        outboundcapacity,
        outboundrate,
        outboundenabled,
        inboundcapacity,
        inboundrate,
        inboundenabled,
      }: {
        destchain: string;
        tokenpool: string;
        fastfinality: boolean;
        outboundcapacity: string;
        outboundrate: string;
        outboundenabled: string;
        inboundcapacity: string;
        inboundrate: string;
        inboundenabled: string;
      },
      hre: HardhatRuntimeEnvironment
    ) => {
      if (!destchain)
        throw new Error("--destchain is required (e.g. --destchain fuji)");

      const update = buildRateLimitUpdate({
        outboundcapacity,
        outboundrate,
        outboundenabled,
        inboundcapacity,
        inboundrate,
        inboundenabled,
      });

      if (!update.updateOutbound && !update.updateInbound) {
        throw new Error(
          "At least one direction must be specified: set --outbound* and/or --inbound* rate limit options"
        );
      }

      const networkConnection = await hre.network.getOrCreate();
      const { viem } = networkConnection;
      const networkName = networkConnection.networkName;
      const sourceConfig = getConfigByNetworkName(networkName);
      const destConfig = getConfigByNetworkName(destchain);
      const { chainName, explorerUrl, confirmations, chainId } = sourceConfig;
      const destChainSelector = BigInt(destConfig.chainSelector);

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

      const v2 = await isV2Pool(poolContract, destChainSelector);

      console.log("");
      console.log("========================================");
      console.log("⚡️ Update Rate Limiters");
      console.log("========================================");
      console.log(`Chain:        ${chainName}`);
      console.log(`Remote Chain: ${destConfig.chainName}`);
      console.log(`Token Pool:   ${poolAddress}`);
      console.log(`Action:       Update rate limits`);
      console.log(
        `Direction:    ${directionLabel(
          update.updateOutbound,
          update.updateInbound
        )}`
      );
      console.log(
        `Bucket:       ${fastfinality ? "Fast finality" : "Standard finality"}`
      );
      console.log("========================================");
      console.log("");

      console.log(
        `Pool Version: ${
          v2 ? "v2 (setRateLimitConfig)" : "v1 (setChainRateLimiterConfig)"
        }`
      );
      console.log("");

      // Show current state before updating
      console.log("Current Rate Limiter State:");
      await logRateLimiterState(
        poolContract,
        destChainSelector,
        fastfinality,
        v2
      );

      // Seed from live on-chain state; only override the directions actually provided.
      const { outbound: currentOut, inbound: currentIn } =
        await getCurrentConfigs(
          poolContract,
          destChainSelector,
          fastfinality,
          v2
        );

      const newOutbound: RateLimiterConfig = update.updateOutbound
        ? {
            isEnabled: update.outboundEnabled,
            capacity: update.outboundEnabled ? update.outboundCapacity : 0n,
            rate: update.outboundEnabled ? update.outboundRate : 0n,
          }
        : currentOut;

      const newInbound: RateLimiterConfig = update.updateInbound
        ? {
            isEnabled: update.inboundEnabled,
            capacity: update.inboundEnabled ? update.inboundCapacity : 0n,
            rate: update.inboundEnabled ? update.inboundRate : 0n,
          }
        : currentIn;

      logNewConfig(
        update.updateOutbound,
        newOutbound,
        update.updateInbound,
        newInbound
      );

      console.log(`[Step 1] Applying rate limit update on ${chainName}`);

      let txHash: `0x${string}`;

      if (v2) {
        txHash = await poolContract.write.setRateLimitConfig(
          [
            [
              {
                remoteChainSelector: destChainSelector,
                fastFinality: fastfinality,
                outboundRateLimiterConfig: newOutbound,
                inboundRateLimiterConfig: newInbound,
              },
            ],
          ],
          { account: wallet.account }
        );
      } else {
        if (fastfinality) {
          console.log(
            "⚠️  Warning: --fastfinality is ignored on v1 pools. Updating the standard bucket."
          );
        }
        // setChainRateLimiterConfig is the v1 API — not present on the v2 pool ABI
        txHash = await wallet.writeContract({
          address: poolAddress,
          abi: tokenPoolV1Abi,
          functionName: "setChainRateLimiterConfig",
          args: [destChainSelector, newOutbound, newInbound],
          account: wallet.account,
        });
      }

      console.log(`⏳ Tx: ${explorerUrl}/tx/${txHash}`);
      await publicClient.waitForTransactionReceipt({
        hash: txHash,
        confirmations,
      });

      console.log("");
      console.log("========================================");
      console.log(`✅ Rate limiter update complete on ${chainName}!`);
      console.log("========================================");
      console.log(`Token Pool:   ${explorerUrl}/address/${poolAddress}`);
      console.log(`Transaction:  ${explorerUrl}/tx/${txHash}`);
      console.log("========================================");
      console.log("");
    },
  }))
  .build();
