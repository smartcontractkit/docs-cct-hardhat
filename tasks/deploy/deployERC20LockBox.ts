import { task } from "hardhat/config";
import type { HardhatRuntimeEnvironment } from "hardhat/types/hre";
import { isAddress, type Address } from "viem";
import { verifyContract } from "@nomicfoundation/hardhat-verify/verify";
import { getConfigByNetworkName, getDeployedToken } from "../../helper-config";
import { saveDeployment } from "../../utils/saveDeployment";

/**
 * Deploys an ERC20LockBox for use with a LockReleaseTokenPool.
 * The lockbox holds ERC20 liquidity so pools can be upgraded without migrating funds.
 * After deployment, authorize the token pool address via the lockbox's applyAuthorizedCallerUpdates.
 *
 * Usage:
 *   npx hardhat deployLockBox --network sepolia
 *   npx hardhat deployLockBox --tokenaddress 0xYourToken --network sepolia
 *   npx hardhat deployLockBox --authorizedcallers 0xPool1,0xPool2 --network sepolia
 */
export const deployERC20LockBox = task(
  "deployERC20LockBox",
  "Deploys an ERC20LockBox for use with a LockReleaseTokenPool"
)
  .addOption({
    name: "tokenaddress",
    description: "Token address (overrides env var)",
    defaultValue: "",
  })
  .addOption({
    name: "authorizedcallers",
    description:
      "Comma-separated addresses to authorize immediately (e.g. deployer for initial liquidity management)",
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
        authorizedcallers,
        verify,
      }: {
        tokenaddress: string;
        authorizedcallers: string;
        verify: boolean;
      },
      hre: HardhatRuntimeEnvironment
    ) => {
      const networkConnection = await hre.network.getOrCreate();
      const { viem } = networkConnection;
      const networkName = networkConnection.networkName;
      const networkConfig = getConfigByNetworkName(networkName);
      const { confirmations, chainName, explorerUrl, chainNameIdentifier } =
        networkConfig;

      let tokenAddress: Address;
      if (tokenaddress) {
        if (!isAddress(tokenaddress))
          throw new Error(`Invalid token address: ${tokenaddress}`);
        tokenAddress = tokenaddress;
      } else {
        tokenAddress = getDeployedToken(networkConfig.chainId) as Address;
      }

      // Parse comma-separated authorized callers
      const callers: Address[] = authorizedcallers
        ? authorizedcallers
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
            .map((s) => {
              if (!isAddress(s))
                throw new Error(`Invalid authorized caller address: ${s}`);
              return s as Address;
            })
        : [];

      console.log("");
      console.log("========================================");
      console.log("📦 Deploy ERC20 LockBox");
      console.log("========================================");
      console.log(`Chain:        ${chainName}`);
      console.log(`Action:       Deploy ERC20 lockbox`);
      console.log("========================================");
      console.log("");

      console.log("ERC20LockBox Parameters:");
      console.log(`  Token: ${tokenAddress}`);
      if (callers.length > 0) {
        console.log(`  Authorized Callers: ${callers.length}`);
        callers.forEach((c, i) => console.log(`    [${i}] ${c}`));
      } else {
        console.log(
          "  Authorized Callers: None (add after deploying the token pool)"
        );
      }
      console.log("");

      const publicClient = await viem.getPublicClient();
      const [wallet] = await viem.getWalletClients();

      console.log(`[Step 1] Deploying ERC20LockBox on ${chainName}`);
      const constructorArgs = Array<any>([tokenAddress]);

      console.log(`   Waiting for ${confirmations} confirmation(s)...`);
      const lockBox = await viem.deployContract(
        "ERC20LockBox",
        ...constructorArgs,
        { confirmations }
      );
      console.log(`ERC20LockBox deployed at: ${lockBox.address}`);
      console.log(`${explorerUrl}/address/${lockBox.address}`);
      console.log("✅ ERC20LockBox deployed successfully!");

      if (callers.length > 0) {
        console.log("\n[Step 2] Authorizing callers...");
        const authTxHash = await lockBox.write.applyAuthorizedCallerUpdates(
          [{ addedCallers: callers, removedCallers: [] as Address[] }],
          { account: wallet.account }
        );
        console.log(`⏳ Tx: ${explorerUrl}/tx/${authTxHash}`);
        await publicClient.waitForTransactionReceipt({
          hash: authTxHash,
          confirmations,
        });
        console.log("✅ Authorized callers set successfully!");
      }

      console.log("");
      console.log("========================================");
      console.log(`✅ Deployment Complete on ${chainName}!`);
      console.log("========================================");
      console.log(`ERC20LockBox Address: ${lockBox.address}`);
      console.log(`${explorerUrl}/address/${lockBox.address}`);
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
        type: "lock-box",
        chainNameIdentifier,
        symbol,
        lockBoxAddress: lockBox.address,
        tokenAddress,
      });

      console.log("");
      console.log("Copy this address to use in the next command:");
      console.log(`  --lockbox ${lockBox.address}`);
      if (callers.length === 0) {
        console.log("");
        console.log("Next Steps:");
        console.log(`  1. Deploy a LockReleaseTokenPool:`);
        console.log(
          `       npx hardhat deployLockReleaseTokenPool --lockbox ${lockBox.address} --network ${networkName}`
        );
        console.log("  2. Authorize the deployed pool on this lockbox:");
        console.log(
          `       npx hardhat updateAuthorizedCallers --lockbox ${lockBox.address} --add <TOKEN_POOL_ADDRESS> --network ${networkName}`
        );
      }
      console.log("========================================");
      console.log("");

      if (verify) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        console.log("\nVerifying contract on block explorer...");
        try {
          const isVerified = await verifyContract(
            {
              address: lockBox.address,
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
