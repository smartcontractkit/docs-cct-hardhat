import { task } from "hardhat/config";
import type { HardhatRuntimeEnvironment } from "hardhat/types/hre";
import { isAddress, type Address } from "viem";
import {
  getConfigByNetworkName,
  getDeployedTokenPool,
} from "../../../helper-config";
import {
  buildRateLimitUpdate,
  isV2Pool,
  getCurrentConfigs,
  logRateLimiterStateWithFallback,
  logNewConfig,
} from "../../../utils/rateLimiterUtils";
import {
  BLOCK_DEPTH_BITS,
  BLOCK_DEPTH_MASK,
  MAX_BLOCK_DEPTH,
  WAIT_FOR_SAFE_FLAG,
} from "../../../utils/finalityCodecConstants";
import { decodeModeLabel } from "../../../utils/finalityConfigUtils";

function buildFinalityConfig(
  blockdepth: string,
  waitforsafe: boolean
): `0x${string}` {
  const depth = blockdepth !== "" ? Number(blockdepth) : 0;
  if (!Number.isInteger(depth) || depth < 0 || depth > MAX_BLOCK_DEPTH)
    throw new Error(
      `--blockdepth must be an integer between 0 and ${MAX_BLOCK_DEPTH}`
    );

  let value = depth & BLOCK_DEPTH_MASK;
  if (waitforsafe) value |= WAIT_FOR_SAFE_FLAG;

  return `0x${value.toString(16).padStart(8, "0")}` as `0x${string}`;
}

/**
 * Sets the allowed finality configuration on a TokenPool (v2+ only).
 * Optionally updates rate limits for the fast finality bucket on a specific remote chain lane.
 *
 * Exactly one finality mode must be specified (or none, to reset to WAIT_FOR_FINALITY):
 *   --blockdepth <n>                — Allow fast finality after N block confirmations (1–65535).
 *   --waitforsafe                   — Allow fast finality using the `safe` head.
 *   --blockdepth <n> --waitforsafe  — Allow both modes simultaneously (pool accepts either).
 *   (neither)                       — WAIT_FOR_FINALITY (default): disables fast finality.
 *
 * Usage:
 *   # Set block depth:
 *   npx hardhat setFinalityConfig --blockdepth 5 --network sepolia
 *
 *   # Set WAIT_FOR_SAFE mode and view current rate limits for a lane:
 *   npx hardhat setFinalityConfig --waitforsafe --destchain fuji --network sepolia
 *
 *   # Combine both modes:
 *   npx hardhat setFinalityConfig --blockdepth 5 --waitforsafe --network sepolia
 *
 *   # Set block depth and update fast finality rate limit bucket:
 *   npx hardhat setFinalityConfig --blockdepth 5 --destchain fuji \
 *     --outboundcapacity 1000000000000000000000 --outboundrate 100000000000000000 \
 *     --inboundcapacity 1000000000000000000000 --inboundrate 100000000000000000 \
 *     --network sepolia
 *
 *   # Reset to default finality (disables fast finality transfers):
 *   npx hardhat setFinalityConfig --network sepolia
 */
export const setFinalityConfig = task(
  "setFinalityConfig",
  "Sets the allowed finality configuration on a TokenPool (v2+ only)"
)
  .addOption({
    name: "blockdepth",
    description:
      "Number of block confirmations for fast finality (1–65535). Can be combined with --waitforsafe.",
    defaultValue: "",
  })
  .addFlag({
    name: "waitforsafe",
    description:
      "Allow fast finality using the `safe` head. Can be combined with --blockdepth.",
  })
  .addOption({
    name: "tokenpool",
    description: "Token pool address (overrides env var)",
    defaultValue: "",
  })
  .addOption({
    name: "destchain",
    description:
      "Destination chain name — required when specifying rate limit options (e.g. MANTLE_SEPOLIA or mantleSepolia)",
    defaultValue: "",
  })
  .addOption({
    name: "outboundcapacity",
    description:
      "Outbound rate limit capacity for the fast finality bucket — isEnabled auto-set when > 0",
    defaultValue: "0",
  })
  .addOption({
    name: "outboundrate",
    description:
      "Outbound rate limit rate for the fast finality bucket — isEnabled auto-set when > 0",
    defaultValue: "0",
  })
  .addOption({
    name: "outboundenabled",
    description:
      "Outbound rate limit enabled (true/false) — defaults to true when capacity or rate is set",
    defaultValue: "",
  })
  .addOption({
    name: "inboundcapacity",
    description:
      "Inbound rate limit capacity for the fast finality bucket — isEnabled auto-set when > 0",
    defaultValue: "0",
  })
  .addOption({
    name: "inboundrate",
    description:
      "Inbound rate limit rate for the fast finality bucket — isEnabled auto-set when > 0",
    defaultValue: "0",
  })
  .addOption({
    name: "inboundenabled",
    description:
      "Inbound rate limit enabled (true/false) — defaults to true when capacity or rate is set",
    defaultValue: "",
  })
  .setAction(async () => ({
    default: async (
      {
        blockdepth,
        waitforsafe,
        tokenpool,
        destchain,
        outboundcapacity,
        outboundrate,
        outboundenabled,
        inboundcapacity,
        inboundrate,
        inboundenabled,
      }: {
        blockdepth: string;
        waitforsafe: boolean;
        tokenpool: string;
        destchain: string;
        outboundcapacity: string;
        outboundrate: string;
        outboundenabled: string;
        inboundcapacity: string;
        inboundrate: string;
        inboundenabled: string;
      },
      hre: HardhatRuntimeEnvironment
    ) => {
      const newFinalityConfig = buildFinalityConfig(blockdepth, waitforsafe);

      const rateLimitUpdate = buildRateLimitUpdate({
        outboundcapacity,
        outboundrate,
        outboundenabled,
        inboundcapacity,
        inboundrate,
        inboundenabled,
      });
      const hasRateLimitUpdate =
        rateLimitUpdate.updateOutbound || rateLimitUpdate.updateInbound;

      if (hasRateLimitUpdate && !destchain)
        throw new Error(
          "--destchain must be set when specifying rate limit options"
        );

      const networkConnection = await hre.network.getOrCreate();
      const { viem } = networkConnection;
      const networkName = networkConnection.networkName;
      const sourceConfig = getConfigByNetworkName(networkName);
      const { confirmations, chainName, explorerUrl, chainId } = sourceConfig;

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

      // Resolve dest chain and detect pool version (only when --destchain is set)
      let remoteChainSelector = 0n;
      let destChainName = "";
      let v2 = false;
      if (destchain) {
        const destConfig = getConfigByNetworkName(destchain);
        remoteChainSelector = BigInt(destConfig.chainSelector);
        destChainName = destConfig.chainName;
        v2 = await isV2Pool(poolContract, remoteChainSelector);
      }

      console.log("");
      console.log("========================================");
      console.log("⏱️  Set Finality Config");
      console.log("========================================");
      console.log(`Chain:        ${chainName}`);
      if (destchain) console.log(`Remote Chain: ${destChainName}`);
      console.log(`Token Pool:   ${poolAddress}`);
      console.log(`Action:       Set finality config`);
      console.log("========================================");
      console.log("");

      // Show current vs new value
      try {
        const currentFinality =
          (await poolContract.read.getAllowedFinalityConfig()) as `0x${string}`;
        console.log(`  Current Finality Config: ${currentFinality}`);
      } catch {
        console.log(
          "  Current Finality Config: Not available (pool version < 2.0)"
        );
      }
      console.log(`  New Finality Config:     ${newFinalityConfig}`);
      console.log(
        `  Mode:                    ${decodeModeLabel(newFinalityConfig)}`
      );
      console.log("");

      // Show current rate limits for the lane (if --destchain provided)
      if (destchain) {
        console.log("----------------------------------------");
        console.log(
          "📊 Current Rate Limits (fast finality where enabled, standard otherwise):"
        );
        console.log("----------------------------------------");
        await logRateLimiterStateWithFallback(
          poolContract,
          remoteChainSelector,
          v2
        );
      }

      const publicClient = await viem.getPublicClient();
      const [wallet] = await viem.getWalletClients();

      // Step 1: Set finality config
      console.log(`[Step 1] Setting finality config on ${chainName}`);
      try {
        const txHash = await poolContract.write.setAllowedFinalityConfig(
          [newFinalityConfig],
          { account: wallet.account }
        );
        console.log(`⏳ Tx: ${explorerUrl}/tx/${txHash}`);
        await publicClient.waitForTransactionReceipt({
          hash: txHash,
          confirmations,
        });
        console.log("✅ Finality config set successfully!");
      } catch (err) {
        console.log("❌ Error: setAllowedFinalityConfig() reverted.");
        if (err instanceof Error) console.log(`  ${err.message}`);
        console.log(
          "  If the error is about ownership, ensure you are using the pool owner's account."
        );
        console.log(
          "  If the function is not found, the pool may be v1 (requires TokenPool v2.0+)."
        );
        throw err;
      }

      // Step 2: Apply rate limit update for fast finality bucket (if requested)
      if (hasRateLimitUpdate) {
        console.log("");
        console.log(
          `[Step 2] Updating rate limits (fast finality bucket) on ${chainName} → ${destChainName}`
        );

        const { outbound, inbound } = await getCurrentConfigs(
          poolContract,
          remoteChainSelector,
          true,
          v2
        );

        if (rateLimitUpdate.updateOutbound) {
          outbound.isEnabled = rateLimitUpdate.outboundEnabled;
          outbound.capacity = rateLimitUpdate.outboundEnabled
            ? rateLimitUpdate.outboundCapacity
            : 0n;
          outbound.rate = rateLimitUpdate.outboundEnabled
            ? rateLimitUpdate.outboundRate
            : 0n;
        }
        if (rateLimitUpdate.updateInbound) {
          inbound.isEnabled = rateLimitUpdate.inboundEnabled;
          inbound.capacity = rateLimitUpdate.inboundEnabled
            ? rateLimitUpdate.inboundCapacity
            : 0n;
          inbound.rate = rateLimitUpdate.inboundEnabled
            ? rateLimitUpdate.inboundRate
            : 0n;
        }

        logNewConfig(
          rateLimitUpdate.updateOutbound,
          outbound,
          rateLimitUpdate.updateInbound,
          inbound
        );

        const args = [
          {
            remoteChainSelector,
            fastFinality: true,
            outboundRateLimiterConfig: outbound,
            inboundRateLimiterConfig: inbound,
          },
        ];
        const tx2Hash = await poolContract.write.setRateLimitConfig([args], {
          account: wallet.account,
        });
        console.log(`⏳ Tx: ${explorerUrl}/tx/${tx2Hash}`);
        await publicClient.waitForTransactionReceipt({
          hash: tx2Hash,
          confirmations,
        });
        console.log("✅ Rate limits updated successfully!");
      }

      // Show updated rate limits for the lane (if --destchain provided)
      if (destchain) {
        console.log("");
        console.log("----------------------------------------");
        console.log(
          "📊 Updated Rate Limits (fast finality where enabled, standard otherwise):"
        );
        console.log("----------------------------------------");
        await logRateLimiterStateWithFallback(
          poolContract,
          remoteChainSelector,
          v2
        );
      }

      console.log("");
      console.log("========================================");
      console.log(`✅ Configuration Complete on ${chainName}!`);
      console.log("========================================");
      console.log(`Token Pool:      ${explorerUrl}/address/${poolAddress}`);
      console.log(`Finality Config: ${newFinalityConfig}`);
      console.log(`Mode:            ${decodeModeLabel(newFinalityConfig)}`);
      console.log("========================================");
      console.log("");
    },
  }))
  .build();
