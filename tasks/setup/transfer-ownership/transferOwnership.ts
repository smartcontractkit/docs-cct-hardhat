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
 * Initiates an ownership transfer for a token, token pool, pool hooks, or lockbox.
 * This is step 1 of a two-step process — the new owner must call acceptOwnership to complete it.
 *
 * For tokenPool, poolHooks, and lockBox: uses Chainlink's ConfirmedOwner (Ownable2Step) pattern.
 * For token: auto-detects the token type and calls the appropriate transfer function:
 *   - CrossChainToken (AccessControlDefaultAdminRules):    beginDefaultAdminTransfer(newAdmin) — step 1 of 2
 *   - OZ Ownable2Step:                                     transferOwnership(newOwner)         — step 1 of 2
 *   - ConfirmedOwner / plain Ownable:                      transferOwnership(newOwner)         — step 1 of 2
 *   - BurnMintERC20 v1 (plain AccessControl, no owner()): grantRole + revokeRole              — 1-step, atomic
 *
 * Usage:
 *   npx hardhat transferOwnership --address 0xYourPool --newowner 0xNewOwner --network sepolia
 *   npx hardhat transferOwnership --type tokenPool --address 0xYourPool --newowner 0xNewOwner --network sepolia
 *   npx hardhat transferOwnership --type token --address 0xYourToken --newowner 0xNewOwner --network sepolia
 *   npx hardhat transferOwnership --type poolHooks --address 0xYourHooks --newowner 0xNewOwner --network sepolia
 *   npx hardhat transferOwnership --type lockBox --address 0xYourLockBox --newowner 0xNewOwner --network sepolia
 *
 * If --type is omitted, the contract at --address is treated as a generic IOwnable (same as tokenPool/poolHooks/lockBox).
 */
export const transferOwnership = task(
  "transferOwnership",
  "Initiates an ownership transfer for a token, token pool, pool hooks, or lockbox (pending accept step required)"
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
  .addOption({
    name: "newowner",
    description:
      "Address of the new owner (must call acceptOwnership to complete)",
    defaultValue: "",
  })
  .setAction(async () => ({
    default: async (
      {
        type,
        address,
        newowner,
      }: { type: string; address: string; newowner: string },
      hre: HardhatRuntimeEnvironment
    ) => {
      if (type && !ENTITY_TYPES.includes(type as EntityType))
        throw new Error(
          `Invalid --type "${type}". Valid values: ${ENTITY_TYPES.join(", ")}`
        );
      if (!address) throw new Error("--address is required");
      if (!isAddress(address))
        throw new Error(`Invalid contract address: ${address}`);
      if (!newowner) throw new Error("--newowner is required");
      if (!isAddress(newowner))
        throw new Error(`Invalid new owner address: ${newowner}`);

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
      console.log(`🔄 Transfer ${label} Ownership`);
      console.log("========================================");
      console.log(`Chain:        ${chainName}`);
      console.log(`Action:       Transfer ${label.toLowerCase()} ownership`);
      console.log("========================================");
      console.log("");

      if (entityType === "token") {
        // Auto-detect token type by probing view functions unique to each standard:
        // 1. CrossChainToken (AccessControlDefaultAdminRules) — has pendingDefaultAdmin()
        // 2. OZ Ownable2Step                                  — has owner() + pendingOwner()
        // 3. ConfirmedOwner / plain Ownable                   — has owner() but no pendingOwner()
        // 4. Old BurnMintERC20 v1 (plain AccessControl)       — has neither
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
            "ℹ️  Detection: CrossChainToken (AccessControlDefaultAdminRules) — using beginDefaultAdminTransfer (step 1 of 2)"
          );
        } else if (isOwnable2Step) {
          console.log(
            "ℹ️  Detection: OZ Ownable2Step — using transferOwnership (step 1 of 2)"
          );
        } else if (isOwnable) {
          console.log(
            "ℹ️  Detection: Ownable (owner() only, no pendingOwner()) — ConfirmedOwner or plain Ownable"
          );
          console.log(
            "ℹ️  transferOwnership will be called. If ConfirmedOwner: run acceptOwnership after. If plain Ownable: transfer completes immediately."
          );
        } else {
          console.log(
            "ℹ️  Detection: AccessControl (BurnMintERC20 v1) — using grantRole + revokeRole (1-step, atomic, no accept required)"
          );
        }
        console.log("");

        console.log("Transfer Token Ownership Parameters:");
        console.log(`  Token:         ${entityAddress}`);
        if (currentOwner) console.log(`  Current Owner: ${currentOwner}`);
        console.log(`  New Owner:     ${newowner}`);
        console.log(`  Signer:        ${signerAddress}`);
        console.log("");

        if (
          currentOwner &&
          currentOwner.toLowerCase() !== signerAddress.toLowerCase()
        ) {
          throw new Error(
            `Signer (${signerAddress}) is not the current token owner/admin (${currentOwner}). Only the current owner/admin can initiate an ownership transfer.`
          );
        }

        let txHash: `0x${string}`;
        if (isCrossChainToken) {
          console.log(
            `[Step 1] Initiating admin transfer (CrossChainToken) on ${chainName}`
          );
          txHash = await cctContract.write.beginDefaultAdminTransfer(
            [newowner as Address],
            { account: wallet.account }
          );
          console.log(`⏳ Tx: ${explorerUrl}/tx/${txHash}`);
          await publicClient.waitForTransactionReceipt({
            hash: txHash,
            confirmations,
          });
          console.log(
            "✅ Admin transfer initiated! New owner must call acceptOwnership."
          );
        } else if (isOwnable2Step || isOwnable) {
          console.log(`[Step 1] Transferring token ownership on ${chainName}`);
          const ownableContract = await viem.getContractAt(
            "IOwnable",
            entityAddress
          );
          txHash = await ownableContract.write.transferOwnership(
            [newowner as Address],
            { account: wallet.account }
          );
          console.log(`⏳ Tx: ${explorerUrl}/tx/${txHash}`);
          await publicClient.waitForTransactionReceipt({
            hash: txHash,
            confirmations,
          });
          if (isOwnable2Step) {
            console.log(
              "✅ Ownership transfer initiated! New owner must call acceptOwnership."
            );
          } else {
            console.log(
              "✅ Ownership transfer initiated! If ConfirmedOwner: new owner must call acceptOwnership. If plain Ownable: transfer is already complete."
            );
          }
        } else {
          // Old BurnMintERC20 v1: plain AccessControl — grant to new admin, revoke from self, atomically.
          const DEFAULT_ADMIN_ROLE =
            "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`;
          const accessControl = await viem.getContractAt(
            "IAccessControl",
            entityAddress
          );
          const hasRole = await accessControl.read.hasRole([
            DEFAULT_ADMIN_ROLE,
            signerAddress as Address,
          ]);
          if (!hasRole)
            throw new Error(
              `Signer (${signerAddress}) does not have DEFAULT_ADMIN_ROLE on this token.`
            );

          console.log(
            `[Step 1] Granting DEFAULT_ADMIN_ROLE to new owner on ${chainName}`
          );
          const grantTx = await accessControl.write.grantRole(
            [DEFAULT_ADMIN_ROLE, newowner as Address],
            { account: wallet.account }
          );
          console.log(`⏳ Tx: ${explorerUrl}/tx/${grantTx}`);
          await publicClient.waitForTransactionReceipt({
            hash: grantTx,
            confirmations,
          });

          console.log(
            `[Step 2] Revoking DEFAULT_ADMIN_ROLE from current admin on ${chainName}`
          );
          const revokeTx = await accessControl.write.revokeRole(
            [DEFAULT_ADMIN_ROLE, signerAddress as Address],
            { account: wallet.account }
          );
          console.log(`⏳ Tx: ${explorerUrl}/tx/${revokeTx}`);
          await publicClient.waitForTransactionReceipt({
            hash: revokeTx,
            confirmations,
          });
          txHash = revokeTx;
          console.log(
            "✅ Admin role transferred atomically! No accept step required."
          );
        }

        console.log("");
        console.log("========================================");
        console.log(`✅ Token Ownership Transfer Complete on ${chainName}!`);
        console.log("========================================");
        console.log(`Token:       ${explorerUrl}/address/${entityAddress}`);
        console.log(`New Owner:   ${newowner}`);
        console.log("========================================");
        console.log("");
        if (isCrossChainToken || isOwnable2Step || isOwnable) {
          console.log(
            `ℹ️  The new owner (${newowner}) must call acceptOwnership --type token --address ${entityAddress} to complete the transfer (unless this token uses plain Ownable, in which case transfer is already complete).`
          );
          console.log("");
        }
      } else {
        // tokenPool, poolHooks, lockBox — all use ConfirmedOwner; fallback for omitted --type also uses IOwnable
        const contractName = entityType
          ? SIMPLE_CONTRACT_NAME[entityType as Exclude<EntityType, "token">]
          : "IOwnable";
        const contract = await viem.getContractAt(contractName, entityAddress);
        const currentOwner: Address = await contract.read.owner();

        console.log(`Transfer ${label} Ownership Parameters:`);
        console.log(`  ${`${label}:`.padEnd(14)} ${entityAddress}`);
        console.log(`  Current Owner: ${currentOwner}`);
        console.log(`  New Owner:     ${newowner}`);
        console.log(`  Signer:        ${signerAddress}`);
        console.log("");

        if (currentOwner.toLowerCase() !== signerAddress.toLowerCase()) {
          throw new Error(
            `Signer (${signerAddress}) is not the current ${label.toLowerCase()} owner (${currentOwner}). Only the current owner can initiate an ownership transfer.`
          );
        }

        console.log(
          `[Step 1] Transferring ${label.toLowerCase()} ownership on ${chainName}`
        );
        const txHash = await contract.write.transferOwnership(
          [newowner as Address],
          { account: wallet.account }
        );
        console.log(`⏳ Tx: ${explorerUrl}/tx/${txHash}`);
        await publicClient.waitForTransactionReceipt({
          hash: txHash,
          confirmations,
        });

        console.log("");
        console.log("========================================");
        console.log(
          `✅ ${label} Ownership Transfer Initiated on ${chainName}!`
        );
        console.log("========================================");
        console.log(
          `${`${label}:`.padEnd(12)} ${explorerUrl}/address/${entityAddress}`
        );
        console.log(`Transaction: ${explorerUrl}/tx/${txHash}`);
        console.log(`New Owner:   ${newowner}`);
        console.log("========================================");
        console.log("");
        console.log(
          `ℹ️  The new owner (${newowner}) must call acceptOwnership${
            entityType ? ` --type ${entityType}` : ""
          } --address ${entityAddress} to complete the transfer.`
        );
        console.log("");
      }
    },
  }))
  .build();
