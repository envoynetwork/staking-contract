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
contract EnvoyStakingV2 is Ownable {
    
    using SafeMath for uint;

    event ConfigUpdate(string field, uint value);
    event Staking(address indexed stakeholder_, uint stake_);
    event Rewarding(address indexed stakeholder_, uint reward_, uint numberOfPeriods);
    event Test(string test, uint test2);

    // Struct containing the state of each stakeholder
    struct StakeHolder {
        uint stakingBalance; // Staking balance of the stakeholder
        uint weight; // The weight of the staker
        uint startDate; // The date the staker joined
        uint lastClaimed; // The date the stakeholder claimed the last rewards
        uint rewardPeriod; // The period definition that was last used to claim
        uint releaseDate; // Date on which the stakeholder is able to withdraw the staked funds
        uint releaseAmount; // Amount to be released at the release date
        uint newStake; // Will be used to update the stake of the user in the next period
    }

    /** Struct containing the state of each reward period.
    Normally, for each period of duration `rewardPeriodDuration`,
    a new struct is added when users interact with the contract.
    If no interaction with the smart contract takes place,
    the state will be used for multiple periods between
    RewardPeriod.startDate and RewardPeriod.endDate.
    */
    struct RewardPeriod {
        uint startDate; // First period for which this state applies
        uint endDate; // Last period for which this state applies
        uint rewardPerPeriod; // amount to distribute over stakeholders
        // Both the staking balance and weighted staking balance are stored.
        // The ratio of the two can be used to know the stake weighted average user level.
        uint totalStakingBalance;
        uint totalWeightedStakingBalance;
        uint totalNewStake;
        uint totalNewWeightedStake;
        uint totalRewardsClaimed; // Total rewards claimed (used for compounded reward calculation)
    }

    // Keeps track of user information by mapping the stakeholder address to his state
    mapping(address => StakeHolder) public stakeholders;

    //Keeps track of the different reward intervals, sequentially via a list
    RewardPeriod[] public rewardPeriods;

    // Keeps track of totalStake per period
    mapping(uint => uint) public totalWeightedStake;
    
    address public signatureAddress;

    IERC20 public stakingToken;

    uint public startDate; // Used to calculate how many periods have passed
    uint public endDate; // Used to cap the end date in the reward calculation
    uint public rewardPeriodDuration= 7 days; // Length in between reward distribution
    uint public cooldown = 7 days; // Length between withdrawal request and actual withdrawal is possible

    uint public maxWeight; // Highest weight observed in the contract

    string private _name = "ENVOY - STAKING"; // Used for ERC20 compatibility
    string private _symbol = "ENV-S"; // Used for ERC20 compatibility

    constructor(address signatureAddress_, address stakingTokenAddress) {
        signatureAddress = signatureAddress_;
        stakingToken = IERC20(stakingTokenAddress);

        startDate = block.timestamp;            
        
        // Initialise the first reward period in the sequence
        RewardPeriod memory rp = RewardPeriod({
            startDate: 0,
            endDate: 0,
            rewardPerPeriod: 958000 * 10**18,
            totalStakingBalance: 0,
            totalWeightedStakingBalance: 0,
            totalNewStake: 0,
            totalNewWeightedStake: 0,
            totalRewardsClaimed: 0
        });
        rewardPeriods.push(rp);
    }

    /**
    Easy getter to get the index of the latest reward period in the list.
    */
    function getRewardPeriodsLength() public view returns (uint length) {
        return rewardPeriods.length;
    }

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
    
        // Update the total weighted amount of the current period.
        // The change is applied instantly

        if (rewardPeriods[rewardPeriods.length - 1].startDate < currentPeriod()){
            rewardPeriods[rewardPeriods.length - 1].endDate = currentPeriod() - 1;
            RewardPeriod memory rp = RewardPeriod({
                startDate: currentPeriod(),
                endDate: 0,
                rewardPerPeriod: rewardPeriods[rewardPeriods.length - 1].rewardPerPeriod,
                totalStakingBalance: rewardPeriods[rewardPeriods.length - 1].totalStakingBalance + rewardPeriods[rewardPeriods.length - 1].totalNewStake,
                totalWeightedStakingBalance: rewardPeriods[rewardPeriods.length - 1].totalWeightedStakingBalance
                    + rewardPeriods[rewardPeriods.length - 1].totalNewWeightedStake
                    + (weight_ - stakeholder.weight)*(stakeholder.newStake + stakeholder.stakingBalance),
                totalNewStake: 0,
                totalNewWeightedStake: 0,
                totalRewardsClaimed: 0
            });

            rewardPeriods.push(rp);
        } else {
            rewardPeriods[rewardPeriods.length - 1].totalWeightedStakingBalance += (weight_ - stakeholder.weight)*stakeholder.stakingBalance;
            rewardPeriods[rewardPeriods.length - 1].totalNewWeightedStake += (weight_ - stakeholder.weight)*stakeholder.newStake;
        }

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

        // Transfer the tokens for staking
        stakingToken.transferFrom(sender, address(this), amount);

        // Update the stakeholders state
        StakeHolder storage stakeholder = stakeholders[sender];

        if(stakeholder.startDate == 0) {
            stakeholder.startDate = block.timestamp;
            stakeholder.lastClaimed = currentPeriod();
            stakeholder.rewardPeriod = rewardPeriods.length - 1;
        }

        // Claim previous rewards with old staked value
        claimRewards(false);

        stakeholder.newStake = amount;

        // Update the totals
        if (rewardPeriods[rewardPeriods.length - 1].startDate < currentPeriod()){
            rewardPeriods[rewardPeriods.length - 1].endDate = currentPeriod() - 1;
            RewardPeriod memory rp = RewardPeriod({
                startDate: currentPeriod(),
                endDate: currentPeriod(),
                rewardPerPeriod: rewardPeriods[rewardPeriods.length - 1].rewardPerPeriod,
                totalStakingBalance: rewardPeriods[rewardPeriods.length - 1].totalStakingBalance + rewardPeriods[rewardPeriods.length - 1].totalNewStake ,
                totalWeightedStakingBalance: rewardPeriods[rewardPeriods.length - 1].totalWeightedStakingBalance + rewardPeriods[rewardPeriods.length - 1].totalNewWeightedStake,
                totalNewStake: amount,
                totalNewWeightedStake: amount*(stakeholder.weight+1),
                totalRewardsClaimed: 0
            });
            rewardPeriods.push(rp);
        } else {
            rewardPeriods[rewardPeriods.length - 1].endDate = currentPeriod();
            rewardPeriods[rewardPeriods.length - 1].totalNewStake += amount;
            rewardPeriods[rewardPeriods.length - 1].totalNewWeightedStake += amount*(stakeholder.weight+1);
        }

        emit Staking(sender, amount);

    }

    /**
     Request to withdrawal funds from the contract.
     The funds will not be regarded as stake anymore: no rewards can be earned anymore.
     The funds are not withdrawn directly, they can be claimed with `withdrawFunds`
     after the cooldown period has passed.
     @dev the request will set the releaseDate for the stakeholder to `cooldown` time in the future,
      and the releaseAmount to the amount requested for withdrawal.
     @param amount The amount to withdraw, capped by the total stake + owed rewards.
     @param claimRewardsFirst a boolean flag: should be set to true if you want to claim your rewards.
      If set to false, all owed rewards will be dropped. Build in for safety, funds can be withdrawn
      even when the reward calculations encounters a breaking bug.
     */
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
        updateTotalStakingBalance(stakeholder.stakingBalance - amount, stakeholder.weight+1, false);
        stakeholder.stakingBalance -= amount;
    }

    /**
     * Withdraw staked funds from the contract.
     * Can only be triggered after `requestWithdrawal` has been called
     * and the cooldown period has passed.
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

        updateNewStakePreviousPeriod();

        // Number of periods for which rewards will be paid
        uint n = currentPeriod() - stakeholder.lastClaimed;
        // If no stake is present or no time passed since last claim, 0 can be returned.
        if ((stakeholder.stakingBalance == 0 && stakeholder.newStake == 0 ) || n == 0){
            return;
        }


        // Calculate the rewards and new stakeholder state
        (uint reward, StakeHolder memory newStakeholder) = calculateRewards(stakeholderAddress);
        
        stakeholder.stakingBalance = newStakeholder.stakingBalance;
        stakeholder.weight = newStakeholder.weight;
        stakeholder.newStake = newStakeholder.newStake;

        // If the stakeholder wants to redraw the rewards;
        // Send to his wallet. Else, update stakingbalance.
        if (withdrawl){
            stakingToken.transfer(_msgSender(), reward);
        } else {
            stakeholder.stakingBalance += reward;
            updateTotalStakingBalance(reward, stakeholder.weight+1, true);
        }

        if (rewardPeriods[rewardPeriods.length - 1].startDate < currentPeriod()){
            rewardPeriods[rewardPeriods.length - 1].endDate = currentPeriod() - 1;
            RewardPeriod memory rp = RewardPeriod({
                startDate: currentPeriod(),
                endDate: 0,
                rewardPerPeriod: rewardPeriods[rewardPeriods.length - 1].rewardPerPeriod,
                totalStakingBalance: rewardPeriods[rewardPeriods.length - 1].totalStakingBalance + rewardPeriods[rewardPeriods.length - 1].totalNewStake,
                totalWeightedStakingBalance: rewardPeriods[rewardPeriods.length - 1].totalWeightedStakingBalance + rewardPeriods[rewardPeriods.length - 1].totalNewWeightedStake,
                totalNewStake: 0,
                totalNewWeightedStake: 0,
                totalRewardsClaimed: reward
            });
            rewardPeriods.push(rp);
        } else {
            rewardPeriods[rewardPeriods.length - 1].totalRewardsClaimed += reward;
        }

        stakeholder.lastClaimed = currentPeriod();
        stakeholder.rewardPeriod = rewardPeriods.length - 1;

        emit Rewarding(stakeholderAddress, reward, n);

    }

    /**
     * Calculate the rewards owed to a stakeholder.
     * The interest will be calculated based on:
     *  - The reward to divide in this period
     *  - The the relative stake of the stakeholder
     *  - The time the stakeholder has been staking.
     * The formula of compounding interest is applied, meaning rewards on rewards are calculated..
     * @param stakeholderAddress The address to calculate rewards for
     * @return reward The rewards of the stakeholder for previous periods.
     * @return stakeholder The new object containing stakeholder state
     */
    function calculateRewards(address stakeholderAddress) public  returns(uint reward, StakeHolder memory stakeholder) {

        stakeholder = stakeholders[stakeholderAddress];
        
        // Number of accounts for which rewards will be paid
        uint n = currentPeriod() - stakeholder.lastClaimed;
        emit Test('currentperiod', n);

        // If no stake is present or no time passed since last claim, 0 can be returned.
        if ((stakeholder.stakingBalance == 0 && stakeholder.newStake == 0 ) || n == 0){
            return (0, stakeholder);
        }

        uint s = stakeholder.stakingBalance;
        emit Test('initialStakingBalance', s);
      
        uint unclaimedRewards = totalUnclaimedRewards(stakeholder.lastClaimed);

        emit Test('unclaimed', unclaimedRewards);

        // Loop over all intervals defined. 
        for (uint p = stakeholder.rewardPeriod; p < rewardPeriods.length; p++) {
            // Handle start if it is not equal to the start of the reward period
            uint start = rewardPeriods[p].startDate < stakeholder.lastClaimed ?
                stakeholder.lastClaimed : rewardPeriods[p].startDate;
            emit Test('start', start);

            // Handle stop if end date is not defined (last reward period)
            uint end = rewardPeriods[p].endDate == 0 ?
                currentPeriod() : rewardPeriods[p].endDate;
            emit Test('end', end);

            uint tsb = rewardPeriods[p].totalStakingBalance;
            uint twsb = rewardPeriods[p].totalWeightedStakingBalance;

            // Store the denominator of the share which is the sum of:
            // - the total weighted staked amounts
            // - the total weighted rewards of the all periods.
            uint rewardPerStakeDenominator = (tsb > 0) ?
                twsb + unclaimedRewards * twsb / tsb : 1;

            emit Test('total w stake', twsb);
            emit Test('denominator', rewardPerStakeDenominator);

            // Loop over all periods between start and end (mostly only 1 period)
            for (uint q = start; q < end; q++) {
                s += s*(stakeholder.weight+1) * rewardPeriods[p].rewardPerPeriod
                    / rewardPerStakeDenominator;
                emit Test('q', q);            
                emit Test('new stake', s);
                
                // set new stake if necessary
                if(stakeholder.newStake > 0){
                    emit Test('set new stake', stakeholder.newStake);
                    s += stakeholder.newStake;
                    stakeholder.stakingBalance += stakeholder.newStake;

                    tsb += stakeholder.newStake;
                    twsb += stakeholder.newStake*(stakeholder.weight+1);

                    stakeholder.newStake = 0;
                }
            }
            unclaimedRewards += rewardPeriods[p].rewardPerPeriod - rewardPeriods[p].totalRewardsClaimed;
            emit Test('new unclaimed', unclaimedRewards);
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
        if(amount > stakingToken.balanceOf(address(this)) - (rewardPeriods[rewardPeriods.length - 1].totalStakingBalance + totalUnclaimedRewards(currentPeriod()))){
            amount = stakingToken.balanceOf(address(this)) - (rewardPeriods[rewardPeriods.length - 1].totalStakingBalance + totalUnclaimedRewards(currentPeriod()));
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
    //     rewardPeriodDuration = value;
    //     emit ConfigUpdate('Interest period', value);
    // }

    function updateCoolDownPeriod(uint value) public onlyOwner{
        cooldown = value;
        emit ConfigUpdate('Cool down period', value);
    }


    function updateRewardPerPeriod(uint value) public onlyOwner{
        updateNewStakePreviousPeriod();
        if (rewardPeriods[rewardPeriods.length - 1].startDate < currentPeriod()){
            rewardPeriods[rewardPeriods.length - 1].endDate = currentPeriod() -  1;
            RewardPeriod memory rp = RewardPeriod({
                startDate: currentPeriod(),
                endDate: 0,
                rewardPerPeriod: value,
                totalStakingBalance: rewardPeriods[rewardPeriods.length - 1].totalStakingBalance + rewardPeriods[rewardPeriods.length - 1].totalNewStake,
                totalWeightedStakingBalance: rewardPeriods[rewardPeriods.length - 1].totalWeightedStakingBalance + rewardPeriods[rewardPeriods.length - 1].totalNewWeightedStake,
                totalNewStake: 0,
                totalNewWeightedStake: 0,
                totalRewardsClaimed: 0
            });
            rewardPeriods.push(rp);
        } else {
            rewardPeriods[rewardPeriods.length - 1].rewardPerPeriod = value;
        }        
        emit ConfigUpdate('Reward per period', value);
    }

    function currentPeriod() public view returns(uint period){
        period = (block.timestamp - startDate) / rewardPeriodDuration;
    }

    function totalUnclaimedRewards(uint period) public view returns(uint rewards){
        uint i = 0;
        while(rewardPeriods[i].endDate < period){ // endDate = 0 is implicitly handled
            // No rewards are unclaimed if there were no stakers for a period
            if(rewardPeriods[i].totalWeightedStakingBalance > 0){
                // Loop over completed periods with start and end date
                if(i < rewardPeriods.length-1){
                    rewards += (rewardPeriods[i].endDate - rewardPeriods[i].startDate)
                        * rewardPeriods[i].rewardPerPeriod
                        - rewardPeriods[i].totalRewardsClaimed;
                } else {
                    // Last period might be finished, while the state is not updated yet
                    uint start;
                    if (rewardPeriods[i].endDate > 0){
                        rewards += (rewardPeriods[i].endDate - rewardPeriods[i].startDate)
                            * rewardPeriods[i].rewardPerPeriod
                            - rewardPeriods[i].totalRewardsClaimed;
                        start = rewardPeriods[i].endDate + 1;                
                    } else {
                        start = rewardPeriods[i].startDate;
                    }
                    rewards += (period - start) * rewardPeriods[i].rewardPerPeriod - rewardPeriods[i].totalRewardsClaimed;
                }
            }
            i++;
        }
        if(rewardPeriods[i].totalWeightedStakingBalance > 0){
        }
    }

    function updateTotalStakingBalance(uint amount, uint weight, bool increase) internal {
        // Update this period total stake (or define a new one when it already)

        updateNewStakePreviousPeriod();

        uint newTotalStake = rewardPeriods[rewardPeriods.length - 1].totalStakingBalance;
        uint newTotalWeightedStake = rewardPeriods[rewardPeriods.length - 1].totalWeightedStakingBalance;
        if(increase){
            newTotalStake += amount;
            newTotalWeightedStake += amount * weight;
        } else{
            newTotalStake -= amount;
            newTotalWeightedStake -= amount * weight;
        }
        
        if (rewardPeriods[rewardPeriods.length - 1].startDate < currentPeriod()){
            rewardPeriods[rewardPeriods.length - 1].endDate = currentPeriod() - 1;
            RewardPeriod memory rp = RewardPeriod({
                startDate: currentPeriod(),
                endDate: 0,
                rewardPerPeriod: rewardPeriods[rewardPeriods.length - 1].rewardPerPeriod,
                totalStakingBalance: rewardPeriods[rewardPeriods.length - 1].totalNewStake + newTotalStake,
                totalWeightedStakingBalance: rewardPeriods[rewardPeriods.length - 1].totalNewWeightedStake + newTotalWeightedStake,
                totalNewStake: 0,
                totalNewWeightedStake: 0,
                totalRewardsClaimed: 0
            });
            rewardPeriods.push(rp);
        } else {
            rewardPeriods[rewardPeriods.length - 1].totalStakingBalance = newTotalStake;
            rewardPeriods[rewardPeriods.length - 1].totalWeightedStakingBalance = newTotalWeightedStake;
        }
    }

    /**
     * @dev Function to add new stake to the total staking balance with a period delay.
     */
    function updateNewStakePreviousPeriod() internal {
        if ((rewardPeriods[rewardPeriods.length - 1].endDate > 0) && (rewardPeriods[rewardPeriods.length - 1].endDate < currentPeriod())){
            RewardPeriod memory rp = RewardPeriod({
                startDate: rewardPeriods[rewardPeriods.length - 1].endDate+1,
                endDate: 0,
                rewardPerPeriod: rewardPeriods[rewardPeriods.length - 1].rewardPerPeriod,
                totalStakingBalance: rewardPeriods[rewardPeriods.length - 1].totalStakingBalance + rewardPeriods[rewardPeriods.length - 1].totalNewStake,
                totalWeightedStakingBalance: rewardPeriods[rewardPeriods.length - 1].totalWeightedStakingBalance + rewardPeriods[rewardPeriods.length - 1].totalNewWeightedStake,
                totalNewStake: 0,
                totalNewWeightedStake: 0,
                totalRewardsClaimed: 0
            });
            rewardPeriods.push(rp);
        }        
    }

}