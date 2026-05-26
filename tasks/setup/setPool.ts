import { task } from "hardhat/config";
import type { HardhatRuntimeEnvironment } from "hardhat/types/hre";
import { isAddress, type Address } from "viem";
import {
  getConfigByNetworkName,
  getDeployedToken,
  getDeployedTokenPool,
} from "../../helper-config";

/**
 * Sets the token pool on the TokenAdminRegistry for a given token.
 * Must be called after acceptAdminRole — the signer must be the token administrator.
 *
 * Usage:
 *   npx hardhat setPool --network sepolia
 *   npx hardhat setPool --tokenaddress 0xYourToken --tokenpool 0xYourPool --network sepolia
 */
export const setPool = task(
  "setPool",
  "Sets the token pool on the TokenAdminRegistry"
)
  .addOption({
    name: "tokenaddress",
    description: "Token address (overrides env var)",
    defaultValue: "",
  })
  .addOption({
    name: "tokenpool",
    description: "Token pool address (overrides env var)",
    defaultValue: "",
  })
  .setAction(async () => ({
    default: async (
      { tokenaddress, tokenpool }: { tokenaddress: string; tokenpool: string },
      hre: HardhatRuntimeEnvironment
    ) => {
      const networkConnection = await hre.network.getOrCreate();
      const { viem } = networkConnection;
      const networkName = networkConnection.networkName;
      const networkConfig = getConfigByNetworkName(networkName);
      const { confirmations, tokenAdminRegistry, chainName, explorerUrl } =
        networkConfig;
      if (!tokenAdminRegistry)
        throw new Error(
          `tokenAdminRegistry not configured for network "${networkName}"`
        );

      let tokenAddress: Address;
      if (tokenaddress) {
        if (!isAddress(tokenaddress))
          throw new Error(`Invalid token address: ${tokenaddress}`);
        tokenAddress = tokenaddress;
      } else {
        tokenAddress = getDeployedToken(networkConfig.chainId) as Address;
      }

      let poolAddress: Address;
      if (tokenpool) {
        if (!isAddress(tokenpool))
          throw new Error(`Invalid pool address: ${tokenpool}`);
        poolAddress = tokenpool;
      } else {
        poolAddress = getDeployedTokenPool(networkConfig.chainId) as Address;
      }

      const publicClient = await viem.getPublicClient();
      const [wallet] = await viem.getWalletClients();

      const registryContract = await viem.getContractAt(
        "TokenAdminRegistry",
        tokenAdminRegistry
      );
      const tokenConfig = await registryContract.read.getTokenConfig([
        tokenAddress,
      ]);
      const tokenAdministratorAddress = tokenConfig.administrator;

      console.log("");
      console.log("========================================");
      console.log("🏊 Set Token Pool");
      console.log("========================================");
      console.log(`Chain:        ${chainName}`);
      console.log(`Token Pool:   ${poolAddress}`);
      console.log(`Action:       Set token pool`);
      console.log("========================================");
      console.log("");

      console.log("Set Pool Parameters:");
      console.log(`  Token:                ${tokenAddress}`);
      console.log(`  Pool:                 ${poolAddress}`);
      console.log(`  Token Admin Registry: ${tokenAdminRegistry}`);
      console.log(`  Token Administrator:  ${tokenAdministratorAddress}`);
      console.log("");

      console.log(`[Step 1] Setting pool for token on ${chainName}`);
      const txHash = await registryContract.write.setPool(
        [tokenAddress, poolAddress],
        { account: wallet.account }
      );
      console.log(`⏳ Tx: ${explorerUrl}/tx/${txHash}`);
      await publicClient.waitForTransactionReceipt({
        hash: txHash,
        confirmations,
      });

      console.log("");
      console.log("========================================");
      console.log(`✅ Pool Set Complete on ${chainName}!`);
      console.log("========================================");
      console.log(`Token Address: ${explorerUrl}/address/${tokenAddress}`);
      console.log(`Pool Address:  ${explorerUrl}/address/${poolAddress}`);
      console.log(`Transaction:   ${explorerUrl}/tx/${txHash}`);
      console.log("========================================");
      console.log("");
    },
  }))
  .build();
