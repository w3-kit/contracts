//SPDX-License-Identifier:MIT

pragma solidity 0.8.26;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

//Custom Errors
error AlreadyMerchant(address _merchant);
error ZeroAddress();
error UnregisteredMerchant();
error NotOwner();
error EmptyValue();
error ExistingPlan();
error InvalidMerchant();
error InvalidID();
error Paused();
error NotPaused();
error InsufficientBalance();
error PeriodIncomplete();
error NothingToWithdraw();
error AlreadyDeactivated();
error DeactivatedPlan();
error IdenticalAddress();
error NotAuthorized(address caller);
error InvalidAddress();
error AlreadyPending();
error AlreadyPaused();

/// @title SUBSCRIPTION
/// @notice A decentralized subscription management contract that handles recurring ERC20 payments between merchants and subscribers.
/// @dev Inherits ReentrancyGuard to protect against reentrancy attacks during token transfers.
///      Uses SafeERC20 to safely interact with ERC20 tokens that may not return a boolean.
contract SUBSCRIPTION is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // STATE DECLARATIONS

    /// @notice The address of the contract authority responsible for transferring ownership.
    address public immutable authority;

    /// @notice The address of the new proposed owner of the contract.
    address public pendingOwner;

    /// @notice The address of the contract owner responsible for registering merchants.
    address public owner;

    /// @notice The ERC20 token used as the payment currency for all subscriptions.
    IERC20 public immutable paymentToken;

    // MODIFIERS

    /// @notice Reverts if the provided address is the zero address.
    /// @param _address The address to validate.
    modifier checkAddress(address _address) {
        if (_address == address(0)) revert ZeroAddress();
        _;
    }

    /// @notice Reverts if the caller is not the contract owner.
    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    /// @notice Reverts if the given address does not have an active subscription for the given ID.
    /// @param _address The subscriber address to check.
    /// @param _subscriptionID The subscription plan ID to check against.
    modifier checkSubscriber(address _address, uint256 _subscriptionID) {
        if (Subscribers[_address][_subscriptionID].amountPaid == 0) revert InvalidID();
        _;
    }

    /// @notice Reverts if the subscriber's renewal is currently paused.
    /// @param _address The subscriber address to check.
    /// @param _subscriptionID The subscription plan ID to check against.
    modifier checkPaused(address _address, uint256 _subscriptionID) {
        if (Subscribers[_address][_subscriptionID].paused) revert Paused();
        _;
    }

    /// @notice Reverts if the caller is not the merchant who owns the given subscription plan.
    /// @param _subscriptionID The subscription plan ID to check.
    /// @param _address The address to validate as the plan's merchant.
    modifier checkMerchant(uint256 _subscriptionID, address _address) {
        if (Subscriptions[_subscriptionID].merchant != _address) revert InvalidMerchant();
        _;
    }

    /// @notice Reverts if the given subscription plan has been deactivated.
    /// @param _subscriptionID The subscription plan ID to check.
    modifier checkDeactivation(uint256 _subscriptionID) {
        if (Subscriptions[_subscriptionID].deactivated) revert DeactivatedPlan();
        _;
    }

    /// @notice Reverts if given Merchant address is not registered.
    /// @param _merchant The merchant address to check.
    modifier checkMerchantRegistration(address _merchant) {
        if (isMerchant[_merchant] == false) revert UnregisteredMerchant();
        _;
    }

    // STRUCTS

    /// @notice Stores the details of a subscriber's active subscription.
    /// @param merchant The address of the merchant who owns the plan.
    /// @param subscriptionName The name of the subscribed plan.
    /// @param lastBillingDate The timestamp of the most recent payment.
    /// @param nextBillingDate The timestamp when the next payment is due.
    /// @param amountPaid The price paid per billing cycle.
    /// @param paused Whether auto renewal is currently paused.
    struct subscriberDetails {
        address merchant;
        string subscriptionName;
        uint256 lastBillingDate;
        uint256 nextBillingDate;
        uint256 amountPaid;
        bool paused;
    }

    /// @notice Stores the details of a subscription plan created by a merchant.
    /// @param merchant The address of the merchant who created the plan.
    /// @param name The name of the subscription plan.
    /// @param duration The billing cycle length in days.
    /// @param price The cost per billing cycle in payment tokens.
    /// @param toWithdraw The accumulated amount available for the merchant to withdraw.
    /// @param deactivated Whether the plan has been deactivated and is no longer open for new subscriptions.
    struct subscriptionDetails {
        address merchant;
        string name;
        uint256 duration;
        uint256 price;
        uint256 toWithdraw;
        bool deactivated;
    }


    // MAPPINGS

    /// @notice Maps a subscriber address and plan ID to their subscription details.
    mapping(address => mapping(uint256 => subscriberDetails)) public Subscribers;

    /// @notice Maps a plan ID to its subscription details.
    mapping(uint256 => subscriptionDetails) public Subscriptions;

    /// @notice Tracks whether an address is a registered merchant.
    mapping(address => bool) public isMerchant;

    /// @notice Maps a merchant to its subscriptions tally.
    mapping(address => uint256[]) public merchantSubscriptions;

    //EVENTS

    /// @notice Emitted when a subscriber successfully purchases a subscription.
    /// @param _purchaser The address of the subscriber.
    /// @param _merchant The address of the merchant.
    /// @param _name The name of the subscription plan.
    event SubscriptionPurchased(address indexed _purchaser, address indexed _merchant, string _name);

    /// @notice Emitted when a subscriber cancels their subscription.
    /// @param _subscriber The address of the subscriber.
    /// @param _merchant The address of the merchant.
    /// @param _name The name of the subscription plan.
    event Cancelled(address indexed _subscriber, address indexed _merchant, string _name);

    /// @notice Emitted when a merchant defines a new subscription plan.
    /// @param _merchant The address of the merchant.
    /// @param _name The name of the plan.
    /// @param _duration The billing cycle duration in days.
    /// @param _price The price per billing cycle in payment tokens.
    event PlanDefined(address indexed _merchant, string _name, uint256 indexed _duration, uint256 indexed _price);

    /// @notice Emitted when a new merchant is registered by the owner.
    /// @param _merchant The address of the newly registered merchant.
    event MerchantRegistered(address indexed _merchant);

    /// @notice Emitted when a subscription is successfully auto renewed.
    /// @param _subscriber The address of the subscriber.
    /// @param _merchant The address of the merchant who triggered the renewal.
    /// @param _name The name of the subscription plan.
    event AutoRenewed(address indexed _subscriber, address indexed _merchant, string _name);

    /// @notice Emitted when a subscriber pauses their auto renewal.
    /// @param _subscriber The address of the subscriber.
    /// @param _merchant The address of the merchant.
    /// @param _name The name of the subscription plan.
    event PausedRenewal(address indexed _subscriber, address indexed _merchant, string _name);

    /// @notice Emitted when a subscriber resumes their auto renewal.
    /// @param _subscriber The address of the subscriber.
    /// @param _merchant The address of the merchant.
    /// @param _name The name of the subscription plan.
    event ResumedRenewal(address indexed _subscriber, address indexed _merchant, string _name);

    /// @notice Emitted when a merchant deactivates a subscription plan.
    /// @param _merchant The address of the merchant.
    /// @param _subscriptionID The ID of the deactivated plan.
    event PlanDeactivated(address indexed _merchant, uint256 indexed _subscriptionID);

    /// @notice Emitted when a withdrawal from a merchant is completed.
    /// @param _merchant The address of the merchant.
    /// @param _subscriptionID ID of the subscription from which the merchant has withdrawn.
    event Withdrawal (address indexed _merchant, uint256 indexed _subscriptionID);

    /// @notice Emitted whenever the transfer of ownership process has started.
    /// @param from The address of the current Owner.
    /// @param to The address of the proposed Owner.
    event OwnershipTransferStarted(address indexed from, address indexed to);

    /// @notice Emitted when the proposed Owner accepts Ownership
    /// @param from The address of the current Owner.
    /// @param to The address of the proposed Owner.
    event OwnershipTransferred(address indexed from, address indexed to);

    /// @notice Emitted when a Merchant's Registration is Revoked.
    /// @param _merchant The address of the Merchant to be revoked.
    event MerchantRevoked(address indexed _merchant);

    // UNIQUE IDENTIFICATION NUMBERING

    /// @dev Internal counter for assigning unique IDs to subscription plans. Starts at 1 to avoid conflict with zero-value checks.
    uint256 subscriptionIdCount = 1;

    //DEPLOYMENT

    /// @notice Deploys the subscription contract with a designated owner and payment token.
    /// @param _authority The address of the contract Authority who can trigger Transfer of Ownership.
    /// @param _owner The address of the contract owner who can register merchants.
    /// @param _token The address of the ERC20 token used for payments.
    constructor(address _authority, address _owner, address _token) 
    checkAddress(_authority)    
    checkAddress(_owner) 
    checkAddress(_token) {
        if (_authority == _owner) revert IdenticalAddress();
        authority = _authority;
        owner = _owner;
        paymentToken = IERC20(_token);
    }

    // OWNER FUNCTIONS

    /// @notice Initiates transfer of ownership, allowing new proposed owner to accept ownership.
    /// @dev Only callable by the contract owner and authority. Reverts if the address is zero.
    /// @param newOwner The new proposed owner.
    function transferOwnership(address newOwner) public 
    checkAddress(newOwner) {
        if (msg.sender != owner && msg.sender != authority) revert NotAuthorized(msg.sender);
        if (newOwner == owner || newOwner == authority) revert InvalidAddress();
        if (newOwner == pendingOwner) revert AlreadyPending();
        pendingOwner = newOwner;

        emit OwnershipTransferStarted (owner, newOwner);
    }

    /// @notice Completes transfer of ownership to the proposed owner.
    /// @dev Only callable by pendingOwner. Reverts if the address is not pendingOwner.
    function acceptOwnership() public {
        if (msg.sender != pendingOwner) revert NotAuthorized(msg.sender);
        delete pendingOwner;
        emit OwnershipTransferred(owner, msg.sender);
        
        owner = msg.sender;
    }

    /// @notice Registers a new merchant, allowing them to create subscription plans.
    /// @dev Only callable by the contract owner. Reverts if the address is zero or already registered.
    /// @param _merchant The address to register as a merchant.
    function registerMerchant(address _merchant) public 
    onlyOwner()
    checkAddress(_merchant) {
        if (isMerchant[_merchant]) revert AlreadyMerchant(_merchant);
        isMerchant[_merchant] = true;

        emit MerchantRegistered(_merchant);
    }

    /// @notice Revokes the registration of a merchant. Deactivating all the existing plans defined by the merchant.
    /// @dev Only callable by the contract Owner. Reverts if the address is zero or the merchant is not registered.
    /// @param _merchant The address of the merchant to be revoked.
    function revokeMerchant(address _merchant) public 
    onlyOwner() 
    checkAddress(_merchant)
    checkMerchantRegistration(_merchant) {
        uint256[] memory _subscriptions = merchantSubscriptions[_merchant];
        uint256 len = _subscriptions.length;
        for (uint256 i = 0; i < len; i++) {
            uint256 currentNumber = _subscriptions[i];
            Subscriptions[currentNumber].deactivated = true;

            emit PlanDeactivated(_merchant, currentNumber);
        }
        isMerchant[_merchant] = false;

        emit MerchantRevoked(_merchant);
    }

    // MERCHANT INTERACTIONS

    /// @notice Creates a new subscription plan with a name, duration, and price.
    /// @dev Only callable by registered merchants. Plan ID is auto-assigned and incremented.
    /// @param _name The name of the subscription plan.
    /// @param _duration The billing cycle length in days.
    /// @param _price The cost per billing cycle in payment tokens.
    function definePlan(string memory _name, uint256 _duration, uint256 _price) public 
    checkMerchantRegistration(msg.sender) {
        if (bytes (_name).length == 0) revert EmptyValue();
        if (_duration == 0) revert EmptyValue();
        if (_price == 0) revert EmptyValue();
        merchantSubscriptions[msg.sender].push(subscriptionIdCount);
        Subscriptions[subscriptionIdCount] = subscriptionDetails ({
            merchant: msg.sender,
            name: _name,
            duration: _duration,
            price: _price,
            toWithdraw: 0,
            deactivated: false
        });
        subscriptionIdCount++;

        emit PlanDefined(msg.sender, _name, _duration, _price);
    }

    /// @notice Triggers an auto renewal for a subscriber once their billing period has ended.
    /// @dev Only callable by the merchant who owns the plan. Reverts if the plan is deactivated,
    ///      the subscription is paused, or the billing period has not yet elapsed.
    /// @param _subscriber The address of the subscriber to renew.
    /// @param subscriptionID The ID of the subscription plan.
    function autoRenewal(address _subscriber, uint256 subscriptionID) public 
    nonReentrant()
    checkDeactivation(subscriptionID)
    checkMerchant(subscriptionID, msg.sender) 
    checkSubscriber(_subscriber, subscriptionID)
    checkPaused(_subscriber, subscriptionID) {
        if (block.timestamp < Subscribers[_subscriber][subscriptionID].nextBillingDate) revert PeriodIncomplete();

        completeSubscription(subscriptionID, _subscriber);
        emit AutoRenewed(_subscriber, msg.sender, Subscriptions[subscriptionID].name);
    }

    /// @notice Allows a merchant to withdraw accumulated subscription payments for a plan.
    /// @dev Resets the toWithdraw balance to zero before transferring to prevent double withdrawal.
    /// @param subscriptionID The ID of the subscription plan to withdraw earnings from.
    function merchantWithdrawal(uint256 subscriptionID) public 
    nonReentrant()
    checkMerchant(subscriptionID, msg.sender) {
        if (Subscriptions[subscriptionID].toWithdraw == 0) revert NothingToWithdraw();
        completeWithdrawal(subscriptionID, msg.sender);
    }

    /// @notice Deactivates a subscription plan, preventing new subscriptions and auto renewals.
    /// @dev Only callable by the merchant who owns the plan. Existing subscribers are unaffected.
    /// @param _subscriptionID The ID of the plan to deactivate.
    function deactivatePlan(uint256 _subscriptionID) public 
    checkMerchant(_subscriptionID, msg.sender) {
        if (Subscriptions[_subscriptionID].deactivated) revert AlreadyDeactivated();
        Subscriptions[_subscriptionID].deactivated = true;

        emit PlanDeactivated(msg.sender, _subscriptionID);
    }

    // CUSTOMER INTERACTIONS

    /// @notice Subscribes the caller to a plan and processes the first payment.
    /// @dev Requires the caller to have approved this contract to spend the plan's price in payment tokens.
    ///      Reverts if the plan is deactivated, does not exist, or the caller is already subscribed.
    /// @param subscriptionID The ID of the subscription plan to subscribe to.
    function subscribe(uint256 subscriptionID) public 
    nonReentrant()
    checkDeactivation(subscriptionID) {
        uint256 _price = Subscriptions[subscriptionID].price;
        if (_price == 0) revert InvalidID();
        if (Subscribers[msg.sender][subscriptionID].amountPaid > 0) revert ExistingPlan();
        if (paymentToken.balanceOf(msg.sender) < _price) revert InsufficientBalance();
        address _merchant = Subscriptions[subscriptionID].merchant;
        completeSubscription(subscriptionID, msg.sender);

        emit SubscriptionPurchased(msg.sender, _merchant, Subscriptions[subscriptionID].name);
    }

    /// @notice Pauses auto renewal for the caller's subscription.
    /// @dev The subscription remains active but the merchant cannot trigger auto renewals while paused.
    /// @param subscriptionID The ID of the subscription plan to pause.
    function pauseRenewal(uint256 subscriptionID) public 
    checkDeactivation(subscriptionID) 
    checkSubscriber(msg.sender, subscriptionID) {
        if (Subscribers[msg.sender][subscriptionID].paused) revert AlreadyPaused();
        Subscribers[msg.sender][subscriptionID].paused = true;

        emit PausedRenewal(msg.sender, Subscriptions[subscriptionID].merchant, Subscriptions[subscriptionID].name);
    }

    /// @notice Resumes auto renewal for the caller's paused subscription.
    /// @dev If the billing date has already passed at the time of resumption, an immediate payment is charged.
    ///      Reverts if the plan has been deactivated.
    /// @param subscriptionID The ID of the subscription plan to resume.
    function resumeRenewal(uint256 subscriptionID) public 
    nonReentrant()
    checkDeactivation(subscriptionID) 
    checkSubscriber(msg.sender, subscriptionID) {
        if (!Subscribers[msg.sender][subscriptionID].paused) revert NotPaused();
        Subscribers[msg.sender][subscriptionID].paused = false;

        address _merchant = Subscriptions[subscriptionID].merchant;
        string memory _name = Subscriptions[subscriptionID].name;
        if (Subscribers[msg.sender][subscriptionID].nextBillingDate < block.timestamp) {
            if (paymentToken.balanceOf(msg.sender) < Subscriptions[subscriptionID].price) revert InsufficientBalance();
            completeSubscription(subscriptionID, msg.sender);
            emit SubscriptionPurchased(msg.sender, _merchant, _name);
        }

        emit ResumedRenewal(msg.sender, _merchant, _name);
    }

    /// @notice Cancels the caller's subscription and resets all associated data.
    /// @dev Does not issue a refund for the current billing period. The subscriber can resubscribe after cancellation.
    /// @param subscriptionID The ID of the subscription plan to cancel.
    function cancelSubscription(uint256 subscriptionID) public  
    checkSubscriber(msg.sender, subscriptionID) {
        string memory _name = Subscriptions[subscriptionID].name;
        address _merchant = Subscriptions[subscriptionID].merchant;
        Subscribers[msg.sender][subscriptionID] = subscriberDetails({
            merchant: address(0),
            subscriptionName: "",
            lastBillingDate: 0,
            nextBillingDate: 0,
            amountPaid: 0,
            paused: false
        });

        emit Cancelled(msg.sender, _merchant, _name);
    }

    // INTERNAL FUNCTIONS

    /// @notice Processes a subscription payment and updates subscriber state.
    /// @dev Transfers payment tokens from the subscriber to the contract using safeTransferFrom.
    ///      Updates the last and next billing dates based on the plan duration.
    ///      Accumulates the payment in toWithdraw for the merchant to claim later.
    /// @param subscriptionID The ID of the subscription plan being processed.
    /// @param _subscriber The address of the subscriber being charged.
    function completeSubscription(uint256 subscriptionID, address _subscriber) internal {
        uint256 _amount = Subscriptions[subscriptionID].price;
        address _merchant = Subscriptions[subscriptionID].merchant;
        string memory _name = Subscriptions[subscriptionID].name;
        uint256 _duration = Subscriptions[subscriptionID].duration;
        Subscribers[_subscriber][subscriptionID] = subscriberDetails ({
            merchant: _merchant,
            subscriptionName: _name, 
            lastBillingDate: block.timestamp,
            nextBillingDate: block.timestamp + (_duration * 1 days),
            amountPaid: _amount,
            paused: false
        });

        Subscriptions[subscriptionID].toWithdraw += _amount;

        paymentToken.safeTransferFrom(_subscriber, address(this), _amount);
    }

    /// @notice complete withdrawal when called by the merchant.
    /// @dev Checks if the merchant requested withrawal is valid.
    ///      Transfers Payment Tokens pending in the subscriptions details.
    ///      Sets withdraw storage to 0 before transaction.
    /// @param subscriptionID ID of the subscription contaning the pending tokens.
    /// @param _merchant The address of the merchant who is requesting the withdrawal. 
    function completeWithdrawal(uint256 subscriptionID, address _merchant) internal {
        uint256 _toWithdraw = Subscriptions[subscriptionID].toWithdraw;
        Subscriptions[subscriptionID].toWithdraw = 0;
        paymentToken.safeTransfer(_merchant, _toWithdraw);

        emit Withdrawal(_merchant, subscriptionID);
    }
}
