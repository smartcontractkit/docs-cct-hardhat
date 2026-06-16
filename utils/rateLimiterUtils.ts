import type { Address, PublicClient } from "viem";

// Shared helpers for rate limiter reads, logging, and updates.

/**
 * Minimal ABI for TokenPool v1 rate limiter functions removed in v2.
 * Use with wallet.writeContract when targeting a v1 pool.
 */
export const tokenPoolV1Abi = [
  {
    name: "getCurrentOutboundRateLimiterState",
    type: "function",
    inputs: [{ name: "remoteChainSelector", type: "uint64" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "tokens", type: "uint128" },
          { name: "lastUpdated", type: "uint32" },
          { name: "isEnabled", type: "bool" },
          { name: "capacity", type: "uint128" },
          { name: "rate", type: "uint128" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    name: "getCurrentInboundRateLimiterState",
    type: "function",
    inputs: [{ name: "remoteChainSelector", type: "uint64" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "tokens", type: "uint128" },
          { name: "lastUpdated", type: "uint32" },
          { name: "isEnabled", type: "bool" },
          { name: "capacity", type: "uint128" },
          { name: "rate", type: "uint128" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    name: "setChainRateLimiterConfig",
    type: "function",
    inputs: [
      { name: "remoteChainSelector", type: "uint64" },
      {
        name: "outboundConfig",
        type: "tuple",
        components: [
          { name: "isEnabled", type: "bool" },
          { name: "capacity", type: "uint128" },
          { name: "rate", type: "uint128" },
        ],
      },
      {
        name: "inboundConfig",
        type: "tuple",
        components: [
          { name: "isEnabled", type: "bool" },
          { name: "capacity", type: "uint128" },
          { name: "rate", type: "uint128" },
        ],
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

export type RateLimiterConfig = {
  isEnabled: boolean;
  capacity: bigint;
  rate: bigint;
};

export type TokenBucket = {
  tokens: bigint;
  lastUpdated: number;
  isEnabled: boolean;
  capacity: bigint;
  rate: bigint;
};

export type RateLimitUpdate = {
  updateOutbound: boolean;
  outboundEnabled: boolean;
  outboundCapacity: bigint;
  outboundRate: bigint;
  updateInbound: boolean;
  inboundEnabled: boolean;
  inboundCapacity: bigint;
  inboundRate: bigint;
};

/**
 * Builds a RateLimitUpdate from CLI option strings.
 * isEnabled defaults to true when capacity or rate is non-zero (matching Foundry behaviour).
 * updateOutbound/updateInbound are true when any outbound/inbound option is non-default.
 */
export function buildRateLimitUpdate(opts: {
  outboundcapacity: string;
  outboundrate: string;
  outboundenabled: string; // "true" | "false" | "" (not provided)
  inboundcapacity: string;
  inboundrate: string;
  inboundenabled: string; // "true" | "false" | "" (not provided)
}): RateLimitUpdate {
  const outboundCapacity = BigInt(opts.outboundcapacity || "0");
  const outboundRate = BigInt(opts.outboundrate || "0");
  const inboundCapacity = BigInt(opts.inboundcapacity || "0");
  const inboundRate = BigInt(opts.inboundrate || "0");

  const updateOutbound =
    outboundCapacity > 0n || outboundRate > 0n || opts.outboundenabled !== "";
  const updateInbound =
    inboundCapacity > 0n || inboundRate > 0n || opts.inboundenabled !== "";

  // isEnabled: explicit flag wins; otherwise auto-derive from capacity/rate being non-zero
  const outboundEnabled =
    opts.outboundenabled !== ""
      ? opts.outboundenabled === "true"
      : outboundCapacity > 0n || outboundRate > 0n;
  const inboundEnabled =
    opts.inboundenabled !== ""
      ? opts.inboundenabled === "true"
      : inboundCapacity > 0n || inboundRate > 0n;

  return {
    updateOutbound,
    outboundEnabled,
    outboundCapacity: outboundEnabled ? outboundCapacity : 0n,
    outboundRate: outboundEnabled ? outboundRate : 0n,
    updateInbound,
    inboundEnabled,
    inboundCapacity: inboundEnabled ? inboundCapacity : 0n,
    inboundRate: inboundEnabled ? inboundRate : 0n,
  };
}

/**
 * Returns true if the pool exposes the v2 getCurrentRateLimiterState(selector, bool) function.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function isV2Pool(
  poolContract: any,
  remoteChainSelector: bigint
): Promise<boolean> {
  try {
    await poolContract.read.getCurrentRateLimiterState([
      remoteChainSelector,
      true,
    ]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Fetches the current outbound and inbound TokenBuckets for a lane.
 * Falls back to v1 API (getCurrentOutboundRateLimiterState / getCurrentInboundRateLimiterState) when isV2 is false.
 */
export async function getCurrentBuckets(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  poolContract: any,
  poolAddress: Address,
  publicClient: PublicClient,
  remoteChainSelector: bigint,
  fastFinality: boolean,
  v2: boolean
): Promise<{ outbound: TokenBucket; inbound: TokenBucket }> {
  if (v2) {
    const [outbound, inbound] =
      await poolContract.read.getCurrentRateLimiterState([
        remoteChainSelector,
        fastFinality,
      ]);
    return {
      outbound: outbound as TokenBucket,
      inbound: inbound as TokenBucket,
    };
  }

  // v1 pools expose per-direction getters that are not present in the v2 ABI.
  // Use the minimal v1 ABI directly to avoid AbiFunctionNotFoundError.
  const outbound = (await publicClient.readContract({
    address: poolAddress,
    abi: tokenPoolV1Abi,
    functionName: "getCurrentOutboundRateLimiterState",
    args: [remoteChainSelector],
  })) as unknown as TokenBucket;
  const inbound = (await publicClient.readContract({
    address: poolAddress,
    abi: tokenPoolV1Abi,
    functionName: "getCurrentInboundRateLimiterState",
    args: [remoteChainSelector],
  })) as unknown as TokenBucket;

  return { outbound, inbound };
}

/**
 * Fetches the current rate limiter configs (isEnabled/capacity/rate) for a lane.
 * Strips the live token fill level from the TokenBucket — not needed for updates.
 */
export async function getCurrentConfigs(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  poolContract: any,
  poolAddress: Address,
  publicClient: PublicClient,
  remoteChainSelector: bigint,
  fastFinality: boolean,
  v2: boolean
): Promise<{ outbound: RateLimiterConfig; inbound: RateLimiterConfig }> {
  const { outbound: ob, inbound: ib } = await getCurrentBuckets(
    poolContract,
    poolAddress,
    publicClient,
    remoteChainSelector,
    fastFinality,
    v2
  );
  return {
    outbound: { isEnabled: ob.isEnabled, capacity: ob.capacity, rate: ob.rate },
    inbound: { isEnabled: ib.isEnabled, capacity: ib.capacity, rate: ib.rate },
  };
}

function logBucket(label: string, bucket: TokenBucket): void {
  console.log(`  ${label} Enabled:  ${bucket.isEnabled}`);
  console.log(`  ${label} Capacity: ${bucket.capacity}`);
  console.log(`  ${label} Rate:     ${bucket.rate}`);
  console.log(`  ${label} Tokens:   ${bucket.tokens}`);
}

function logBucketGroup(label: string, bucket: TokenBucket): void {
  console.log(`  ${label}:`);
  console.log(`    Enabled:  ${bucket.isEnabled}`);
  console.log(`    Capacity: ${bucket.capacity}`);
  console.log(`    Rate:     ${bucket.rate}`);
  console.log(`    Tokens:   ${bucket.tokens}`);
}

/**
 * Logs the current rate limiter state for a lane.
 * For v2 pools: shows the custom finality bucket where enabled, standard fallback otherwise.
 * For v1 pools: always shows the standard bucket.
 */
export async function logRateLimiterStateWithFallback(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  poolContract: any,
  poolAddress: Address,
  publicClient: PublicClient,
  remoteChainSelector: bigint,
  v2: boolean
): Promise<void> {
  if (!v2) {
    const outbound = (await publicClient.readContract({
      address: poolAddress,
      abi: tokenPoolV1Abi,
      functionName: "getCurrentOutboundRateLimiterState",
      args: [remoteChainSelector],
    })) as unknown as TokenBucket;
    const inbound = (await publicClient.readContract({
      address: poolAddress,
      abi: tokenPoolV1Abi,
      functionName: "getCurrentInboundRateLimiterState",
      args: [remoteChainSelector],
    })) as unknown as TokenBucket;
    logBucket("Outbound [standard]", outbound as TokenBucket);
    logBucket("Inbound  [standard]", inbound as TokenBucket);
    console.log("");
    return;
  }

  const [customOut, customIn] =
    await poolContract.read.getCurrentRateLimiterState([
      remoteChainSelector,
      true,
    ]);
  const co = customOut as TokenBucket;
  const ci = customIn as TokenBucket;

  // Only fetch standard buckets when at least one direction needs the fallback
  let stdOut: TokenBucket | undefined;
  let stdIn: TokenBucket | undefined;
  if (!co.isEnabled || !ci.isEnabled) {
    const [so, si] = await poolContract.read.getCurrentRateLimiterState([
      remoteChainSelector,
      false,
    ]);
    stdOut = so as TokenBucket;
    stdIn = si as TokenBucket;
  }

  co.isEnabled
    ? logBucketGroup("Outbound [fast finality]", co)
    : logBucketGroup("Outbound [standard fallback]", stdOut!);
  ci.isEnabled
    ? logBucketGroup("Inbound [fast finality]", ci)
    : logBucketGroup("Inbound [standard fallback]", stdIn!);
  console.log("");
}

/**
 * Logs the current rate limiter state for a lane (standard or fast finality bucket, no fallback).
 * For v1 pools fastFinality is ignored — always reads the standard bucket.
 */
export async function logRateLimiterState(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  poolContract: any,
  poolAddress: Address,
  publicClient: PublicClient,
  remoteChainSelector: bigint,
  fastFinality: boolean,
  v2: boolean
): Promise<void> {
  const { outbound, inbound } = await getCurrentBuckets(
    poolContract,
    poolAddress,
    publicClient,
    remoteChainSelector,
    fastFinality,
    v2
  );
  logBucket("Outbound", outbound);
  logBucket("Inbound ", inbound);
  console.log("");
}

/**
 * Returns a human-readable direction label for the rate limit update.
 */
export function directionLabel(
  updateOutbound: boolean,
  updateInbound: boolean
): string {
  if (updateOutbound && updateInbound) return "Both";
  if (updateOutbound) return "Outbound only";
  return "Inbound only";
}

/**
 * Logs the new rate limiter config that will be applied.
 */
export function logNewConfig(
  updateOutbound: boolean,
  outbound: RateLimiterConfig,
  updateInbound: boolean,
  inbound: RateLimiterConfig
): void {
  console.log("New Configuration:");
  if (updateOutbound) {
    console.log(`  Outbound Enabled:  ${outbound.isEnabled}`);
    if (outbound.isEnabled) {
      console.log(`  Outbound Capacity: ${outbound.capacity}`);
      console.log(`  Outbound Rate:     ${outbound.rate}`);
    }
  }
  if (updateInbound) {
    console.log(`  Inbound Enabled:   ${inbound.isEnabled}`);
    if (inbound.isEnabled) {
      console.log(`  Inbound Capacity:  ${inbound.capacity}`);
      console.log(`  Inbound Rate:      ${inbound.rate}`);
    }
  }
  console.log("");
}
