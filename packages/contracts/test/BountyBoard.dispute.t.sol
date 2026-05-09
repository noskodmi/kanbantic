// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import { TestBase } from "./helpers/TestBase.sol";
import { BountyBoard } from "../src/BountyBoard.sol";
import { ArbiterCouncil } from "../src/ArbiterCouncil.sol";
import { IBountyBoard } from "../src/interfaces/IBountyBoard.sol";
import { IArbiterCouncil } from "../src/interfaces/IArbiterCouncil.sol";
import { WorkspaceRegistry } from "../src/WorkspaceRegistry.sol";

contract BountyBoardDisputeTest is TestBase {
    BountyBoard internal board;
    ArbiterCouncil internal council;
    WorkspaceRegistry internal workspaces;

    bytes32 internal constant DESC = keccak256("desc");
    bytes32 internal constant PROOF = keccak256("proof");
    bytes32 internal constant REASON = keccak256("reason");
    bytes32 internal constant AGENT = keccak256("agent");

    function setUp() public override {
        super.setUp();
        workspaces = new WorkspaceRegistry();
        board = new BountyBoard(workspaces, worker);

        address[] memory arb = new address[](5);
        arb[0] = alice;
        arb[1] = bob;
        arb[2] = carol;
        arb[3] = dave;
        arb[4] = eve;
        council = new ArbiterCouncil(arb, 3, board);
    }

    function test_DisputeFlow_AcceptResolution_PaysClaimer() public {
        // Setup
        vm.prank(poster);
        uint256 id = board.post{ value: 0.01 ether }(
            "research",
            0.01 ether,
            DESC,
            uint64(block.timestamp + 1 days),
            0,
            bytes32(0),
            address(council)
        );
        vm.prank(frank);
        board.claim(id, AGENT);
        vm.prank(frank);
        board.submit(id, PROOF, "0xsig");

        // Reject moves to Disputed (because arbiterCouncil != 0)
        vm.prank(poster);
        board.reject(id, REASON);
        assertEq(uint256(board.statusOf(id)), uint256(IBountyBoard.Status.Disputed));

        // 3-of-5 vote accept
        vm.prank(alice);
        council.vote(id, false, REASON);
        vm.prank(bob);
        council.vote(id, false, REASON);
        vm.prank(carol);
        council.vote(id, false, REASON);

        uint256 before = frank.balance;
        council.execute(id);

        assertEq(frank.balance, before + 0.01 ether);
        assertEq(uint256(board.statusOf(id)), uint256(IBountyBoard.Status.Resolved));
    }

    function test_DisputeFlow_RefundResolution_RefundsPoster() public {
        // Setup
        vm.prank(poster);
        uint256 id = board.post{ value: 0.01 ether }(
            "research",
            0.01 ether,
            DESC,
            uint64(block.timestamp + 1 days),
            0,
            bytes32(0),
            address(council)
        );
        vm.prank(frank);
        board.claim(id, AGENT);
        vm.prank(frank);
        board.submit(id, PROOF, "0xsig");

        vm.prank(poster);
        board.reject(id, REASON);

        // 3-of-5 vote refund
        vm.prank(alice);
        council.vote(id, true, REASON);
        vm.prank(bob);
        council.vote(id, true, REASON);
        vm.prank(carol);
        council.vote(id, true, REASON);

        uint256 before = poster.balance;
        council.execute(id);

        assertEq(poster.balance, before + 0.01 ether);
        assertEq(uint256(board.statusOf(id)), uint256(IBountyBoard.Status.Refunded));
    }

    function test_SettleDispute_RevertsForNonArbiterCouncilCaller() public {
        vm.prank(poster);
        uint256 id = board.post{ value: 0.01 ether }(
            "research",
            0.01 ether,
            DESC,
            uint64(block.timestamp + 1 days),
            0,
            bytes32(0),
            address(council)
        );
        vm.prank(frank);
        board.claim(id, AGENT);
        vm.prank(frank);
        board.submit(id, PROOF, "0xsig");
        vm.prank(poster);
        board.reject(id, REASON);

        vm.prank(frank);
        vm.expectRevert(abi.encodeWithSelector(BountyBoard.NotArbiterCouncil.selector, frank));
        board.settleDispute(id, false);
    }

    function test_SettleDispute_RevertsIfNoArbiterSetOnBounty() public {
        vm.prank(poster);
        uint256 id = board.post{ value: 0.01 ether }(
            "research",
            0.01 ether,
            DESC,
            uint64(block.timestamp + 1 days),
            0,
            bytes32(0),
            address(0)
        );
        // Note: with arbiter=address(0), reject path refunds immediately —
        // we can't reach Disputed state. So test the NoArbiterCouncil revert
        // by direct call before any state transitions.

        vm.prank(frank);
        vm.expectRevert(abi.encodeWithSelector(BountyBoard.NoArbiterCouncil.selector, id));
        board.settleDispute(id, false);
    }
}
