import { task } from "hardhat/config";
import type { HardhatRuntimeEnvironment } from "hardhat/types/hre";
import { isAddress, zeroAddress, type Address } from "viem";
import { verifyContract } from "@nomicfoundation/hardhat-verify/verify";
import { getConfigByNetworkName, getDeployedToken } from "../../helper-config";
import { saveDeployment } from "../../utils/saveDeployment";

/**
 * Deploys a LockReleaseTokenPool for an existing ERC20 token.
 * Requires a pre-deployed ERC20LockBox (--lockbox).
 * After deployment, authorize the pool on the lockbox via its applyAuthorizedCallerUpdates.
 *
 * Usage:
 *   npx hardhat deployLockReleaseTokenPool --lockbox 0xLockBoxAddress --network sepolia
 *   npx hardhat deployLockReleaseTokenPool --lockbox 0xLockBoxAddress --tokenaddress 0xToken --network sepolia
 *   npx hardhat deployLockReleaseTokenPool --lockbox 0xLockBoxAddress --poolhooks 0xHooks --network sepolia
 */
export const deployLockReleaseTokenPool = task(
  "deployLockReleaseTokenPool",
  "Deploys a LockReleaseTokenPool for an existing ERC20 token"
)
  .addOption({
    name: "tokenaddress",
    description: "Token address (overrides env var)",
    defaultValue: "",
  })
  .addOption({
    name: "lockbox",
    description: "ERC20LockBox address (required)",
    defaultValue: "",
  })
  .addOption({
    name: "localtokendecimals",
    description: "Fallback decimals if the token does not expose decimals()",
    defaultValue: "18",
  })
  .addOption({
    name: "poolhooks",
    description:
      "Address of advanced pool hooks contract (default: zero address)",
    defaultValue: "",
  })
  .addFlag({
    name: "verify",
    description: "Verify the contract on the block explorer after deployment",
  })
  .setAction(async () => ({
    default: async (
      {
        tokenaddress,
        lockbox,
        localtokendecimals,
        poolhooks,
        verify,
      }: {
        tokenaddress: string;
        lockbox: string;
        localtokendecimals: string;
        poolhooks: string;
        verify: boolean;
      },
      hre: HardhatRuntimeEnvironment
    ) => {
      if (!lockbox)
        throw new Error("--lockbox is required (deploy an ERC20LockBox first)");
      if (!isAddress(lockbox))
        throw new Error(`Invalid lockbox address: ${lockbox}`);
      const lockBoxAddress = lockbox as Address;

      const networkConnection = await hre.network.getOrCreate();
      const { viem } = networkConnection;
      const networkName = networkConnection.networkName;
      const networkConfig = getConfigByNetworkName(networkName);
      const {
        router,
        rmnProxy,
        confirmations,
        chainName,
        explorerUrl,
        chainNameIdentifier,
      } = networkConfig;

      if (!router) throw new Error(`Router not defined for ${chainName}`);
      if (!rmnProxy) throw new Error(`RMN Proxy not defined for ${chainName}`);

      let tokenAddress: Address;
      if (tokenaddress) {
        if (!isAddress(tokenaddress))
          throw new Error(`Invalid token address: ${tokenaddress}`);
        tokenAddress = tokenaddress;
      } else {
        tokenAddress = getDeployedToken(networkConfig.chainId) as Address;
      }

      const poolHooksAddress = (poolhooks || zeroAddress) as Address;

      console.log("");
      console.log("========================================");
      console.log("🔐 Deploy Lock & Release Token Pool");
      console.log("========================================");
      console.log(`Chain:        ${chainName}`);
      console.log(`Action:       Deploy LockReleaseTokenPool`);
      console.log("========================================");
      console.log("");

      const publicClient = await viem.getPublicClient();

      // Read decimals from token; fall back to --localtokendecimals
      let decimals: number;
      try {
        const tokenContract = await viem.getContractAt(
          "IERC20Metadata",
          tokenAddress
        );
        decimals = await tokenContract.read.decimals();
      } catch {
        console.log(
          "⚠️  decimals() not available on token — falling back to --localtokendecimals"
        );
        decimals = Number(localtokendecimals);
      }

      console.log("Token Pool Parameters:");
      console.log(`  Token:       ${tokenAddress}`);
      console.log(`  Decimals:    ${decimals}`);
      console.log(`  Router:      ${router}`);
      console.log(`  RMN Proxy:   ${rmnProxy}`);
      console.log(`  LockBox:     ${lockBoxAddress}`);
      console.log(
        `  Pool Hooks:  ${
          poolHooksAddress !== zeroAddress ? poolHooksAddress : "None (0x0)"
        }`
      );
      console.log("");

      console.log(`[Step 1] Deploying LockReleaseTokenPool on ${chainName}`);
      const constructorArgs = Array<any>([
        tokenAddress,
        decimals,
        poolHooksAddress,
        rmnProxy,
        router,
        lockBoxAddress,
      ]);
      const { contract, deploymentTransaction } =
        await viem.sendDeploymentTransaction(
          "LockReleaseTokenPool",
          ...constructorArgs
        );
      console.log(`⏳ Deployment tx: ${deploymentTransaction.hash}`);
      console.log(`   Waiting for ${confirmations} confirmation(s)...`);
      await publicClient.waitForTransactionReceipt({
        hash: deploymentTransaction.hash,
        confirmations,
      });
      console.log(`Token Pool deployed at: ${contract.address}`);
      console.log(`${explorerUrl}/address/${contract.address}`);
      console.log("✅ LockReleaseTokenPool deployed successfully!");

      console.log("");
      console.log("========================================");
      console.log(`✅ Deployment Complete on ${chainName}!`);
      console.log("========================================");
      console.log(`Token Pool Address: ${contract.address}`);
      console.log(`${explorerUrl}/address/${contract.address}`);
      console.log("");

      let symbol = "unknown";
      try {
        const tokenContract = await viem.getContractAt(
          "IERC20Metadata",
          tokenAddress
        );
        symbol = await tokenContract.read.symbol();
      } catch {
        /* leave as "unknown" */
      }

      saveDeployment({
        type: "lock-release-token-pool",
        chainNameIdentifier,
        symbol,
        tokenPoolAddress: contract.address,
        tokenAddress,
        lockBoxAddress,
      });

      console.log("");
      console.log("Run this command to set the environment variable:");
      console.log(
        `export ${chainNameIdentifier}_TOKEN_POOL=${contract.address}`
      );
      console.log("");
      console.log("Next Step: Authorize this pool on the lockbox:");
      console.log(
        `  npx hardhat updateAuthorizedCallers --lockbox ${lockBoxAddress} --add ${contract.address} --network ${networkName}`
      );
      console.log("========================================");
      console.log("");

      if (verify) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        console.log("\nVerifying contract on block explorer...");
        try {
          const isVerified = await verifyContract(
            {
              address: contract.address,
              constructorArgs: constructorArgs.flat(),
            },
            hre
          );
          if (isVerified) {
            console.log("✅ Contract verified successfully");
          } else {
            console.warn("⚠️  Contract verification failed");
          }
        } catch (error: any) {
          if (error?.message?.includes("Already Verified")) {
            console.log("Contract already verified");
          } else {
            console.warn(`⚠️  Verification failed: ${error?.message}`);
          }
        }
      }
    },
  }))
  .build();
