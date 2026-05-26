import { deployToken } from "./deploy/deployToken";
import { deployTokenPool } from "./deploy/deployBurnMintTokenPool";
import { deployERC20LockBox } from "./deploy/deployERC20LockBox";
import { deployLockReleaseTokenPool } from "./deploy/deployLockReleaseTokenPool";
import { claimAdmin } from "./setup/claimAdmin";
import { acceptAdminRole } from "./setup/acceptAdminRole";
import { transferTokenAdminRole } from "./setup/transferTokenAdminRole";
import { transferOwnership } from "./setup/transfer-ownership/transferOwnership";
import { acceptOwnership } from "./setup/transfer-ownership/acceptOwnership";
import { applyChainUpdates } from "./setup/applyChainUpdates";
import { getSupportedChains } from "./setup/getSupportedChains";
import { getTypeAndVersion } from "./setup/getTypeAndVersion";
import { setPool } from "./setup/setPool";
import { getFinalityConfig } from "./configure/finality-config/getFinalityConfig";
import { setFinalityConfig } from "./configure/finality-config/setFinalityConfig";
import { getLockBox } from "./configure/getLockBox";
import { getTokenTransferFeeConfig } from "./configure/fee-config/getTokenTransferFeeConfig";
import { updateTokenTransferFeeConfig } from "./configure/fee-config/updateTokenTransferFeeConfig";
import { getCurrentRateLimits } from "./configure/rate-limiter/getCurrentRateLimits";
import { updateRateLimiters } from "./configure/rate-limiter/updateRateLimiters";
import { getAuthorizedCallers } from "./configure/authorized-callers/getAuthorizedCallers";
import { updateAuthorizedCallers } from "./configure/authorized-callers/updateAuthorizedCallers";
import { getRemotePools } from "./configure/remote-pools/getRemotePools";
import { addRemotePool } from "./configure/remote-pools/addRemotePool";
import { removeRemotePool } from "./configure/remote-pools/removeRemotePool";
import { getDynamicConfig } from "./configure/dynamic-config/getDynamicConfig";
import { setDynamicConfig } from "./configure/dynamic-config/setDynamicConfig";
import { deployAdvancedPoolHooks } from "./configure/allowlist/deployAdvancedPoolHooks";
import { getAdvancedPoolHooks } from "./configure/allowlist/getAdvancedPoolHooks";
import { updateAdvancedPoolHooks } from "./configure/allowlist/updateAdvancedPoolHooks";
import { getAllowList } from "./configure/allowlist/getAllowList";
import { isAllowListed } from "./configure/allowlist/isAllowListed";
import { updateAllowList } from "./configure/allowlist/updateAllowList";
import { mintTokens } from "./operations/mintTokens";
import { depositToLockBox } from "./operations/depositToLockBox";
import { withdrawFromLockBox } from "./operations/withdrawFromLockBox";
import { getFeeTokenBalances } from "./operations/getFeeTokenBalances";
import { withdrawFeeTokens } from "./operations/withdrawFeeTokens";

export const tasks = [
  deployToken,
  deployTokenPool,
  deployERC20LockBox,
  deployLockReleaseTokenPool,
  claimAdmin,
  acceptAdminRole,
  transferTokenAdminRole,
  transferOwnership,
  acceptOwnership,
  applyChainUpdates,
  getSupportedChains,
  getTypeAndVersion,
  setPool,
  getFinalityConfig,
  setFinalityConfig,
  getLockBox,
  getTokenTransferFeeConfig,
  updateTokenTransferFeeConfig,
  getCurrentRateLimits,
  updateRateLimiters,
  getAuthorizedCallers,
  updateAuthorizedCallers,
  getRemotePools,
  addRemotePool,
  removeRemotePool,
  getDynamicConfig,
  setDynamicConfig,
  deployAdvancedPoolHooks,
  getAdvancedPoolHooks,
  updateAdvancedPoolHooks,
  getAllowList,
  isAllowListed,
  updateAllowList,
  mintTokens,
  depositToLockBox,
  withdrawFromLockBox,
  getFeeTokenBalances,
  withdrawFeeTokens,
];

/**
 * npm package contracts to compile as build entry points.
 * Hardhat resolves their Solidity imports transitively.
 */
export const npmFilesToBuild = [
  "@chainlink/contracts-ccip/contracts/tokens/CrossChainToken.sol",
  "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol",
  "@chainlink/contracts-ccip/contracts/pools/BurnMintTokenPool.sol",
  "@chainlink/contracts-ccip/contracts/pools/LockReleaseTokenPool.sol",
  "@chainlink/contracts-ccip/contracts/pools/ERC20LockBox.sol",
  "@chainlink/contracts/src/v0.8/shared/access/AuthorizedCallers.sol",
  "@chainlink/contracts-ccip/contracts/tokenAdminRegistry/RegistryModuleOwnerCustom.sol",
  "@chainlink/contracts-ccip/contracts/tokenAdminRegistry/TokenAdminRegistry.sol",
  "@chainlink/contracts-ccip/contracts/interfaces/IGetCCIPAdmin.sol",
  "@chainlink/contracts-ccip/contracts/interfaces/IOwner.sol",
  "@chainlink/contracts-ccip/contracts/interfaces/IRouterClient.sol",
  "@chainlink/contracts-ccip/contracts/interfaces/IRouter.sol",
  "@chainlink/contracts-ccip/contracts/interfaces/IEVM2AnyOnRampClient.sol",
  "@chainlink/contracts-ccip/contracts/pools/AdvancedPoolHooks.sol",
  "@chainlink/contracts/src/v0.8/shared/interfaces/IOwnable.sol",
  "@chainlink/contracts/src/v0.8/shared/interfaces/ITypeAndVersion.sol",
  "@openzeppelin/contracts/access/IAccessControl.sol",
  "@openzeppelin/contracts-5.3.0/access/Ownable2Step.sol",
];
