// SPDX-License-Identifier: MIT

// THIS IS REPLACED ON EACH GENERATION AND USED TO HOLD THE CODE, THIS IS NOT HARD CODED IN THE APP
pragma solidity ^0.8.20;

contract GenContract {
    string public constant name = "lolo";
    string public constant symbol = "LOLO";
    uint8 public constant decimals = 18;
    uint256 public constant totalSupply = 1_000_000 * (10 ** uint256(decimals));

    mapping(address => uint256) private _balances;
    mapping(address => mapping(address => uint256)) private _allowances;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor() {
        _balances[msg.sender] = totalSupply;
        emit Transfer(address(0), msg.sender, totalSupply);
    }

    function balanceOf(address account) external view returns (uint256) {
        return _balances[account];
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        address owner = msg.sender;
        require(to != address(0), "Transfer to zero address");
        require(_balances[owner] >= amount, "Insufficient balance");
        unchecked {
            _balances[owner] -= amount;
            _balances[to] += amount;
        }
        emit Transfer(owner, to, amount);
        return true;
    }

    function allowance(address owner, address spender) external view returns (uint256) {
        return _allowances[owner][spender];
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        address owner = msg.sender;
        require(spender != address(0), "Approve to zero address");
        _allowances[owner][spender] = amount;
        emit Approval(owner, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        address spender = msg.sender;
        require(from != address(0) && to != address(0), "Zero address");
        require(_balances[from] >= amount, "Insufficient balance");
        uint256 currentAllowance = _allowances[from][spender];
        require(currentAllowance >= amount, "Allowance exceeded");
        unchecked {
            _balances[from] -= amount;
            _balances[to] += amount;
            _allowances[from][spender] = currentAllowance - amount;
        }
        emit Transfer(from, to, amount);
        return true;
    }

    receive() external payable {}
}