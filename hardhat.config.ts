import hardhatToolboxViemPlugin from "@nomicfoundation/hardhat-toolbox-viem";
import hardhatVerifyPlugin from "@nomicfoundation/hardhat-verify";
import { configVariable, defineConfig } from "hardhat/config";
import { configData, getNetworkVariants } from "./helper-config";
import { tasks, npmFilesToBuild } from "./tasks/index";
import dotenv from "dotenv";
dotenv.config();

const networks: Record<string, any> = {};

for (const [name, config] of Object.entries(configData)) {
  const rpcVarName = `${config.chainNameIdentifier}_RPC_URL`;
  const networkConfig = {
    type: "http" as const,
    chainId: config.chainId,
    url: configVariable(rpcVarName) ?? process.env[rpcVarName],
    accounts: [configVariable(process.env.KEYSTORE_NAME!)],
  };

  // Register all variants: "ethereumsepolia", "ethereumSepolia", "ETHEREUM_SEPOLIA", and short aliases (e.g. "sepolia", "fuji", "amoy")
  for (const variant of getNetworkVariants(name)) {
    networks[variant] = networkConfig;
  }
}

export default defineConfig({
  plugins: [hardhatToolboxViemPlugin, hardhatVerifyPlugin],
  tasks,
  solidity: {
    npmFilesToBuild,
    profiles: {
      default: {
        version: "0.8.24",
        settings: {
          evmVersion: "shanghai",
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      production: {
        version: "0.8.24",
        settings: {
          evmVersion: "shanghai",
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    },
  },
  networks,
  verify: {
    etherscan: {
      apiKey: process.env.ETHERSCAN_API_KEY || "UNSET",
      enabled: true,
    },
    blockscout: {
      enabled: false,
    },
  },
});
