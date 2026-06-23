import { task } from "hardhat/config";
import type { HardhatRuntimeEnvironment } from "hardhat/types/hre";
import { verifyContract } from "@nomicfoundation/hardhat-verify/verify";
import { readFileSync } from "fs";
import { resolve } from "path";
import { zeroAddress, type Address } from "viem";
import { getConfigByNetworkName } from "../../helper-config";
import { saveDeployment } from "../../utils/saveDeployment";

interface TokenJsonConfig {
  name: string;
  symbol: string;
  decimals: number;
  maxSupply: number;
  preMint: number;
}

function loadTokenJson(): TokenJsonConfig {
  const jsonPath = resolve(process.cwd(), "input/token.json");
  return JSON.parse(readFileSync(jsonPath, "utf-8")) as TokenJsonConfig;
}

/**
 * Deploys a CrossChainToken and grants mint/burn roles to the deployer.
 *
 * Parameter resolution order (highest to lowest priority):
 *   1. CLI flag (--name, --symbol, …)
 *   2. input/token.json
 *
 * Usage:
 *   npx hardhat deployToken --network sepolia
 *   npx hardhat deployToken --name "My Token" --symbol MTK --network fuji
 */
export const deployToken = task(
  "deployToken",
  "Deploys a CrossChainToken and grants mint/burn roles to the deployer"
)
  .addOption({
    name: "name",
    description: "Token name (overrides input/token.json)",
    defaultValue: "",
  })
  .addOption({
    name: "symbol",
    description: "Token symbol (overrides input/token.json)",
    defaultValue: "",
  })
  .addOption({
    name: "decimals",
    description: "Token decimals (overrides input/token.json)",
    defaultValue: "",
  })
  .addOption({
    name: "maxsupply",
    description:
      "Maximum token supply, 0 = unlimited (overrides input/token.json)",
    defaultValue: "",
  })
  .addOption({
    name: "premint",
    description: "Amount to pre-mint to deployer (overrides input/token.json)",
    defaultValue: "",
  })
  .addOption({
    name: "rolesrecipient",
    description: "Address to grant mint/burn roles to (defaults to deployer)",
    defaultValue: "",
  })
  .addOption({
    name: "ccipadmin",
    description: "CCIP admin address (defaults to deployer)",
    defaultValue: "",
  })
  .addFlag({
    name: "verify",
    description: "Verify the contract on the block explorer after deployment",
  })
  .setAction(async () => ({
    default: async (
      {
        name,
        symbol,
        decimals,
        maxsupply,
        premint,
        rolesrecipient,
        ccipadmin,
        verify,
      }: {
        name: string;
        symbol: string;
        decimals: string;
        maxsupply: string;
        premint: string;
        rolesrecipient: string;
        ccipadmin: string;
        verify: boolean;
      },
      hre: HardhatRuntimeEnvironment
    ) => {
      // Resolution order: CLI flag → input/token.json
      const json = loadTokenJson();
      const tokenName = name || json.name;
      const tokenSymbol = symbol || json.symbol;
      const tokenDecimals = Number(decimals !== "" ? decimals : json.decimals);
      const tokenMaxSupply = BigInt(
        maxsupply !== "" ? maxsupply : json.maxSupply
      );
      const tokenPreMint = BigInt(premint !== "" ? premint : json.preMint);

      const networkConnection = await hre.network.getOrCreate();
      const { viem } = networkConnection;
      const networkName = networkConnection.networkName;
      const networkConfig = getConfigByNetworkName(networkName);

      console.log("");
      console.log("========================================");
      console.log("🪙 Deploy Token");
      console.log("========================================");
      console.log(`Chain:        ${networkConfig.chainName}`);
      console.log(`Action:       Deploy CrossChainToken`);
      console.log("========================================");
      console.log("");
      console.log("Token Parameters:");
      console.log(`  Name:       ${tokenName}`);
      console.log(`  Symbol:     ${tokenSymbol}`);
      console.log(`  Decimals:   ${tokenDecimals}`);
      console.log(`  Max Supply: ${tokenMaxSupply}`);
      console.log(`  Pre-Mint:   ${tokenPreMint}`);
      console.log("");

      const [wallet] = await viem.getWalletClients();
      const publicClient = await viem.getPublicClient();
      const deployer = wallet.account.address;

      const preMintRecipient = (
        tokenPreMint > 0n ? deployer : zeroAddress
      ) as Address;
      const ccipAdmin = (ccipadmin || zeroAddress) as Address; // address(0) resolves to deployer inside BaseERC20

      console.log(`  Pre-mint Recipient: ${preMintRecipient}`);
      console.log(
        `  CCIP Admin:         ${
          ccipAdmin === zeroAddress ? deployer : ccipAdmin
        }`
      );
      console.log("");

      console.log(
        `[Step 1] Deploying ${tokenName} (${tokenSymbol}) on ${networkConfig.chainName}`
      );

      const constructorArgs = Array<any>([
        [
          tokenName,
          tokenSymbol,
          tokenMaxSupply,
          tokenPreMint,
          preMintRecipient,
          tokenDecimals,
          ccipAdmin,
        ],
        deployer as Address, // burnMintRoleAdmin
        zeroAddress as Address, // owner — address(0) defaults to deployer
      ]);

      console.log(
        `   Waiting for ${networkConfig.confirmations} confirmation(s)...`
      );
      const contract = await viem.deployContract(
        "CrossChainToken",
        ...constructorArgs,
        { confirmations: networkConfig.confirmations }
      );

      console.log(`Token deployed at: ${contract.address}`);
      console.log(`${networkConfig.explorerUrl}/address/${contract.address}`);

      // Grant mint/burn roles to the specified address, or the deployer if not provided
      const rolesRecipient = (rolesrecipient || deployer) as `0x${string}`;

      console.log(
        `\n[Step 2] Granting mint and burn roles to: ${rolesRecipient}`
      );

      const token = await viem.getContractAt(
        "CrossChainToken",
        contract.address
      );
      const roleTx = await token.write.grantMintAndBurnRoles([rolesRecipient], {
        account: wallet.account,
      });

      console.log(
        `   Waiting for ${networkConfig.confirmations} confirmation(s)...`
      );
      await publicClient.waitForTransactionReceipt({
        hash: roleTx,
        confirmations: networkConfig.confirmations,
      });

      console.log("✅ Roles granted successfully!");

      // Wait for Etherscan to index the bytecode before submitting verification
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

      console.log("");
      console.log("========================================");
      console.log(`✅ Deployment Complete on ${networkConfig.chainName}!`);
      console.log("========================================");
      console.log(`Token Address: ${contract.address}`);
      console.log(`${networkConfig.explorerUrl}/address/${contract.address}`);
      console.log("");
      console.log("Run this command to set the environment variable:");
      console.log(
        `export ${networkConfig.chainNameIdentifier}_TOKEN=${contract.address}`
      );
      console.log("========================================");
      console.log("");

      saveDeployment({
        type: "token",
        chainNameIdentifier: networkConfig.chainNameIdentifier,
        symbol: tokenSymbol,
        tokenAddress: contract.address,
      });
    },
  }))
  .build();
