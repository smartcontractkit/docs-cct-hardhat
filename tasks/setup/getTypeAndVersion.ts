import { task } from "hardhat/config";
import type { HardhatRuntimeEnvironment } from "hardhat/types/hre";
import { isAddress, type Address } from "viem";
import { getConfigByNetworkName } from "../../helper-config";

/**
 * Reads and displays the typeAndVersion string from any contract implementing ITypeAndVersion.
 * Throws an error if the contract does not expose typeAndVersion() (i.e. does not implement the interface).
 *
 * Usage:
 *   npx hardhat getTypeAndVersion --address 0xYourContract --network sepolia
 */
export const getTypeAndVersion = task(
  "getTypeAndVersion",
  "Reads the typeAndVersion string from any contract implementing ITypeAndVersion"
)
  .addOption({
    name: "address",
    description: "Contract address to query",
    defaultValue: "",
  })
  .setAction(async () => ({
    default: async (
      { address }: { address: string },
      hre: HardhatRuntimeEnvironment
    ) => {
      if (!address) throw new Error("--address is required");
      if (!isAddress(address))
        throw new Error(`Invalid contract address: ${address}`);

      const contractAddress = address as Address;

      const networkConnection = await hre.network.getOrCreate();
      const { viem } = networkConnection;
      const networkName = networkConnection.networkName;
      const networkConfig = getConfigByNetworkName(networkName);
      const { chainName, explorerUrl } = networkConfig;

      console.log("");
      console.log("========================================");
      console.log("🔍 Get Type and Version");
      console.log("========================================");
      console.log(`Chain:        ${chainName}`);
      console.log(`Contract:     ${contractAddress}`);
      console.log(`Action:       Read typeAndVersion`);
      console.log("========================================");
      console.log("");

      let version: string;
      try {
        const contract = await viem.getContractAt(
          "ITypeAndVersion",
          contractAddress
        );
        version = await contract.read.typeAndVersion();
      } catch {
        throw new Error(
          `Contract at ${contractAddress} does not implement ITypeAndVersion (typeAndVersion() call failed)`
        );
      }

      console.log(`typeAndVersion: ${version}`);
      console.log("");
      console.log("========================================");
      console.log(`Contract:     ${explorerUrl}/address/${contractAddress}`);
      console.log("========================================");
      console.log("");
    },
  }))
  .build();
