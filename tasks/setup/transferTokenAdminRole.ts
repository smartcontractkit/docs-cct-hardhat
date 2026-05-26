import { task } from "hardhat/config";
import type { HardhatRuntimeEnvironment } from "hardhat/types/hre";
import { isAddress, zeroAddress, type Address } from "viem";
import { getConfigByNetworkName, getDeployedToken } from "../../helper-config";

/**
 * Initiates a transfer of the token admin role to a new address.
 * This is step 1 of a two-step process — the new admin must call acceptAdminRole to complete it.
 *
 * Usage:
 *   npx hardhat transferTokenAdminRole --newadmin 0xNewAdminAddress --network sepolia
 *   npx hardhat transferTokenAdminRole --tokenaddress 0xYourToken --newadmin 0xNewAdminAddress --network sepolia
 */
export const transferTokenAdminRole = task(
  "transferTokenAdminRole",
  "Initiates a transfer of the token admin role to a new address (pending accept step required)"
)
  .addOption({
    name: "tokenaddress",
    description: "Address of the token (overrides env var)",
    defaultValue: "",
  })
  .addOption({
    name: "newadmin",
    description:
      "Address of the new admin (must call acceptAdminRole to complete)",
    defaultValue: "",
  })
  .setAction(async () => ({
    default: async (
      { tokenaddress, newadmin }: { tokenaddress: string; newadmin: string },
      hre: HardhatRuntimeEnvironment
    ) => {
      if (!newadmin) throw new Error("--newadmin is required");
      if (!isAddress(newadmin))
        throw new Error(`Invalid new admin address: ${newadmin}`);

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
      console.log("🔄 Transfer Token Admin Role");
      console.log("========================================");
      console.log(`Chain:        ${chainName}`);
      console.log(`Action:       Transfer admin role`);
      console.log("========================================");
      console.log("");

      const registryContract = await viem.getContractAt(
        "TokenAdminRegistry",
        tokenAdminRegistry
      );

      const tokenConfig = await registryContract.read.getTokenConfig([
        tokenAddress,
      ]);
      const currentAdmin = tokenConfig.administrator;
      const pendingAdmin = tokenConfig.pendingAdministrator;

      console.log("Transfer Admin Role Parameters:");
      console.log(`  Token:                 ${tokenAddress}`);
      console.log(`  Token Admin Registry:  ${tokenAdminRegistry}`);
      console.log(`  Current Administrator: ${currentAdmin}`);
      console.log(`  Pending Administrator: ${pendingAdmin}`);
      console.log(`  New Admin:             ${newadmin}`);
      console.log(`  Signer:                ${signerAddress}`);
      console.log("");

      if (currentAdmin.toLowerCase() === zeroAddress.toLowerCase()) {
        if (pendingAdmin.toLowerCase() === zeroAddress.toLowerCase()) {
          throw new Error(
            `No admin has been claimed yet for this token.\nCall claimAdmin first, then acceptAdminRole, before transferring.`
          );
        }
        throw new Error(
          `Current admin is zero address — the pending admin (${pendingAdmin}) hasn't called acceptAdminRole yet.`
        );
      }

      if (currentAdmin.toLowerCase() !== signerAddress.toLowerCase()) {
        throw new Error(
          `Signer (${signerAddress}) is not the current administrator (${currentAdmin}). Only the current admin can transfer the role.`
        );
      }

      console.log(`[Step 1] Transferring admin role for token on ${chainName}`);
      const txHash = await registryContract.write.transferAdminRole(
        [tokenAddress, newadmin as Address],
        { account: wallet.account }
      );
      console.log(`⏳ Tx: ${explorerUrl}/tx/${txHash}`);
      await publicClient.waitForTransactionReceipt({
        hash: txHash,
        confirmations,
      });

      console.log("");
      console.log("========================================");
      console.log(`✅ Admin Role Transfer Initiated on ${chainName}!`);
      console.log("========================================");
      console.log(`Token:            ${explorerUrl}/address/${tokenAddress}`);
      console.log(`Transaction:      ${explorerUrl}/tx/${txHash}`);
      console.log(`New Admin:        ${newadmin}`);
      console.log("========================================");
      console.log("");
      console.log(
        `ℹ️  The new admin (${newadmin}) must call acceptAdminRole to complete the transfer.`
      );
      console.log("");
    },
  }))
  .build();
