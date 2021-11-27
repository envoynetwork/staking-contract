//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

contract EnvoyStaking is Ownable {

    using SafeMath for uint;

    event Staking(address indexed stakeholder_, uint stake_);
    event Rewarding(address indexed stakeholder_, uint reward_);

    struct StakeHolder {
        uint stakingBalance;
        uint weight;
        uint interestDate; 
        uint newStake; 
        uint newWeight;
    }

    mapping(address => StakeHolder) public stakeholders;

    uint totalStake;
    uint maxWeight;

    uint public cooldown = 2 days;
    
    address wallet;
    address signatureAddress;

    IERC20 stakingToken;

    uint public interestDecimals = 1000000000000;
    uint public baseInterest = 3924000000;
    uint public extraInterest = 39240000000; //10% per year
    uint public compoundingPeriod = 15 days;

    constructor(address signatureAddress_, address stakingTokenAddress) {
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

    function updateWeight(uint weight_, bytes memory signature, bool instant) public{
        address sender = _msgSender();
        require(signatureAddress == _recoverSigner(sender, weight_, signature),
            "Signature of the input was not signed by 'signatureAddress'");

        StakeHolder storage stakeholder = stakeholders[sender];
        if(instant){
            claimRewards(false);
            stakeholder.interestDate = block.timestamp;
            stakeholder.weight = weight_;
        } else {
            stakeholder.newWeight = weight_;
        }
    }

    function stake(uint amount, bool instant) public {
        address sender = _msgSender();

        require(stakingToken.allowance(sender, address(this)) >= amount,
            "The staking contract is not approved to stake this amount");

        stakingToken.transferFrom(sender, address(this), amount);

        StakeHolder storage stakeholder = stakeholders[sender];

        if(instant){
            claimRewards(false);
            stakeholder.interestDate = block.timestamp;
            stakeholder.stakingBalance += amount;
        } else {
            claimRewards(false);
            stakeholder.newStake = amount;
        }

        totalStake += amount;

        emit Staking(sender, amount);

    }

    function withdrawlFunds(uint amount) public payable {
        address sender = _msgSender();
        StakeHolder storage stakeholder = stakeholders[sender];
        require(stakeholder.interestDate + cooldown < block.timestamp, "Funds are locked until cooldown period is over");
        
        claimRewards(false);
        
        require(stakeholder.stakingBalance >= 0, "Nothing was staked");
        
        if(amount > stakeholder.stakingBalance){
            amount = stakeholder.stakingBalance;
        }
        stakingToken.transfer(sender, stakeholder.stakingBalance);

        totalStake -= amount;
    }

    /**
     * Calculate the rewards owed to 
     */
    function claimRewards(bool withdrawl) public returns(uint reward) {

        address stakeholderAddress = _msgSender();
        StakeHolder storage stakeholder = stakeholders[stakeholderAddress];

        
        // Number of accounts for which rewards will be paid
        uint n = (block.timestamp-stakeholder.interestDate) / compoundingPeriod;

        if (stakeholder.stakingBalance == 0 || n == 0){
            return 0;
        }

        if (stakeholder.newWeight > 0 || stakeholder.newStake > 0){
            // If updates were scheduled for the next period:
            // - first calculate rewards on the first compounding period with the old values
            // - set the new values to use in the computation of the following compounding periods
            stakeholder.stakingBalance += stakeholder.stakingBalance * (baseInterest + extraInterest * stakeholder.weight);
            stakeholder.interestDate += compoundingPeriod;

            if(stakeholder.newWeight > 0){
                stakeholder.weight = stakeholder.newWeight;
                stakeholder.newWeight = 0;
            }

            if(stakeholder.newStake > 0){
                stakeholder.stakingBalance += stakeholder.newStake;
                stakeholder.newStake = 0;
            }

            stakeholder.interestDate += compoundingPeriod;
            
            // One period was already rewarded
            n-=1;

        }

        // Update the timestamp of the timestamp for the staking period that was not rewarded yet
        stakeholder.interestDate += (n * compoundingPeriod);

        uint s = stakeholder.stakingBalance;
        uint r = baseInterest + extraInterest * stakeholder.weight;

        while (n > 0) {
            s += s * r / interestDecimals;
            n -= 1;
        }

        reward = s - stakeholder.stakingBalance;

        // If the stakeholder wants to redraw the rewards;
        // Send to his wallet. Else, update stakingbalance.
        if (withdrawl){
            stakingToken.transfer(_msgSender(), reward);
        } else {
            stakeholder.stakingBalance = s;
            totalStake += reward;
        }

        emit Rewarding(stakeholderAddress, reward);

    }




    /**
     * Checks if the signature is created out of the contract address, sender and new weight,
     * signed by the private key of the signerAddress
     * @param sender the address of the message sender
     * @param weight amount of tokens to mint
     * @param signature a signature of the contract address, senderAddress and tokensId.
     *   Should be signed by the private key of signerAddress.
     */
    function _recoverSigner(address sender, uint weight, bytes memory signature) public view returns (address){
        return ECDSA.recover(ECDSA.toEthSignedMessageHash(keccak256(abi.encode(address(this), sender, weight))) , signature);
    }


}