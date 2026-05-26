import fs from "fs";
import { task } from "hardhat/config";
import type { HardhatRuntimeEnvironment } from "hardhat/types/hre";
import { isAddress, type Address } from "viem";
import {
  getConfigByNetworkName,
  getDeployedTokenPool,
  getDeployedToken,
} from "../../helper-config";
import {
  prepareChainAddressData,
  validateChainAddress,
  type ChainFamily,
} from "../../utils/chainHandlers";

// ─── JSON file mode ────────────────────────────────────────────────────────────
// Pass --viajsonfile to read config from this file instead of CLI args.
// Supports multiple destination chains and multiple remote pool addresses per chain
// in a single transaction — impractical via inline CLI args.
//
// JSON schema:
//   {
//     "sourcePool": "0x...",          // optional — overrides TOKEN_POOL env var
//     "remoteChains": [
//       {
//         "destChain": "MANTLE_SEPOLIA",         // required — chain name identifier
//         "destChainFamily": "evm",              // optional — auto-detected from destChain
//         "destChainSelector": "0",              // optional — auto-detected from destChain
//         "destPools": ["0x...", "0x..."],        // required — one or more remote pool addresses
//         "destToken": "0x...",                  // required — remote token address
//         "outboundRateLimit": {                 // optional — defaults to disabled
//           "enabled": false, "capacity": "0", "rate": "0"
//         },
//         "inboundRateLimit": {                  // optional — defaults to disabled
//           "enabled": false, "capacity": "0", "rate": "0"
//         }
//       }
//     ]
//   }
//
// See input/apply-chain-updates.json for a working example.
//
// ─── CLI / env var mode (single destination chain) ────────────────────────────
// Usage:
//   npx hardhat applyChainUpdates --destchain fuji --network sepolia
//   npx hardhat applyChainUpdates \
//     --destchain fuji \
//     --outboundcapacity 99000000000000000000 \
//     --outboundrate 99000000000000000 \
//     --inboundcapacity 100000000000000000000 \
//     --inboundrate 100000000000000000 \
//     --network sepolia
//   npx hardhat applyChainUpdates --destchain SOLANA_DEVNET \
//     --destpooladdress <base58> --desttokenaddress <base58> --network sepolia

const JSON_INPUT_FILE = "input/apply-chain-updates.json";

interface RateLimitConfig {
  isEnabled: boolean;
  capacity: bigint;
  rate: bigint;
}

interface ChainUpdateEntry {
  remoteChainSelector: bigint;
  remotePoolAddresses: `0x${string}`[];
  remoteTokenAddress: `0x${string}`;
  outboundRateLimiterConfig: RateLimitConfig;
  inboundRateLimiterConfig: RateLimitConfig;
}

function parseRateLimitFromJson(
  raw: { enabled?: boolean; capacity?: string; rate?: string } | undefined
): RateLimitConfig {
  if (!raw) return { isEnabled: false, capacity: 0n, rate: 0n };
  const enabled = raw.enabled ?? false;
  return {
    isEnabled: enabled,
    capacity: enabled ? BigInt(raw.capacity ?? "0") : 0n,
    rate: enabled ? BigInt(raw.rate ?? "0") : 0n,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runFromJson(
  poolAddress: Address,
  sourceConfig: ReturnType<typeof getConfigByNetworkName>,
  poolContract: any,
  viem: any,
  wallet: any
): Promise<void> {
  const { confirmations, chainName, explorerUrl } = sourceConfig;

  const raw = JSON.parse(fs.readFileSync(JSON_INPUT_FILE, "utf8")) as {
    sourcePool?: string;
    remoteChains: Array<{
      destChain: string;
      destChainFamily?: string;
      destChainSelector?: string;
      destPools: string[];
      destToken: string;
      outboundRateLimit?: {
        enabled?: boolean;
        capacity?: string;
        rate?: string;
      };
      inboundRateLimit?: {
        enabled?: boolean;
        capacity?: string;
        rate?: string;
      };
    }>;
  };

  if (!raw.remoteChains || raw.remoteChains.length === 0) {
    throw new Error(
      "JSON file must contain at least one entry in 'remoteChains'."
    );
  }

  console.log("");
  console.log("========================================");
  console.log("🔗 Apply Chain Updates (JSON mode)");
  console.log("========================================");
  console.log(`Source Chain:  ${chainName}`);
  console.log(`Token Pool:    ${poolAddress}`);
  console.log(`Input File:    ${JSON_INPUT_FILE}`);
  console.log(`Remote Chains: ${raw.remoteChains.length}`);
  console.log("========================================");
  console.log("");

  // Single pass: build updates, detect replacements, log.
  const chainUpdates: ChainUpdateEntry[] = [];
  const shouldRemove: boolean[] = [];
  const publicClient = await viem.getPublicClient();

  for (let i = 0; i < raw.remoteChains.length; i++) {
    const entry = raw.remoteChains[i];
    const destConfig = getConfigByNetworkName(entry.destChain);
    const destChainFamily = (entry.destChainFamily ??
      destConfig.chainFamily) as ChainFamily;
    const destChainSelector = BigInt(
      entry.destChainSelector ?? destConfig.chainSelector
    );

    if (!destChainSelector) {
      throw new Error(
        `Chain selector is 0 for remoteChains[${i}]. Set 'destChainSelector' in the JSON entry or use a recognized 'destChain' name.`
      );
    }
    if (!entry.destPools || entry.destPools.length === 0) {
      throw new Error(
        `remoteChains[${i}].destPools must contain at least one address.`
      );
    }

    validateChainAddress(entry.destToken, destChainFamily);
    const tokenEncoded = prepareChainAddressData(
      entry.destToken,
      destChainFamily
    );

    const encodedPools = entry.destPools.map((p, pi) => {
      validateChainAddress(p, destChainFamily);
      return prepareChainAddressData(p, destChainFamily);
    });

    const outbound = parseRateLimitFromJson(entry.outboundRateLimit);
    const inbound = parseRateLimitFromJson(entry.inboundRateLimit);

    const alreadyConfigured = await poolContract.read.isSupportedChain([
      destChainSelector,
    ]);
    shouldRemove.push(alreadyConfigured);

    const displayName = destConfig.chainName || entry.destChain;
    console.log(`  [${i}] ${displayName}`);
    console.log(`      Selector:       ${destChainSelector}`);
    console.log(`      Family:         ${destChainFamily}`);
    console.log(`      Token:          ${entry.destToken}`);
    console.log(`      Pools:          ${entry.destPools.length}`);
    for (let j = 0; j < entry.destPools.length; j++)
      console.log(`        [${j}] ${entry.destPools[j]}`);
    console.log(`      Outbound RL:    enabled=${outbound.isEnabled}`);
    console.log(`      Inbound RL:     enabled=${inbound.isEnabled}`);
    if (alreadyConfigured) {
      console.log(
        `  ⚠️  [${i}] Existing config for chain selector ${destChainSelector} will be replaced.`
      );
    } else {
      console.log(
        `  [${i}] New chain selector ${destChainSelector} will be added.`
      );
    }

    chainUpdates.push({
      remoteChainSelector: destChainSelector,
      remotePoolAddresses: encodedPools as `0x${string}`[],
      remoteTokenAddress: tokenEncoded as `0x${string}`,
      outboundRateLimiterConfig: outbound,
      inboundRateLimiterConfig: inbound,
    });
  }

  const chainSelectorRemovals = chainUpdates
    .filter((_, i) => shouldRemove[i])
    .map((u) => u.remoteChainSelector);

  console.log(`[Step 1] Applying chain updates to pool on ${chainName}`);
  const txHash = await poolContract.write.applyChainUpdates(
    [chainSelectorRemovals, chainUpdates],
    { account: wallet.account }
  );
  console.log(`⏳ Tx: ${explorerUrl}/tx/${txHash}`);
  await publicClient.waitForTransactionReceipt({ hash: txHash, confirmations });
  console.log("✅ Chain updates applied successfully!");

  console.log("");
  console.log("========================================");
  console.log(`✅ Chain Updates Complete on ${chainName}!`);
  console.log("========================================");
  console.log(`Token Pool:               ${poolAddress}`);
  console.log(`Remote chains configured: ${chainUpdates.length}`);
  console.log(
    `Explorer:                 ${explorerUrl}/address/${poolAddress}`
  );
  console.log("========================================");
  console.log("");
}

export const applyChainUpdates = task(
  "applyChainUpdates",
  "Configures cross-chain lanes on the source TokenPool"
)
  .addFlag({
    name: "viajsonfile",
    description: `Read config from ${JSON_INPUT_FILE} (supports multiple chains/pools)`,
  })
  .addOption({
    name: "destchain",
    description:
      "Destination chain name (e.g. MANTLE_SEPOLIA or mantleSepolia) — CLI mode only",
    defaultValue: "",
  })
  .addOption({
    name: "tokenpool",
    description: "Source token pool address (overrides env var)",
    defaultValue: "",
  })
  .addOption({
    name: "destpooladdress",
    description: "Destination pool address (overrides env var) — CLI mode only",
    defaultValue: "",
  })
  .addOption({
    name: "desttokenaddress",
    description:
      "Destination token address (overrides env var) — CLI mode only",
    defaultValue: "",
  })
  .addOption({
    name: "outboundcapacity",
    description:
      "Outbound rate limit capacity — isEnabled auto-set when > 0 — CLI mode only",
    defaultValue: "0",
  })
  .addOption({
    name: "outboundrate",
    description: "Outbound rate limit refill rate per second — CLI mode only",
    defaultValue: "0",
  })
  .addOption({
    name: "inboundcapacity",
    description: "Inbound rate limit capacity — CLI mode only",
    defaultValue: "0",
  })
  .addOption({
    name: "inboundrate",
    description: "Inbound rate limit refill rate per second — CLI mode only",
    defaultValue: "0",
  })
  .setAction(async () => ({
    default: async (
      {
        viajsonfile,
        destchain,
        tokenpool,
        destpooladdress,
        desttokenaddress,
        outboundcapacity,
        outboundrate,
        inboundcapacity,
        inboundrate,
      }: {
        viajsonfile: boolean;
        destchain: string;
        tokenpool: string;
        destpooladdress: string;
        desttokenaddress: string;
        outboundcapacity: string;
        outboundrate: string;
        inboundcapacity: string;
        inboundrate: string;
      },
      hre: HardhatRuntimeEnvironment
    ) => {
      const networkConnection = await hre.network.getOrCreate();
      const { viem } = networkConnection;
      const networkName = networkConnection.networkName;
      const sourceConfig = getConfigByNetworkName(networkName);

      // Resolve source pool — JSON "sourcePool" field takes priority, then CLI flag, then env var.
      let poolAddress: Address;
      if (viajsonfile) {
        const raw = JSON.parse(fs.readFileSync(JSON_INPUT_FILE, "utf8")) as {
          sourcePool?: string;
        };
        if (raw.sourcePool && isAddress(raw.sourcePool)) {
          poolAddress = raw.sourcePool;
        } else {
          poolAddress = getDeployedTokenPool(sourceConfig.chainId) as Address;
        }
      } else if (tokenpool) {
        if (!isAddress(tokenpool))
          throw new Error(`Invalid pool address: ${tokenpool}`);
        poolAddress = tokenpool;
      } else {
        poolAddress = getDeployedTokenPool(sourceConfig.chainId) as Address;
      }

      const [wallet] = await viem.getWalletClients();
      const poolContract = await viem.getContractAt(
        "BurnMintTokenPool",
        poolAddress
      );

      if (viajsonfile) {
        return runFromJson(
          poolAddress,
          sourceConfig,
          poolContract,
          viem,
          wallet
        );
      }

      // ── CLI mode ─────────────────────────────────────────────────────────────
      if (!destchain)
        throw new Error(
          "--destchain is required in CLI mode (e.g. MANTLE_SEPOLIA or mantleSepolia)"
        );

      const destConfig = getConfigByNetworkName(destchain);
      const { confirmations, chainName, explorerUrl } = sourceConfig;
      const destChainSelector = BigInt(destConfig.chainSelector);
      const destChainFamily = destConfig.chainFamily as ChainFamily;

      // CLI overrides take precedence over env var fallbacks.
      // EVM destinations: fall back to the deployed-address helpers.
      // Non-EVM destinations: addresses must be supplied explicitly via CLI flag or
      // <CHAIN_NAME_IDENTIFIER>_TOKEN_POOL / _TOKEN env var.
      let rawDestPoolAddress: string;
      let rawDestTokenAddress: string;

      if (destChainFamily === "evm") {
        rawDestPoolAddress =
          destpooladdress || getDeployedTokenPool(destConfig.chainId);
        rawDestTokenAddress =
          desttokenaddress || getDeployedToken(destConfig.chainId);
      } else {
        const chainSpecificPool =
          process.env[`${destConfig.chainNameIdentifier}_TOKEN_POOL`] ?? "";
        rawDestPoolAddress = destpooladdress || chainSpecificPool;
        if (!rawDestPoolAddress) {
          throw new Error(
            `Destination pool not set. Pass --destpooladdress or export ${destConfig.chainNameIdentifier}_TOKEN_POOL.`
          );
        }
        const chainSpecificToken =
          process.env[`${destConfig.chainNameIdentifier}_TOKEN`] ?? "";
        rawDestTokenAddress = desttokenaddress || chainSpecificToken;
        if (!rawDestTokenAddress) {
          throw new Error(
            `Destination token not set. Pass --desttokenaddress or export ${destConfig.chainNameIdentifier}_TOKEN.`
          );
        }
      }

      validateChainAddress(rawDestPoolAddress, destChainFamily);
      validateChainAddress(rawDestTokenAddress, destChainFamily);

      const destPoolEncoded = prepareChainAddressData(
        rawDestPoolAddress,
        destChainFamily
      );
      const destTokenEncoded = prepareChainAddressData(
        rawDestTokenAddress,
        destChainFamily
      );

      const outCapacity = BigInt(outboundcapacity);
      const outRate = BigInt(outboundrate);
      const inCapacity = BigInt(inboundcapacity);
      const inRate = BigInt(inboundrate);
      const outboundRateLimiter = {
        isEnabled: outCapacity > 0n || outRate > 0n,
        capacity: outCapacity,
        rate: outRate,
      };
      const inboundRateLimiter = {
        isEnabled: inCapacity > 0n || inRate > 0n,
        capacity: inCapacity,
        rate: inRate,
      };

      console.log("");
      console.log("========================================");
      console.log("🔗 Apply Chain Updates");
      console.log("========================================");
      console.log(`Chain:        ${chainName}`);
      console.log(`Remote Chain: ${destConfig.chainName}`);
      console.log(`Token Pool:   ${poolAddress}`);
      console.log(`Action:       Configure cross-chain lane`);
      console.log("========================================");
      console.log("");

      console.log("Chain Update Parameters:");
      console.log(`  Source Pool:                  ${poolAddress}`);
      console.log(`  Destination Chain Selector:   ${destChainSelector}`);
      console.log(`  Destination Chain Family:     ${destChainFamily}`);
      console.log(`  Destination Pool:             ${rawDestPoolAddress}`);
      console.log(`  Destination Token:            ${rawDestTokenAddress}`);
      console.log(
        `  Outbound Rate Limit Enabled:  ${outboundRateLimiter.isEnabled}`
      );
      console.log(
        `  Outbound Rate Limit Capacity: ${outboundRateLimiter.capacity}`
      );
      console.log(
        `  Outbound Rate Limit Rate:     ${outboundRateLimiter.rate}`
      );
      console.log(
        `  Inbound Rate Limit Enabled:   ${inboundRateLimiter.isEnabled}`
      );
      console.log(
        `  Inbound Rate Limit Capacity:  ${inboundRateLimiter.capacity}`
      );
      console.log(`  Inbound Rate Limit Rate:      ${inboundRateLimiter.rate}`);
      console.log("");

      const publicClient = await viem.getPublicClient();

      // Idempotent: remove existing config before re-adding
      const chainAlreadyConfigured = await poolContract.read.isSupportedChain([
        destChainSelector,
      ]);
      const chainSelectorRemovals: bigint[] = chainAlreadyConfigured
        ? [destChainSelector]
        : [];
      if (chainAlreadyConfigured) {
        console.log(
          "⚠️  Existing config detected for destination chain selector; replacing it."
        );
      } else {
        console.log(
          "No existing config for destination chain selector; adding new one."
        );
      }

      const chainUpdates = [
        {
          remoteChainSelector: destChainSelector,
          remotePoolAddresses: [destPoolEncoded],
          remoteTokenAddress: destTokenEncoded,
          outboundRateLimiterConfig: outboundRateLimiter,
          inboundRateLimiterConfig: inboundRateLimiter,
        },
      ];

      console.log(`[Step 1] Applying chain updates to pool on ${chainName}`);
      const txHash = await poolContract.write.applyChainUpdates(
        [chainSelectorRemovals, chainUpdates],
        { account: wallet.account }
      );
      console.log(`⏳ Tx: ${explorerUrl}/tx/${txHash}`);
      await publicClient.waitForTransactionReceipt({
        hash: txHash,
        confirmations,
      });

      console.log("");
      console.log("========================================");
      console.log(`✅ Chain Updates Complete on ${chainName}!`);
      console.log("========================================");
      console.log(`Token Pool:   ${poolAddress}`);
      console.log(`Explorer:     ${explorerUrl}/address/${poolAddress}`);
      console.log(`Transaction:  ${explorerUrl}/tx/${txHash}`);
      console.log(
        `Remote Chain: ${destConfig.chainName} (Selector: ${destChainSelector})`
      );
      console.log(`Remote Pool:  ${rawDestPoolAddress}`);
      console.log("========================================");
      console.log("");
    },
  }))
  .build();
