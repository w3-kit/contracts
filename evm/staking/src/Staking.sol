// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

error ZeroAmount();
error ZeroAddress();
error ZeroDuration();
error RewardPeriodNotFinished();
error InsufficientRewardBalance();
error NothingStaked();
error InsufficientStake();

/// @title Staking
/// @notice Stake ERC-20 tokens to earn ERC-20 reward tokens over time.
/// @dev Based on the Synthetix StakingRewards pattern — rewards accrue per
///      token per second, tracked via a running accumulator (`rewardPerTokenStored`).
contract Staking is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable stakingToken;
    IERC20 public immutable rewardToken;

    // Reward state
    uint256 public rewardRate;
    uint256 public periodFinish;
    uint256 public lastUpdateTime;
    uint256 public rewardPerTokenStored;

    // Global staking state
    uint256 public totalStaked;

    // Per-user state
    mapping(address => uint256) public balanceOf;
    mapping(address => uint256) public userRewardPerTokenPaid;
    mapping(address => uint256) public rewards;

    event Staked(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event RewardClaimed(address indexed user, uint256 reward);
    event RewardConfigured(uint256 rewardAmount, uint256 duration);

    constructor(
        address _owner,
        address _stakingToken,
        address _rewardToken
    ) Ownable(_owner) {
        if (_stakingToken == address(0)) revert ZeroAddress();
        if (_rewardToken == address(0)) revert ZeroAddress();
        stakingToken = IERC20(_stakingToken);
        rewardToken = IERC20(_rewardToken);
    }

    // ---------------------------------------------------------------
    //  Views
    // ---------------------------------------------------------------

    /// @notice Timestamp up to which rewards should be calculated.
    function lastTimeRewardApplicable() public view returns (uint256) {
        return block.timestamp < periodFinish ? block.timestamp : periodFinish;
    }

    /// @notice Accumulated reward per staked token (scaled by 1e18).
    function rewardPerToken() public view returns (uint256) {
        if (totalStaked == 0) return rewardPerTokenStored;
        return rewardPerTokenStored
            + ((lastTimeRewardApplicable() - lastUpdateTime) * rewardRate * 1e18) / totalStaked;
    }

    /// @notice Pending reward for `account`.
    function earned(address account) public view returns (uint256) {
        return (balanceOf[account] * (rewardPerToken() - userRewardPerTokenPaid[account])) / 1e18
            + rewards[account];
    }

    // ---------------------------------------------------------------
    //  User actions
    // ---------------------------------------------------------------

    /// @notice Stake `amount` of the staking token.
    function stake(uint256 amount) external nonReentrant updateReward(msg.sender) {
        if (amount == 0) revert ZeroAmount();
        totalStaked += amount;
        balanceOf[msg.sender] += amount;
        stakingToken.safeTransferFrom(msg.sender, address(this), amount);
        emit Staked(msg.sender, amount);
    }

    /// @notice Withdraw `amount` of the staking token.
    function withdraw(uint256 amount) external nonReentrant updateReward(msg.sender) {
        if (amount == 0) revert ZeroAmount();
        if (amount > balanceOf[msg.sender]) revert InsufficientStake();
        totalStaked -= amount;
        balanceOf[msg.sender] -= amount;
        stakingToken.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    /// @notice Claim all pending rewards.
    function claimReward() external nonReentrant updateReward(msg.sender) {
        uint256 reward = rewards[msg.sender];
        if (reward > 0) {
            rewards[msg.sender] = 0;
            rewardToken.safeTransfer(msg.sender, reward);
            emit RewardClaimed(msg.sender, reward);
        }
    }

    /// @notice Withdraw full stake and claim all pending rewards.
    function exit() external nonReentrant updateReward(msg.sender) {
        uint256 staked = balanceOf[msg.sender];
        if (staked == 0) revert NothingStaked();

        totalStaked -= staked;
        balanceOf[msg.sender] = 0;
        stakingToken.safeTransfer(msg.sender, staked);
        emit Withdrawn(msg.sender, staked);

        uint256 reward = rewards[msg.sender];
        if (reward > 0) {
            rewards[msg.sender] = 0;
            rewardToken.safeTransfer(msg.sender, reward);
            emit RewardClaimed(msg.sender, reward);
        }
    }

    // ---------------------------------------------------------------
    //  Owner actions
    // ---------------------------------------------------------------

    /// @notice Configure a new reward period. The contract must already hold
    ///         enough reward tokens to cover the full `rewardAmount`.
    /// @param rewardAmount Total reward tokens to distribute over `duration`.
    /// @param duration     Length of the reward period in seconds.
    function configureReward(uint256 rewardAmount, uint256 duration) external onlyOwner updateReward(address(0)) {
        if (duration == 0) revert ZeroDuration();
        if (block.timestamp < periodFinish) revert RewardPeriodNotFinished();

        uint256 balance = rewardToken.balanceOf(address(this));
        if (balance < rewardAmount) revert InsufficientRewardBalance();

        rewardRate = rewardAmount / duration;
        lastUpdateTime = block.timestamp;
        periodFinish = block.timestamp + duration;

        emit RewardConfigured(rewardAmount, duration);
    }

    // ---------------------------------------------------------------
    //  Internal
    // ---------------------------------------------------------------

    modifier updateReward(address account) {
        rewardPerTokenStored = rewardPerToken();
        lastUpdateTime = lastTimeRewardApplicable();
        if (account != address(0)) {
            rewards[account] = (balanceOf[account] * (rewardPerTokenStored - userRewardPerTokenPaid[account])) / 1e18
                + rewards[account];
            userRewardPerTokenPaid[account] = rewardPerTokenStored;
        }
        _;
    }
}
