import { task } from "hardhat/config";
import type { HardhatRuntimeEnvironment } from "hardhat/types/hre";
import { isAddress, type Address } from "viem";
import { getConfigByNetworkName, getDeployedToken } from "../../helper-config";

/**
 * Accepts the pending token admin role via TokenAdminRegistry.
 * Must be called after claimAdmin. The signer must be the pendingAdministrator.
 *
 * Usage:
 *   npx hardhat acceptAdminRole --network sepolia
 *   npx hardhat acceptAdminRole --tokenaddress 0xYourToken --network fuji
 */
export const acceptAdminRole = task(
  "acceptAdminRole",
  "Accepts the pending token admin role via TokenAdminRegistry"
)
  .addOption({
    name: "tokenaddress",
    description: "Address of the token (overrides env var)",
    defaultValue: "",
  })
  .setAction(async () => ({
    default: async (
      { tokenaddress }: { tokenaddress: string },
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

      const publicClient = await viem.getPublicClient();
      const [wallet] = await viem.getWalletClients();
      const signerAddress = wallet.account.address;

      console.log("");
      console.log("========================================");
      console.log("👑 Accept Admin Role");
      console.log("========================================");
      console.log(`Chain:        ${chainName}`);
      console.log(`Action:       Accept admin role`);
      console.log("========================================");
      console.log("");

      const registryContract = await viem.getContractAt(
        "TokenAdminRegistry",
        tokenAdminRegistry
      );

      const tokenConfig = await registryContract.read.getTokenConfig([
        tokenAddress,
      ]);
      const pendingAdministrator = tokenConfig.pendingAdministrator;

      console.log("Accept Admin Role Parameters:");
      console.log(`  Token:                 ${tokenAddress}`);
      console.log(`  Token Admin Registry:  ${tokenAdminRegistry}`);
      console.log(`  Pending Administrator: ${pendingAdministrator}`);
      console.log(`  Signer:                ${signerAddress}`);
      console.log("");

      if (pendingAdministrator.toLowerCase() !== signerAddress.toLowerCase()) {
        throw new Error(
          `Only the pending administrator (${pendingAdministrator}) can accept the admin role, got signer (${signerAddress})`
        );
      }

      console.log(`[Step 1] Accepting admin role for token on ${chainName}`);
      const txHash = await registryContract.write.acceptAdminRole(
        [tokenAddress],
        { account: wallet.account }
      );
      console.log(`⏳ Tx: ${explorerUrl}/tx/${txHash}`);
      await publicClient.waitForTransactionReceipt({
        hash: txHash,
        confirmations,
      });

      console.log("");
      console.log("========================================");
      console.log(`✅ Admin Role Accepted on ${chainName}!`);
      console.log("========================================");
      console.log(`Token:            ${explorerUrl}/address/${tokenAddress}`);
      console.log(`Transaction:      ${explorerUrl}/tx/${txHash}`);
      console.log(`New Administrator: ${signerAddress}`);
      console.log("========================================");
      console.log("");
    },
  }))
  .build();
