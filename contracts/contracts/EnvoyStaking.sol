//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * @title A staking contract for Envoy tokens
 * @author Kasper De Blieck (kasperdeblieck@envoy.art)
 * This contract allows Envoy token owners to stake their funds.
 * Staking funds will reward a periodic compounded interest.
 */
contract EnvoyStaking is Ownable {
    
    using SafeMath for uint;

    event ConfigUpdate(string field, uint value);
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
    
    address public signatureAddress;

    IERC20 public stakingToken;

    // Decimals used for interest calculation
    uint public interestDecimals = 1000000000000;
    uint public baseInterest = 4000000000;
    uint public extraInterest = 400000000; //10% per year
    uint public interestPeriod = 15 days;
    uint public cooldown = 2 days;

    uint totalStake;
    uint maxWeight;

    constructor(address signatureAddress_, address stakingTokenAddress) {
        signatureAddress = signatureAddress_;
        stakingToken = IERC20(stakingTokenAddress);
    }

    /**
     * Increase the stake of the sender by a value.
     * @param weight_ The new weight.
     * @param signature A signature proving the sender
     *  is allowed to update his weight.
     * @param instant if false, finish current period with
     *  old values and start new period with new value.
     *  If true, end current period without rewards and
     *  start a new period with the new values.
     */
    function updateWeight(uint weight_, bytes memory signature, bool instant) public{
        address sender = _msgSender();
        require(signatureAddress == _recoverSigner(sender, weight_, signature),
            "Signature of the input was not signed by 'signatureAddress'");

        StakeHolder storage stakeholder = stakeholders[sender];

        // Claim previous rewards with old weight
        claimRewards(false);

        if(instant){
            stakeholder.interestDate = block.timestamp;
            stakeholder.weight = weight_;
        } else {
            stakeholder.newWeight = weight_;
        }

        // Keep track of highest weight
        if(weight_ > maxWeight){
            maxWeight = weight_;
        }
    }

    /**
     * Increase the stake of the sender by a value.
     * @param amount The amount to stake
     * @param instant if false, finish current period with
     *  old values and start new period with new value.
     *  If true, end current period without rewards and
     *  start a new period with the new values.
     *  If the current stake is 0, this should be instant.
     */
    function stake(uint amount, bool instant) public {
        address sender = _msgSender();

        require(amount > 0, "Staking requires positive value");
        require(stakingToken.allowance(sender, address(this)) >= amount,
            "The staking contract is not approved to stake this amount");

        stakingToken.transferFrom(sender, address(this), amount);

        StakeHolder storage stakeholder = stakeholders[sender];

        // Claim previous rewards with old staked value
        claimRewards(false);
        if(instant){
            stakeholder.interestDate = block.timestamp;
            stakeholder.stakingBalance += amount;
        } else {
            require(stakeholder.stakingBalance > 0, "New stakers must stake instantly");
            stakeholder.newStake = amount;
        }

        // Keep track of the total stake in the contract
        totalStake += amount;

        emit Staking(sender, amount);

    }

    /**
     * Withdraw staked funds from the contract.
     * This will calculate the owed rewards for previous periods,
     * the current interest period will end without reward.
     * @param amount The amount to withdraw, capped by stakingbalance
     */
    function withdrawFunds(uint amount) public {
        address sender = _msgSender();
        StakeHolder storage stakeholder = stakeholders[sender];

        require(stakeholder.interestDate + cooldown < block.timestamp, "Funds are locked until cooldown period is over");
        require(stakeholder.stakingBalance >= 0, "Nothing was staked");
        
        // Claim rewards with current stake
        claimRewards(false);
        
        if(amount > stakeholder.stakingBalance){
            amount = stakeholder.stakingBalance;
        }
        stakingToken.transfer(sender, amount);

        stakeholder.interestDate = block.timestamp;
        stakeholder.stakingBalance -= amount;
        totalStake -= amount;
    }

    /**
     * Calculate the rewards owed to a stakeholder.
     * The interest will be calculated based on:
     *  - The amount staked of the stakeholder
     *  - The weight of the stakeholder
     *  - The amount of interest periods staked
     *  - The base and extra interest of the contract
     * The formula of compounding interest is applied.
     * @param withdrawl if true, send the rewards to the stakeholder.
     *  if false, add the rewards to the staking balance of the stakeholder.
     * @return reward The rewards of the stakeholder for previous periods.
     */
    function claimRewards(bool withdrawl) public returns(uint reward) {

        address stakeholderAddress = _msgSender();
        StakeHolder storage stakeholder = stakeholders[stakeholderAddress];

        
        // Number of accounts for which rewards will be paid
        uint n = (block.timestamp-stakeholder.interestDate) / interestPeriod;

        if (stakeholder.stakingBalance == 0 || n == 0){
            return 0;
        }

        if (stakeholder.newWeight > 0 || stakeholder.newStake > 0){
            // If updates were scheduled for the next period:
            // - first calculate rewards on the first compounding period with the old values
            // - set the new values to use in the computation of the following compounding periods
            stakeholder.stakingBalance += stakeholder.stakingBalance * (baseInterest + extraInterest * stakeholder.weight);
            stakeholder.interestDate += interestPeriod;

            if(stakeholder.newWeight > 0){
                stakeholder.weight = stakeholder.newWeight;
                stakeholder.newWeight = 0;
            }

            if(stakeholder.newStake > 0){
                stakeholder.stakingBalance += stakeholder.newStake;
                stakeholder.newStake = 0;
            }

            // One period was already rewarded with old values
            stakeholder.interestDate += interestPeriod;
            n-=1;

        }

        // Update the timestamp of the timestamp for the staking period that was not rewarded yet
        stakeholder.interestDate += (n * interestPeriod);

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

    /**
     * Owner function to transfer the staking token from the contract
     * address to the contract owner.
     * The amount cannot exceed the amount staked by the stakeholders,
     * making sure the funds of stakeholders stay in the contract.
     * @param amount the amount to withraw as owner
     */
    function withdrawRemainingFunds(uint amount) public onlyOwner{
        address sender = _msgSender();
        
        // Make sure the staked amounts are never withdrawn
        if(amount > address(this).balance - totalStake){
            amount = address(this).balance - totalStake;
        }

        stakingToken.transfer(sender, amount);
    }

    // List of owner functions to update the contract
    function updateSignatureAddress(address value) public onlyOwner {
        signatureAddress = value; 
    }

    function updateInterestDecimals(uint value) public onlyOwner{
        interestDecimals = value;
        emit ConfigUpdate('Decimals', value);
    }

    function updateBaseInterest(uint value) public onlyOwner{
        baseInterest = value;
        emit ConfigUpdate('Base interest', value);
    }

    function updateExtraInterest(uint value) public onlyOwner{
        extraInterest = value;
        emit ConfigUpdate('Extra interest', value);
    }

    function updateInterestPeriod(uint value) public onlyOwner{
        interestPeriod = value;
        emit ConfigUpdate('Interest period', value);
    }

    function updateCoolDownPeriod(uint value) public onlyOwner{
        interestPeriod = value;
        emit ConfigUpdate('Cool down period', value);
    }

}