// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import { ReentrancyGuard } from "@openzeppelin/utils/ReentrancyGuard.sol";
import { IBountyBoard } from "./interfaces/IBountyBoard.sol";
import { IWorkspaceRegistry } from "./interfaces/IWorkspaceRegistry.sol";

/// @title BountyBoard
/// @notice ETH-escrowed bounty marketplace. Posters fund a job; claimers
///         (agents) execute and submit a proof; settlement is either
///         direct (poster accepts) or routed through an arbiter council.
///         Two claim modes: instant (claimWindowBlocks==0) and fair-claim
///         (commit-reveal + Orbitport cTRNG draw, see finalizeFairClaim).
/// @dev Phase 1 simplification on fair-claim: the contract verifies the
///      Orbitport signature off-chain (Worker is a permissioned oracle).
///      `orbitportOracle` is the only address allowed to call
///      `finalizeFairClaim`. Phase 2+ may swap in on-chain Ed25519
///      verification once the cTRNG protocol is hardened. The
///      `orbitportSig` parameter is accepted for spec compatibility but
///      is not validated on chain in v1.
contract BountyBoard is IBountyBoard, ReentrancyGuard {
    IWorkspaceRegistry public immutable workspaceRegistry;
    address public immutable orbitportOracle;

    mapping(uint256 => Bounty) private _bounties;
    /// @dev bountyId → committer → commitment hash
    mapping(uint256 => mapping(address => bytes32)) private _commitments;
    /// @dev bountyId → array of all committer addresses (for finalize indexing)
    mapping(uint256 => address[]) private _committers;
    /// @dev bountyId → final picked address from finalizeFairClaim
    mapping(uint256 => address) private _picked;
    /// @dev bountyId → EOA that called `claim` (for instant) or revealed (for fair-claim)
    mapping(uint256 => address) private _lastClaimer;

    uint256 private _nextId = 1;

    error ZeroReward();
    error RewardValueMismatch(uint256 reward, uint256 sent);
    error ExpiryInPast();
    error NotWorkspaceMember(bytes32 workspaceNode, address caller);
    error BadStatus(uint256 bountyId);
    error WrongClaimMode(uint256 bountyId);
    error ZeroAgentNode();
    error NotClaimer(address caller);
    error NotPoster(address caller);
    error NotYetExpired(uint256 bountyId);
    error NotOrbitportOracle(address caller);
    error ClaimWindowOpen(uint256 bountyId);
    error ClaimWindowClosed(uint256 bountyId);
    error NoCommitters(uint256 bountyId);
    error NotPickedClaimant(address caller);
    error CommitmentMismatch();
    error NoArbiterCouncil(uint256 bountyId);
    error NotArbiterCouncil(address caller);
    error ZeroAddress();

    constructor(IWorkspaceRegistry workspaceRegistry_, address orbitportOracle_) {
        if (address(workspaceRegistry_) == address(0)) revert ZeroAddress();
        if (orbitportOracle_ == address(0)) revert ZeroAddress();
        workspaceRegistry = workspaceRegistry_;
        orbitportOracle = orbitportOracle_;
    }

    /// @inheritdoc IBountyBoard
    function post(
        string calldata capabilityFilter,
        uint256 reward,
        bytes32 descriptionRef,
        uint64 expiresAt,
        uint32 claimWindowBlocks,
        bytes32 workspaceNode,
        address arbiterCouncil
    ) external payable returns (uint256 bountyId) {
        if (reward == 0) revert ZeroReward();
        if (msg.value != reward) revert RewardValueMismatch(reward, msg.value);
        if (expiresAt <= block.timestamp) revert ExpiryInPast();

        if (workspaceNode != bytes32(0)) {
            if (!workspaceRegistry.isMember(workspaceNode, msg.sender)) {
                revert NotWorkspaceMember(workspaceNode, msg.sender);
            }
        }

        bountyId = _nextId++;
        Status initial = claimWindowBlocks == 0 ? Status.Open : Status.ClaimWindowOpen;

        _bounties[bountyId] = Bounty({
            poster: msg.sender,
            capabilityFilter: capabilityFilter,
            reward: reward,
            descriptionRef: descriptionRef,
            expiresAt: expiresAt,
            claimWindowBlocks: claimWindowBlocks,
            claimWindowStartBlock: claimWindowBlocks == 0 ? 0 : uint32(block.number),
            status: initial,
            claimerNode: bytes32(0),
            submissionRef: bytes32(0),
            workspaceNode: workspaceNode,
            arbiterCouncil: arbiterCouncil
        });

        emit BountyPosted(
            bountyId,
            msg.sender,
            workspaceNode,
            capabilityFilter,
            reward,
            descriptionRef,
            expiresAt,
            claimWindowBlocks,
            arbiterCouncil
        );
    }

    /// @inheritdoc IBountyBoard
    function claim(uint256 bountyId, bytes32 agentNode) external {
        Bounty storage b = _bounties[bountyId];
        if (b.claimWindowBlocks != 0) revert WrongClaimMode(bountyId);
        if (b.status != Status.Open) revert BadStatus(bountyId);
        if (agentNode == bytes32(0)) revert ZeroAgentNode();

        b.status = Status.Claimed;
        b.claimerNode = agentNode;
        _lastClaimer[bountyId] = msg.sender;
        emit BountyClaimed(bountyId, agentNode, msg.sender);
    }

    /// @inheritdoc IBountyBoard
    function commitClaim(uint256 bountyId, bytes32 commitment) external {
        Bounty storage b = _bounties[bountyId];
        if (b.claimWindowBlocks == 0) revert WrongClaimMode(bountyId);
        if (b.status != Status.ClaimWindowOpen) revert BadStatus(bountyId);
        if (block.number >= b.claimWindowStartBlock + b.claimWindowBlocks) {
            revert ClaimWindowClosed(bountyId);
        }

        if (_commitments[bountyId][msg.sender] == bytes32(0)) {
            _committers[bountyId].push(msg.sender);
        }
        _commitments[bountyId][msg.sender] = commitment;
        emit BountyClaimCommitted(bountyId, msg.sender, commitment);
    }

    /// @inheritdoc IBountyBoard
    function finalizeFairClaim(
        uint256 bountyId,
        bytes32 ctrngDraw,
        bytes calldata /*orbitportSig*/
    )
        external
    {
        if (msg.sender != orbitportOracle) revert NotOrbitportOracle(msg.sender);

        Bounty storage b = _bounties[bountyId];
        if (b.status != Status.ClaimWindowOpen) revert BadStatus(bountyId);
        if (block.number < b.claimWindowStartBlock + b.claimWindowBlocks) {
            revert ClaimWindowOpen(bountyId);
        }

        address[] storage committers = _committers[bountyId];
        if (committers.length == 0) revert NoCommitters(bountyId);

        uint256 closeBlock = uint256(b.claimWindowStartBlock + b.claimWindowBlocks - 1);
        uint256 entropy = uint256(
            keccak256(abi.encodePacked(ctrngDraw, blockhash(closeBlock), block.prevrandao))
        );
        address pickedAddress = committers[entropy % committers.length];

        _picked[bountyId] = pickedAddress;
        b.status = Status.ClaimWindowClosed;
        emit BountyClaimFinalized(bountyId, pickedAddress, ctrngDraw);
    }

    /// @inheritdoc IBountyBoard
    function revealClaim(uint256 bountyId, bytes32 nonce, bytes32 agentNode) external {
        Bounty storage b = _bounties[bountyId];
        if (b.status != Status.ClaimWindowClosed) revert BadStatus(bountyId);
        if (msg.sender != _picked[bountyId]) revert NotPickedClaimant(msg.sender);
        if (agentNode == bytes32(0)) revert ZeroAgentNode();
        if (_commitments[bountyId][msg.sender] != keccak256(abi.encodePacked(msg.sender, nonce))) {
            revert CommitmentMismatch();
        }

        b.status = Status.Claimed;
        b.claimerNode = agentNode;
        _lastClaimer[bountyId] = msg.sender;
        emit BountyClaimed(bountyId, agentNode, msg.sender);
    }

    /// @inheritdoc IBountyBoard
    function submit(
        uint256 bountyId,
        bytes32 proofRef,
        bytes calldata /*ownerSignature*/
    )
        external
    {
        Bounty storage b = _bounties[bountyId];
        if (b.status != Status.Claimed) revert BadStatus(bountyId);
        if (msg.sender != _lastClaimer[bountyId]) revert NotClaimer(msg.sender);

        b.status = Status.Submitted;
        b.submissionRef = proofRef;
        emit BountySubmitted(bountyId, proofRef);
    }

    /// @inheritdoc IBountyBoard
    function accept(uint256 bountyId) external nonReentrant {
        Bounty storage b = _bounties[bountyId];
        if (msg.sender != b.poster) revert NotPoster(msg.sender);
        if (b.status != Status.Submitted) revert BadStatus(bountyId);

        b.status = Status.Resolved;
        address payee = _lastClaimer[bountyId];
        uint256 amount = b.reward;
        emit BountyAccepted(bountyId, payee, amount);
        (bool ok,) = payee.call{ value: amount }("");
        require(ok, "transfer failed");
    }

    /// @inheritdoc IBountyBoard
    function reject(uint256 bountyId, bytes32 reasonRef) external nonReentrant {
        Bounty storage b = _bounties[bountyId];
        if (msg.sender != b.poster) revert NotPoster(msg.sender);
        if (b.status != Status.Submitted) revert BadStatus(bountyId);

        if (b.arbiterCouncil != address(0)) {
            b.status = Status.Disputed;
            emit BountyRejected(bountyId, reasonRef);
        } else {
            // No arbiter path — refund the poster directly.
            b.status = Status.Refunded;
            uint256 amount = b.reward;
            emit BountyRejected(bountyId, reasonRef);
            emit BountySettled(bountyId, true);
            (bool ok,) = b.poster.call{ value: amount }("");
            require(ok, "refund failed");
        }
    }

    /// @inheritdoc IBountyBoard
    function settleDispute(uint256 bountyId, bool refund) external nonReentrant {
        Bounty storage b = _bounties[bountyId];
        if (b.arbiterCouncil == address(0)) revert NoArbiterCouncil(bountyId);
        if (msg.sender != b.arbiterCouncil) revert NotArbiterCouncil(msg.sender);
        if (b.status != Status.Disputed) revert BadStatus(bountyId);

        if (refund) {
            b.status = Status.Refunded;
            uint256 amount = b.reward;
            emit BountySettled(bountyId, true);
            (bool ok,) = b.poster.call{ value: amount }("");
            require(ok, "refund failed");
        } else {
            b.status = Status.Resolved;
            address payee = _lastClaimer[bountyId];
            uint256 amount = b.reward;
            emit BountySettled(bountyId, false);
            (bool ok,) = payee.call{ value: amount }("");
            require(ok, "payout failed");
        }
    }

    /// @inheritdoc IBountyBoard
    function expire(uint256 bountyId) external nonReentrant {
        Bounty storage b = _bounties[bountyId];
        if (b.status != Status.Open && b.status != Status.ClaimWindowOpen) {
            revert BadStatus(bountyId);
        }
        if (block.timestamp < b.expiresAt) revert NotYetExpired(bountyId);

        b.status = Status.Refunded;
        uint256 amount = b.reward;
        emit BountyExpired(bountyId);
        (bool ok,) = b.poster.call{ value: amount }("");
        require(ok, "refund failed");
    }

    /// @inheritdoc IBountyBoard
    function bountyOf(uint256 bountyId) external view returns (Bounty memory) {
        return _bounties[bountyId];
    }

    /// @inheritdoc IBountyBoard
    function statusOf(uint256 bountyId) external view returns (Status) {
        return _bounties[bountyId].status;
    }

    /// @inheritdoc IBountyBoard
    function posterOf(uint256 bountyId) external view returns (address) {
        return _bounties[bountyId].poster;
    }

    /// @inheritdoc IBountyBoard
    function nextId() external view returns (uint256) {
        return _nextId;
    }
}
