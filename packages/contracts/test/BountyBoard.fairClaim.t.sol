// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import { TestBase } from "./helpers/TestBase.sol";
import { BountyBoard } from "../src/BountyBoard.sol";
import { IBountyBoard } from "../src/interfaces/IBountyBoard.sol";
import { WorkspaceRegistry } from "../src/WorkspaceRegistry.sol";

contract BountyBoardFairClaimTest is TestBase {
    BountyBoard internal board;
    WorkspaceRegistry internal workspaces;

    bytes32 internal constant DESC = keccak256("desc");
    bytes32 internal constant AGENT = keccak256("agent");
    bytes32 internal constant CTRNG = keccak256("ctrng");
    string internal constant CAP = "research";

    uint32 internal constant WIN = 5; // 5-block claim window

    function setUp() public override {
        super.setUp();
        workspaces = new WorkspaceRegistry();
        board = new BountyBoard(workspaces, worker);
    }

    /* ───────────── commitClaim ───────────── */

    function test_CommitClaim_RecordsCommitment() public {
        uint256 id = _post(WIN);
        bytes32 commitment = keccak256(abi.encodePacked(alice, bytes32(uint256(123))));

        vm.prank(alice);
        board.commitClaim(id, commitment);

        // Status remains ClaimWindowOpen
        assertEq(uint256(board.statusOf(id)), uint256(IBountyBoard.Status.ClaimWindowOpen));
    }

    function test_CommitClaim_EmitsEvent() public {
        uint256 id = _post(WIN);
        bytes32 commitment = keccak256(abi.encodePacked(alice, bytes32(uint256(123))));

        vm.expectEmit(true, true, false, true);
        emit IBountyBoard.BountyClaimCommitted(id, alice, commitment);
        vm.prank(alice);
        board.commitClaim(id, commitment);
    }

    function test_CommitClaim_RevertsIfNotFairClaimMode() public {
        uint256 id = _post(0);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(BountyBoard.WrongClaimMode.selector, id));
        board.commitClaim(id, bytes32(uint256(1)));
    }

    function test_CommitClaim_RevertsAfterWindowClose() public {
        uint256 id = _post(WIN);
        vm.roll(block.number + WIN + 1);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(BountyBoard.ClaimWindowClosed.selector, id));
        board.commitClaim(id, bytes32(uint256(1)));
    }

    function test_CommitClaim_AllowsMultipleCommittersInSameWindow() public {
        uint256 id = _post(WIN);
        vm.prank(alice);
        board.commitClaim(id, keccak256(abi.encodePacked(alice, bytes32(uint256(1)))));
        vm.prank(bob);
        board.commitClaim(id, keccak256(abi.encodePacked(bob, bytes32(uint256(2)))));
        vm.prank(carol);
        board.commitClaim(id, keccak256(abi.encodePacked(carol, bytes32(uint256(3)))));
    }

    /* ───────────── finalizeFairClaim ───────────── */

    function test_Finalize_PicksWinnerAndAdvancesStatus() public {
        uint256 id = _post(WIN);
        vm.prank(alice);
        board.commitClaim(id, keccak256(abi.encodePacked(alice, bytes32(uint256(1)))));
        vm.prank(bob);
        board.commitClaim(id, keccak256(abi.encodePacked(bob, bytes32(uint256(2)))));

        vm.roll(block.number + WIN);

        vm.prank(worker);
        board.finalizeFairClaim(id, CTRNG, "0xsigblob");

        assertEq(uint256(board.statusOf(id)), uint256(IBountyBoard.Status.ClaimWindowClosed));
    }

    function test_Finalize_RevertsIfNotOracle() public {
        uint256 id = _post(WIN);
        vm.prank(alice);
        board.commitClaim(id, keccak256(abi.encodePacked(alice, bytes32(uint256(1)))));
        vm.roll(block.number + WIN);

        vm.prank(frank);
        vm.expectRevert(abi.encodeWithSelector(BountyBoard.NotOrbitportOracle.selector, frank));
        board.finalizeFairClaim(id, CTRNG, "0xsig");
    }

    function test_Finalize_RevertsBeforeWindowCloses() public {
        uint256 id = _post(WIN);
        vm.prank(alice);
        board.commitClaim(id, keccak256(abi.encodePacked(alice, bytes32(uint256(1)))));

        vm.prank(worker);
        vm.expectRevert(abi.encodeWithSelector(BountyBoard.ClaimWindowOpen.selector, id));
        board.finalizeFairClaim(id, CTRNG, "0xsig");
    }

    function test_Finalize_RevertsIfNoCommitters() public {
        uint256 id = _post(WIN);
        vm.roll(block.number + WIN);

        vm.prank(worker);
        vm.expectRevert(abi.encodeWithSelector(BountyBoard.NoCommitters.selector, id));
        board.finalizeFairClaim(id, CTRNG, "0xsig");
    }

    function test_Finalize_RevertsIfBadStatus() public {
        // Posting with claimWindow=0 means status starts as Open, not ClaimWindowOpen.
        // Calling finalizeFairClaim on it (as the oracle) should revert BadStatus.
        uint256 id = _post(0);
        vm.prank(worker);
        vm.expectRevert(abi.encodeWithSelector(BountyBoard.BadStatus.selector, id));
        board.finalizeFairClaim(id, CTRNG, "0xsig");
    }

    /* ───────────── revealClaim ───────────── */

    function test_Reveal_PickedAddressCanReveal() public {
        // Use a single committer so we know who's picked.
        uint256 id = _post(WIN);
        bytes32 nonce = bytes32(uint256(123));
        vm.prank(alice);
        board.commitClaim(id, keccak256(abi.encodePacked(alice, nonce)));
        vm.roll(block.number + WIN);
        vm.prank(worker);
        board.finalizeFairClaim(id, CTRNG, "0xsig");

        vm.prank(alice);
        board.revealClaim(id, nonce, AGENT);

        IBountyBoard.Bounty memory b = board.bountyOf(id);
        assertEq(uint256(b.status), uint256(IBountyBoard.Status.Claimed));
        assertEq(b.claimerNode, AGENT);
    }

    function test_Reveal_EmitsEvent() public {
        uint256 id = _post(WIN);
        bytes32 nonce = bytes32(uint256(123));
        vm.prank(alice);
        board.commitClaim(id, keccak256(abi.encodePacked(alice, nonce)));
        vm.roll(block.number + WIN);
        vm.prank(worker);
        board.finalizeFairClaim(id, CTRNG, "0xsig");

        vm.expectEmit(true, true, true, false);
        emit IBountyBoard.BountyClaimed(id, AGENT, alice);
        vm.prank(alice);
        board.revealClaim(id, nonce, AGENT);
    }

    function test_Reveal_RevertsIfNotPickedAddress() public {
        uint256 id = _post(WIN);
        vm.prank(alice);
        board.commitClaim(id, keccak256(abi.encodePacked(alice, bytes32(uint256(1)))));
        vm.roll(block.number + WIN);
        vm.prank(worker);
        board.finalizeFairClaim(id, CTRNG, "0xsig");

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(BountyBoard.NotPickedClaimant.selector, bob));
        board.revealClaim(id, bytes32(uint256(1)), AGENT);
    }

    function test_Reveal_RevertsOnCommitmentMismatch() public {
        uint256 id = _post(WIN);
        bytes32 nonce = bytes32(uint256(1));
        bytes32 wrongNonce = bytes32(uint256(2));
        vm.prank(alice);
        board.commitClaim(id, keccak256(abi.encodePacked(alice, nonce)));
        vm.roll(block.number + WIN);
        vm.prank(worker);
        board.finalizeFairClaim(id, CTRNG, "0xsig");

        vm.prank(alice);
        vm.expectRevert(BountyBoard.CommitmentMismatch.selector);
        board.revealClaim(id, wrongNonce, AGENT);
    }

    function test_Reveal_RevertsIfFinalizeNotCalled() public {
        uint256 id = _post(WIN);
        vm.prank(alice);
        board.commitClaim(id, keccak256(abi.encodePacked(alice, bytes32(uint256(1)))));

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(BountyBoard.BadStatus.selector, id));
        board.revealClaim(id, bytes32(uint256(1)), AGENT);
    }

    function test_Reveal_RevertsOnZeroAgentNode() public {
        uint256 id = _post(WIN);
        bytes32 nonce = bytes32(uint256(1));
        vm.prank(alice);
        board.commitClaim(id, keccak256(abi.encodePacked(alice, nonce)));
        vm.roll(block.number + WIN);
        vm.prank(worker);
        board.finalizeFairClaim(id, CTRNG, "0xsig");

        vm.prank(alice);
        vm.expectRevert(BountyBoard.ZeroAgentNode.selector);
        board.revealClaim(id, nonce, bytes32(0));
    }

    function _post(uint32 claimWindow) internal returns (uint256) {
        vm.prank(poster);
        return board.post{ value: 0.01 ether }(
            CAP,
            0.01 ether,
            DESC,
            uint64(block.timestamp + 1 days),
            claimWindow,
            bytes32(0),
            address(0)
        );
    }
}
