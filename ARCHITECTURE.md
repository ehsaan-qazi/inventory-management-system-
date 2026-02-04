# Fish Market Architecture Contract

> **For future developers: This document defines invariants that MUST NOT be violated.**

## Core Principles

### 1. Ledger is Immutable
- `ledger_entries` table is **append-only**
- **NO UPDATE** on existing rows (except `is_reversed` flag for UI visibility)
- **NO DELETE** ever
- Corrections are made via compensating entries, not modifications

### 2. Balance is Derived
- Balance = `initial_balance` + SUM(ledger entries where `affects_balance = 1`)
- Balance column in `customers`/`farmers` is a **cache only**
- Balance cache is updated atomically at write time
- Balance is **NEVER recomputed** from full transaction history at read time

### 3. No Hard Deletes
- Transactions: marked `status = 'voided'` (not deleted)
- Manual entries: marked `is_reversed = 1` (not deleted)
- Voiding/reversing creates a compensating ledger entry

### 4. Reversals via Compensating Entries
- To "undo" a ledger entry: create a new entry with opposite direction
- Original entry remains in history with `is_reversed = 1`
- The two entries naturally cancel in balance calculation

### 5. Single-Effect Guarantee
Each financial event creates **exactly ONE** ledger entry:
- Sale → 1 CREDIT entry
- Purchase → 1 DEBIT entry
- Payment → 1 DEBIT entry
- Void → 1 compensating entry

## Data Growth Policy

### Append-Only Tables (NEVER truncate)
- `ledger_entries`
- `transactions`
- `farmer_transactions`

### Pagination Requirements
- **ALL** history queries MUST use LIMIT/OFFSET
- Default page size: 50
- Maximum page size: 200
- No unbounded SELECTs on history tables

### Large Account Handling
- Accounts with >10,000 records log a warning
- App remains functional indefinitely
- No automatic pruning or archiving

## Write Path Rules

### Transaction Atomicity
Every balance-affecting write MUST:
1. Be wrapped in a DB transaction
2. Insert ledger entry
3. Sync balance cache
4. Complete atomically or rollback entirely

### Crash Safety Guarantee
- Partial ledger entries: **IMPOSSIBLE** (transaction rollback)
- Partial balance updates: **IMPOSSIBLE** (same transaction)
- Orphan reversals: **IMPOSSIBLE** (same transaction)

## Entry Type Rules

| Type | `affects_balance` | `amount` | `display_amount` | Balance Effect |
|------|-------------------|----------|------------------|----------------|
| Financial | 1 | > 0 | NULL | Yes |
| Informational | 0 | 0 | Optional (user's amount for UI/receipts) | No |

### Dual-Amount Model (v1.2)
- **`amount`** (NOT NULL): The accounting amount used for balance calculations
  - Financial entries: User's actual amount (must be > 0)
  - Non-financial entries: Always 0 (never affects balance)
- **`display_amount`** (NULLABLE): Optional amount for UI/receipt display only
  - Financial entries: NULL (no separate display needed)
  - Non-financial entries: User's optional amount (if provided)

### Invariants
- Financial entry with `amount <= 0`: **REJECTED**
- Financial entry with `affects_balance = 0`: **REJECTED** (contradictory)
- Non-financial entry with `amount != 0`: **IMPOSSIBLE** (enforced at write time)
- Reversal referencing non-existent entry: **REJECTED**
- Double reversal of same entry: **REJECTED**

## What NOT to Do

❌ Do NOT add `UPDATE` statements to ledger entries  
❌ Do NOT add `DELETE` statements to any accounting table  
❌ Do NOT recompute balance from full history on reads  
❌ Do NOT modify reversal logic  
❌ Do NOT add triggers that auto-fix balances  
❌ Do NOT add background reconciliation jobs  

## File Locations

| Component | File |
|-----------|------|
| Database logic | `src/js/database.js` |
| Balance computation | `computeAccountBalance()` |
| Balance cache sync | `syncBalanceCache()` |
| Integrity check | `verifyBalanceIntegrity()` |
