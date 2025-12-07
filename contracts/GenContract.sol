// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/*
    GenContract: An ERC20 token contract for "Duck" with hardcoded name, symbol, and supply.
    - Name: Duck
    - Symbol: DUCK
    - Total Supply: 1,000,000 DUCK (18 decimals)
    - All tokens are minted to the deployer.
    - Includes a receive() external payable {} function.
*/

interface IERC20 {
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
}

contract GenContract is IERC20 {
    string public constant name = "Duck";
    string public constant symbol = "DUCK";
    uint8 public constant decimals = 18;
    uint256 private constant _totalSupply = 1_000_000 * (10 ** uint256(decimals));

    mapping(address => uint256) private _balances;
    mapping(address => mapping(address => uint256)) private _allowances;

    constructor() {
        _balances[msg.sender] = _totalSupply;
        emit Transfer(address(0), msg.sender, _totalSupply);
    }

    function totalSupply() public pure override returns (uint256) {
        return _totalSupply;
    }

    function balanceOf(address account) public view override returns (uint256) {
        return _balances[account];
    }

    function transfer(address recipient, uint256 amount) public override returns (bool) {
        address sender = msg.sender;
        require(recipient != address(0), "DUCK: transfer to zero address");
        require(_balances[sender] >= amount, "DUCK: transfer amount exceeds balance");

        unchecked {
            _balances[sender] -= amount;
            _balances[recipient] += amount;
        }
        emit Transfer(sender, recipient, amount);
        return true;
    }

    function allowance(address owner, address spender) public view override returns (uint256) {
        return _allowances[owner][spender];
    }

    function approve(address spender, uint256 amount) public override returns (bool) {
        address owner = msg.sender;
        require(spender != address(0), "DUCK: approve to zero address");

        _allowances[owner][spender] = amount;
        emit Approval(owner, spender, amount);
        return true;
    }

    function transferFrom(address sender, address recipient, uint256 amount) public override returns (bool) {
        address spender = msg.sender;
        require(sender != address(0), "DUCK: transfer from zero address");
        require(recipient != address(0), "DUCK: transfer to zero address");
        require(_balances[sender] >= amount, "DUCK: transfer amount exceeds balance");
        require(_allowances[sender][spender] >= amount, "DUCK: transfer amount exceeds allowance");

        unchecked {
            _balances[sender] -= amount;
            _balances[recipient] += amount;
            _allowances[sender][spender] -= amount;
        }
        emit Transfer(sender, recipient, amount);
        return true;
    }

    receive() external payable {}
}