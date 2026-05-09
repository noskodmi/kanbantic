# @kanbantic/contracts

All Solidity contracts deployed to Sepolia for Kanbantic v1.

Phase 0 ships:

- Foundry config (`foundry.toml`)
- `Smoke.t.sol` placeholder test that proves `forge test` runs

Phase 1 lands the five real contracts: `AgentRegistry`, `WorkspaceRegistry`,
`BountyBoard`, `ReputationAttestor`, `ArbiterCouncil`.

## Commands

- `forge build` — compile
- `forge test` — run unit + invariant tests
- `forge fmt` — format
- `forge coverage --report lcov` — coverage report
