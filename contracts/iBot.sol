// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

contract iBot is Initializable, ReentrancyGuard, Pausable {
    address public iFactory;
    address public creator;
    uint256 public order;

    bool private locked;

    uint256 snapshotBalance;
    address private latestBuyer;
    uint256 private lastPurchaseTimestamp;
    mapping(address => uint256) public purchases;

    uint256 private initPrice;

    event TicketPurchased(
        address indexed buyer,
        uint256 cost,
        uint256 timestamp
    );

    event Disbursement(address indexed to, uint256 amount);

    error ZeroAddress();
    error AlreadyInitialized();

    modifier onlyFactory() {
        require(msg.sender == iFactory, "Only factory can call");
        _;
    }

    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _factory,
        address _creator,
        uint256 _initPrice
    ) public payable initializer {
        if (_factory == address(0)) revert ZeroAddress();

        iFactory = _factory;
        creator = _creator;
        initPrice = _initPrice;
        order = 0;
    }

    function getPrice() public view returns (uint256) {
        if (order == 0) return initPrice;
        return (initPrice * (order + 2)) / (order + 1);
    }

    function buyTicket() public payable whenNotPaused {
        uint256 price = getPrice();
        require(price <= msg.value, "Invalid payment");

        uint256 protocolFee = (price / 100) * 15;
        uint256 creatorFee = (price / 100) * 15;
        uint256 poolFee = price - protocolFee - creatorFee;

        _safeTransfer(iFactory, protocolFee);
        _safeTransfer(creator, creatorFee);
        _safeTransfer(address(this), poolFee);

        uint256 excess = msg.value - price;
        if (excess > 0) {
            _safeTransfer(msg.sender, excess);
        }

        initPrice = price;
        order++;
        purchases[msg.sender] += poolFee;
        latestBuyer = msg.sender;
        lastPurchaseTimestamp = block.timestamp;

        emit TicketPurchased(msg.sender, price, block.timestamp);
    }

    function overdueRefund() public nonReentrant {
        require(
            block.timestamp > lastPurchaseTimestamp + 12 hours,
            "Too soon to disburse"
        );

        uint256 purchase = purchases[latestBuyer];
        require(purchase > 0, "No purchase to disburse");

        uint256 refund = (purchase * 75) / 100;
        if (msg.sender == latestBuyer) {
            if (snapshotBalance == 0) {
                snapshotBalance = address(this).balance;
            }
            refund += (snapshotBalance * 15) / 100;
        }

        _safeTransfer(msg.sender, refund);
        purchases[latestBuyer] = 0;

        if (!paused()) {
            _pause();
        }

        emit Disbursement(msg.sender, refund);
    }

    function disburse(address to) external onlyFactory {
        uint256 balance = address(this).balance;
        _safeTransfer(to, balance);
        _pause();

        emit Disbursement(to, balance);
    }

    function _safeTransfer(address to, uint256 amount) private {
        (bool success, ) = to.call{value: amount}("");
        require(success, "Transfer failed");
    }

    receive() external payable {}
}
