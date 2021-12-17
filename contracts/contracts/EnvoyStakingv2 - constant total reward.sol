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
    event Rewarding(address indexed stakeholder_, uint reward_, uint numberOfPeriods);

    struct StakeHolder {
        uint stakingBalance; // Staking balance of the stakeholder
        uint weight; // The weight of the staker
        uint startDate; // The date the staker joined
        uint lastClaimed; // The date the stakeholder claimed the last rewards
        uint rewardPeriod; // The period definition that was last used to claim
        uint releaseDate; // Date on which the stakeholder is able to withdraw the staked funds
        uint releaseAmount; // Amount to be released at the release date
        // uint newWeigth;
        uint newStake;
    }

    struct RewardPeriod {
        uint startDate;
        uint endDate;
        uint rewardPerPeriod;
        uint totalWeightedStakingBalance;
        uint totalRewardsClaimed;
    }

    // Keeps track of user information
    mapping(address => StakeHolder) public stakeholders;

    // Keeps track of 
    RewardPeriod[] public rewardPeriods;

    // Keeps track of totalStake per period
    mapping(uint => uint) public totalWeightedStake;
    
    address public signatureAddress;

    IERC20 public stakingToken;

    // Decimals used for interest calculation
    // uint public interestDecimals = 1000000000000;

    uint public startDate;
    uint public endDate;
    // uint public rewardPerBlock = 958000 * 10**18;
    uint public rewardPeriodLength= 7 days;
    uint public cooldown = 7 days;

    uint public maxWeight;

    constructor(address signatureAddress_, address stakingTokenAddress) {
        signatureAddress = signatureAddress_;
        stakingToken = IERC20(stakingTokenAddress);

        startDate = block.timestamp;
    }


    string private _name = "ENVOY - STAKING";
    string private _symbol = "ENV-S";


    /**
     * Increase the stake of the sender by a value.
     * @param weight_ The new weight.
     * @param signature A signature proving the sender
     *  is allowed to update his weight.
     */
    function updateWeight(uint weight_, bytes memory signature) public{
        address sender = _msgSender();
        require(signatureAddress == _recoverSigner(sender, weight_, signature),
            "Signature of the input was not signed by 'signatureAddress'");

        StakeHolder storage stakeholder = stakeholders[sender];

        // Claim previous rewards with old weight
        claimRewards(false);

        updateTotalWeightedStakingBalance((weight_ - stakeholder.weight)*stakeholder.stakingBalance, true);
        // stakeholder.newWeight = weight_
        stakeholder.weight = weight_;


        // Keep track of highest weight
        if(weight_ > maxWeight){
            maxWeight = weight_;
        }
    }

    /**
     * Increase the stake of the sender by a value.
     * @param amount The amount to stake
     */
    function stake(uint amount) public {
        address sender = _msgSender();

        require(amount > 0, "Staking requires positive value");
        require(stakingToken.allowance(sender, address(this)) >= amount,
            "The staking contract is not approved to stake this amount");

        stakingToken.transferFrom(sender, address(this), amount);

        StakeHolder storage stakeholder = stakeholders[sender];

        if(stakeholder.startDate == 0) {
            stakeholder.startDate = block.timestamp;
            stakeholder.lastClaimed = block.timestamp;
            stakeholder.rewardPeriod = rewardPeriods.length - 1;
        }

        // Claim previous rewards with old staked value
        claimRewards(false);

        stakeholder.newStake = amount;

        updateTotalWeightedStakingBalance(amount*(stakeholder.weight + 1), true);

        emit Staking(sender, amount);

    }

    function requestWithdrawal(uint amount, bool claimRewardsFirst) public {
        address sender = _msgSender();
        StakeHolder storage stakeholder = stakeholders[sender];
        
        require(stakeholder.stakingBalance >= 0, "Nothing was staked");

        stakeholder.releaseDate = block.timestamp + cooldown;
        
        // Claim rewards with current stake
        // Can be skipped as failsafe in case claiming rewards fails,
        // but REWARDS ARE LOST.
        if (claimRewardsFirst){
            claimRewards(false);
        }
        
        if(amount >= stakeholder.stakingBalance){
            amount = stakeholder.stakingBalance;
            stakeholder.startDate = 0;
        }

        stakeholder.releaseDate = block.timestamp + cooldown;
        stakeholder.releaseAmount = amount;
        updateTotalWeightedStakingBalance((stakeholder.stakingBalance - amount)*(stakeholder.weight+1), false);
        stakeholder.stakingBalance -= amount;
    }

    /**
     * Withdraw staked funds from the contract.
     * This will calculate the owed rewards for previous periods,
     * the current interest period will end without reward.
     */
    function withdrawFunds() public {
        address sender = _msgSender();
        StakeHolder storage stakeholder = stakeholders[sender];

        require(stakeholder.releaseDate != 0 && stakeholder.releaseDate < block.timestamp, "Funds are locked until cooldown period is over");
        require(stakeholder.releaseAmount >= 0, "Nothing to withdrawl");
        
        stakingToken.transfer(sender, stakeholder.releaseAmount);
        stakeholder.releaseAmount = 0;

    }

    /**
     * Function to claim the rewards earned by staking.
     * @dev uses calculateRewards to get the amount owed
     * @param withdrawl if true, send the rewards to the stakeholder.
     *  if false, add the rewards to the staking balance of the stakeholder.
     */
    function claimRewards(bool withdrawl) public {

        address stakeholderAddress = _msgSender();
        StakeHolder storage stakeholder = stakeholders[stakeholderAddress];

        // Number of periods for which rewards will be paid
        uint n = currentPeriod() - stakeholder.lastClaimed;

        // If no stake is present or no time passed since last claim, 0 can be returned.
        if ((stakeholder.stakingBalance == 0 && stakeholder.newStake == 0 ) || n == 0){
        }

        // Calculate the rewards and new stakeholder state
        (uint reward, StakeHolder memory newStakeholder) = calculateRewards(stakeholderAddress);
        
        stakeholder.stakingBalance = newStakeholder.stakingBalance;
        stakeholder.weight = newStakeholder.weight;
        stakeholder.newStake = newStakeholder.newStake;
        stakeholder.lastClaimed = currentPeriod();
        stakeholder.rewardPeriod = rewardPeriods.length - 1;

        // If the stakeholder wants to redraw the rewards;
        // Send to his wallet. Else, update stakingbalance.
        if (withdrawl){
            stakingToken.transfer(_msgSender(), reward);
        } else {
            stakeholder.stakingBalance += reward;
            updateTotalWeightedStakingBalance(reward*(stakeholder.weight+1), true);
        }

        if (rewardPeriods[rewardPeriods.length - 1].startDate < currentPeriod()){
            rewardPeriods[rewardPeriods.length - 1].endDate = currentPeriod() - 1;
            RewardPeriod memory rp = RewardPeriod({
                startDate: currentPeriod(),
                endDate: 0,
                rewardPerPeriod: rewardPeriods[rewardPeriods.length - 1].rewardPerPeriod,
                totalWeightedStakingBalance: rewardPeriods[rewardPeriods.length - 1].totalWeightedStakingBalance,
                totalRewardsClaimed: reward
            });
            rewardPeriods.push(rp);
        } else {
            rewardPeriods[rewardPeriods.length - 1].totalRewardsClaimed += reward;
        }

        emit Rewarding(stakeholderAddress, reward, n);

    }

    /**
     * Calculate the rewards owed to a stakeholder.
     * The interest will be calculated based on:
     *  - The amount staked of the stakeholder
     *  - The weight of the stakeholder
     *  - The amount of interest periods staked
     *  - The base and extra interest of the contract
     * The formula of compounding interest is applied.
     * @param stakeholderAddress The address to calculate rewards for
     * @return reward The rewards of the stakeholder for previous periods.
     * @return stakeholder The new object containing stakeholder state
     */
    function calculateRewards(address stakeholderAddress) public view returns(uint reward, StakeHolder memory stakeholder) {

        stakeholder = stakeholders[stakeholderAddress];
        
        // Number of accounts for which rewards will be paid
        uint n = currentPeriod() - stakeholder.lastClaimed;

        // If no stake is present or no time passed since last claim, 0 can be returned.
        if ((stakeholder.stakingBalance == 0 && stakeholder.newStake == 0 ) || n == 0){
            return (0, stakeholder);
        }

        // Update the timestamp of the timestamp for the staking period that was not rewarded yet
        uint s = stakeholder.stakingBalance + reward;        

        uint unclaimedRewards = totalUnclaimedRewards(stakeholder.lastClaimed);

        for (uint p = stakeholder.rewardPeriod; p < rewardPeriods.length; p++) {
            // Handle start if it is not equal to the start of the reward period
            uint start = rewardPeriods[p].startDate < stakeholder.lastClaimed ?
                stakeholder.lastClaimed : rewardPeriods[p].startDate;

            // Handle stop if end date is not defined (last reward period)
            uint end = rewardPeriods[p].endDate == 0 ?
                currentPeriod() : rewardPeriods[p].endDate;

            // Loop over all periods
            unclaimedRewards += rewardPeriods[p].rewardPerPeriod - rewardPeriods[p].totalRewardsClaimed;
            uint rewardPerStake = rewardPeriods[p].rewardPerPeriod / (rewardPeriods[p].totalWeightedStakingBalance + unclaimedRewards);
            for (uint q = start; q < end; q++) {
                    s += s*(stakeholder.weight+1)*rewardPerStake;
                    
                    // set new values if necessary
                    // if(stakeholder.newWeight > 0){
                    //     stakeholder.weight = stakeholder.newWeight;
                    //     stakeholder.newWeight = 0;
                    // }
                    if(stakeholder.newStake > 0){
                        stakeholder.stakingBalance += stakeholder.newStake;
                        stakeholder.newStake = 0;
                    }
                }
        }

        reward = s - stakeholder.stakingBalance;
    
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
        
        // Make sure the staked amounts or owed rewards are never withdrawn
        if(amount > stakingToken.balanceOf(address(this)) - (rewardPeriods[rewardPeriods.length - 1].totalWeightedStakingBalance + totalUnclaimedRewards(currentPeriod()))){
            amount = stakingToken.balanceOf(address(this)) - (rewardPeriods[rewardPeriods.length - 1].totalWeightedStakingBalance + totalUnclaimedRewards(currentPeriod()));
        }

        stakingToken.transfer(sender, amount);
    }

    // List of owner functions to update the contract
    function updateSignatureAddress(address value) public onlyOwner {
        signatureAddress = value; 
    }

    /**
     * Updates the amount of decimals used for the interest rate.
     * After this accuracy, rounding will be applied
     * and approximations will stack over long time periods.
     * @param value The number of decimals. NOT the number to devide with.
     *  e.g.: to use 3 decimals, input 3 (10**3) and not 1000.
     */
    // function updateInterestDecimals(uint value) public onlyOwner{
    //     // First adjust interest rates to new decimals.
    //     // Make sure no precision is lost!
    //     value = 10 ** value;
    //     baseInterest = baseInterest * value / interestDecimals;
    //     extraInterest = extraInterest * value / interestDecimals;
    //     interestDecimals = value;
    //     emit ConfigUpdate('Decimals', value);
    // }

    // function updateBaseInterest(uint value) public onlyOwner{
    //     baseInterest = value;
    //     emit ConfigUpdate('Base interest', value);
    // }

    // function updateExtraInterest(uint value) public onlyOwner{
    //     extraInterest = value;
    //     emit ConfigUpdate('Extra interest', value);
    // }

    // function updateRewardPeriod(uint value) public onlyOwner{
    //     rewardPeriodLength = value;
    //     emit ConfigUpdate('Interest period', value);
    // }

    function updateCoolDownPeriod(uint value) public onlyOwner{
        cooldown = value;
        emit ConfigUpdate('Cool down period', value);
    }

    function currentPeriod() public view returns(uint period){
        period = (startDate - block.timestamp) / rewardPeriodLength;
    }

    function totalUnclaimedRewards(uint period) public view returns(uint rewards){
        uint i = 0;
        while(rewardPeriods[i].endDate > 0 || rewardPeriods[i].endDate < period ){
            rewards += (rewardPeriods[i].endDate - rewardPeriods[i].startDate)
                * rewardPeriods[i].rewardPerPeriod
                - rewardPeriods[i].totalRewardsClaimed;
            i++;
        }
        rewards += (period - rewardPeriods[i].startDate) * rewardPeriods[i].rewardPerPeriod - rewardPeriods[i].totalRewardsClaimed;
    }

    function updateTotalWeightedStakingBalance(uint amount, bool increase) internal {
        // Update this period total stake (or define a new one when it already)
        uint newTotalWeightedStake = rewardPeriods[rewardPeriods.length - 1].totalWeightedStakingBalance;
        if(increase){
            newTotalWeightedStake += amount;
        } else{
            newTotalWeightedStake -= amount;
        }
        
        if (rewardPeriods[rewardPeriods.length - 1].startDate < currentPeriod()){
            rewardPeriods[rewardPeriods.length - 1].endDate = currentPeriod() - 1;
            RewardPeriod memory rp = RewardPeriod({
                startDate: currentPeriod(),
                endDate: 0,
                rewardPerPeriod: rewardPeriods[rewardPeriods.length - 1].rewardPerPeriod,
                totalWeightedStakingBalance: newTotalWeightedStake,
                totalRewardsClaimed: 0
            });
            rewardPeriods.push(rp);
        } else {
            rewardPeriods[rewardPeriods.length - 1].totalWeightedStakingBalance = newTotalWeightedStake;
        }
    }


}