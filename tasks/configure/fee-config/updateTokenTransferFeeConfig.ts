import { task } from "hardhat/config";
import type { HardhatRuntimeEnvironment } from "hardhat/types/hre";
import { isAddress, type Address } from "viem";
import {
  getConfigByNetworkName,
  getDeployedTokenPool,
} from "../../../helper-config";

type TokenTransferFeeConfig = {
  destGasOverhead: number;
  destBytesOverhead: number;
  finalityFeeUSDCents: number;
  fastFinalityFeeUSDCents: number;
  finalityTransferFeeBps: number;
  fastFinalityTransferFeeBps: number;
  isEnabled: boolean;
};

const ZERO_CONFIG: TokenTransferFeeConfig = {
  destGasOverhead: 0,
  destBytesOverhead: 0,
  finalityFeeUSDCents: 0,
  fastFinalityFeeUSDCents: 0,
  finalityTransferFeeBps: 0,
  fastFinalityTransferFeeBps: 0,
  isEnabled: false,
};

/**
 * Applies or disables the token transfer fee configuration for a pool on a given destination lane.
 * Only available on TokenPool v2.0 and later.
 *
 * When no fee fields are provided, the current on-chain values are preserved as defaults.
 * Pass --disable to disable the fee config for the lane (reverts to FeeQuoter defaults).
 *
 * Usage:
 *   npx hardhat updateTokenTransferFeeConfig --destchain fuji --destgasoverhead 50000 --fastfinalityfeeusdcents 100 --network sepolia
 *   npx hardhat updateTokenTransferFeeConfig --destchain fuji --disable --network sepolia
 */
export const updateTokenTransferFeeConfig = task(
  "updateTokenTransferFeeConfig",
  "Applies or disables the token transfer fee config for a pool on a destination lane (v2+ only)"
)
  .addOption({
    name: "destchain",
    description:
      "Destination chain name (e.g. MANTLE_SEPOLIA or mantleSepolia)",
    defaultValue: "",
  })
  .addOption({
    name: "tokenpool",
    description: "Token pool address (overrides env var)",
    defaultValue: "",
  })
  .addFlag({
    name: "disable",
    description:
      "Disable the fee config for this lane (reverts to FeeQuoter defaults)",
  })
  .addOption({
    name: "destgasoverhead",
    description: "Gas overhead on destination chain (uint32)",
    defaultValue: "",
  })
  .addOption({
    name: "destbytesoverhead",
    description: "Data availability bytes overhead (uint32)",
    defaultValue: "",
  })
  .addOption({
    name: "finalityfeeusdcents",
    description: "Fixed fee in 0.01 USD units for finality transfers (uint32)",
    defaultValue: "",
  })
  .addOption({
    name: "fastfinalityfeeusdcents",
    description:
      "Fixed fee in 0.01 USD units for fast finality transfers (uint32)",
    defaultValue: "",
  })
  .addOption({
    name: "finalitytransferfeebps",
    description:
      "Fee in bps deducted from transferred amount for finality transfers (uint16, 0–9999)",
    defaultValue: "",
  })
  .addOption({
    name: "fastfinalitytransferfeebps",
    description:
      "Fee in bps deducted from transferred amount for fast finality transfers (uint16, 0–9999)",
    defaultValue: "",
  })
  .setAction(async () => ({
    default: async (
      {
        destchain,
        tokenpool,
        disable,
        destgasoverhead,
        destbytesoverhead,
        finalityfeeusdcents,
        fastfinalityfeeusdcents,
        finalitytransferfeebps,
        fastfinalitytransferfeebps,
      }: {
        destchain: string;
        tokenpool: string;
        disable: boolean;
        destgasoverhead: string;
        destbytesoverhead: string;
        finalityfeeusdcents: string;
        fastfinalityfeeusdcents: string;
        finalitytransferfeebps: string;
        fastfinalitytransferfeebps: string;
      },
      hre: HardhatRuntimeEnvironment
    ) => {
      if (!destchain)
        throw new Error("--destchain is required (e.g. --destchain fuji)");

      const networkConnection = await hre.network.getOrCreate();
      const { viem } = networkConnection;
      const networkName = networkConnection.networkName;
      const sourceConfig = getConfigByNetworkName(networkName);
      const destConfig = getConfigByNetworkName(destchain);
      const { chainName, explorerUrl, confirmations, chainId } = sourceConfig;
      const destChainSelector = BigInt(destConfig.chainSelector);

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
      console.log("💰 Update Token Transfer Fee Config");
      console.log("========================================");
      console.log(`Chain:        ${chainName}`);
      console.log(`Remote Chain: ${destConfig.chainName}`);
      console.log(`Token Pool:   ${poolAddress}`);
      console.log(
        `Action:       ${disable ? "Disable fee config" : "Set fee config"}`
      );
      console.log("========================================");
      console.log("");
      console.log(`Dest Chain Selector: ${destChainSelector}`);
      console.log("");

      const publicClient = await viem.getPublicClient();
      const [wallet] = await viem.getWalletClients();
      const poolContract = await viem.getContractAt(
        "BurnMintTokenPool",
        poolAddress
      );

      const isSupported = (await poolContract.read.isSupportedChain([
        destChainSelector,
      ])) as boolean;
      if (!isSupported) {
        throw new Error(
          `Destination chain ${destConfig.chainName} (selector: ${destChainSelector}) is not configured on this pool. Run applyChainUpdates first.`
        );
      }

      if (disable) {
        console.log(
          `[Step 1] Disabling fee config for lane to ${destConfig.chainName}`
        );
        try {
          const txHash =
            await poolContract.write.applyTokenTransferFeeConfigUpdates(
              [[], [destChainSelector]],
              { account: wallet.account }
            );
          console.log(`⏳ Tx: ${explorerUrl}/tx/${txHash}`);
          await publicClient.waitForTransactionReceipt({
            hash: txHash,
            confirmations,
          });
          console.log("✅ Fee config disabled for this lane.");
          console.log(
            "   The OnRamp will now use FeeQuoter defaults for this destination."
          );
        } catch (err) {
          console.log(
            "❌ Error: applyTokenTransferFeeConfigUpdates() reverted. Pool may be v1 (requires TokenPool v2.0+)."
          );
          if (err instanceof Error) throw err;
          throw new Error("applyTokenTransferFeeConfigUpdates() reverted");
        }
      } else {
        // Read current on-chain config as defaults; unset options fall back to these values.
        let currentConfig: TokenTransferFeeConfig = ZERO_CONFIG;
        try {
          const onChain = (await poolContract.read.getTokenTransferFeeConfig([
            "0x0000000000000000000000000000000000000000",
            destChainSelector,
            "0x00000000",
            "0x",
          ])) as TokenTransferFeeConfig;
          currentConfig = onChain;
          console.log("Current On-Chain Fee Configuration:");
          console.log(
            `  isEnabled:                   ${currentConfig.isEnabled}`
          );
          console.log(
            `  destGasOverhead:             ${currentConfig.destGasOverhead}`
          );
          console.log(
            `  destBytesOverhead:           ${currentConfig.destBytesOverhead}`
          );
          console.log(
            `  finalityFeeUSDCents:         ${currentConfig.finalityFeeUSDCents}`
          );
          console.log(
            `  fastFinalityFeeUSDCents:     ${currentConfig.fastFinalityFeeUSDCents}`
          );
          console.log(
            `  finalityTransferFeeBps:      ${currentConfig.finalityTransferFeeBps}`
          );
          console.log(
            `  fastFinalityTransferFeeBps:  ${currentConfig.fastFinalityTransferFeeBps}`
          );
          console.log("");
        } catch {
          // Pool is v1 or config not yet set — all defaults will be zero.
        }

        // Override only the fields explicitly provided; fall back to current on-chain values.
        const newConfig: TokenTransferFeeConfig = {
          destGasOverhead:
            destgasoverhead !== ""
              ? Number(destgasoverhead)
              : currentConfig.destGasOverhead,
          destBytesOverhead:
            destbytesoverhead !== ""
              ? Number(destbytesoverhead)
              : currentConfig.destBytesOverhead,
          finalityFeeUSDCents:
            finalityfeeusdcents !== ""
              ? Number(finalityfeeusdcents)
              : currentConfig.finalityFeeUSDCents,
          fastFinalityFeeUSDCents:
            fastfinalityfeeusdcents !== ""
              ? Number(fastfinalityfeeusdcents)
              : currentConfig.fastFinalityFeeUSDCents,
          finalityTransferFeeBps:
            finalitytransferfeebps !== ""
              ? Number(finalitytransferfeebps)
              : currentConfig.finalityTransferFeeBps,
          fastFinalityTransferFeeBps:
            fastfinalitytransferfeebps !== ""
              ? Number(fastfinalitytransferfeebps)
              : currentConfig.fastFinalityTransferFeeBps,
          isEnabled: true,
        };

        console.log("Fee Configuration to Apply:");
        console.log(
          `  destGasOverhead:             ${newConfig.destGasOverhead}`
        );
        console.log(
          `  destBytesOverhead:           ${newConfig.destBytesOverhead}`
        );
        console.log(
          `  finalityFeeUSDCents:         ${newConfig.finalityFeeUSDCents}`
        );
        console.log(
          `  fastFinalityFeeUSDCents:     ${newConfig.fastFinalityFeeUSDCents}`
        );
        console.log(
          `  finalityTransferFeeBps:      ${newConfig.finalityTransferFeeBps}`
        );
        console.log(
          `  fastFinalityTransferFeeBps:  ${newConfig.fastFinalityTransferFeeBps}`
        );
        console.log("");

        console.log(
          `[Step 1] Applying fee config for lane to ${destConfig.chainName}`
        );
        try {
          const txHash =
            await poolContract.write.applyTokenTransferFeeConfigUpdates(
              [[{ destChainSelector, tokenTransferFeeConfig: newConfig }], []],
              { account: wallet.account }
            );
          console.log(`⏳ Tx: ${explorerUrl}/tx/${txHash}`);
          await publicClient.waitForTransactionReceipt({
            hash: txHash,
            confirmations,
          });
          console.log("✅ Fee config applied successfully!");
        } catch (err) {
          console.log(
            "❌ Error: applyTokenTransferFeeConfigUpdates() reverted. Pool may be v1 (requires TokenPool v2.0+)."
          );
          if (err instanceof Error) throw err;
          throw new Error("applyTokenTransferFeeConfigUpdates() reverted");
        }
      }

      console.log("");
      console.log("========================================");
      console.log("✅ Operation Complete!");
      console.log("========================================");
      console.log(`Token Pool:   ${explorerUrl}/address/${poolAddress}`);
      console.log("========================================");
      console.log("");
    },
  }))
  .build();
