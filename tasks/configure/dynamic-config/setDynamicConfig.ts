import { task } from "hardhat/config";
import type { HardhatRuntimeEnvironment } from "hardhat/types/hre";
import { isAddress, zeroAddress, type Address } from "viem";
import {
  getConfigByNetworkName,
  getDeployedTokenPool,
} from "../../../helper-config";

/**
 * Updates the dynamic configuration of a TokenPool (router, rateLimitAdmin, feeAdmin).
 *
 * All options are optional — each defaults to the current on-chain value if not provided.
 * rateLimitAdmin and feeAdmin fall back to the wallet address if the on-chain value is unset.
 * Set --feeadmin to the zero address (0x0000...0000) to restrict fee withdrawal to the owner only.
 *
 * Usage:
 *   npx hardhat setDynamicConfig --router 0xRouter --network sepolia
 *   npx hardhat setDynamicConfig --router 0xRouter --ratelimitadmin 0xAdmin --feeadmin 0xFeeAdmin --network sepolia
 */
export const setDynamicConfig = task(
  "setDynamicConfig",
  "Updates the dynamic configuration of a TokenPool (router, rateLimitAdmin, feeAdmin)"
)
  .addOption({
    name: "tokenpool",
    description: "Token pool address (overrides env var)",
    defaultValue: "",
  })
  .addOption({
    name: "router",
    description: "New router address (defaults to current on-chain value)",
    defaultValue: "",
  })
  .addOption({
    name: "ratelimitadmin",
    description:
      "New rate limit admin address (defaults to current on-chain value, then wallet address)",
    defaultValue: "",
  })
  .addOption({
    name: "feeadmin",
    description:
      "New fee admin address (defaults to current on-chain value, then wallet address; use zero address to restrict to owner only)",
    defaultValue: "",
  })
  .setAction(async () => ({
    default: async (
      {
        tokenpool,
        router,
        ratelimitadmin,
        feeadmin,
      }: {
        tokenpool: string;
        router: string;
        ratelimitadmin: string;
        feeadmin: string;
      },
      hre: HardhatRuntimeEnvironment
    ) => {
      if (router && !isAddress(router))
        throw new Error(`Invalid router address: ${router}`);
      if (ratelimitadmin && !isAddress(ratelimitadmin))
        throw new Error(`Invalid rateLimitAdmin address: ${ratelimitadmin}`);
      if (feeadmin && !isAddress(feeadmin))
        throw new Error(`Invalid feeAdmin address: ${feeadmin}`);

      const networkConnection = await hre.network.getOrCreate();
      const { viem } = networkConnection;
      const networkName = networkConnection.networkName;
      const sourceConfig = getConfigByNetworkName(networkName);
      const { chainName, explorerUrl, confirmations, chainId } = sourceConfig;

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
      const walletAddress = wallet.account.address;
      const poolContract = await viem.getContractAt(
        "BurnMintTokenPool",
        poolAddress
      );

      // Read current config for display
      const [currentRouter, currentRateLimitAdmin, currentFeeAdmin] =
        (await poolContract.read.getDynamicConfig()) as [
          Address,
          Address,
          Address
        ];

      // Defaults: CLI option → current on-chain value → wallet address (as last resort if unset)
      const newRouter: Address = router ? (router as Address) : currentRouter;
      const newRateLimitAdmin: Address = ratelimitadmin
        ? (ratelimitadmin as Address)
        : currentRateLimitAdmin !== zeroAddress
        ? currentRateLimitAdmin
        : walletAddress;
      const newFeeAdmin: Address = feeadmin
        ? (feeadmin as Address)
        : currentFeeAdmin !== zeroAddress
        ? currentFeeAdmin
        : walletAddress;

      console.log("");
      console.log("========================================");
      console.log("⚙️  Set Dynamic Config");
      console.log("========================================");
      console.log(`Chain:        ${chainName}`);
      console.log(`Token Pool:   ${poolAddress}`);
      console.log(`Action:       Set dynamic config`);
      console.log("========================================");
      console.log("");
      console.log("Current Configuration:");
      console.log(`  Router:           ${currentRouter}`);
      console.log(`  Rate Limit Admin: ${currentRateLimitAdmin}`);
      console.log(`  Fee Admin:        ${currentFeeAdmin}`);
      console.log("");
      console.log("New Configuration:");
      console.log(`  Router:           ${newRouter}`);
      console.log(`  Rate Limit Admin: ${newRateLimitAdmin}`);
      console.log(`  Fee Admin:        ${newFeeAdmin}`);
      console.log("");

      console.log(`[Step 1] Setting dynamic config on ${chainName}`);
      const txHash = await poolContract.write.setDynamicConfig(
        [newRouter, newRateLimitAdmin, newFeeAdmin],
        { account: wallet.account }
      );
      console.log(`⏳ Tx: ${explorerUrl}/tx/${txHash}`);
      await publicClient.waitForTransactionReceipt({
        hash: txHash,
        confirmations,
      });
      console.log("✅ Dynamic config updated successfully!");

      console.log("");
      console.log("========================================");
      console.log(`✅ Configuration Complete on ${chainName}!`);
      console.log("========================================");
      console.log(`Token Pool:       ${explorerUrl}/address/${poolAddress}`);
      console.log(`Router:           ${newRouter}`);
      console.log(`Rate Limit Admin: ${newRateLimitAdmin}`);
      console.log(`Fee Admin:        ${newFeeAdmin}`);
      console.log(`Transaction:      ${explorerUrl}/tx/${txHash}`);
      console.log("========================================");
      console.log("");
    },
  }))
  .build();
