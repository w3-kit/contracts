// SPDX-License-Identifier: MIT
// Compatible with OpenZeppelin Contracts ^5.6.0
pragma solidity 0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {ERC20Pausable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

error ExceedsMaxSupply(uint256 amount, uint256 remainingMintable);
error ZeroMaxSupply();

contract TokenERC20 is ERC20, ERC20Burnable, ERC20Pausable, Ownable, ERC20Permit {

    uint256 public immutable maxSupply;

    constructor(address initialOwner, string memory name, string memory symbol, uint256 _maxSupply)
        ERC20(name, symbol)
        Ownable(initialOwner)
        ERC20Permit(name)
    {
        if (_maxSupply == 0) revert ZeroMaxSupply();
        maxSupply = _maxSupply;
    }

    event Mint(address indexed to, uint256 amount);

    function pause() public onlyOwner {
        _pause();
    }

    function unpause() public onlyOwner {
        _unpause();
    }


    function mint(address to, uint256 amount) public onlyOwner {
        uint256 remaining = maxSupply - totalSupply();
        if (amount > remaining) revert ExceedsMaxSupply(amount, remaining);
        _mint(to, amount);
        emit Mint(to, amount);
    }

    function _update(address from, address to, uint256 value)
        internal
        override(ERC20, ERC20Pausable)
    {
        super._update(from, to, value);
    }
}
