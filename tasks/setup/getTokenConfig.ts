import { task } from "hardhat/config";
import type { HardhatRuntimeEnvironment } from "hardhat/types/hre";
import { isAddress, zeroAddress, type Address } from "viem";
import { getConfigByNetworkName, getDeployedToken } from "../../helper-config";

/**
 * Reads and displays TokenAdminRegistry.getTokenConfig(tokenAddress) for a token.
 *
 * This is the authoritative source of "which pool is live for this token" on a given chain.
 *
 * Usage:
 *   npx hardhat getTokenConfig --network sepolia
 *   npx hardhat getTokenConfig --tokenaddress 0xYourToken --network mantleSepolia
 */
export const getTokenConfig = task(
  "getTokenConfig",
  "Reads TokenAdminRegistry token config (administrator, pendingAdministrator, tokenPool)"
)
  .addOption({
    name: "tokenaddress",
    description: "Token address (overrides env var)",
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
      const { chainName, explorerUrl, tokenAdminRegistry } = networkConfig;

      if (!tokenAdminRegistry) {
        throw new Error(
          `tokenAdminRegistry not configured for network "${networkName}"`
        );
      }

      let tokenAddress: Address;
      if (tokenaddress) {
        if (!isAddress(tokenaddress)) {
          throw new Error(`Invalid token address: ${tokenaddress}`);
        }
        tokenAddress = tokenaddress;
      } else {
        tokenAddress = getDeployedToken(networkConfig.chainId) as Address;
      }

      console.log("");
      console.log("========================================");
      console.log("📋 Get Token Config");
      console.log("========================================");
      console.log(`Chain:        ${chainName}`);
      console.log(`Token:        ${tokenAddress}`);
      console.log(`Registry:     ${tokenAdminRegistry}`);
      console.log(`Action:       Read getTokenConfig`);
      console.log("========================================");
      console.log("");

      const registryContract = await viem.getContractAt(
        "TokenAdminRegistry",
        tokenAdminRegistry
      );
      const tokenConfig = await registryContract.read.getTokenConfig([
        tokenAddress,
      ]);

      const administrator = tokenConfig.administrator as Address;
      const pendingAdministrator = tokenConfig.pendingAdministrator as Address;
      const tokenPool = tokenConfig.tokenPool as Address;

      console.log("Token Config:");
      console.log(`  administrator:        ${administrator}`);
      console.log(`  pendingAdministrator: ${pendingAdministrator}`);
      console.log(`  tokenPool:            ${tokenPool}`);

      if (administrator.toLowerCase() === zeroAddress.toLowerCase()) {
        console.log("");
        console.log(
          "⚠️  administrator is the zero address. This token may not be registered on this chain."
        );
      }

      if (pendingAdministrator.toLowerCase() !== zeroAddress.toLowerCase()) {
        console.log("");
        console.log(
          `ℹ️  pendingAdministrator is set (${pendingAdministrator}). There may be an in-progress admin transfer.`
        );
      }

      console.log("");
      console.log("========================================");
      console.log(`Token:        ${explorerUrl}/address/${tokenAddress}`);
      if (tokenPool.toLowerCase() !== zeroAddress.toLowerCase()) {
        console.log(`Token Pool:   ${explorerUrl}/address/${tokenPool}`);
      }
      console.log(`Registry:     ${explorerUrl}/address/${tokenAdminRegistry}`);
      console.log("========================================");
      console.log("");
    },
  }))
  .build();