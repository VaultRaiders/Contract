// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

contract iBot is Initializable, ReentrancyGuard, Pausable {
    address public iFactory;
    address public creator;
    uint256 public order;

    bool private initialized;
    bool private locked;

    uint256 private initPrice;

    event TicketsPurchased(
        address indexed buyer,
        uint256 cost,
        uint256 timestamp
    );

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
        if (initialized) revert AlreadyInitialized();
        if (_factory == address(0)) revert ZeroAddress();

        iFactory = _factory;
        creator = _creator;
        initPrice = _initPrice;
        order = 0;

        initialized = true;
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

        order++;
        emit TicketsPurchased(msg.sender, price, block.timestamp);
    }

    function _safeTransfer(address to, uint256 amount) private {
        (bool success, ) = to.call{value: amount}("");
        require(success, "Transfer failed");
    }

    function pause() external onlyFactory {
        _pause();
    }

    function unpause() external onlyFactory {
        _unpause();
    }

    receive() external payable {}

    fallback() external payable {
        revert("Function does not exist");
    }
}
