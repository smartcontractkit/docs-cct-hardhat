import { task } from "hardhat/config";
import type { HardhatRuntimeEnvironment } from "hardhat/types/hre";
import { isAddress, type Address } from "viem";
import { readFileSync } from "fs";
import { join } from "path";
import { getConfigByNetworkName, getDeployedToken } from "../../helper-config";

/**
 * Mints CrossChainToken tokens to a receiver address.
 *
 * Usage:
 *   npx hardhat mintTokens --amount 1000000000000000000 --network sepolia
 *   npx hardhat mintTokens --network sepolia
 *   npx hardhat mintTokens --amount 1000000000000000000 --receiver 0xReceiverAddress --network sepolia
 *   npx hardhat mintTokens --amount 1000000000000000000 --tokenaddress 0xTokenAddress --network sepolia
 *
 * Options:
 *   --amount    Amount to mint in wei. Defaults to tokenAmountToMint from input/token.json.
 */
export const mintTokens = task(
  "mintTokens",
  "Mints CrossChainToken tokens to a receiver address"
)
  .addOption({
    name: "amount",
    description:
      "Amount to mint in wei — defaults to tokenAmountToMint from input/token.json",
    defaultValue: "",
  })
  .addOption({
    name: "receiver",
    description: "Receiver address — defaults to the deployer wallet",
    defaultValue: "",
  })
  .addOption({
    name: "tokenaddress",
    description: "Token address (overrides env var)",
    defaultValue: "",
  })
  .setAction(async () => ({
    default: async (
      {
        amount,
        receiver,
        tokenaddress,
      }: {
        amount: string;
        receiver: string;
        tokenaddress: string;
      },
      hre: HardhatRuntimeEnvironment
    ) => {
      let rawAmount = amount;
      if (!rawAmount) {
        const tokenJson = JSON.parse(
          readFileSync(join(process.cwd(), "input/token.json"), "utf8")
        );
        if (!tokenJson.tokenAmountToMint) {
          throw new Error(
            "--amount is required (or set tokenAmountToMint in input/token.json)"
          );
        }
        rawAmount = BigInt(tokenJson.tokenAmountToMint).toString();
      }
      const mintAmount = BigInt(rawAmount);
      if (mintAmount <= 0n) throw new Error("--amount must be greater than 0");

      const networkConnection = await hre.network.getOrCreate();
      const { viem } = networkConnection;
      const networkName = networkConnection.networkName;
      const sourceConfig = getConfigByNetworkName(networkName);
      const { confirmations, chainName, explorerUrl } = sourceConfig;

      let tokenAddress: Address;
      if (tokenaddress) {
        if (!isAddress(tokenaddress))
          throw new Error(`Invalid token address: ${tokenaddress}`);
        tokenAddress = tokenaddress;
      } else {
        tokenAddress = getDeployedToken(sourceConfig.chainId) as Address;
      }

      const [wallet] = await viem.getWalletClients();

      let receiverAddress: Address;
      if (receiver) {
        if (!isAddress(receiver))
          throw new Error(`Invalid receiver address: ${receiver}`);
        receiverAddress = receiver;
      } else {
        receiverAddress = wallet.account.address;
      }

      const tokenContract = await viem.getContractAt(
        "CrossChainToken",
        tokenAddress
      );
      const symbol = await tokenContract.read.symbol();

      console.log("");
      console.log("========================================");
      console.log("💰 Mint Tokens");
      console.log("========================================");
      console.log(`Chain:        ${chainName}`);
      console.log(`Action:       Mint tokens`);
      console.log("========================================");
      console.log("");
      console.log("Mint Parameters:");
      console.log(`  Token:    ${tokenAddress}`);
      console.log(`  Symbol:   ${symbol}`);
      console.log(`  Amount:   ${mintAmount}`);
      console.log(`  Receiver: ${receiverAddress}`);
      console.log("");

      const publicClient = await viem.getPublicClient();

      console.log(
        `[Step 1] Minting ${mintAmount} ${symbol} to ${receiverAddress}`
      );
      const txHash = await tokenContract.write.mint(
        [receiverAddress, mintAmount],
        { account: wallet.account }
      );
      console.log(`⏳ Tx: ${explorerUrl}/tx/${txHash}`);
      await publicClient.waitForTransactionReceipt({
        hash: txHash,
        confirmations,
      });
      console.log("✅ Tokens minted successfully!");

      const newBalance = await tokenContract.read.balanceOf([receiverAddress]);

      console.log("");
      console.log("========================================");
      console.log(`✅ Minting Complete on ${chainName}!`);
      console.log("========================================");
      console.log(
        `Receiver Address: ${explorerUrl}/address/${receiverAddress}`
      );
      console.log(`New Balance:      ${newBalance} ${symbol}`);
      console.log("========================================");
      console.log("");
    },
  }))
  .build();
