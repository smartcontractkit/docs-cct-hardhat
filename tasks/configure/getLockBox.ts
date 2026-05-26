import { task } from "hardhat/config";
import type { HardhatRuntimeEnvironment } from "hardhat/types/hre";
import { isAddress, zeroAddress, type Address } from "viem";
import {
  getConfigByNetworkName,
  getDeployedTokenPool,
} from "../../helper-config";

/**
 * Reads and displays the ERC20LockBox address attached to a LockReleaseTokenPool.
 * getLockBox() is only available on LockReleaseTokenPool v2.0 and later.
 *
 * Usage:
 *   npx hardhat getLockBox --network sepolia
 *   npx hardhat getLockBox --tokenpool 0xYourPool --network sepolia
 */
export const getLockBox = task(
  "getLockBox",
  "Reads the ERC20LockBox address attached to a LockReleaseTokenPool (v2+ only)"
)
  .addOption({
    name: "tokenpool",
    description: "Token pool address (overrides env var)",
    defaultValue: "",
  })
  .setAction(async () => ({
    default: async (
      { tokenpool }: { tokenpool: string },
      hre: HardhatRuntimeEnvironment
    ) => {
      const networkConnection = await hre.network.getOrCreate();
      const { viem } = networkConnection;
      const networkName = networkConnection.networkName;
      const { chainName, explorerUrl, chainId } =
        getConfigByNetworkName(networkName);

      let poolAddress: Address;
      if (tokenpool) {
        if (!isAddress(tokenpool))
          throw new Error(`Invalid pool address: ${tokenpool}`);
        poolAddress = tokenpool;
      } else {
        poolAddress = getDeployedTokenPool(chainId) as Address;
      }

      console.log("");
      console.log("========================================");
      console.log("🔒 Get LockBox");
      console.log("========================================");
      console.log(`Chain:        ${chainName}`);
      console.log(`Token Pool:   ${poolAddress}`);
      console.log(`Action:       View lockbox`);
      console.log("========================================");
      console.log("");

      const poolContract = await viem.getContractAt(
        "LockReleaseTokenPool",
        poolAddress
      );

      try {
        const lockBox = (await poolContract.read.getLockBox()) as Address;
        if (!lockBox || lockBox === zeroAddress) {
          console.log("No LockBox is attached to this pool.");
        } else {
          console.log("✅ LockBox:");
          console.log(`   ${lockBox}`);

          // Read token balance held by the lockbox
          try {
            const lockBoxContract = await viem.getContractAt(
              "ERC20LockBox",
              lockBox
            );
            const token = (await lockBoxContract.read.getToken()) as Address;
            const tokenContract = await viem.getContractAt(
              "IERC20Metadata",
              token
            );
            const balance = (await tokenContract.read.balanceOf([
              lockBox,
            ])) as bigint;
            let symbol = "";
            try {
              symbol = ` (${await tokenContract.read.symbol()})`;
            } catch {
              /* optional */
            }
            console.log(`   Token:   ${token}${symbol}`);
            console.log(`   Balance: ${balance}`);
          } catch {
            // Non-critical — lockbox address resolved but token query failed
          }
        }
      } catch (err) {
        console.log(
          "❌ Error: getLockBox() reverted. Pool may be v1 (requires LockReleaseTokenPool v2.0+)."
        );
        if (err instanceof Error) console.log(`   ${err.message}`);
      }

      console.log("");
      console.log("========================================");
      console.log(`Token Pool:   ${explorerUrl}/address/${poolAddress}`);
      console.log("========================================");
      console.log("");
    },
  }))
  .build();
