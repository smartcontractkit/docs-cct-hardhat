import { task } from "hardhat/config";
import type { HardhatRuntimeEnvironment } from "hardhat/types/hre";
import { isAddress, zeroAddress, type Address } from "viem";
import { readFileSync } from "fs";
import { join } from "path";
import { verifyContract } from "@nomicfoundation/hardhat-verify/verify";
import { getConfigByNetworkName } from "../../../helper-config";
import { saveDeployment } from "../../../utils/saveDeployment";

interface AdvancedPoolHooksConfig {
  allowlist?: string[];
  thresholdAmount?: number | string;
  policyEngine?: string;
  authorizedCallers?: string[];
}

function loadHooksConfig(): AdvancedPoolHooksConfig {
  const path = join(process.cwd(), "input/advanced-pool-hooks.json");
  return JSON.parse(readFileSync(path, "utf8")) as AdvancedPoolHooksConfig;
}

function parseAddressList(csv: string, label: string): Address[] {
  return csv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((addr) => {
      if (!isAddress(addr))
        throw new Error(`Invalid ${label} address: ${addr}`);
      return addr as Address;
    });
}

/**
 * Deploys an AdvancedPoolHooks contract for enhanced token pool security.
 * Provides allowlist functionality, threshold-based validation, and policy engine integration.
 *
 * Parameter resolution order: CLI flag → input/advanced-pool-hooks.json
 *
 * Usage:
 *   npx hardhat deployAdvancedPoolHooks --network sepolia
 *   npx hardhat deployAdvancedPoolHooks --allowlist "0xA,0xB" --network sepolia
 *   npx hardhat deployAdvancedPoolHooks --authorizedcallers "0xPool" --thresholdamount 1000000000000000000 --network sepolia
 */
export const deployAdvancedPoolHooks = task(
  "deployAdvancedPoolHooks",
  "Deploys an AdvancedPoolHooks contract for allowlisting and CCV configuration"
)
  .addOption({
    name: "allowlist",
    description:
      "Comma-separated addresses allowed to transfer (overrides input/advanced-pool-hooks.json)",
    defaultValue: "",
  })
  .addOption({
    name: "thresholdamount",
    description:
      "Transfer threshold above which additional CCVs are required (overrides input/advanced-pool-hooks.json)",
    defaultValue: "",
  })
  .addOption({
    name: "policyengine",
    description:
      "Policy engine contract address — use 0x0 to disable (overrides input/advanced-pool-hooks.json)",
    defaultValue: "",
  })
  .addOption({
    name: "authorizedcallers",
    description:
      "Comma-separated token pool addresses authorized to use these hooks (overrides input/advanced-pool-hooks.json)",
    defaultValue: "",
  })
  .addFlag({
    name: "verify",
    description: "Verify the contract on the block explorer after deployment",
  })
  .setAction(async () => ({
    default: async (
      {
        allowlist,
        thresholdamount,
        policyengine,
        authorizedcallers,
        verify,
      }: {
        allowlist: string;
        thresholdamount: string;
        policyengine: string;
        authorizedcallers: string;
        verify: boolean;
      },
      hre: HardhatRuntimeEnvironment
    ) => {
      const networkConnection = await hre.network.getOrCreate();
      const { viem } = networkConnection;
      const networkName = networkConnection.networkName;
      const {
        confirmations,
        chainName,
        explorerUrl,
        chainId,
        chainNameIdentifier,
      } = getConfigByNetworkName(networkName);

      const config = loadHooksConfig();

      const allowlistAddresses: Address[] = allowlist
        ? parseAddressList(allowlist, "allowlist")
        : (config.allowlist ?? []).map((a) => {
            if (!isAddress(a))
              throw new Error(`Invalid allowlist address in config: ${a}`);
            return a as Address;
          });

      const thresholdAmount: bigint = thresholdamount
        ? BigInt(thresholdamount)
        : BigInt(config.thresholdAmount ?? 0);

      let policyEngineAddress: Address;
      if (policyengine) {
        if (!isAddress(policyengine))
          throw new Error(`Invalid policy engine address: ${policyengine}`);
        policyEngineAddress = policyengine as Address;
      } else {
        const configPe = config.policyEngine ?? zeroAddress;
        if (!isAddress(configPe))
          throw new Error(`Invalid policy engine in config: ${configPe}`);
        policyEngineAddress = configPe as Address;
      }

      const authorizedCallersAddresses: Address[] = authorizedcallers
        ? parseAddressList(authorizedcallers, "authorizedcallers")
        : (config.authorizedCallers ?? []).map((a) => {
            if (!isAddress(a))
              throw new Error(
                `Invalid authorizedCallers address in config: ${a}`
              );
            return a as Address;
          });

      const [wallet] = await viem.getWalletClients();

      console.log("");
      console.log("========================================");
      console.log("🔒 Deploy Advanced Pool Hooks");
      console.log("========================================");
      console.log(`Chain:        ${chainName}`);
      console.log(`Action:       Deploy pool hooks`);
      console.log("========================================");
      console.log("");
      console.log("Advanced Pool Hooks Parameters:");
      console.log(
        `  Allowlist Enabled:           ${
          allowlistAddresses.length > 0 ? "Yes" : "No"
        }`
      );
      if (allowlistAddresses.length > 0) {
        console.log(
          `  Allowlist Size:              ${allowlistAddresses.length}`
        );
        for (let i = 0; i < allowlistAddresses.length; i++) {
          console.log(`    [${i}] ${allowlistAddresses[i]}`);
        }
      }
      console.log(
        `  Threshold Amount:            ${
          thresholdAmount > 0n ? thresholdAmount.toString() : "Disabled (0)"
        }`
      );
      console.log(
        `  Policy Engine:               ${
          policyEngineAddress !== zeroAddress
            ? policyEngineAddress
            : "Disabled (0x0)"
        }`
      );
      console.log(
        `  Authorized Callers Enabled:  ${
          authorizedCallersAddresses.length > 0 ? "Yes" : "No"
        }`
      );
      if (authorizedCallersAddresses.length > 0) {
        console.log(
          `  Authorized Callers Size:     ${authorizedCallersAddresses.length}`
        );
        for (let i = 0; i < authorizedCallersAddresses.length; i++) {
          console.log(`    [${i}] ${authorizedCallersAddresses[i]}`);
        }
      }
      console.log("");

      console.log(`[Step 1] Deploying AdvancedPoolHooks on ${chainName}`);
      const constructorArgs = Array<any>([
        allowlistAddresses,
        thresholdAmount,
        policyEngineAddress,
        authorizedCallersAddresses,
      ]);

      console.log(`   Waiting for ${confirmations} confirmation(s)...`);
      const contract = await viem.deployContract(
        "AdvancedPoolHooks",
        ...constructorArgs,
        { confirmations }
      );
      const hooksAddress = contract.address;
      console.log("✅ AdvancedPoolHooks deployed successfully!");

      console.log("");
      console.log("========================================");
      console.log(`✅ Deployment Complete on ${chainName}!`);
      console.log("========================================");
      console.log(`AdvancedPoolHooks Address: ${hooksAddress}`);
      console.log(`${explorerUrl}/address/${hooksAddress}`);
      console.log("");
      saveDeployment({
        type: "pool-hooks",
        chainNameIdentifier,
        hooksAddress,
      });

      if (verify) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        console.log("\nVerifying contract on block explorer...");
        const constructorArgsFlat = [
          allowlistAddresses,
          thresholdAmount,
          policyEngineAddress,
          authorizedCallersAddresses,
        ];
        try {
          const isVerified = await verifyContract(
            {
              address: hooksAddress,
              constructorArgs: constructorArgsFlat,
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
      console.log("Configuration Summary:");
      console.log(
        `  Allowlist:          ${
          allowlistAddresses.length > 0 ? "Enabled" : "Disabled"
        }`
      );
      console.log(
        `  Threshold:          ${
          thresholdAmount > 0n ? thresholdAmount.toString() : "Disabled"
        }`
      );
      console.log(
        `  Policy Engine:      ${
          policyEngineAddress !== zeroAddress ? policyEngineAddress : "Disabled"
        }`
      );
      console.log(
        `  Authorized Callers: ${
          authorizedCallersAddresses.length > 0 ? "Enabled" : "Disabled"
        }`
      );
      console.log("");
      console.log("Next Steps:");
      console.log(
        "  1. When deploying a TokenPool, pass this hooks address as the 'poolHooks' parameter"
      );
      console.log(
        "  2. Attach to an existing pool: npx hardhat updateAdvancedPoolHooks --newhook <address> --network <network>"
      );
      console.log(
        '  3. Manage allowlist: npx hardhat updateAllowList --poolhooks <address> --add "0xAddr" --network <network>'
      );
      console.log("========================================");
      console.log("");
    },
  }))
  .build();
