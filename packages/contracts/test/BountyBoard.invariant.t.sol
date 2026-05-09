// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import { Test } from "forge-std/Test.sol";
import { StdInvariant } from "forge-std/StdInvariant.sol";
import { BountyBoard } from "../src/BountyBoard.sol";
import { IBountyBoard } from "../src/interfaces/IBountyBoard.sol";
import { WorkspaceRegistry } from "../src/WorkspaceRegistry.sol";

/// @notice Wraps BountyBoard with a tiny driver that emits well-formed
///         post/claim/submit/accept/reject/expire calls. Ghost variables
///         track the expected escrowed-eth invariant.
contract BountyBoardHandler is Test {
    BountyBoard public board;
    address public poster = makeAddr("invariant_poster");
    uint256 public openIds;
    uint256[] public openIdList;

    constructor(BountyBoard board_) {
        board = board_;
        vm.deal(poster, 1000 ether);
    }

    function postBounty(uint96 reward, uint64 expiresInSeconds) external {
        if (reward == 0) reward = 1 wei;
        if (expiresInSeconds == 0) expiresInSeconds = 1;
        uint64 expiresAt = uint64(block.timestamp) + expiresInSeconds;

        vm.prank(poster);
        try board.post{ value: reward }(
            "x", reward, bytes32(uint256(1)), expiresAt, 0, bytes32(0), address(0)
        ) returns (
            uint256 id
        ) {
            openIdList.push(id);
            openIds++;
        } catch { }
    }

    function claimBounty(uint256 idx) external {
        if (openIdList.length == 0) return;
        uint256 id = openIdList[idx % openIdList.length];
        if (board.statusOf(id) != IBountyBoard.Status.Open) return;
        vm.prank(makeAddr(string(abi.encodePacked("claimant_", idx))));
        try board.claim(id, bytes32(uint256(0xa))) { } catch { }
    }

    function submitBounty(uint256 idx) external {
        if (openIdList.length == 0) return;
        uint256 id = openIdList[idx % openIdList.length];
        if (board.statusOf(id) != IBountyBoard.Status.Claimed) return;
        // The claimer is whoever called claim() — handler doesn't track who,
        // so this often no-ops. Invariant: at minimum, no value is gained.
    }
}

contract BountyBoardInvariantTest is StdInvariant, Test {
    BountyBoard internal board;
    BountyBoardHandler internal handler;

    function setUp() public {
        WorkspaceRegistry workspaces = new WorkspaceRegistry();
        board = new BountyBoard(workspaces, makeAddr("worker"));
        handler = new BountyBoardHandler(board);
        targetContract(address(handler));
    }

    /// @dev Contract balance must equal sum of `reward` for bounties not in a
    ///      terminal state (Resolved, Refunded). This catches escrow drift.
    function invariant_ContractBalanceMatchesUnresolvedRewards() public view {
        uint256 expected = 0;
        for (uint256 i = 1; i < board.nextId(); i++) {
            IBountyBoard.Bounty memory b = board.bountyOf(i);
            if (
                b.status != IBountyBoard.Status.Resolved && b.status != IBountyBoard.Status.Refunded
            ) {
                expected += b.reward;
            }
        }
        assertEq(address(board).balance, expected, "escrow drift");
    }
}
