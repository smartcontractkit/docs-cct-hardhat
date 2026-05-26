import { task } from "hardhat/config";
import type { HardhatRuntimeEnvironment } from "hardhat/types/hre";
import { isAddress, zeroAddress, type Address } from "viem";
import {
  getConfigByNetworkName,
  getDeployedTokenPool,
} from "../../helper-config";

/**
 * Withdraws accrued fee token balances from a token pool to a recipient.
 * Only available on TokenPool v2.0 and later.
 * Callable only by the pool owner or the designated fee admin.
 *
 * The pool token address is printed for reference, but this task makes no assumptions
 * about which ERC20 tokens have accumulated as fees — supply them explicitly via --feetokens.
 * Only ERC20 tokens are supported; native tokens (ETH, AVAX, etc.) are not supported.
 *
 * Usage:
 *   npx hardhat withdrawFeeTokens --feetokens "0xAAA..." --network sepolia
 *   npx hardhat withdrawFeeTokens --feetokens "0xAAA...,0xBBB..." --recipient 0xYourAddress --network sepolia
 *   npx hardhat withdrawFeeTokens --feetokens "0xAAA..." --tokenpool 0xPoolAddress --network sepolia
 */
export const withdrawFeeTokens = task(
  "withdrawFeeTokens",
  "Withdraws accrued fee token balances from a token pool (v2+ only)"
)
  .addOption({
    name: "tokenpool",
    description: "Token pool address (overrides env var)",
    defaultValue: "",
  })
  .addOption({
    name: "recipient",
    description:
      "Address to receive the withdrawn fee tokens — defaults to the deployer wallet",
    defaultValue: "",
  })
  .addOption({
    name: "feetokens",
    description:
      'Comma-separated ERC20 token addresses to withdraw (e.g. "0xAAA...,0xBBB...")',
    defaultValue: "",
  })
  .setAction(async () => ({
    default: async (
      {
        tokenpool,
        recipient,
        feetokens,
      }: { tokenpool: string; recipient: string; feetokens: string },
      hre: HardhatRuntimeEnvironment
    ) => {
      if (!feetokens) {
        throw new Error(
          "--feetokens is required: provide a comma-separated list of ERC20 token addresses"
        );
      }

      const networkConnection = await hre.network.getOrCreate();
      const { viem } = networkConnection;
      const networkName = networkConnection.networkName;
      const { confirmations, chainName, explorerUrl, chainId } =
        getConfigByNetworkName(networkName);

      let poolAddress: Address;
      if (tokenpool) {
        if (!isAddress(tokenpool))
          throw new Error(`Invalid pool address: ${tokenpool}`);
        poolAddress = tokenpool;
      } else {
        poolAddress = getDeployedTokenPool(chainId) as Address;
      }

      const [wallet] = await viem.getWalletClients();

      let recipientAddress: Address;
      if (recipient) {
        if (!isAddress(recipient))
          throw new Error(`Invalid recipient address: ${recipient}`);
        recipientAddress = recipient;
      } else {
        recipientAddress = wallet.account.address;
      }

      // Parse comma-separated fee token list
      const parsedFeeTokens: Address[] = feetokens
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((addr) => {
          if (!isAddress(addr))
            throw new Error(`Invalid fee token address: ${addr}`);
          if (addr.toLowerCase() === zeroAddress) {
            throw new Error(
              "address(0) is not supported. Native tokens (ETH/AVAX) cannot be withdrawn " +
                "via withdrawFeeTokens(). Provide ERC20 token addresses only."
            );
          }
          return addr as Address;
        });

      if (parsedFeeTokens.length === 0) {
        throw new Error(
          "--feetokens must contain at least one valid ERC20 token address"
        );
      }

      const poolContract = await viem.getContractAt(
        "BurnMintTokenPool",
        poolAddress
      );
      const poolToken = (await poolContract.read.getToken()) as Address;

      console.log("");
      console.log("========================================");
      console.log("💸 Withdraw Fee Tokens");
      console.log("========================================");
      console.log(`Chain:        ${chainName}`);
      console.log(`Token Pool:   ${poolAddress}`);
      console.log(`Action:       Withdraw fee tokens`);
      console.log("========================================");
      console.log("");
      console.log(`Pool Token:   ${poolToken} (for reference)`);
      console.log(`Recipient:    ${recipientAddress}`);
      console.log("");
      console.log("Tokens to Withdraw:");

      // Check pool balances for each fee token and build a filtered list
      const balances = new Map<Address, bigint>();
      for (const addr of parsedFeeTokens) {
        const tokenContract = await viem.getContractAt("IERC20Metadata", addr);
        balances.set(
          addr,
          (await tokenContract.read.balanceOf([poolAddress])) as bigint
        );
      }

      let nonZeroCount = 0;
      for (let i = 0; i < parsedFeeTokens.length; i++) {
        const poolBalance = balances.get(parsedFeeTokens[i])!;
        if (poolBalance === 0n) {
          console.log(
            `  [${i}] ${parsedFeeTokens[i]}  →  balance: 0 ⚠️  (skipping)`
          );
        } else {
          console.log(
            `  [${i}] ${parsedFeeTokens[i]}  →  balance: ${poolBalance}`
          );
          nonZeroCount++;
        }
      }

      if (nonZeroCount === 0) {
        console.log("");
        console.log(
          "⚠️  No fee tokens have a non-zero balance in the pool. Nothing to withdraw."
        );
        console.log("========================================");
        console.log("");
        return;
      }

      const tokensToWithdraw = parsedFeeTokens.filter(
        (addr) => (balances.get(addr) ?? 0n) > 0n
      );
      console.log("");

      const publicClient = await viem.getPublicClient();

      console.log(`[Step 1] Withdrawing fee tokens on ${chainName}`);
      try {
        const txHash = await poolContract.write.withdrawFeeTokens(
          [tokensToWithdraw, recipientAddress],
          { account: wallet.account }
        );
        console.log(`⏳ Tx: ${explorerUrl}/tx/${txHash}`);
        await publicClient.waitForTransactionReceipt({
          hash: txHash,
          confirmations,
        });
        console.log("✅ Fee tokens withdrawn successfully!");
      } catch (err) {
        console.log("❌ Error: withdrawFeeTokens() reverted.");
        if (err instanceof Error) {
          console.log(`   ${err.message}`);
          if (err.message.includes("OnlyCallableByOwner")) {
            console.log(
              "   Ensure the wallet sending the transaction is the pool owner or fee admin."
            );
          }
        }
        console.log(
          "   If the function is missing, the pool may be v1 (requires TokenPool v2.0+)."
        );
        throw err;
      }

      console.log("");
      console.log("========================================");
      console.log(`✅ Withdrawal complete on ${chainName}!`);
      console.log("========================================");
      console.log(`Token Pool:   ${explorerUrl}/address/${poolAddress}`);
      console.log(`Recipient:    ${explorerUrl}/address/${recipientAddress}`);
      console.log("========================================");
      console.log("");
    },
  }))
  .build();
