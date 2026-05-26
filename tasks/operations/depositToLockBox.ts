import { task } from "hardhat/config";
import type { HardhatRuntimeEnvironment } from "hardhat/types/hre";
import { isAddress, type Address } from "viem";
import { readFileSync } from "fs";
import { join } from "path";
import { getConfigByNetworkName, getDeployedToken } from "../../helper-config";

/**
 * Deposits tokens into an ERC20LockBox.
 * Requires the caller to be an authorized caller on the lockbox.
 *
 * Usage:
 *   npx hardhat depositToLockBox --lockbox 0xLockBoxAddress --amount 1000000000000000000 --network sepolia
 *   npx hardhat depositToLockBox --lockbox 0xLockBoxAddress --network sepolia
 *
 * Options:
 *   --amount    Amount to deposit in wei. Defaults to tokenAmountToTransfer from input/token.json.
 */
export const depositToLockBox = task(
  "depositToLockBox",
  "Deposits tokens into an ERC20LockBox"
)
  .addOption({
    name: "lockbox",
    description: "ERC20LockBox contract address",
    defaultValue: "",
  })
  .addOption({
    name: "amount",
    description:
      "Amount to deposit in wei — defaults to tokenAmountToTransfer from input/token.json",
    defaultValue: "",
  })
  .setAction(async () => ({
    default: async (
      { lockbox, amount }: { lockbox: string; amount: string },
      hre: HardhatRuntimeEnvironment
    ) => {
      if (!lockbox) throw new Error("--lockbox is required");
      if (!isAddress(lockbox))
        throw new Error(`Invalid lockbox address: ${lockbox}`);

      let rawAmount = amount;
      if (!rawAmount) {
        const tokenJson = JSON.parse(
          readFileSync(join(process.cwd(), "input/token.json"), "utf8")
        );
        if (!tokenJson.tokenAmountToTransfer) {
          throw new Error(
            "--amount is required (or set tokenAmountToTransfer in input/token.json)"
          );
        }
        rawAmount = BigInt(tokenJson.tokenAmountToTransfer).toString();
      }

      const depositAmount = BigInt(rawAmount);
      if (depositAmount <= 0n)
        throw new Error("--amount must be greater than 0");

      const networkConnection = await hre.network.getOrCreate();
      const { viem } = networkConnection;
      const networkName = networkConnection.networkName;
      const { confirmations, chainName, explorerUrl, chainId } =
        getConfigByNetworkName(networkName);

      const lockBoxAddress = lockbox as Address;
      const tokenAddress = getDeployedToken(chainId) as Address;

      const [wallet] = await viem.getWalletClients();
      const walletAddress = wallet.account.address;

      const lockBoxContract = await viem.getContractAt(
        "ERC20LockBox",
        lockBoxAddress
      );
      const tokenContract = await viem.getContractAt(
        "IERC20Metadata",
        tokenAddress
      );
      const symbol = await tokenContract.read.symbol();

      const isSupported = (await lockBoxContract.read.isTokenSupported([
        tokenAddress,
      ])) as boolean;
      if (!isSupported) {
        throw new Error(
          `Token ${tokenAddress} is not supported by lockbox ${lockBoxAddress}`
        );
      }

      console.log("");
      console.log("========================================");
      console.log("📥 Deposit to LockBox");
      console.log("========================================");
      console.log(`Chain:        ${chainName}`);
      console.log(`LockBox:      ${lockBoxAddress}`);
      console.log(`Action:       Deposit to lockbox`);
      console.log("========================================");
      console.log("");

      const balanceBefore = (await tokenContract.read.balanceOf([
        walletAddress,
      ])) as bigint;
      if (balanceBefore < depositAmount) {
        throw new Error(
          `Insufficient token balance: have ${balanceBefore}, need ${depositAmount}`
        );
      }

      console.log("Deposit Parameters:");
      console.log(`  LockBox:   ${lockBoxAddress}`);
      console.log(`  Token:     ${tokenAddress} (${symbol})`);
      console.log(`  Depositor: ${walletAddress}`);
      console.log(`  Amount:    ${depositAmount}`);
      console.log("");

      const publicClient = await viem.getPublicClient();

      console.log(`[Step 1] Approving ${depositAmount} ${symbol} to LockBox`);
      const approveTxHash = await tokenContract.write.approve(
        [lockBoxAddress, depositAmount],
        { account: wallet.account }
      );
      console.log(`⏳ Tx: ${explorerUrl}/tx/${approveTxHash}`);
      await publicClient.waitForTransactionReceipt({
        hash: approveTxHash,
        confirmations,
      });
      console.log("✅ Approval successful!");

      console.log(
        `\n[Step 2] Depositing ${depositAmount} ${symbol} into LockBox`
      );
      const depositTxHash = await lockBoxContract.write.deposit(
        [tokenAddress, 0n, depositAmount],
        { account: wallet.account }
      );
      console.log(`⏳ Tx: ${explorerUrl}/tx/${depositTxHash}`);
      await publicClient.waitForTransactionReceipt({
        hash: depositTxHash,
        confirmations,
      });
      console.log("✅ Deposit successful!");

      const balanceAfter = (await tokenContract.read.balanceOf([
        walletAddress,
      ])) as bigint;
      const lockBoxBalance = (await tokenContract.read.balanceOf([
        lockBoxAddress,
      ])) as bigint;

      console.log("");
      console.log("========================================");
      console.log(`✅ Deposit Complete on ${chainName}!`);
      console.log("========================================");
      console.log(`Depositor Balance Before: ${balanceBefore} ${symbol}`);
      console.log(`Depositor Balance After:  ${balanceAfter} ${symbol}`);
      console.log(`LockBox Balance:          ${lockBoxBalance} ${symbol}`);
      console.log("========================================");
      console.log("");
    },
  }))
  .build();
