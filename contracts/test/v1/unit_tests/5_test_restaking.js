const EnvoyStaking = artifacts.require("EnvoyStakingV1");
const TestToken = artifacts.require("TestToken");

const truffleAssert = require('truffle-assertions');
const truffleHelpers = require('openzeppelin-test-helpers');


const sigs = require('../utils/signatures.js')
const signerKey = sigs.signerKey
const signatureAddress = sigs.signatureAddress
const getSignature = sigs.getSignature

contract("Re-staking", function(accounts) {
    
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
    var interestPeriod
    var interestDecimals
    var interestRate
    var stake
    
    var newStake
    var stakingBalance
    var totalStake
    var initialInterestDate

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
        }
        await token.claim(contract.address, web3.utils.toWei('1000'))
        
        // Store initial contract values
        interestPeriod = await contract.interestPeriod.call()
        interestDecimals = await contract.interestDecimals.call()
        interestRate = await contract.baseInterest.call()
        
        stake = web3.utils.toWei('50')
        
        // Following initial staking should work, tested in ./2_test_staking.js
        // After approving, staking is possible
        await token.approve(contract.address, web3.utils.toWei('100'), {from: staker})
        await contract.stake(stake, true, {from: staker})

        
        newStake = web3.utils.toBN(web3.utils.toWei('10'))
        contractBalance = await token.balanceOf(contract.address)
        stakingBalance = (await contract.stakeholders.call(staker)).stakingBalance
        totalStake = await contract.totalStake.call()
        initialInterestDate = (await contract.stakeholders.call(staker)).interestDate
    }),
    it("Restaking new funds instantly", async function() {

        // Move one day
        await truffleHelpers.time.increase(truffleHelpers.time.duration.seconds('86400'));

        // Staker should be able to instantly update the stake with the correct sig
        await contract.stake(newStake, true, {from: staker})

        // Check if everything was updated correctly
        assert.equal(stakingBalance.add(newStake).toString(), (await contract.stakeholders.call(staker)).stakingBalance.toString())
        assert.equal(totalStake.add(newStake).toString(), (await contract.totalStake.call()).toString())
        assert.equal((await truffleHelpers.time.latest()).toString(), (await contract.stakeholders.call(staker)).interestDate)
        assert.equal(initialInterestDate.toNumber() < (await contract.stakeholders.call(staker)).interestDate.toNumber(), true)

    }),
    it("Restake new funds with delay", async function() {

        // Move one day
        await truffleHelpers.time.increase(truffleHelpers.time.duration.seconds('86400'));

        // Staker should be able update the stake with delay
        await contract.stake(newStake, false, {from: staker})

        // Check if everything was updated correctly in this period
        assert.equal(stakingBalance.toString(), (await contract.stakeholders.call(staker)).stakingBalance.toString())
        assert.equal(newStake, (await contract.stakeholders.call(staker)).newStake.toString())       
        assert.equal(totalStake.add(newStake), (await contract.totalStake.call()).toString())
        assert.equal(initialInterestDate.toString(), (await contract.stakeholders.call(staker)).interestDate.toString(), true)

        // Move to next period and trigger changes
        await truffleHelpers.time.increase(truffleHelpers.time.duration.seconds((await contract.interestPeriod.call())));
        await contract.claimRewards(false, {from: staker})

        // Check if everything was updated correctly after the end of the period
        var newBalance = stakingBalance.mul(interestRate.add(web3.utils.toBN(interestDecimals))).div(interestDecimals).add(newStake)
        var newTotalStake = totalStake.add(newBalance).sub(stakingBalance)

        assert.equal(newBalance.toString(), (await contract.stakeholders.call(staker)).stakingBalance.toString())
        assert.equal('0', (await contract.stakeholders.call(staker)).newStake.toString())
        assert.equal(newTotalStake.toString(), (await contract.totalStake.call()).toString())
        assert.equal(initialInterestDate.add((await contract.interestPeriod.call())).toString(),
            (await contract.stakeholders.call(staker)).interestDate.toString())

    }),

    it("Restake speed up delay by triggering immediate call", async function() {

        // Move one day
        await truffleHelpers.time.increase(truffleHelpers.time.duration.seconds('86400'));


        // Staker should be able to update the stake with delay
        await contract.stake(newStake, false, {from: staker})

        // Move second day
        await truffleHelpers.time.increase(truffleHelpers.time.duration.seconds('86400'));

        // Staker should be able to immediately update the stake again, taking the previous restaking into account
        await contract.stake(newStake, true, {from: staker})

        // Check if everything was updated correctly when calling both functions
        assert.equal(stakingBalance.add(newStake).add(newStake).toString(), (await contract.stakeholders.call(staker)).stakingBalance.toString())
        assert.equal(totalStake.add(newStake).add(newStake).toString(), (await contract.totalStake.call()).toString())
        assert.equal((await truffleHelpers.time.latest()).toString(), (await contract.stakeholders.call(staker)).interestDate)

    })

})