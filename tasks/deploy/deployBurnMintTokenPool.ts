import { task } from "hardhat/config";
import type { HardhatRuntimeEnvironment } from "hardhat/types/hre";
import { isAddress, zeroAddress, type Address } from "viem";
import { verifyContract } from "@nomicfoundation/hardhat-verify/verify";
import { getConfigByNetworkName, getDeployedToken } from "../../helper-config";
import { saveDeployment } from "../../utils/saveDeployment";

/**
 * Deploys a BurnMintTokenPool for an existing CrossChainToken and grants it mint/burn roles.
 *
 * Usage:
 *   npx hardhat deployTokenPool --network sepolia
 *   npx hardhat deployTokenPool --tokenaddress 0xYourToken --network sepolia
 *   npx hardhat deployTokenPool --tokenaddress 0xYourToken --poolhooks 0xHooks... --network fuji
 */
export const deployTokenPool = task(
  "deployTokenPool",
  "Deploys a BurnMintTokenPool and grants it mint/burn roles on the token"
)
  .addOption({
    name: "tokenaddress",
    description: "Address of the token to deploy the pool for",
    defaultValue: "",
  })
  .addOption({
    name: "localtokendecimals",
    description: "Fallback decimals if the token does not expose decimals()",
    defaultValue: "18",
  })
  .addOption({
    name: "poolhooks",
    description:
      "Address of advanced pool hooks contract (default: zero address)",
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
        localtokendecimals,
        poolhooks,
        verify,
      }: {
        tokenaddress: string;
        localtokendecimals: string;
        poolhooks: string;
        verify: boolean;
      },
      hre: HardhatRuntimeEnvironment
    ) => {
      const networkConnection = await hre.network.getOrCreate();
      const { viem } = networkConnection;
      const networkName = networkConnection.networkName;
      const networkConfig = getConfigByNetworkName(networkName);

      // Flag takes precedence; fall back to the env var set by deployToken
      let tokenAddress: Address;
      if (tokenaddress) {
        if (!isAddress(tokenaddress))
          throw new Error(`Invalid token address: ${tokenaddress}`);
        tokenAddress = tokenaddress;
      } else {
        tokenAddress = getDeployedToken(networkConfig.chainId) as Address;
      }
      const poolHooks = (poolhooks || zeroAddress) as `0x${string}`;

      const { router, rmnProxy, confirmations } = networkConfig;
      if (!router)
        throw new Error(`Router not defined for ${networkConfig.chainName}`);
      if (!rmnProxy)
        throw new Error(`RMN Proxy not defined for ${networkConfig.chainName}`);

      console.log("");
      console.log("========================================");
      console.log("🔥⚒️  Deploy Burn & Mint Token Pool");
      console.log("========================================");
      console.log(`Chain:        ${networkConfig.chainName}`);
      console.log(`Action:       Deploy BurnMintTokenPool`);
      console.log("========================================");
      console.log("");

      // Read decimals from token contract, fall back to CLI arg / DECIMALS env var
      const publicClient = await viem.getPublicClient();
      const [wallet] = await viem.getWalletClients();

      let decimals: number;
      try {
        const tokenContract = await viem.getContractAt(
          "IERC20Metadata",
          tokenAddress
        );
        decimals = await tokenContract.read.decimals();
      } catch {
        console.log(
          "⚠️  decimals() not available on token — falling back to --localtokendecimals"
        );
        decimals = Number(localtokendecimals);
      }

      console.log("Token Pool Parameters:");
      console.log(`  Token:       ${tokenAddress}`);
      console.log(`  Decimals:    ${decimals}`);
      console.log(`  Router:      ${router}`);
      console.log(`  RMN Proxy:   ${rmnProxy}`);
      console.log(
        `  Pool Hooks:  ${poolHooks !== zeroAddress ? poolHooks : "None (0x0)"}`
      );
      console.log("");

      console.log(
        `[Step 1] Deploying BurnMintTokenPool on ${networkConfig.chainName}`
      );

      const constructorArgs = [
        tokenAddress,
        decimals,
        poolHooks,
        rmnProxy as Address,
        router as Address,
      ] as const;

      // Avoid hardhat-viem's sendDeploymentTransaction(), which immediately calls
      // eth_getTransactionByHash after broadcasting. Some RPC providers (notably
      // on certain L2 testnets) may not return the tx until it's mined, which
      // causes TransactionNotFoundError even though the tx is valid.
      const burnMintTokenPoolArtifact =
        await hre.artifacts.readArtifact("BurnMintTokenPool");
      const deploymentTxHash = await wallet.deployContract({
        abi: burnMintTokenPoolArtifact.abi,
        bytecode: burnMintTokenPoolArtifact.bytecode as `0x${string}`,
        args: constructorArgs,
      });

      console.log(`⏳ Deployment tx: ${deploymentTxHash}`);
      console.log(`   Waiting for ${confirmations} confirmation(s)...`);

      const deploymentReceipt = await publicClient.waitForTransactionReceipt({
        hash: deploymentTxHash,
        confirmations,
      });

      if (!deploymentReceipt.contractAddress) {
        throw new Error(
          `Deployment receipt missing contractAddress for tx ${deploymentTxHash}`
        );
      }

      const contract = await viem.getContractAt(
        "BurnMintTokenPool",
        deploymentReceipt.contractAddress
      );

      console.log(`Token Pool deployed at: ${contract.address}`);
      console.log(`${networkConfig.explorerUrl}/address/${contract.address}`);

      // Grant mint/burn roles to the pool on the token contract
      console.log(
        `\n[Step 2] Granting mint and burn roles to token pool: ${contract.address}`
      );

      try {
        const tokenContract = await viem.getContractAt(
          "CrossChainToken",
          tokenAddress
        );
        const grantTx = await tokenContract.write.grantMintAndBurnRoles(
          [contract.address],
          { account: wallet.account }
        );

        console.log(`   Waiting for ${confirmations} confirmation(s)...`);
        await publicClient.waitForTransactionReceipt({
          hash: grantTx,
          confirmations,
        });
        console.log("✅ Roles granted successfully!");
      } catch {
        console.log("⚠️  grantMintAndBurnRoles() not available on token.");
        console.log(
          `   Please manually grant mint and burn roles to the pool at ${contract.address}`
        );
      }

      console.log("");
      console.log("========================================");
      console.log(`✅ Deployment Complete on ${networkConfig.chainName}!`);
      console.log("========================================");
      console.log(`Token Pool Address: ${contract.address}`);
      console.log(`${networkConfig.explorerUrl}/address/${contract.address}`);
      console.log("");
      console.log("Run this command to set the environment variable:");
      console.log(
        `export ${networkConfig.chainNameIdentifier}_TOKEN_POOL=${contract.address}`
      );
      console.log("========================================");
      console.log("");

      // Read symbol from token contract for the filename; fall back to "unknown"
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
        type: "token-pool",
        chainNameIdentifier: networkConfig.chainNameIdentifier,
        symbol,
        tokenPoolAddress: contract.address,
        tokenAddress,
      });

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
    },
  }))
  .build();
