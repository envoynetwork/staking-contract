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
        uint rewardPerPeriod; // amount to distribute over stakeholders
        mapping (uint => uint) totalStakingBalance; // Mapping weight to stake amount of tokens staked
        mapping (uint => uint) totalNewStake; // Tokens staked in this period to be added in the next one.
        mapping (uint => uint) rewardsClaimed; // Mapping weight to rewards claimed with this weight of tokens staked
    }

    // Keeps track of user information by mapping the stakeholder address to his state
    mapping(address => StakeHolder) public stakeholders;

    //Keeps track of the different reward intervals, sequentially
    mapping (uint => RewardPeriod) public rewardPeriods;

    uint public maxRewardPeriod; //Latest reward period 
    uint public maxWeight; // Highest weight observed in the contract
    
    // Address used to verify users updating weight
    address public signatureAddress;

    IERC20 public stakingToken;

    uint public startDate; // Used to calculate how many periods have passed
    uint public maxNumberOfPeriods = 1095; // Used to cap the end date in the reward calculation
    uint public rewardPeriodDuration= 1 days; // Length in between reward distribution
    uint public cooldown = 7 days; // Length between withdrawal request and actual withdrawal is possible


    string private _name = "ENVOY - STAKING"; // Used for ERC20 compatibility
    string private _symbol = "ENV-S"; // Used for ERC20 compatibility

    constructor(address signatureAddress_, address stakingTokenAddress) {
        signatureAddress = signatureAddress_;
        stakingToken = IERC20(stakingTokenAddress);

        startDate = block.timestamp;            
        
        // Initialise the first reward period in the sequence
        rewardPeriods[0].rewardPerPeriod = 958000 * 10**18;
    }

    /**
     * Calculates the staking balance for a certain period.
     * Can provide the current balance or balance to be added next period.
     * Also weighted (or multiple weighted) balances can be returned
     * @param period The period for which to call the balance
     * @param weightExponent How many times does the stake need to be multiplied with the weight?
     * @param newStake Does the current value or new value need to be displayed?
     * @return totalStaking the total amount staked for the parameters.
     */
    function totalStakingBalance(uint period, uint weightExponent, bool newStake) public view returns (uint totalStaking){
        for(uint i = 0; i <= maxWeight; i++){
            if(newStake){
                totalStaking += rewardPeriods[period].totalNewStake[i] * (i+1) ** weightExponent;
            } else
            {
                totalStaking += rewardPeriods[period].totalStakingBalance[i] * (i+1) ** weightExponent;
            }
        }
    }
    
    /**
     * Calculates the total rewards for a period.
     * @param period the period to calculate rewards for
     * @param weightExponent How many times does the stake need to be multiplied with the weight?
     * @param claimed True for claimed rewards, false for unclaimed rewards (results sum to the total reward)
     * @return totalRewards the total rewards
     */
    function rewards(uint period, uint weightExponent, bool claimed) public view returns (uint totalRewards){
        for(uint i = 0; i <= maxWeight; i++){
            if(claimed){
                totalRewards += rewardPeriods[period].rewardsClaimed[i] * (i+1) ** weightExponent;
            } else {
                totalRewards += (rewardPeriods[period].rewardsClaimed[i] - rewardPeriods[period].rewardsClaimed[i])
                     * (i+1) ** weightExponent;
            }
        }
    }
    
    function handleNewPeriod() internal {
        // Close previous periods if in the past and create a new one
        while(currentPeriod()>maxRewardPeriod){
            maxRewardPeriod++;
            // rewardPeriods[maxRewardPeriod].startDate = start;
            rewardPeriods[maxRewardPeriod].rewardPerPeriod = rewardPeriods[maxRewardPeriod-1].rewardPerPeriod;
            uint twsb = totalStakingBalance(maxRewardPeriod-1, 1, false);
            for(uint i = 0; i<=maxWeight;i++){
                rewardPeriods[maxRewardPeriod].totalStakingBalance[i] = rewardPeriods[maxRewardPeriod-1].totalStakingBalance[i] + rewardPeriods[maxRewardPeriod-1].totalNewStake[i];
                if(twsb > 0){
                    rewardPeriods[maxRewardPeriod].totalStakingBalance[i] += rewardPeriods[maxRewardPeriod-1].rewardPerPeriod*rewardPeriods[maxRewardPeriod-1].totalStakingBalance[i]*(i+1) / twsb;
                }
            }
        }
    }

    /**
     * Increase the stake of the sender by a value.
     * @param weight_ The new weight.
     * @param signature A signature proving the sender
     *  is allowed to update his weight.
     */
    function updateWeight(uint weight_, bytes memory signature) public{
        // Close previous period if in the past and create a new one, else update the latest one.
        handleNewPeriod();
    
        address sender = _msgSender();

        // Verify the stakeholder was allowed to update stake
        require(signatureAddress == _recoverSigner(sender, weight_, signature),
            "Signature of the input was not signed by 'signatureAddress'");

        StakeHolder storage stakeholder = stakeholders[sender];

        // Claim previous rewards with old weight
        claimRewards(false);

        // Update the total weighted amount of the current period.
        rewardPeriods[maxRewardPeriod].totalStakingBalance[stakeholder.weight] -= stakeholder.stakingBalance;
        rewardPeriods[maxRewardPeriod].totalStakingBalance[weight_] += stakeholder.stakingBalance;
        rewardPeriods[maxRewardPeriod].totalNewStake[stakeholder.weight] -= stakeholder.newStake;
        rewardPeriods[maxRewardPeriod].totalNewStake[weight_] += stakeholder.newStake;
        
        // Finally, set the new weight
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
        // Close previous period if in the past and create a new one, else update the latest one.
        handleNewPeriod();
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
        }

        // Claim previous rewards with old staked value
        claimRewards(false);

        // The current period will calculate rewards with the old stake.
        // Afterwards, newStake will be added to stake and calculation uses updated balance
        stakeholder.newStake = amount;

        // Update the totals
        // rewardPeriods[maxRewardPeriod].endDate = currentPeriod();
        rewardPeriods[maxRewardPeriod].totalNewStake[stakeholder.weight] += amount;
        
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
        handleNewPeriod();
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
        rewardPeriods[maxRewardPeriod].totalStakingBalance[stakeholder.weight] -= amount;

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

        require(stakeholder.releaseDate != 0 && stakeholder.releaseDate < block.timestamp,
            "Funds are locked until cooldown period is over");
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
        // If necessary, close the current latest period and create a new latest.
        // Updated staking balance before calculation.
        handleNewPeriod();

        address stakeholderAddress = _msgSender();
        StakeHolder storage stakeholder = stakeholders[stakeholderAddress];


        // Number of periods for which rewards will be paid
        // Current period is not in the interval as it is not finished.
        uint n = (currentPeriod() > stakeholder.lastClaimed) ? 
            currentPeriod() - stakeholder.lastClaimed : 0;

        // If no stake is present or no time passed since last claim, 0 can be returned.
        if ((stakeholder.stakingBalance == 0 && stakeholder.newStake == 0 ) || n == 0){
            return;
        }

        // Calculate the rewards and new stakeholder state
        (uint reward, StakeHolder memory newStakeholder) = calculateRewards(stakeholderAddress);
        
        // Update stakeholder values
        stakeholder.stakingBalance = newStakeholder.stakingBalance;
        stakeholder.weight = newStakeholder.weight;
        stakeholder.newStake = newStakeholder.newStake;

        // If the stakeholder wants to withdraw the rewards,
        // send the funds to his wallet. Else, update stakingbalance.
        if (withdrawl){
            stakingToken.transfer(_msgSender(), reward);
        } else {
            stakeholder.stakingBalance += reward;
        }

        // If necessary, close the current latest period and create a new latest.
        // Add the weighted rewards to the totalWeightedRewardsClaimed values.
        rewardPeriods[maxRewardPeriod].rewardsClaimed[stakeholder.weight] += reward;

        // Update last claimed and reward definition to use in next calculation
        stakeholder.lastClaimed = currentPeriod();

        emit Rewarding(stakeholderAddress, reward, n);

    }

    /**
     * Calculate the rewards owed to a stakeholder.
     * The interest will be calculated based on:
     *  - The reward to divide in this period
     *  - The the relative stake of the stakeholder (taking previous rewards in account)
     *  - The time the stakeholder has been staking.
     * The formula of compounding interest is applied, meaning rewards on rewards are calculated.
     * @param stakeholderAddress The address to calculate rewards for
     * @return reward The rewards of the stakeholder for previous periods.
     * @return stakeholder The new object containing stakeholder state
     */
    function calculateRewards(address stakeholderAddress) public view returns(uint reward, StakeHolder memory stakeholder) {

        stakeholder = stakeholders[stakeholderAddress];
        
        // Number of periods for which rewards will be paid
        // lastClaimed is included, currentPeriod not.
        uint n = (currentPeriod() > stakeholder.lastClaimed) ? 
            currentPeriod() - stakeholder.lastClaimed : 0;

        // If no stake is present or no time passed since last claim, 0 can be returned.
        if ((stakeholder.stakingBalance == 0 && stakeholder.newStake == 0 ) || n == 0){
            return (0, stakeholder);
        }

        uint s = stakeholder.stakingBalance;

        // Loop over all following intervals to calculate the rewards for following periods.
        for (uint p = stakeholder.lastClaimed; p < (maxRewardPeriod > maxNumberOfPeriods ? maxNumberOfPeriods : maxRewardPeriod); p++) {

            uint twsb = totalStakingBalance(p,1,false);

            // Update the new stake
            if(twsb > 0){
                s += s*(stakeholder.weight+1) * rewardPeriods[p].rewardPerPeriod / twsb;
            }

            if(stakeholder.newStake > 0){
                // After reward last period with old stake, add it to balance
                s += stakeholder.newStake;
                stakeholder.stakingBalance += stakeholder.newStake;
                stakeholder.newStake = 0;
            }            
        }

        // Final reward value
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
     * Unclaimed rewards CAN be rewarded as a failsafe if things would go wrong
     * @param amount the amount to withraw as owner
     */
    function withdrawRemainingFunds(uint amount) public onlyOwner{
        address sender = _msgSender();
        
        // Make sure the staked amounts rewards are never withdrawn
        if(amount > stakingToken.balanceOf(address(this)) - (totalStakingBalance(maxRewardPeriod,0,false))){
            amount = stakingToken.balanceOf(address(this)) - (totalStakingBalance(maxRewardPeriod,0,false));
        }

        stakingToken.transfer(sender, amount);
    }

    /**
     * Update the address used to verify signatures
     * @param value the new address to use for verification
     */
    function updateSignatureAddress(address value) public onlyOwner {
        signatureAddress = value; 
    }

    /**
     * @param value the new end date after which rewards will stop
     */
    function updateMaxNumberOfPeriods(uint value) public onlyOwner {
        maxNumberOfPeriods = value; 
        emit ConfigUpdate('Max number of periods', value);
    }

    /**
     * Updates the cooldown period.
     * @param value The new reward per period
     */
    function updateCoolDownPeriod(uint value) public onlyOwner{
        cooldown = value;
        emit ConfigUpdate('Cool down period', value);
    }

    /**
     * Updates the reward per period, starting instantly.
     * @param value The new reward per period
     */
    function updateRewardPerPeriod(uint value) public onlyOwner{
        handleNewPeriod();       
        rewardPeriods[maxRewardPeriod].rewardPerPeriod = value;
        emit ConfigUpdate('Reward per period', value);
    }

    /**
     * Calculates how many reward periods passed since the start.
     * @return period the current period
     */
    function currentPeriod() public view returns(uint period){
        period = (block.timestamp - startDate) / rewardPeriodDuration;
    }
 
}