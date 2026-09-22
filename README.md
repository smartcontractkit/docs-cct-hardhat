# CCIP Cross-Chain Token Deployment and Registration Tasks

> **NOTE:** This repository represents an educational example to use a Chainlink system, product, or service and is provided to demonstrate how to interact with Chainlink’s systems, products, and services to integrate them into your own. This template is provided “AS IS” and “AS AVAILABLE” without warranties of any kind, it has not been audited, and it may be missing key checks or error handling to make the usage of the system, product or service more clear. Do not use the code in this example in a production environment without completing your own audits and application of best practices. Neither Chainlink Labs, the Chainlink Foundation, nor Chainlink node operators are responsible for unintended outputs that are generated due to errors in code.

Hardhat tasks for deploying and managing cross-chain tokens using Chainlink CCIP.

## Prerequisites

1. Install dependencies:

   ```bash
   npm install
   ```

2. Store your private key in Hardhat's encrypted configuration store (if you don't have one already):

   ```bash
   npx hardhat keystore set your_keystore_name
   ```

   Hardhat prompts for a keystore password — set it on first use, or enter it to unlock on subsequent uses. Then it asks you to enter your private key as hidden text. The name you choose (e.g. `my_wallet`) is what you set as `KEYSTORE_NAME` in `.env`.

3. Configure environment variables. Copy `.env.example` to `.env` and fill in your values:

   ```bash
   cp .env.example .env
   ```

   ```bash
   # Hardhat configuration variable name holding your private key
   # Set via: npx hardhat keystore set your_keystore_name
   KEYSTORE_NAME=your_keystore_name

   # RPC URLs
   ETHEREUM_SEPOLIA_RPC_URL=your_eth_sepolia_rpc
   ARBITRUM_SEPOLIA_RPC_URL=your_arbitrum_sepolia_rpc  

   # Etherscan API key (required only if you use --verify on deployment tasks)
   ETHERSCAN_API_KEY=your_etherscan_api_key
   ```

4. Load environment variables:

   ```bash
   source .env
   ```

5. Build the project:

   ```bash
   npx hardhat compile
   ```

## Deployment Flow

### Step 1: Deploy Token (on both chains)

Configure token parameters in `input/token.json` (see [Configuration Files](#configuration-files) section), or override any field with CLI flags:

| Flag          | Default (from `token.json`) |
| ------------- | --------------------------- |
| `--name`      | `.name`                     |
| `--symbol`    | `.symbol`                   |
| `--decimals`  | `.decimals`                 |
| `--maxsupply` | `.maxSupply`                |
| `--premint`   | `.preMint`                  |

```bash
# Deploy on Ethereum Sepolia
npx hardhat deployToken --network sepolia

# Deploy on Arbitrum Sepolia
npx hardhat deployToken --network arbitrumSepolia
```

> **Note:** `--verify` requires `ETHERSCAN_API_KEY` to be set (see [Prerequisites](#prerequisites)). Etherscan API v2 supports all chains with a single key.

Optional: Pass `--rolesrecipient 0x...` to grant mint/burn roles to a specific address (defaults to the deployer). Pass `--ccipadmin 0x...` to set a custom CCIP admin address (defaults to the deployer). Pass `--premintrecipient 0x...` to set the address receiving any pre-minted tokens (defaults to the deployer when `--premint` is non-zero).

After each deployment, the token address is automatically saved to:

```
deployments/tokens/{CHAIN_NAME_IDENTIFIER}/{timestamp}-{SYMBOL}-Token.json
```

The file uses the env var name as the key (e.g. `ETHEREUM_SEPOLIA_TOKEN`). If you need to retrieve the deployed address later, open the file — the key is the env var name and the value is the address, so you can copy both directly into an `export` command. The `deployments/` directory is ignored by `.gitignore` — files are local to each user.

Set the token address so subsequent tasks can find it:

```bash
export ETHEREUM_SEPOLIA_TOKEN=0x...
export ARBITRUM_SEPOLIA_TOKEN=0x...
```

Alternatively, pass the address directly via `--tokenaddress` on any task that requires it — no export needed.

### Step 2: Deploy Token Pools (on both chains)

##### Burn & Mint Pool

Tokens are burned on source, minted on destination.

```bash
# Deploy pool on Ethereum Sepolia
npx hardhat deployTokenPool --network sepolia

# Deploy pool on Arbitrum Sepolia
npx hardhat deployTokenPool --network arbitrumSepolia
```

After each deployment, the pool address is automatically saved to:

```
deployments/token-pools/{CHAIN_NAME_IDENTIFIER}/{timestamp}-{SYMBOL}-BurnMintTokenPool.json
```

The file records the pool address under `{CHAIN_NAME_IDENTIFIER}_TOKEN_POOL` and its bound token address under `{CHAIN_NAME_IDENTIFIER}_TOKEN`.

Optional: Pass `--poolhooks 0x...` to attach an `AdvancedPoolHooks` contract at deploy time. Pass `--localtokendecimals <n>` if your token does not implement the optional `decimals()` ERC20 function — the task will fall back to this value and fail if neither is available.

The task also attempts to call `grantMintAndBurnRoles` on the token to grant the pool mint and burn rights. If the token does not implement this function, the task will print instructions to grant the roles manually.

##### Lock & Release Pool

Use the following when you don't have burn/mint rights on the source chain token (e.g. it was issued by a third party). Two patterns are supported:

###### Pattern A — Lock on Source, Mint on Destination

Token was originally issued on one chain; you control the token on the destination and can grant mint rights.

The `ERC20LockBox` is only needed on the chain where tokens are **locked**. The destination chain uses a standard `BurnMintTokenPool`, which requires mint/burn rights on the destination token.

```bash
# 1. Deploy ERC20LockBox first (pool address isn't known yet)
npx hardhat deployERC20LockBox --network sepolia
# Optional: add --authorizedcallers <DEPLOYER_OR_ISSUER_EOA> to authorize initial liquidity management

# 2. Deploy LockRelease pool, passing the lockbox address from step 1
npx hardhat deployLockReleaseTokenPool --lockbox <LOCKBOX_ADDRESS> --network sepolia

# 3. Authorize the pool to call the lockbox (deposit/withdraw)
npx hardhat updateAuthorizedCallers \
  --lockbox <LOCKBOX_ADDRESS> \
  --add <POOL_ADDRESS> \
  --network sepolia

# 4. BurnMint pool on Arbitrum Sepolia (minting side)
npx hardhat deployTokenPool --network arbitrumSepolia
```

###### Pattern B — Lock on Source, Release on Destination

Token already exists on both chains independently.

Each chain needs its own `ERC20LockBox` and `LockReleaseTokenPool`.

```bash
# 1. Deploy ERC20LockBox on Ethereum Sepolia
npx hardhat deployERC20LockBox --network sepolia

# 2. Deploy ERC20LockBox on Arbitrum Sepolia
npx hardhat deployERC20LockBox --network arbitrumSepolia

# Optional: add --authorizedcallers <DEPLOYER_OR_ISSUER_EOA> to either or both commands above

# 3. Deploy LockRelease pool on Ethereum Sepolia, passing its lockbox address from step 1
npx hardhat deployLockReleaseTokenPool --lockbox <ETHEREUM_SEPOLIA_LOCKBOX_ADDRESS> --network sepolia

# 4. Authorize the Ethereum Sepolia pool on its lockbox
npx hardhat updateAuthorizedCallers \
  --lockbox <ETHEREUM_SEPOLIA_LOCKBOX_ADDRESS> \
  --add <ETHEREUM_SEPOLIA_POOL_ADDRESS> \
  --network sepolia

# 5. Deploy LockRelease pool on Arbitrum Sepolia, passing its lockbox address from step 2
npx hardhat deployLockReleaseTokenPool --lockbox <ARBITRUM_SEPOLIA_LOCKBOX_ADDRESS> --network arbitrumSepolia

# 6. Authorize the Arbitrum Sepolia pool on its lockbox
npx hardhat updateAuthorizedCallers \
  --lockbox <ARBITRUM_SEPOLIA_LOCKBOX_ADDRESS> \
  --add <ARBITRUM_SEPOLIA_POOL_ADDRESS> \
  --network arbitrumSepolia
```

The `LockReleaseTokenPool` requires the `ERC20LockBox` at deploy time, and the lockbox must authorize the pool (via `updateAuthorizedCallers`) before it can deposit/withdraw tokens. The deployment order is always: **lockbox → pool → authorize pool on lockbox**.

`--lockbox` is required and must be the address of a deployed `ERC20LockBox` for the token. Optional: Pass `--poolhooks 0x...` to attach an already-deployed `AdvancedPoolHooks` contract at deploy time. Pass `--localtokendecimals <n>` if your token does not implement the optional `decimals()` ERC20 function. When deploying the lockbox, you can optionally pass `--authorizedcallers` (comma-separated) to authorize addresses immediately — useful for authorizing the deployer or token issuer to deposit/withdraw liquidity initially.

Set the pool address so subsequent tasks can find it:

```bash
export ETHEREUM_SEPOLIA_TOKEN_POOL=0x...
export ARBITRUM_SEPOLIA_TOKEN_POOL=0x...
```

Alternatively, pass the address directly via `--tokenpool` on any task that requires it.

Each deployment is automatically saved:

- ERC20LockBox → `deployments/lock-boxes/{CHAIN_NAME_IDENTIFIER}/{timestamp}-{SYMBOL}-LockBox.json` — keys: `LOCK_BOX`, `{CHAIN_NAME_IDENTIFIER}_TOKEN`
- LockReleaseTokenPool → `deployments/token-pools/{CHAIN_NAME_IDENTIFIER}/{timestamp}-{SYMBOL}-LockReleaseTokenPool.json` — keys: `{CHAIN_NAME_IDENTIFIER}_TOKEN_POOL`, `LOCK_BOX`, `{CHAIN_NAME_IDENTIFIER}_TOKEN`

To verify the lockbox address is correctly attached to the pool:

```bash
npx hardhat getLockBox --network arbitrumSepolia
```

### Step 3: Claim Admin (on both chains)

```bash
# On Ethereum Sepolia
npx hardhat claimAdmin --network sepolia

# On Arbitrum Sepolia
npx hardhat claimAdmin --network arbitrumSepolia
```

Optional: Pass `--ccipadmin 0x...` to specify the token's expected CCIP admin address (defaults to the deployer wallet).

### Step 4: Accept Admin Role (on both chains)

```bash
# On Ethereum Sepolia
npx hardhat acceptAdminRole --network sepolia

# On Arbitrum Sepolia
npx hardhat acceptAdminRole --network arbitrumSepolia
```

### Step 5: Apply Chain Updates (configure cross-chain routes)

```bash
# Configure Ethereum Sepolia → Arbitrum Sepolia
npx hardhat applyChainUpdates --destchain arbitrumSepolia --network sepolia

# Configure Arbitrum Sepolia → Ethereum Sepolia
npx hardhat applyChainUpdates --destchain sepolia --network arbitrumSepolia

# Configure Ethereum Sepolia → Solana Devnet (non-EVM destination)
npx hardhat applyChainUpdates \
  --destchain solanaDevnet \
  --destpooladdress <SOLANA_TOKEN_POOL_ADDRESS> \
  --desttokenaddress <SOLANA_TOKEN_ADDRESS> \
  --network sepolia
```

> **Non-EVM destinations:** For non-EVM chains like Solana Devnet, supply the destination pool and token addresses via `--destpooladdress` and `--desttokenaddress` — these are base58-encoded addresses, not `0x`-prefixed EVM addresses. Rate limiting is not applicable for non-EVM destinations and is ignored.

This task is idempotent — if the destination chain is already configured on the pool, the existing config is removed and replaced automatically.

Rate limiting is disabled by default. To enable it, pass the capacity and rate — `isEnabled` is automatically set to `true` when either value is provided:

```bash
# Ethereum Sepolia → Arbitrum Sepolia: enable both directions
npx hardhat applyChainUpdates \
  --destchain arbitrumSepolia \
  --outboundcapacity 1000000000000000000000 \
  --outboundrate 100000000000000000 \
  --inboundcapacity 1000000000000000000000 \
  --inboundrate 100000000000000000 \
  --network sepolia

# Arbitrum Sepolia → Ethereum Sepolia: enable both directions
npx hardhat applyChainUpdates \
  --destchain sepolia \
  --outboundcapacity 1000000000000000000000 \
  --outboundrate 100000000000000000 \
  --inboundcapacity 1000000000000000000000 \
  --inboundrate 100000000000000000 \
  --network arbitrumSepolia

# Enable outbound only (Sepolia → Arbitrum Sepolia)
npx hardhat applyChainUpdates \
  --destchain arbitrumSepolia \
  --outboundcapacity 1000000000000000000000 \
  --outboundrate 100000000000000000 \
  --network sepolia

# Enable inbound only (Sepolia → Arbitrum Sepolia)
npx hardhat applyChainUpdates \
  --destchain arbitrumSepolia \
  --inboundcapacity 1000000000000000000000 \
  --inboundrate 100000000000000000 \
  --network sepolia
```

| Flag                 | Required | Description                                                                |
| -------------------- | -------- | -------------------------------------------------------------------------- |
| `--destchain`        | Yes      | Destination chain name (e.g. `arbitrumSepolia`, `ARBITRUM_SEPOLIA`)        |
| `--tokenpool`        | No       | Source pool address — overrides the `{CHAIN}_TOKEN_POOL` env var           |
| `--destpooladdress`  | No       | Destination pool address — overrides the `{DEST_CHAIN}_TOKEN_POOL` env var |
| `--desttokenaddress` | No       | Destination token address — overrides the `{DEST_CHAIN}_TOKEN` env var     |
| `--outboundcapacity` | No       | Token bucket capacity for outbound transfers                               |
| `--outboundrate`     | No       | Token bucket refill rate (tokens/second) for outbound transfers            |
| `--inboundcapacity`  | No       | Token bucket capacity for inbound transfers                                |
| `--inboundrate`      | No       | Token bucket refill rate (tokens/second) for inbound transfers             |

> **Note:** `applyChainUpdates` only configures the **standard finality** rate limit bucket. To configure the fast finality bucket, run `updateRateLimiters --fastfinality` after the lane is set up.

To read the list of supported chains and their remote pool addresses:

```bash
npx hardhat getSupportedChains --network sepolia
```

### Step 6: Set Pool (on both chains)

```bash
# On Ethereum Sepolia
npx hardhat setPool --network sepolia

# On Arbitrum Sepolia
npx hardhat setPool --network arbitrumSepolia
```

## Ownership Management (Optional)

The following tasks are not required for the core deployment flow but are useful when handing off control to a multisig or a different EOA after initial setup. All token ownership tasks auto-detect the correct ownership pattern — no configuration needed.

### Transfer Ownership

Initiates or completes an ownership transfer for a token, token pool, pool hooks, or lockbox. Both `--type` and `--address` are required.

For `tokenPool`, `poolHooks`, and `lockBox`, all use Chainlink's `ConfirmedOwner` (two-step) — always requires `acceptOwnership`.

For `token`, the task auto-detects the ownership pattern:

| Detection                            | Token type                                 | Transfer action                             | Accept required?                                                |
| ------------------------------------ | ------------------------------------------ | ------------------------------------------- | --------------------------------------------------------------- |
| `pendingDefaultAdmin()` succeeds     | CrossChainToken                            | `beginDefaultAdminTransfer`                 | Yes — run `acceptOwnership --type token`                        |
| `pendingOwner()` + `owner()` succeed | OZ `Ownable2Step`                          | `transferOwnership`                         | Yes — run `acceptOwnership --type token`                        |
| `owner()` only (no `pendingOwner()`) | `ConfirmedOwner` or plain `Ownable`        | `transferOwnership`                         | Yes for `ConfirmedOwner`; plain `Ownable` transfers immediately |
| Neither                              | `BurnMintERC20` v1 (plain `AccessControl`) | `grantRole` + `revokeRole` (atomic, 1-step) | No                                                              |

**Step 1 — initiate (run as current owner/admin):**

```bash
# Omit --type to use the generic IOwnable path (works for any tokenPool/poolHooks/lockBox)
npx hardhat transferOwnership --address 0xYourPool --newowner 0xNewOwner --network sepolia

# Or specify --type for a named label in the output
npx hardhat transferOwnership --type tokenPool --address 0xYourPool --newowner 0xNewOwner --network sepolia
npx hardhat transferOwnership --type token --address 0xYourToken --newowner 0xNewOwner --network sepolia
npx hardhat transferOwnership --type poolHooks --address 0xYourHooks --newowner 0xNewOwner --network sepolia
npx hardhat transferOwnership --type lockBox --address 0xYourLockBox --newowner 0xNewOwner --network sepolia
```

**Step 2 — accept (run as `--newowner`):**

```bash
# Omit --type to use the generic IOwnable path
npx hardhat acceptOwnership --address 0xYourPool --network sepolia

# Or specify --type
npx hardhat acceptOwnership --type token --address 0xYourToken --network sepolia
npx hardhat acceptOwnership --type tokenPool --address 0xYourPool --network sepolia
npx hardhat acceptOwnership --type poolHooks --address 0xYourHooks --network sepolia
npx hardhat acceptOwnership --type lockBox --address 0xYourLockBox --network sepolia
```

> For `BurnMintERC20` v1 tokens, step 2 exits early — the transfer was already atomic. For plain `Ownable` tokens, step 1 completes immediately — step 2 will revert on-chain.

| Flag         | Required            | Description                                               |
| ------------ | ------------------- | --------------------------------------------------------- |
| `--type`     | Yes                 | Entity type: `token \| tokenPool \| poolHooks \| lockBox` |
| `--address`  | Yes                 | Contract address of the entity                            |
| `--newowner` | Yes (transfer only) | Address of the new owner                                  |

### Transfer Token Admin Role

Initiates a transfer of the CCIP token admin role to a new address. This is step 1 of a two-step process — the new admin must call `acceptAdminRole` to complete it.

```bash
npx hardhat transferTokenAdminRole --newadmin 0xNewAdminAddress --network sepolia
```

Optional: Pass `--tokenaddress 0x...` to override the token address (defaults to the `{CHAIN}_TOKEN` env var).

## Token Operations

### Mint Tokens

```bash
npx hardhat mintTokens --network sepolia
```

Optional: Pass `--amount <wei>` to override the amount to mint (defaults to `tokenAmountToMint` from `input/token.json`). Pass `--receiver 0x...` to mint to a different address (defaults to the deployer wallet).

### Transfer Tokens Cross-Chain

Install `ccip-cli` globally if not already installed:

```bash
npm install -g @chainlink/ccip-cli
```

> **Minimum version:** This README assumes `@chainlink/ccip-cli >= 1.5.0` (supports `--extra finality=...`).
> Verify your version with:
>
> ```bash
> ccip-cli --version
> ```

First, export the router address for the source chain — find it in `HelperConfig.s.sol` or the [CCIP Directory](https://docs.chain.link/ccip/directory), for example:

```bash
export ETHEREUM_SEPOLIA_ROUTER=0x...
```

```bash
# Receiver address
export RECEIVER=0xYourReceiverAddress

# The hardhat scripts use smallest-unit amounts (wei-like). In the ccip-cli example below, we use a compact, human-readable token amount
ccip-cli send \
  --source ethereum-testnet-sepolia \
  --router $ETHEREUM_SEPOLIA_ROUTER \
  --dest ethereum-testnet-sepolia-arbitrum-1 \
  --transfer-tokens $ETHEREUM_SEPOLIA_TOKEN=1.23 \
  --receiver $RECEIVER \
  --wallet hardhat:$KEYSTORE_NAME
```

Finality options (`--extra finality=...`):

- `finality=finalized` (default): Wait for full finality.
- `finality=safe`: Use Fast Confirmation Rule (wait for the `safe` head).
- `finality=<blockDepth>`: Wait for N block confirmations (example: `finality=5`).

Omit `-x finality=<n>` to use default finality. When set, `<n>` must be greater than or equal to the pool's configured block depth (see [Manage Finality Config](#manage-finality-config)). Pass `--fee-token LINK` to pay fees with LINK (defaults to the native network token).

See the [CCIP CLI docs](https://docs.chain.link/ccip/tools/cli/) for more details.

### Deposit to LockBox

Manually deposit tokens into an ERC20LockBox. Useful for token issuers managing liquidity.

```bash
npx hardhat depositToLockBox --lockbox 0x... --network sepolia
```

Optional: Pass `--amount <wei>` to override the deposit amount (defaults to `tokenAmountToTransfer` from `input/token.json`). Requires the caller to be an authorized caller on the lockbox.

### Withdraw from LockBox

Manually withdraw tokens from an ERC20LockBox. Useful for token issuers managing liquidity.

```bash
npx hardhat withdrawFromLockBox --lockbox 0x... --network sepolia
```

By default, withdraws the entire lockbox balance. Optional: Pass `--amount <wei>` to withdraw a specific amount instead. Pass `--recipient 0x...` to send withdrawn tokens to a different address (defaults to the deployer wallet). Requires the caller to be an authorized caller on the lockbox.

### Get Fee Token Balances

Inspect the fee token balances held by a token pool. Run this before `withdrawFeeTokens` — it prints each token's balance and a pre-filled withdrawal command for any non-zero tokens.

```bash
npx hardhat getFeeTokenBalances --feetokens "0xTokenA,0xTokenB" --network sepolia
```

### Withdraw Fee Tokens

Withdraws accrued fee token balances from a token pool to a specified recipient. Only callable by the pool owner or the designated fee admin.

> **Note:** Pool-level fee accrual and withdrawal are introduced in TokenPool v2.0. If run against a v1 pool, the task will exit with an informative message.

This task makes no assumptions about which token(s) have accumulated as fees — you must explicitly specify them via `--feetokens`. Accepts a comma-separated list.

```bash
# Single fee token
npx hardhat withdrawFeeTokens \
  --feetokens 0xTokenThatAccruedFees \
  --recipient 0xYourAddress \
  --network sepolia

# Multiple fee tokens
npx hardhat withdrawFeeTokens \
  --feetokens "0xFirstFeeToken,0xSecondFeeToken" \
  --recipient 0xYourAddress \
  --network sepolia
```

| Flag          | Required | Description                                                               |
| ------------- | -------- | ------------------------------------------------------------------------- |
| `--feetokens` | Yes      | Comma-separated ERC20 token addresses to withdraw                         |
| `--recipient` | No       | Address to receive the withdrawn fee tokens (defaults to deployer wallet) |

The pool token address is printed at runtime for reference so you can identify whether to include it in `--feetokens`.

## Optional Configuration

### Manage Dynamic Config

Reads or updates the dynamic configuration on a token pool: the CCIP router, rate limit admin, and fee admin.

##### View Dynamic Config

```bash
npx hardhat getDynamicConfig --network sepolia
```

##### Set Dynamic Config

```bash
npx hardhat setDynamicConfig --router 0xYourRouterAddress --network sepolia
npx hardhat setDynamicConfig --router 0xYourRouterAddress --ratelimitadmin 0xAdmin --feeadmin 0xFeeAdmin --network sepolia
```

| Flag               | Required | Description                                                                                                                                                                 |
| ------------------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--router`         | No       | The CCIP router address to set on the pool (default: current on-chain value)                                                                                                |
| `--ratelimitadmin` | No       | Rate limit admin address (default: current on-chain value, then deployer wallet)                                                                                            |
| `--feeadmin`       | No       | Fee admin address (default: current on-chain value, then deployer wallet). Set to `0x0000000000000000000000000000000000000000` to restrict fee withdrawal to the owner only |

### Manage Finality Config

> **Note:** Requires TokenPool v2.0 or later. The finality config controls which fast finality modes are accepted for cross-chain transfers. Setting it to `WAIT_FOR_FINALITY` (no flags, the default) disables fast finality transfers.

##### View Finality Config

```bash
npx hardhat getFinalityConfig --network sepolia
```

##### Set Finality Config

> **Best practice:** When enabling fast finality, consider configuring the fast finality bucket rate limits at the same time. If the fast finality bucket is not configured, fast finality transfers fall back to the standard finality bucket. Configuring it explicitly gives you isolated, independently tuned rate limits for fast finality transfers — useful when their volume or risk profile differs from standard finality transfers.

```bash
# Set block depth and configure the fast finality rate limit bucket:
npx hardhat setFinalityConfig \
  --blockdepth 5 \
  --destchain arbitrumSepolia \
  --outboundcapacity 1000000000000000000000 \
  --outboundrate 100000000000000000 \
  --inboundcapacity 1000000000000000000000 \
  --inboundrate 100000000000000000 \
  --network sepolia

# Set block depth only (no rate limit changes):
npx hardhat setFinalityConfig --blockdepth 5 --network sepolia

# Set WAIT_FOR_SAFE mode and view current rate limits for a lane (no update):
npx hardhat setFinalityConfig --waitforsafe --destchain arbitrumSepolia --network sepolia

# Combine both modes (pool accepts either simultaneously):
npx hardhat setFinalityConfig --blockdepth 5 --waitforsafe --network sepolia

# Reset to default finality (disables fast finality transfers):
npx hardhat setFinalityConfig --network sepolia
```

When `--destchain` is provided, the task logs the current rate limits before applying any changes, and the updated state after. Each direction is shown independently: the **fast finality bucket** is displayed for directions where it is enabled; the **standard finality bucket** (fallback) is displayed for directions where it is not.

| Flag                 | Required | Description                                                                                                                                    |
| -------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `--blockdepth`       | No       | Number of block confirmations for fast finality (1–65535). Can be combined with `--waitforsafe`. Omit both to reset to default finality.       |
| `--waitforsafe`      | No       | Allow fast finality using the `safe` head. Can be combined with `--blockdepth`.                                                                |
| `--destchain`        | No       | Remote chain whose lane is queried/updated. Required when any rate limit flag is set; if omitted, the rate limiter section is skipped entirely |
| `--outboundcapacity` | No       | uint128, outbound token bucket capacity (fast finality bucket)                                                                                 |
| `--outboundrate`     | No       | uint128, outbound token bucket refill rate (tokens/second)                                                                                     |
| `--outboundenabled`  | No       | Override `isEnabled` explicitly (`true`/`false`; defaults to `true` when `--outboundcapacity` or `--outboundrate` are set)                     |
| `--inboundcapacity`  | No       | uint128, inbound token bucket capacity (fast finality bucket)                                                                                  |
| `--inboundrate`      | No       | uint128, inbound token bucket refill rate (tokens/second)                                                                                      |
| `--inboundenabled`   | No       | Override `isEnabled` explicitly (`true`/`false`; defaults to `true` when `--inboundcapacity` or `--inboundrate` are set)                       |

### Manage Remote Pools

Remote pools represent the pool addresses registered on a given chain for each supported remote chain. When a pool is upgraded on a remote chain, the old address should be kept active until all inflight messages have completed, then removed.

##### View Remote Pools

```bash
npx hardhat getRemotePools --destchain arbitrumSepolia --network sepolia
```

##### Add a Remote Pool

Use after upgrading a pool on a remote chain. Both the old and new pool addresses can be active simultaneously to allow inflight messages to complete.

```bash
npx hardhat addRemotePool \
  --destchain arbitrumSepolia \
  --remotepooladdress 0xNewRemotePoolAddress \
  --network sepolia
```

##### Remove a Remote Pool

> **Warning:** All inflight transactions from the removed pool will be rejected after removal. Ensure there are no inflight transactions before proceeding.

```bash
npx hardhat removeRemotePool \
  --destchain arbitrumSepolia \
  --remotepooladdress 0xOldRemotePoolAddress \
  --network sepolia
```

### Deploy Advanced Pool Hooks

Use this task for enhanced security features like allowlists, CCV management, policy engine integration, and threshold-based validation.

Configure defaults in `input/advanced-pool-hooks.json` (see [Configuration Files](#configuration-files) section), or override any field with CLI flags:

| Flag                  | Type                      | Default (from `advanced-pool-hooks.json`) |
| --------------------- | ------------------------- | ----------------------------------------- |
| `--allowlist`         | comma-separated addresses | `.allowlist`                              |
| `--authorizedcallers` | comma-separated addresses | `.authorizedCallers`                      |
| `--thresholdamount`   | uint256 (wei)             | `.thresholdAmount`                        |
| `--policyengine`      | address                   | `.policyEngine`                           |

> **Important:** The `allowlistEnabled` flag is set **immutably** at deploy time based on whether `--allowlist` is non-empty. If you deploy with an empty allowlist (the default), allowlist functionality is permanently disabled — subsequent calls to `updateAllowList` will always revert. To enable allowlisting, pass at least one address via `--allowlist` at deploy time.

```bash
npx hardhat deployAdvancedPoolHooks --network sepolia --verify
```

After deployment, the hooks address is automatically saved to:

```
deployments/advanced-pool-hooks/{CHAIN_NAME_IDENTIFIER}/{timestamp}-AdvancedPoolHooks.json
```

The file records the address under the `POOL_HOOKS` key.

Then pass the hooks address as `--poolhooks` when [deploying a new token pool](#step-2-deploy-token-pools-on-both-chains), or connect it to an existing pool via [`updateAdvancedPoolHooks`](#connect-advanced-pool-hooks-to-a-token-pool).

### Get Advanced Pool Hooks

Reads and displays the `AdvancedPoolHooks` contract address currently attached to a token pool.

```bash
npx hardhat getAdvancedPoolHooks --network sepolia
```

### Connect Advanced Pool Hooks to a Token Pool

```bash
npx hardhat updateAdvancedPoolHooks --newhook 0x... --network sepolia
```

Optional: Pass `--tokenpool 0x...` to override the pool address (defaults to the `{CHAIN}_TOKEN_POOL` env var).

### Manage Allowlist

##### Add/Remove Addresses

Supports comma-separated lists.

```bash
# Via AdvancedPoolHooks
npx hardhat updateAllowList --poolhooks 0x... --add "0xAAA...,0xBBB..." --network sepolia

# Remove addresses
npx hardhat updateAllowList --poolhooks 0x... --remove 0xAAA... --network sepolia
```

> If `--poolhooks` is not set, the task falls back to calling directly on the token pool (v1 pools only).

##### View Current Allowlist

```bash
npx hardhat getAllowList --poolhooks 0x... --network sepolia
```

##### Check if an Address Is Allowlisted

```bash
npx hardhat isAllowListed --poolhooks 0x... --checkaddress 0x... --network sepolia
```

### Manage Authorized Callers

`AuthorizedCallers` is used in two places:

- **`AdvancedPoolHooks`** — authorized callers are the token pools permitted to invoke the hooks.
- **`ERC20LockBox`** — authorized callers are the `LockReleaseTokenPool` contracts permitted to call `deposit`/`withdraw`.

Both use the same task, passing either `--poolhooks <hooksAddress>` or `--lockbox <lockBoxAddress>`.

##### Add/Remove Authorized Callers

Supports comma-separated lists.

```bash
# Add callers — AdvancedPoolHooks
npx hardhat updateAuthorizedCallers --poolhooks 0x... --add "0xAAA...,0xBBB..." --network sepolia

# Add callers — ERC20LockBox
npx hardhat updateAuthorizedCallers --lockbox 0x... --add 0xAAA... --network sepolia

# Remove callers — AdvancedPoolHooks
npx hardhat updateAuthorizedCallers --poolhooks 0x... --remove 0xAAA... --network sepolia

# Remove callers — ERC20LockBox
npx hardhat updateAuthorizedCallers --lockbox 0x... --remove 0xAAA... --network sepolia
```

##### View Current Authorized Callers

```bash
# AdvancedPoolHooks
npx hardhat getAuthorizedCallers --poolhooks 0x... --network sepolia

# ERC20LockBox
npx hardhat getAuthorizedCallers --lockbox 0x... --network sepolia
```

### Manage Rate Limiters

##### View Current Rate Limits

Reads and displays the current rate limiter state for a token pool lane. Compatible with both v1 and v2 pools.

```bash
npx hardhat getCurrentRateLimits --destchain arbitrumSepolia --network sepolia
```

Optional: Pass `--fastfinality` to query the fast finality bucket (v2 pools only). Each direction is shown independently: the fast finality bucket is displayed where it is enabled; the standard finality bucket (fallback) is displayed where it is not.

##### Update Rate Limits

Updates rate limiter configuration for a specific lane. Compatible with both v1 and v2 pools. Direction is inferred automatically from whichever flags are set — no need to pass `--outboundenabled` or `--inboundenabled` separately. `isEnabled` defaults to `true` when `--capacity` or `--rate` are provided; pass `--outboundenabled false` or `--inboundenabled false` to explicitly disable.

```bash
# Enable both directions
npx hardhat updateRateLimiters \
  --destchain arbitrumSepolia \
  --outboundcapacity 1000000000000000000000 \
  --outboundrate 100000000000000000 \
  --inboundcapacity 1000000000000000000000 \
  --inboundrate 100000000000000000 \
  --network sepolia

# Disable outbound only
npx hardhat updateRateLimiters --destchain arbitrumSepolia --outboundenabled false --network sepolia

# Disable inbound only
npx hardhat updateRateLimiters --destchain arbitrumSepolia --inboundenabled false --network sepolia

# Disable both directions
npx hardhat updateRateLimiters --destchain arbitrumSepolia --outboundenabled false --inboundenabled false --network sepolia

# Update the fast finality bucket (v2 only)
npx hardhat updateRateLimiters \
  --destchain arbitrumSepolia \
  --fastfinality \
  --outboundcapacity 500000000000000000000 \
  --outboundrate 50000000000000000 \
  --network sepolia
```

| Flag                 | Required           | Description                                                                                         |
| -------------------- | ------------------ | --------------------------------------------------------------------------------------------------- |
| `--destchain`        | Yes                | Remote chain whose lane is being updated                                                            |
| `--outboundcapacity` | To update outbound | Token bucket capacity for outbound transfers                                                        |
| `--outboundrate`     | To update outbound | Token bucket refill rate (tokens/second) for outbound transfers                                     |
| `--outboundenabled`  | No                 | Override `isEnabled` explicitly (`true`/`false`; defaults to `true` when capacity or rate are set)  |
| `--inboundcapacity`  | To update inbound  | Token bucket capacity for inbound transfers                                                         |
| `--inboundrate`      | To update inbound  | Token bucket refill rate (tokens/second) for inbound transfers                                      |
| `--inboundenabled`   | No                 | Override `isEnabled` explicitly (`true`/`false`; defaults to `true` when capacity or rate are set)  |
| `--fastfinality`     | No                 | Update the fast finality bucket instead of the standard finality bucket (v2 only, default: `false`) |

### Manage Token Transfer Fee Config

Token pools v2.0 and later allow token issuers to configure fee parameters directly on the pool, overriding FeeQuoter defaults. If run against a v1 pool, these tasks will exit with an informative message — on v1, fee configuration is managed entirely by FeeQuoter and must be requested from the Chainlink team.

##### View Fee Config

Reads the raw stored fee configuration for a destination lane.

```bash
npx hardhat getTokenTransferFeeConfig --destchain arbitrumSepolia --network sepolia
```

##### Set or Update Fee Config

All fee config flags are optional — unset fields default to the current on-chain values, so you only need to pass the fields you want to change. When setting a fee config for the first time (no existing on-chain config), any unset fields default to `0`.

```bash
npx hardhat updateTokenTransferFeeConfig \
  --destchain arbitrumSepolia \
  --destgasoverhead 50000 \
  --destbytesoverhead 32 \
  --finalityfeeusdcents 0 \
  --fastfinalityfeeusdcents 100 \
  --finalitytransferfeebps 0 \
  --fastfinalitytransferfeebps 50 \
  --network sepolia
```

| Flag                           | Required | Description                                                                                                                        |
| ------------------------------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `--destchain`                  | Yes      | Remote chain to configure fees for                                                                                                 |
| `--destgasoverhead`            | No       | Gas overhead charged on the destination chain (uint32; defaults to current on-chain value)                                         |
| `--destbytesoverhead`          | No       | Data availability bytes overhead (uint32; defaults to current on-chain value)                                                      |
| `--finalityfeeusdcents`        | No       | Flat fee in 0.01 USD units for finality transfers (uint32; defaults to current on-chain value)                                     |
| `--fastfinalityfeeusdcents`    | No       | Flat fee in 0.01 USD units for fast finality transfers (uint32; defaults to current on-chain value)                                |
| `--finalitytransferfeebps`     | No       | Fee in basis points deducted from the transferred amount for finality transfers [0–9999] (defaults to current on-chain value)      |
| `--fastfinalitytransferfeebps` | No       | Fee in basis points deducted from the transferred amount for fast finality transfers [0–9999] (defaults to current on-chain value) |

##### Disable Fee Config

Disabling the fee config for a lane causes the OnRamp to fall back to FeeQuoter defaults.

```bash
npx hardhat updateTokenTransferFeeConfig --destchain arbitrumSepolia --disable --network sepolia
```

## Supported Networks

**EVM chains (source or destination):**

All tasks accept any of the following name formats for `--network` and for chain name flags (`--destchain`, `--remotechain`, etc.):

| Chain            | `--network` / chain flags                        |
| ---------------- | ------------------------------------------------ |
| Ethereum Sepolia | `sepolia`, `ethereumSepolia`, `ETHEREUM_SEPOLIA` |
| Arbitrum Sepolia | `arbitrumSepolia`, `ARBITRUM_SEPOLIA`            |

> **Note:** The short alias `sepolia` maps to `ETHEREUM_SEPOLIA`.

**Non-EVM chains (destination only):**

> Non-EVM chains can only be used as the **destination** chain in `applyChainUpdates` — i.e. to register a non-EVM token pool on an EVM source chain. They cannot be used as `--network` or source chains.

| Chain         | chain flags                     |
| ------------- | ------------------------------- |
| Solana Devnet | `solanaDevnet`, `SOLANA_DEVNET` |

## Configuration Files

### Token Deployment Configuration

Default token parameters are in `input/token.json`. Deployment fields can be overridden with CLI flags (see [Step 1](#step-1-deploy-token-on-both-chains)). `tokenAmountToMint` and `tokenAmountToTransfer` are used as defaults by the [Token Operations](#token-operations) tasks:

```json
{
  "name": "BnM Test",
  "symbol": "BnM-T",
  "decimals": 18,
  "maxSupply": 0,
  "preMint": 0,
  "tokenAmountToMint": 1000000000000000000000,
  "tokenAmountToTransfer": 1000000000000000000
}
```

### Advanced Pool Hooks Configuration

Default hooks parameters are in `input/advanced-pool-hooks.json`. All fields can be overridden with CLI flags (see [Deploy Advanced Pool Hooks](#deploy-advanced-pool-hooks)):

```json
{
  "allowlist": [],
  "thresholdAmount": 0,
  "policyEngine": "0x0000000000000000000000000000000000000000",
  "authorizedCallers": []
}
```

## Environment Variable Reference

### Session exports — `export VAR=0x...` after each deployment

These are the deployed contract addresses used by tasks when no explicit flag is provided. After each deployment, run `export` in your terminal — or recover values from `deployments/`. Alternatively, pass addresses directly via `--tokenaddress` / `--tokenpool` flags on any task.

> **Note:** Do not add these to `.env`. If unset, tasks throw with a clear error message identifying the missing variable. A stale `.env` value would silently target the wrong contract after a redeployment.

**Token addresses** — exported after [Step 1: Deploy Token](#step-1-deploy-token-on-both-chains):

| Variable                 | Chain            |
| ------------------------ | ---------------- |
| `ETHEREUM_SEPOLIA_TOKEN` | Ethereum Sepolia |
| `ARBITRUM_SEPOLIA_TOKEN` | Arbitrum Sepolia |

**Token pool addresses** — exported after [Step 2: Deploy Token Pools](#step-2-deploy-token-pools-on-both-chains):

| Variable                      | Chain            |
| ----------------------------- | ---------------- |
| `ETHEREUM_SEPOLIA_TOKEN_POOL` | Ethereum Sepolia |
| `ARBITRUM_SEPOLIA_TOKEN_POOL` | Arbitrum Sepolia |

**Non-EVM destination token addresses** — set before running [Step 5: Apply Chain Updates](#step-5-apply-chain-updates-configure-cross-chain-routes) when targeting a non-EVM chain. These are base58-encoded addresses, not `0x`-prefixed:

| Variable              | Chain         |
| --------------------- | ------------- |
| `SOLANA_DEVNET_TOKEN` | Solana Devnet |

**Non-EVM destination token pool addresses** — set before running [Step 5: Apply Chain Updates](#step-5-apply-chain-updates-configure-cross-chain-routes) when targeting a non-EVM chain. These are base58-encoded addresses, not `0x`-prefixed:

| Variable                   | Chain         |
| -------------------------- | ------------- |
| `SOLANA_DEVNET_TOKEN_POOL` | Solana Devnet |

### CLI flag overrides

Every task that resolves a deployed token or pool address from an env var also accepts a direct CLI flag override. These take priority over the exported env var and require no session state.

| Flag                 | Accepted by                                                                                                                                                                                                                                                                                                                                                                                                                              | Description                                                                      |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `--tokenaddress`     | `deployTokenPool`, `deployERC20LockBox`, `deployLockReleaseTokenPool`, `claimAdmin`, `acceptAdminRole`, `transferTokenAdminRole`, `setPool`, `mintTokens`                                                                                                                                                                                                                                                                                | Token address — takes priority over `{CHAIN}_TOKEN` env var                      |
| `--tokenpool`        | `applyChainUpdates`, `getSupportedChains`, `setPool`, `getFeeTokenBalances`, `withdrawFeeTokens`, `getLockBox`, `getFinalityConfig`, `setFinalityConfig`, `getTokenTransferFeeConfig`, `updateTokenTransferFeeConfig`, `getDynamicConfig`, `setDynamicConfig`, `getCurrentRateLimits`, `updateRateLimiters`, `getRemotePools`, `addRemotePool`, `removeRemotePool`, `getAdvancedPoolHooks`, `updateAdvancedPoolHooks`, `updateAllowList` | Pool address — takes priority over `{CHAIN}_TOKEN_POOL` env var                  |
| `--destpooladdress`  | `applyChainUpdates`                                                                                                                                                                                                                                                                                                                                                                                                                      | Destination pool address — takes priority over `{DEST_CHAIN}_TOKEN_POOL` env var |
| `--desttokenaddress` | `applyChainUpdates`                                                                                                                                                                                                                                                                                                                                                                                                                      | Destination token address — takes priority over `{DEST_CHAIN}_TOKEN` env var     |
| `--newowner`         | `transferOwnership`                                                                                                                                                                                                                                                                                                                                                                                                                      | New owner address                                                                |

Disclaimer: Please note, this repo contains community examples only  — these are not Chainlink products or services and are not supported or maintained by Chainlink. This code represents an example of using a Chainlink product or service, and is intended for demonstration and educational purposes only. It is provided “AS IS” and “AS AVAILABLE” without warranties of any kind, may not have been audited, and may omit checks or error handling. Each party intending to use this example code does so entirely at their own risk and must perform its own audits, security and code review, key management, and testing before any production deployment and ensure the operation and performance of such code matches expectations. Neither Chainlink Labs nor the Chainlink Foundation deploys, operates, monitors, maintains or endorses any deployment of this code. Note that this is not a Chainlink product, feature or service, and there are no commitments made with respect to the code, including compatibility with future Chainlink releases. You should not rely on this code without first conducting your own technical, engineering, and security review. This code is also outside the scope of any Chainlink bug bounty programs. Neither Chainlink Labs, the Chainlink Foundation, nor Chainlink node operators are responsible for outcomes due to errors in this example or how it is deployed or operated, or liable for any resulting claims or damages. Use of the Chainlink Network is subject to the Chainlink Foundation [Terms of Service](https://chain.link/terms), which provides important information and disclosures. By using this code, you acknowledge and agree to these terms.
