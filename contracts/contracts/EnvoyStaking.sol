//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/IERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

contract EnovyStaking is ERC20, Ownable {

    constructor(){}

    struct ShareHolder {
        uint staked;
        uint weight;
        uint lastUpdate; 
    }

    mapping(address => ShareHolder) shareholders;

    uint cooldown = 2 days;
    
    address signatureAddress;

    IERC20 stakingToken;



    constructor(address signatureAddress_, address stakingTokenAddress) ERC20('ENVOY staking token', 'ENV-S'){
        wallet = _msgSender();
        signatureAddress = signatureAddress_;
        stakingToken = IERC20(stakingTokenAddress);
    }


    function updateWallet(address wallet_) public onlyOwner {
        wallet = wallet_; 
    }

    function updateSignatureAddress(address signatureAddress_) public onlyOwner {
        signatureAddress = signatureAddress_; 
    }

    function updateWeight(uint weight_, bytes signature) public{
        address sender = _msgSender();
        require(signatureAddress == _recoverSigner(sender, weight_, signature),
            "Signature of the input was not signed by 'signatureAddress'");

        stakeholder.getNewRewards(sender);        
        stakeholders[sender].weight = weight_;

    }

    function stake(uint amount) public {
        address sender = _msgSender();

        require(stakingToken.allowance(sender, address(this) >= amount),
            "The staking contract is not approved to stake this amount");

        stakingToken.safeTransferFrom(sender, address(this), amount);

        stakeholder = stakeholders[sender];
        stakeholder.staked += amount;
        stakeholder.getNewRewards(sender);


    }

    function withdrawl(uint amount) public payable {
        
    }

    function getNewRewards(address stakeholder) internal view returns(uint){
        stakeholder.lastUpdate = now();
    }


    /**
     * Checks if the signature is created out of the contract address, sender and new weight,
     * signed by the private key of the signerAddress
     * @param sender the address of the message sender
     * @param amount amount of tokens to mint
     * @param signature a signature of the contract address, senderAddress and tokensId.
     *   Should be signed by the private key of signerAddress.
     */
    function _recoverSigner(address sender, uint256 weight, bytes memory signature) public view returns (address){
        return ECDSA.recover(ECDSA.toEthSignedMessageHash(keccak256(abi.encode(address(this), sender, weight))) , signature);
    }


}