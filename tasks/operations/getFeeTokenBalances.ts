import { task } from "hardhat/config";
import type { HardhatRuntimeEnvironment } from "hardhat/types/hre";
import { isAddress, zeroAddress, type Address } from "viem";
import {
  getConfigByNetworkName,
  getDeployedTokenPool,
} from "../../helper-config";

/**
 * Read-only inspection of fee token balances held by a token pool.
 * Run this before withdrawFeeTokens to confirm which tokens have accrued fees.
 * Prints a pre-filled withdrawFeeTokens command for any non-zero tokens.
 *
 * No signing or wallet required — callable by anyone.
 *
 * Usage:
 *   npx hardhat getFeeTokenBalances --feetokens "0xAAA..." --network sepolia
 *   npx hardhat getFeeTokenBalances --feetokens "0xAAA...,0xBBB..." --network sepolia
 *   npx hardhat getFeeTokenBalances --feetokens "0xAAA..." --tokenpool 0xPoolAddress --network sepolia
 */
export const getFeeTokenBalances = task(
  "getFeeTokenBalances",
  "Displays fee token balances held by a token pool (v2+ only)"
)
  .addOption({
    name: "tokenpool",
    description: "Token pool address (overrides env var)",
    defaultValue: "",
  })
  .addOption({
    name: "feetokens",
    description:
      'Comma-separated ERC20 token addresses to inspect (e.g. "0xAAA...,0xBBB...")',
    defaultValue: "",
  })
  .setAction(async () => ({
    default: async (
      { tokenpool, feetokens }: { tokenpool: string; feetokens: string },
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
      const { chainName, chainId } = getConfigByNetworkName(networkName);

      let poolAddress: Address;
      if (tokenpool) {
        if (!isAddress(tokenpool))
          throw new Error(`Invalid pool address: ${tokenpool}`);
        poolAddress = tokenpool;
      } else {
        poolAddress = getDeployedTokenPool(chainId) as Address;
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
              "address(0) is not supported. Native tokens (ETH/AVAX) are not supported. " +
                "Provide ERC20 token addresses only."
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
      console.log("🔍 Get Fee Token Balances");
      console.log("========================================");
      console.log(`Chain:        ${chainName}`);
      console.log(`Token Pool:   ${poolAddress}`);
      console.log(`Action:       Inspect fee token balances`);
      console.log("========================================");
      console.log("");
      console.log(`Pool Token:   ${poolToken} (for reference)`);
      console.log("");

      // Fetch and cache balances in a single pass
      const balances = new Map<Address, bigint>();
      for (const addr of parsedFeeTokens) {
        const tokenContract = await viem.getContractAt("IERC20Metadata", addr);
        balances.set(
          addr,
          (await tokenContract.read.balanceOf([poolAddress])) as bigint
        );
      }

      console.log("Fee Token Balances:");
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

      console.log("");

      if (nonZeroCount === 0) {
        console.log(
          "ℹ️  No fee tokens have a non-zero balance in the pool. Nothing to withdraw."
        );
        console.log("========================================");
        console.log("");
        return;
      }

      const tokensToWithdraw = parsedFeeTokens.filter(
        (addr) => (balances.get(addr) ?? 0n) > 0n
      );

      console.log(
        `✅ ${nonZeroCount} token(s) with non-zero balances are ready for withdrawal.`
      );
      console.log("");

      const tokensCsv = tokensToWithdraw.join(",");
      console.log("To withdraw, run:");
      console.log(
        `  npx hardhat withdrawFeeTokens --feetokens "${tokensCsv}" --network ${networkName}`
      );
      console.log(
        "  (Add --recipient 0x... to send to a different address; defaults to the deployer wallet.)"
      );

      console.log("========================================");
      console.log("");
    },
  }))
  .build();
