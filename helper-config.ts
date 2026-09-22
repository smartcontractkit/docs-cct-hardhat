import {
  createPublicClient,
  createWalletClient,
  http,
  type Chain,
  type Address,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { validateChainAddress, type ChainFamily } from "./utils/chainHandlers";

// Network configuration data (matching Foundry's HelperConfig.s.sol structure)
// chainNameIdentifier is automatically set from the object key
const rawConfigData = {
  ETHEREUM_SEPOLIA: {
    chainFamily: "evm" as const,
    chainId: 11155111,
    chainSelector: "16015286601757825753",
    router: "0x0BF3dE8c5D3e8A2B34D2BEeB17ABfCeBaf363A59",
    rmnProxy: "0xba3f6251de62dED61Ff98590cB2fDf6871FbB991",
    tokenAdminRegistry: "0x95F29FEE11c5C55d26cCcf1DB6772DE953B37B82",
    registryModuleOwnerCustom: "0xa3c796d480638d7476792230da1E2ADa86e031b0",
    link: "0x779877A7B0D9E8603169DdbD7836e478b4624789",
    ccipBnM: "0x9a97f119cfe1d5ea77c264441c0a0abc9b34e119",
    confirmations: 2,
    chainName: "Ethereum Sepolia",
    explorerUrl: "https://sepolia.etherscan.io",
    nativeCurrencySymbol: "ETH",
  },
  ZERO_G_TESTNET: {
    chainFamily: "evm" as const,
    chainId: 16602,
    chainSelector: "6892437333620424805",
    router: "0xD610B8f58689de7755947C05342A2DFaC30ebD57",
    rmnProxy: "0x995ab3eC29E1660A93cFddAA19C710A1b5afCCc9",
    tokenAdminRegistry: "0x23a5084Fa78104F3DF11C63Ae59fcac4f6AD9DeE",
    registryModuleOwnerCustom: "0x0820f975ce90EE5c508657F0C58b71D1fcc85cE0",
    link: "0xe5e3a4fF1773d043a387b16Ceb3c91cC49bAFD54",
    ccipBnM: "0xDbB255D37BC7c9e2b08e5a1C9f9506c9E85F1644",
    confirmations: 2,
    chainName: "0g Galileo Testnet",
    explorerUrl: "https://chainscan-galileo.0g",
    nativeCurrencySymbol: "OG",
  },
  PLUME_TESTNET: {
    chainFamily: "evm" as const,
    chainId: 98867,
    chainSelector: "13874588925447303949",
    router: "0x5e5Fd4720E1CE826138D043aF578D69f48af502F",
    rmnProxy: "0xAa3ae5481EE445711252131f1516922D0962916A",
    tokenAdminRegistry: "0x855cF0d18A0BeBEDA7c1CD2F943686120cCCC6bd",
    registryModuleOwnerCustom: "0x693926456C8b210f56E29Bc5b4514B32A5224c88",
    link: "0xB97e3665AEAF96BDD6b300B2e0C93C662104A068",
    ccipBnM: "0x225fAc4130595d1C7dabbE61A8bA9B051440b76c",
    confirmations: 2,
    chainName: "Plume Testnet",
    explorerUrl: "https://testnet-explorer.plume.org",
    nativeCurrencySymbol: "PLUME",
  },
  INK_SEPOLIA: {
    chainFamily: "evm" as const,
    chainId: 763373,
    chainSelector: "9763904284804119144",
    router: "0x17fCda531D8E43B4e2a2A2492FBcd4507a1685A1",
    rmnProxy: "0x84017cfddD12D319E5bBf090e0de6d55B78160Cb",
    tokenAdminRegistry: "0x3A849a05a590FeaEf26c2d425241A2BF29307161",
    registryModuleOwnerCustom: "0xaB018890bBdDf9B80E21d1c335c5f6acdbE0f5D6",
    link: "0x3423C922911956b1Ccbc2b5d4f38216a6f4299b4",
    ccipBnM: "0x414dbe1d58dd9BA7C84f7Fc0e4f82bc858675d37",
    confirmations: 2,
    chainName: "Ink Sepolia",
    explorerUrl: "https://explorer-sepolia.inkonchain.com",
    nativeCurrencySymbol: "INK",
  },
  ARBITRUM_SEPOLIA: {
    chainFamily: "evm" as const,
    chainId: 421614,
    chainSelector: "3478487238524512106",
    router: "0x2a9C5afB0d0e4BAb2BCdaE109EC4b0c4Be15a165",
    rmnProxy: "0x9527E2d01A3064ef6b50c1Da1C0cC523803BCFF2",
    tokenAdminRegistry: "0x8126bE56454B628a88C17849B9ED99dd5a11Bd2f",
    registryModuleOwnerCustom: "0xaD417c0611dBD225471D31F056b8B6beC1CBC153",
    link: "0xb1D4538B4571d411F07960EF2838Ce337FE1E80E",
    ccipBnM: "0x686325E21F55c64Bf724047E0fe7C454D6faD37D",
    confirmations: 2,
    chainName: "Arbitrum Sepolia",
    explorerUrl: "https://sepolia.arbiscan.io",
    nativeCurrencySymbol: "ETH",
  },
  MANTLE_SEPOLIA: {
    chainFamily: "evm" as const,
    chainId: 5003,
    chainSelector: "8236463271206331221",
    router: "0xFd33fd627017fEf041445FC19a2B6521C9778f86",
    rmnProxy: "0xcCB84Ec3F6AFdD2052134f74aaAc95Ae41A7B333",
    tokenAdminRegistry: "0x0F1eE88A582f31d92510E300fc1330AA5a525D51",
    registryModuleOwnerCustom: "0xf76cE612250eeEb8889F49FBCB11f1c2705305F6",
    link: "0x22bdEdEa0beBdD7CfFC95bA53826E55afFE9DE04",
    ccipBnM: "0xBB370F829bdB6fC44f3D34e2A2107578bB2c3F0B",
    confirmations: 2,
    chainName: "Mantle Sepolia",
    explorerUrl: "https://sepolia.mantlescan.xyz",
    nativeCurrencySymbol: "MNT",
  },

  // ── Non-EVM destination chains ──────────────────────────────────────────────
  // Non-EVM chains are only supported as the **destination** chain when calling
  // applyChainUpdates — i.e. to register a non-EVM token pool on an EVM source
  // chain. They cannot be used as source chains in this repo.
  // That's why fields like router, rmnProxy, tokenAdminRegistry, etc.
  // are not included. Only chainSelector, chainName, chainFamily, and
  // chainNameIdentifier (auto-set from the key) are used.
  // Add more entries here as new non-EVM lanes go live.
  SOLANA_DEVNET: {
    chainFamily: "svm" as const,
    chainId: 0, // NOT REQUIRED — non-EVM chain (no EVM chain ID)
    chainSelector: "16423721717087811551",
    chainName: "Solana Devnet",
    confirmations: 0, // NOT REQUIRED — non-EVM chain
    explorerUrl: "", // NOT REQUIRED — non-EVM chain
    nativeCurrencySymbol: "", // NOT REQUIRED — non-EVM chain
  },
} as const;

export interface NetworkConfig {
  chainFamily: string;
  chainId: number;
  chainSelector: string;
  router?: Address;
  rmnProxy?: Address;
  tokenAdminRegistry?: Address;
  registryModuleOwnerCustom?: Address;
  link?: Address;
  ccipBnM?: Address;
  confirmations: number;
  chainName: string;
  chainNameIdentifier: string;
  explorerUrl: string;
  nativeCurrencySymbol: string;
}

// Automatically add chainNameIdentifier from the object key.
export const configData: Record<string, NetworkConfig> = Object.fromEntries(
  Object.entries(rawConfigData).map(([key, config]) => [
    key,
    { ...config, chainNameIdentifier: key } as NetworkConfig,
  ]),
);

export function getNetworkConfig(chainId: number): NetworkConfig {
  const entry = Object.values(configData).find((c) => c.chainId === chainId);
  if (!entry) throw new Error(`Unsupported chain ID: ${chainId}`);
  return entry;
}

// Normalizes any network name variant to a comparable lowercase alphanumeric string.
// "ETHEREUM_SEPOLIA" | "ethereumSepolia" | "ethereumsepolia" → "ethereumsepolia"
export function toHardhatNetworkName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Auto-derive short aliases from the last underscore-segment of each EVM config key.
// Non-EVM destination-only chains (e.g. SOLANA_DEVNET) are excluded — their last segment
// (e.g. "devnet") is too generic and likely to collide with future chains.
// Collision rule: if multiple keys share the same last segment, the ETHEREUM_* key wins.
// Any remaining ties (two non-Ethereum keys with the same suffix) are dropped.
// e.g. "sepolia" → ETHEREUM_SEPOLIA wins over ARBITRUM_SEPOLIA / BASE_SEPOLIA
const _lastSegmentEntries = Object.entries(rawConfigData)
  .filter(([, config]) => config.chainFamily === "evm")
  .map(
    ([key]) => [key.split("_").pop()!.toLowerCase(), key] as [string, string],
  );
export const networkAliases: Record<string, string> = Object.fromEntries(
  Array.from(
    _lastSegmentEntries.reduce((map, [alias, key]) => {
      const existing = map.get(alias);
      if (!existing) {
        // First key with this suffix — register it.
        map.set(alias, key);
      } else if (
        key.startsWith("ETHEREUM_") &&
        !existing.startsWith("ETHEREUM_")
      ) {
        // "sepolia": ARBITRUM_SEPOLIA registered, ETHEREUM_SEPOLIA found → overwrite with ETHEREUM_SEPOLIA.
        map.set(alias, key);
      } else if (
        !key.startsWith("ETHEREUM_") &&
        !existing.startsWith("ETHEREUM_")
      ) {
        // "sepolia": ARBITRUM_SEPOLIA vs BASE_SEPOLIA, no Ethereum variant → drop as ambiguous.
        map.set(alias, "");
      }
      // "sepolia": ETHEREUM_SEPOLIA already registered, BASE_SEPOLIA found → keep Ethereum.
      return map;
    }, new Map<string, string>()),
  ).filter(([, key]) => key !== ""),
);

/**
 * Returns all valid Hardhat network name variants for a configData key.
 * e.g. "ETHEREUM_SEPOLIA" → ["ethereumsepolia", "ethereumSepolia", "ETHEREUM_SEPOLIA", "sepolia"]
 *      "AVALANCHE_FUJI"   → ["avalanchefuji",   "avalancheFuji",   "AVALANCHE_FUJI",   "fuji"]
 * Collision rule for short aliases: ETHEREUM_* prefix wins; other ties are dropped.
 */
export function getNetworkVariants(configKey: string): string[] {
  const normalized = toHardhatNetworkName(configKey);
  const camelCase = configKey
    .toLowerCase()
    .split("_")
    .map((p, i) => (i === 0 ? p : p[0].toUpperCase() + p.slice(1)))
    .join("");
  const variants = new Set([normalized, camelCase, configKey]);
  for (const [alias, key] of Object.entries(networkAliases)) {
    if (key === configKey) variants.add(alias);
  }
  return [...variants];
}

/**
 * Resolves any network name variant to a NetworkConfig.
 * Accepts: "sepolia", "ethereumSepolia", "ETHEREUM_SEPOLIA", "ethereumsepolia", "fuji", "amoy", etc.
 * "sepolia" resolves to ETHEREUM_SEPOLIA — ETHEREUM_* wins collisions automatically.
 */
export function getConfigByNetworkName(networkName: string): NetworkConfig {
  const normalized = toHardhatNetworkName(networkName);
  // Check short aliases first
  const aliasKey = networkAliases[normalized];
  if (aliasKey) return configData[aliasKey];
  // Then match against normalized config keys
  const entry = Object.entries(configData).find(
    ([key]) => toHardhatNetworkName(key) === normalized,
  );
  if (!entry)
    throw new Error(`Network "${networkName}" not found in helper-config`);
  return entry[1];
}

export function getDeployedToken(chainId: number): string {
  const config = getNetworkConfig(chainId);
  const envVarName = `${config.chainNameIdentifier}_TOKEN`;
  const address = process.env[envVarName];
  if (!address) throw new Error(`Environment variable ${envVarName} not set`);
  validateChainAddress(address, config.chainFamily as ChainFamily);
  return address;
}

export function getDeployedTokenPool(chainId: number): string {
  const config = getNetworkConfig(chainId);
  const envVarName = `${config.chainNameIdentifier}_TOKEN_POOL`;
  const address = process.env[envVarName];
  if (!address) throw new Error(`Environment variable ${envVarName} not set`);
  validateChainAddress(address, config.chainFamily as ChainFamily);
  return address;
}

export function parseChainName(chainName: string): number {
  const entry = Object.values(configData).find(
    (c) => c.chainNameIdentifier === chainName,
  );
  if (!entry) throw new Error(`Invalid chain name: ${chainName}`);
  return entry.chainId;
}

export function getChainName(chainId: number): string {
  return getNetworkConfig(chainId).chainName;
}

export function getChainNameBySelector(chainSelector: string): string {
  const entry = Object.values(configData).find(
    (c) => c.chainSelector === chainSelector,
  );
  return entry?.chainName ?? "Unknown";
}

export function getNativeCurrencySymbol(chainId: number): string {
  return getNetworkConfig(chainId).nativeCurrencySymbol;
}

export function getExplorerUrl(
  chainId: number,
  pathType: string,
  address: string,
): string {
  return `${getNetworkConfig(chainId).explorerUrl}${pathType}${address}`;
}

export async function getClients(chainName: string): Promise<{
  publicClient: PublicClient;
  walletClient: WalletClient;
  account: ReturnType<typeof privateKeyToAccount>;
  chain: Chain;
}> {
  // Dynamic import to avoid circular dependency with hardhat.config.ts
  const { config } = await import("hardhat");

  const chainConfig = configData[chainName];
  if (!chainConfig) {
    throw new Error(`Network ${chainName} not found in config`);
  }

  const hardhatNetworkName = toHardhatNetworkName(chainName);

  const networkConfig = config.networks[hardhatNetworkName];
  if (!networkConfig || networkConfig.type !== "http") {
    throw new Error(
      `Network "${hardhatNetworkName}" not found in Hardhat config or not an HTTP network`,
    );
  }

  const rpcUrl = await networkConfig.url.getUrl();

  const { accounts } = networkConfig;
  if (!Array.isArray(accounts) || accounts.length === 0) {
    throw new Error(
      `No accounts configured for network "${hardhatNetworkName}". ` +
        `Add accounts: [configVariable("PRIVATE_KEY")] to your network config in hardhat.config.ts.`,
    );
  }
  const privateKey = await accounts[0].getHexString();

  const account = privateKeyToAccount(privateKey as `0x${string}`);

  const chain: Chain = {
    id: chainConfig.chainId,
    name: chainName,
    nativeCurrency: {
      name: chainConfig.nativeCurrencySymbol,
      symbol: chainConfig.nativeCurrencySymbol,
      decimals: 18,
    },
    rpcUrls: {
      default: { http: [rpcUrl] },
      public: { http: [rpcUrl] },
    },
  };

  const publicClient = createPublicClient({
    chain,
    transport: http(rpcUrl),
  }) as PublicClient;

  const walletClient = createWalletClient({
    chain,
    transport: http(rpcUrl),
    account,
  }) as WalletClient;

  return { publicClient, walletClient, account, chain };
}
