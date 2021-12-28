const EnvoyStaking = artifacts.require("EnvoyStakingV2");
const TestToken = artifacts.require("TestToken");

const truffleAssert = require('truffle-assertions');
const truffleHelpers = require('openzeppelin-test-helpers');


const sigs = require('../utils/signatures.js')
const signerKey = sigs.signerKey
const signatureAddress = sigs.signatureAddress
const getSignature = sigs.getSignature

contract("Staking", function(accounts) {
    
    // Current time
    var startTime
    var currentTime
    
    // User addresses
    const ownerAddress = accounts[0];
    const staker = accounts[1];
    const staker2 = accounts[2]
    
    // Contracts to use
    var contract
    var token
       
    // Store initial contract values
    var contractBalance
    var rewardPeriodDuration
    var stake
    

    before(async function() {
        // Set start time        
        startTime = await truffleHelpers.time.latest();
    }),

    beforeEach(async function() {
        // Reset time        
        currentTime = startTime;
        
        // Make sure contracts are deployed
        token = await TestToken.new();
        contract = await EnvoyStaking.new(signatureAddress, token.address);
        
        // Make sure the contract and accounts have funds
        for(account in accounts){
            await token.claim(accounts[account], web3.utils.toWei('100'))
            await token.claim(contract.address, web3.utils.toWei('1000'))
        }
        
        // Store initial contract values
        contractBalance = await token.balanceOf(contract.address)
        rewardPeriodDuration = await contract.rewardPeriodDuration.call()
        
        stake = web3.utils.toWei('50')
    }),
    
    it("Staking new funds", async function() {

        // Tokens need to be approved before staking is possible
        await truffleAssert.reverts(contract.stake(stake, {from: staker}),
            "The staking contract is not approved to stake this amount");

        var stakerBalance = await token.balanceOf(staker)
        var latestRewardPeriodsIndex = await contract.getRewardPeriodsLength()
        var totalNewStake = (await contract.rewardPeriods.call(latestRewardPeriodsIndex.toNumber()-1)).totalNewStake
        var totalNewWeightedStake = (await contract.rewardPeriods.call(latestRewardPeriodsIndex.toNumber()-1)).totalNewWeightedStake
    
        // After approving, staking is possible
        await token.approve(contract.address, stake, {from: staker})
        await contract.stake(stake, {from: staker})

        // Check if the tokenbalance was updated correctly for the staking contract
        assert.equal((await token.balanceOf(contract.address)).toString(), contractBalance.add(web3.utils.toBN(stake)).toString())

        // Check if the tokenbalance was updated correctly for the stakeholder
        assert.equal((await token.balanceOf(staker)).toString(), stakerBalance.sub(web3.utils.toBN(stake)).toString())

        // Check if the staking balance of the stakeholder was updated
        assert.equal((await contract.stakeholders.call(staker)).newStake.toString(), stake)

        // Check if the start date of the stakeholder was updated
        assert.equal((await contract.stakeholders.call(staker)).startDate.toString(), await truffleHelpers.time.latest())
        assert.equal((await contract.stakeholders.call(staker)).lastClaimed.toString(), (await contract.currentPeriod()).addn(1))
        assert.equal((await contract.stakeholders.call(staker)).rewardPeriod.toString(), latestRewardPeriodsIndex.subn(1).toString())


        // Check if the total staked amount of the current period was updated correctly
        assert.equal(totalNewStake.add(web3.utils.toBN(stake)), (await contract.rewardPeriods.call(latestRewardPeriodsIndex.toNumber()-1)).totalNewStake.toString())
        assert.equal(totalNewWeightedStake.add(web3.utils.toBN(stake)), (await contract.rewardPeriods.call(latestRewardPeriodsIndex.toNumber()-1)).totalNewWeightedStake.toString())

    })

})