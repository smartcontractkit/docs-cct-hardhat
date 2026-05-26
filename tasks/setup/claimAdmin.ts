import { task } from "hardhat/config";
import type { HardhatRuntimeEnvironment } from "hardhat/types/hre";
import { isAddress, type Address } from "viem";
import { getConfigByNetworkName, getDeployedToken } from "../../helper-config";

/**
 * Claims the token admin role via RegistryModuleOwnerCustom.
 *
 * The deployer wallet is validated as the current token admin before the claim.
 * Supports both getCCIPAdmin() and owner() admin interfaces.
 *
 * Usage:
 *   npx hardhat claimAdmin --network sepolia
 *   npx hardhat claimAdmin --tokenaddress 0xYourToken --network fuji
 *   npx hardhat claimAdmin --ccipadmin 0xCustomAdmin --network sepolia
 */
export const claimAdmin = task(
  "claimAdmin",
  "Claims token admin role via RegistryModuleOwnerCustom"
)
  .addOption({
    name: "tokenaddress",
    description: "Address of the token (overrides env var)",
    defaultValue: "",
  })
  .addOption({
    name: "ccipadmin",
    description: "Expected CCIP admin address (defaults to deployer wallet)",
    defaultValue: "",
  })
  .setAction(async () => ({
    default: async (
      { tokenaddress, ccipadmin }: { tokenaddress: string; ccipadmin: string },
      hre: HardhatRuntimeEnvironment
    ) => {
      const networkConnection = await hre.network.getOrCreate();
      const { viem } = networkConnection;
      const networkName = networkConnection.networkName;
      const networkConfig = getConfigByNetworkName(networkName);
      const {
        confirmations,
        registryModuleOwnerCustom,
        chainName,
        explorerUrl,
      } = networkConfig;
      if (!registryModuleOwnerCustom)
        throw new Error(
          `registryModuleOwnerCustom not configured for network "${networkName}"`
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

      const ccipAdminAddress = (ccipadmin || signerAddress) as Address;
      if (ccipadmin && !isAddress(ccipadmin)) {
        throw new Error(`Invalid CCIP admin address: ${ccipadmin}`);
      }

      console.log("");
      console.log("========================================");
      console.log("👑 Claim Token Admin");
      console.log("========================================");
      console.log(`Chain:        ${chainName}`);
      console.log(`Action:       Claim token admin`);
      console.log("========================================");
      console.log("");

      // Detect which admin interface the token supports
      let currentAdmin: Address;
      let useCCIPAdmin: boolean;

      try {
        const ccipAdminContract = await viem.getContractAt(
          "IGetCCIPAdmin",
          tokenAddress
        );
        currentAdmin = await ccipAdminContract.read.getCCIPAdmin();
        useCCIPAdmin = true;
      } catch {
        try {
          const ownerContract = await viem.getContractAt(
            "IOwner",
            tokenAddress
          );
          currentAdmin = await ownerContract.read.owner();
          useCCIPAdmin = false;
        } catch {
          throw new Error(
            "Token must implement either getCCIPAdmin() or owner()"
          );
        }
      }

      console.log("Claim Admin Parameters:");
      console.log(`  Token:           ${tokenAddress}`);
      console.log(`  Current Admin:   ${currentAdmin}`);
      console.log(`  Expected Admin:  ${ccipAdminAddress}`);
      console.log(`  Registry Module: ${registryModuleOwnerCustom}`);
      console.log(
        `  Admin Method:    ${useCCIPAdmin ? "getCCIPAdmin()" : "owner()"}`
      );
      console.log("");

      if (currentAdmin.toLowerCase() !== ccipAdminAddress.toLowerCase()) {
        throw new Error(
          `Admin of token (${currentAdmin}) doesn't match the expected admin address (${ccipAdminAddress})`
        );
      }

      const registryContract = await viem.getContractAt(
        "RegistryModuleOwnerCustom",
        registryModuleOwnerCustom
      );

      let txHash: `0x${string}`;
      if (useCCIPAdmin) {
        console.log(
          `[Step 1] Claiming admin via getCCIPAdmin() on ${chainName}`
        );
        txHash = await registryContract.write.registerAdminViaGetCCIPAdmin(
          [tokenAddress],
          { account: wallet.account }
        );
      } else {
        console.log(`[Step 1] Claiming admin via owner() on ${chainName}`);
        txHash = await registryContract.write.registerAdminViaOwner(
          [tokenAddress],
          { account: wallet.account }
        );
      }
      console.log(`⏳ Tx: ${explorerUrl}/tx/${txHash}`);
      await publicClient.waitForTransactionReceipt({
        hash: txHash,
        confirmations,
      });

      console.log("");
      console.log("========================================");
      console.log(`✅ Admin Claim Complete on ${chainName}!`);
      console.log("========================================");
      console.log(`Token:         ${explorerUrl}/address/${tokenAddress}`);
      console.log(`Transaction:   ${explorerUrl}/tx/${txHash}`);
      console.log(`Admin Address: ${ccipAdminAddress}`);
      console.log("========================================");
      console.log("");
    },
  }))
  .build();
