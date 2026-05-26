import { mkdirSync, writeFileSync } from "fs";
import { resolve } from "path";

type TokenDeploymentParams = {
  type: "token";
  chainNameIdentifier: string;
  symbol: string;
  tokenAddress: string;
};

type TokenPoolDeploymentParams = {
  type: "token-pool";
  chainNameIdentifier: string;
  symbol: string;
  tokenPoolAddress: string;
  tokenAddress: string;
};

type LockReleaseTokenPoolDeploymentParams = {
  type: "lock-release-token-pool";
  chainNameIdentifier: string;
  symbol: string;
  tokenPoolAddress: string;
  tokenAddress: string;
  lockBoxAddress: string;
};

type LockBoxDeploymentParams = {
  type: "lock-box";
  chainNameIdentifier: string;
  symbol: string;
  lockBoxAddress: string;
  tokenAddress: string;
};

type PoolHooksDeploymentParams = {
  type: "pool-hooks";
  chainNameIdentifier: string;
  hooksAddress: string;
};

/**
 * Saves deployment JSON under deployments/tokens/, deployments/token-pools/,
 * deployments/lock-boxes/, or deployments/advanced-pool-hooks/ depending on the `type` field.
 */
export function saveDeployment(
  params:
    | TokenDeploymentParams
    | TokenPoolDeploymentParams
    | LockReleaseTokenPoolDeploymentParams
    | LockBoxDeploymentParams
    | PoolHooksDeploymentParams
): void {
  const { chainNameIdentifier } = params;
  const timestamp = Math.floor(Date.now() / 1000);
  let subdir: string;
  let filename: string;
  let content: Record<string, string>;

  if (params.type === "token") {
    subdir = "tokens";
    filename = `${timestamp}-${params.symbol}-Token.json`;
    content = { [`${chainNameIdentifier}_TOKEN`]: params.tokenAddress };
  } else if (params.type === "token-pool") {
    subdir = "token-pools";
    filename = `${timestamp}-${params.symbol}-BurnMintTokenPool.json`;
    content = {
      [`${chainNameIdentifier}_TOKEN_POOL`]: params.tokenPoolAddress,
      [`${chainNameIdentifier}_TOKEN`]: params.tokenAddress,
    };
  } else if (params.type === "lock-release-token-pool") {
    subdir = "token-pools";
    filename = `${timestamp}-${params.symbol}-LockReleaseTokenPool.json`;
    content = {
      [`${chainNameIdentifier}_TOKEN_POOL`]: params.tokenPoolAddress,
      LOCK_BOX: params.lockBoxAddress,
      [`${chainNameIdentifier}_TOKEN`]: params.tokenAddress,
    };
  } else if (params.type === "lock-box") {
    subdir = "lock-boxes";
    filename = `${timestamp}-${params.symbol}-LockBox.json`;
    content = {
      LOCK_BOX: params.lockBoxAddress,
      [`${chainNameIdentifier}_TOKEN`]: params.tokenAddress,
    };
  } else {
    subdir = "advanced-pool-hooks";
    filename = `${timestamp}-AdvancedPoolHooks.json`;
    content = { POOL_HOOKS: params.hooksAddress };
  }

  const dir = resolve(
    process.cwd(),
    "deployments",
    subdir,
    chainNameIdentifier
  );
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, filename), JSON.stringify(content, null, 2));
  console.log(
    `Deployment saved: deployments/${subdir}/${chainNameIdentifier}/${filename}`
  );
}
