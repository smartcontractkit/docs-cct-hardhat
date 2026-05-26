import { task } from "hardhat/config";
import type { HardhatRuntimeEnvironment } from "hardhat/types/hre";
import { isAddress, type Address } from "viem";
import { getConfigByNetworkName } from "../../../helper-config";

const ENTITY_TYPES = ["token", "tokenPool", "poolHooks", "lockBox"] as const;
type EntityType = (typeof ENTITY_TYPES)[number];

const SIMPLE_CONTRACT_NAME: Record<Exclude<EntityType, "token">, string> = {
  tokenPool: "BurnMintTokenPool",
  poolHooks: "AdvancedPoolHooks",
  lockBox: "ERC20LockBox",
};

const ENTITY_LABEL: Record<EntityType, string> = {
  token: "Token",
  tokenPool: "Token Pool",
  poolHooks: "Pool Hooks",
  lockBox: "LockBox",
};

/**
 * Completes an ownership transfer initiated by transferOwnership.
 * The signer must be the address that was proposed as the new owner.
 *
 * For tokenPool, poolHooks, and lockBox: calls acceptOwnership() (ConfirmedOwner pattern).
 * For token: auto-detects the token type and calls the appropriate accept function:
 *   - CrossChainToken (AccessControlDefaultAdminRules):    acceptDefaultAdminTransfer()
 *   - OZ Ownable2Step:                                     acceptOwnership()
 *   - ConfirmedOwner / plain Ownable:                      acceptOwnership()
 *   - BurnMintERC20 v1 (plain AccessControl):              no accept step needed (atomic transfer)
 *
 * Usage:
 *   npx hardhat acceptOwnership --address 0xYourPool --network sepolia
 *   npx hardhat acceptOwnership --type tokenPool --address 0xYourPool --network sepolia
 *   npx hardhat acceptOwnership --type token --address 0xYourToken --network sepolia
 *   npx hardhat acceptOwnership --type poolHooks --address 0xYourHooks --network sepolia
 *   npx hardhat acceptOwnership --type lockBox --address 0xYourLockBox --network sepolia
 *
 * If --type is omitted, the contract at --address is treated as a generic IOwnable (same as tokenPool/poolHooks/lockBox).
 */
export const acceptOwnership = task(
  "acceptOwnership",
  "Completes an ownership transfer — signer must be the pending owner"
)
  .addOption({
    name: "type",
    description: `Entity type: ${ENTITY_TYPES.join(
      " | "
    )} (optional — omit to use generic IOwnable path)`,
    defaultValue: "",
  })
  .addOption({
    name: "address",
    description: "Contract address of the entity",
    defaultValue: "",
  })
  .setAction(async () => ({
    default: async (
      { type, address }: { type: string; address: string },
      hre: HardhatRuntimeEnvironment
    ) => {
      if (type && !ENTITY_TYPES.includes(type as EntityType))
        throw new Error(
          `Invalid --type "${type}". Valid values: ${ENTITY_TYPES.join(", ")}`
        );
      if (!address) throw new Error("--address is required");
      if (!isAddress(address))
        throw new Error(`Invalid contract address: ${address}`);

      const entityType = type as EntityType | "";
      const entityAddress = address as Address;

      const networkConnection = await hre.network.getOrCreate();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { viem } = networkConnection as any;
      const networkName = networkConnection.networkName;
      const networkConfig = getConfigByNetworkName(networkName);
      const { confirmations, chainName, explorerUrl } = networkConfig;

      const publicClient = await viem.getPublicClient();
      const [wallet] = await viem.getWalletClients();
      const signerAddress = wallet.account.address;

      const label = entityType ? ENTITY_LABEL[entityType] : "Contract";

      console.log("");
      console.log("========================================");
      console.log(`👑 Accept ${label} Ownership`);
      console.log("========================================");
      console.log(`Chain:        ${chainName}`);
      console.log(`Action:       Accept ${label.toLowerCase()} ownership`);
      console.log("========================================");
      console.log("");

      if (entityType === "token") {
        // Auto-detect token type by probing functions unique to each standard.
        const cctContract = await viem.getContractAt(
          "CrossChainToken",
          entityAddress
        );
        let isCrossChainToken = false;
        let isOwnable2Step = false;
        let isOwnable = false;
        try {
          await cctContract.read.pendingDefaultAdmin();
          isCrossChainToken = true;
        } catch {
          /* not CrossChainToken */
        }

        if (!isCrossChainToken) {
          try {
            const ownableContract = await viem.getContractAt(
              "IOwnable",
              entityAddress
            );
            await ownableContract.read.owner();
            try {
              const ownable2StepContract = await viem.getContractAt(
                "Ownable2Step",
                entityAddress
              );
              await ownable2StepContract.read.pendingOwner();
              isOwnable2Step = true;
            } catch {
              isOwnable = true;
            }
          } catch {
            /* old AccessControl */
          }
        }

        const currentOwner: Address | undefined = isCrossChainToken
          ? await cctContract.read.defaultAdmin()
          : isOwnable2Step || isOwnable
          ? await (
              await viem.getContractAt("IOwnable", entityAddress)
            ).read.owner()
          : undefined;

        if (isCrossChainToken) {
          console.log(
            "ℹ️  Detection: CrossChainToken (AccessControlDefaultAdminRules) — using acceptDefaultAdminTransfer"
          );
        } else if (isOwnable2Step) {
          console.log("ℹ️  Detection: OZ Ownable2Step — using acceptOwnership");
        } else if (isOwnable) {
          console.log(
            "ℹ️  Detection: Ownable (owner() only, no pendingOwner()) — ConfirmedOwner or plain Ownable"
          );
          console.log(
            "ℹ️  Calling acceptOwnership(). Works for ConfirmedOwner. For plain Ownable: ownership already transferred — this call will revert."
          );
        } else {
          console.log(
            "ℹ️  Detection: AccessControl (BurnMintERC20 v1) — no accept step required"
          );
          console.log(
            "ℹ️  The DEFAULT_ADMIN_ROLE was transferred atomically by transferOwnership via grantRole + revokeRole."
          );
          console.log("");
          console.log("========================================");
          console.log(
            "✅ Nothing to accept — token admin was already transferred."
          );
          console.log("========================================");
          console.log("");
          return;
        }
        console.log("");

        console.log("Accept Token Ownership Parameters:");
        console.log(`  Token:         ${entityAddress}`);
        if (currentOwner) console.log(`  Current Owner: ${currentOwner}`);
        console.log(`  Signer:        ${signerAddress}`);
        console.log("");

        let txHash: `0x${string}`;
        if (isCrossChainToken) {
          console.log(
            `[Step 1] Accepting admin transfer (CrossChainToken) on ${chainName}`
          );
          txHash = await cctContract.write.acceptDefaultAdminTransfer([], {
            account: wallet.account,
          });
        } else {
          console.log(`[Step 1] Accepting token ownership on ${chainName}`);
          const ownableContract = await viem.getContractAt(
            "IOwnable",
            entityAddress
          );
          txHash = await ownableContract.write.acceptOwnership([], {
            account: wallet.account,
          });
        }
        console.log(`⏳ Tx: ${explorerUrl}/tx/${txHash}`);
        await publicClient.waitForTransactionReceipt({
          hash: txHash,
          confirmations,
        });

        console.log("");
        console.log("========================================");
        console.log(`✅ Token Ownership Accepted on ${chainName}!`);
        console.log("========================================");
        console.log(`Token:       ${explorerUrl}/address/${entityAddress}`);
        console.log(`Transaction: ${explorerUrl}/tx/${txHash}`);
        console.log(`New Owner:   ${signerAddress}`);
        console.log("========================================");
        console.log("");
      } else {
        // tokenPool, poolHooks, lockBox — all use ConfirmedOwner; fallback for omitted --type also uses IOwnable
        const contractName = entityType
          ? SIMPLE_CONTRACT_NAME[entityType as Exclude<EntityType, "token">]
          : "IOwnable";
        const contract = await viem.getContractAt(contractName, entityAddress);
        const currentOwner: Address = await contract.read.owner();

        console.log(`Accept ${label} Ownership Parameters:`);
        console.log(`  ${`${label}:`.padEnd(14)} ${entityAddress}`);
        console.log(`  Current Owner: ${currentOwner}`);
        console.log(`  Signer:        ${signerAddress}`);
        console.log("");

        console.log(
          `[Step 1] Accepting ${label.toLowerCase()} ownership on ${chainName}`
        );
        // acceptOwnership reverts on-chain if the signer is not the pending owner
        const txHash = await contract.write.acceptOwnership([], {
          account: wallet.account,
        });
        console.log(`⏳ Tx: ${explorerUrl}/tx/${txHash}`);
        await publicClient.waitForTransactionReceipt({
          hash: txHash,
          confirmations,
        });

        console.log("");
        console.log("========================================");
        console.log(`✅ ${label} Ownership Accepted on ${chainName}!`);
        console.log("========================================");
        console.log(
          `${`${label}:`.padEnd(12)} ${explorerUrl}/address/${entityAddress}`
        );
        console.log(`Transaction: ${explorerUrl}/tx/${txHash}`);
        console.log(`New Owner:   ${signerAddress}`);

        console.log("========================================");
        console.log("");
      }
    },
  }))
  .build();
