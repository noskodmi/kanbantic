// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import { Test } from "forge-std/Test.sol";

/// @title SmokeTest
/// @notice Verifies Foundry runs end-to-end before real contracts land in Phase 1.
contract SmokeTest is Test {
    function test_TheToolchainWorks() public pure {
        assertEq(uint256(1) + uint256(1), uint256(2));
    }
}
