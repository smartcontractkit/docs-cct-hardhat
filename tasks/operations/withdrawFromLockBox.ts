import { task } from "hardhat/config";
import type { HardhatRuntimeEnvironment } from "hardhat/types/hre";
import { isAddress, type Address } from "viem";
import { getConfigByNetworkName, getDeployedToken } from "../../helper-config";

/**
 * Withdraws tokens from an ERC20LockBox.
 * Requires the caller to be an authorized caller on the lockbox.
 *
 * Usage:
 *   npx hardhat withdrawFromLockBox --lockbox 0xLockBoxAddress --network sepolia
 *   npx hardhat withdrawFromLockBox --lockbox 0xLockBoxAddress --amount 1000000000000000000 --network sepolia
 *   npx hardhat withdrawFromLockBox --lockbox 0xLockBoxAddress --recipient 0xRecipientAddress --network sepolia
 */
export const withdrawFromLockBox = task(
  "withdrawFromLockBox",
  "Withdraws tokens from an ERC20LockBox"
)
  .addOption({
    name: "lockbox",
    description: "ERC20LockBox contract address",
    defaultValue: "",
  })
  .addOption({
    name: "amount",
    description:
      "Amount to withdraw in wei — defaults to entire lockbox balance",
    defaultValue: "",
  })
  .addOption({
    name: "recipient",
    description:
      "Address to receive withdrawn tokens — defaults to the deployer wallet",
    defaultValue: "",
  })
  .setAction(async () => ({
    default: async (
      {
        lockbox,
        amount,
        recipient,
      }: { lockbox: string; amount: string; recipient: string },
      hre: HardhatRuntimeEnvironment
    ) => {
      if (!lockbox) throw new Error("--lockbox is required");
      if (!isAddress(lockbox))
        throw new Error(`Invalid lockbox address: ${lockbox}`);

      const networkConnection = await hre.network.getOrCreate();
      const { viem } = networkConnection;
      const networkName = networkConnection.networkName;
      const { confirmations, chainName, explorerUrl, chainId } =
        getConfigByNetworkName(networkName);

      const lockBoxAddress = lockbox as Address;
      const tokenAddress = getDeployedToken(chainId) as Address;

      const [wallet] = await viem.getWalletClients();

      let recipientAddress: Address;
      if (recipient) {
        if (!isAddress(recipient))
          throw new Error(`Invalid recipient address: ${recipient}`);
        recipientAddress = recipient;
      } else {
        recipientAddress = wallet.account.address;
      }

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

      const lockBoxBalance = (await tokenContract.read.balanceOf([
        lockBoxAddress,
      ])) as bigint;
      if (lockBoxBalance === 0n)
        throw new Error("LockBox has no tokens to withdraw");

      let withdrawAmount: bigint;
      if (amount) {
        withdrawAmount = BigInt(amount);
        if (withdrawAmount <= 0n)
          throw new Error("--amount must be greater than 0");
        if (withdrawAmount > lockBoxBalance) {
          throw new Error(
            `Amount ${withdrawAmount} exceeds lockbox balance ${lockBoxBalance}`
          );
        }
      } else {
        withdrawAmount = lockBoxBalance;
      }

      console.log("");
      console.log("========================================");
      console.log("📤 Withdraw from LockBox");
      console.log("========================================");
      console.log(`Chain:        ${chainName}`);
      console.log(`LockBox:      ${lockBoxAddress}`);
      console.log(`Action:       Withdraw from lockbox`);
      console.log("========================================");
      console.log("");

      console.log("Withdrawal Parameters:");
      console.log(`  LockBox:            ${lockBoxAddress}`);
      console.log(`  Token:              ${tokenAddress} (${symbol})`);
      console.log(`  Recipient:          ${recipientAddress}`);
      console.log(`  LockBox Balance:    ${lockBoxBalance} ${symbol}`);
      console.log(
        `  Amount to Withdraw: ${withdrawAmount}${
          withdrawAmount === lockBoxBalance ? " (entire balance)" : ""
        }`
      );
      console.log("");

      const recipientBalanceBefore = (await tokenContract.read.balanceOf([
        recipientAddress,
      ])) as bigint;

      const publicClient = await viem.getPublicClient();

      console.log(
        `[Step 1] Withdrawing ${withdrawAmount} ${symbol} from LockBox`
      );
      const withdrawTxHash = await lockBoxContract.write.withdraw(
        [tokenAddress, 0n, withdrawAmount, recipientAddress],
        { account: wallet.account }
      );
      console.log(`⏳ Tx: ${explorerUrl}/tx/${withdrawTxHash}`);
      await publicClient.waitForTransactionReceipt({
        hash: withdrawTxHash,
        confirmations,
      });
      console.log("✅ Withdrawal successful!");

      const lockBoxBalanceAfter = (await tokenContract.read.balanceOf([
        lockBoxAddress,
      ])) as bigint;
      const recipientBalanceAfter = (await tokenContract.read.balanceOf([
        recipientAddress,
      ])) as bigint;
      const actualWithdrawn = recipientBalanceAfter - recipientBalanceBefore;

      console.log("");
      console.log("========================================");
      console.log(`✅ Withdrawal Complete on ${chainName}!`);
      console.log("========================================");
      console.log(`Amount Withdrawn:         ${actualWithdrawn} ${symbol}`);
      console.log(`LockBox Balance Before:   ${lockBoxBalance} ${symbol}`);
      console.log(`LockBox Balance After:    ${lockBoxBalanceAfter} ${symbol}`);
      console.log(
        `Recipient Balance Before: ${recipientBalanceBefore} ${symbol}`
      );
      console.log(
        `Recipient Balance After:  ${recipientBalanceAfter} ${symbol}`
      );
      console.log("========================================");
      console.log("");
    },
  }))
  .build();
