const EnvoyStaking = artifacts.require("EnvoyStaking");
const TestToken = artifacts.require("TestToken");

const truffleAssert = require('truffle-assertions');
const truffleHelpers = require('openzeppelin-test-helpers');

const sigs = require('../utils/signatures.js')
const signerKey = sigs.signerKey
const signatureAddress = sigs.signatureAddress
const getSignature = sigs.getSignature
/*
Test different situations of rewards claiming
 - Claiming and adding to staking balance with compounded interest
 - Claiming and withdrawing rewards
 - Claiming in between compounding periods
 - Claiming with large stakes over long periods
 - Claiming with weighted stakeholders
*/
contract("Rewarding", function(accounts) {
    
    // Current time
    var startTime
    var currentTime
    
    // User addresses
    const ownerAddress = accounts[0];
    const staker = accounts[1];
    const weightedStaker = accounts[2]
    
    // Contracts to use
    var contract
    var token
       
    // Store initial contract values
    var contractBalance
    var interestDate
    var stakingBalance
    var interestPeriod
    var interestDecimals
    var interestRate
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
        interestPeriod = await contract.interestPeriod.call()
        interestDecimals = await contract.interestDecimals.call()
        interestRate = await contract.baseInterest.call()
        
        stake = web3.utils.toWei('50')

        // Should work: tested in ./2_test_staking.js
        await token.approve(contract.address, stake, {from: staker})
        await contract.stake(stake, true, {from: staker})

    }),

    it("Rewarding 1 compounding period and add to staking balance", async function() {

        // *** Move 1 compounding period forward and check 
    
        interestDate = (await contract.stakeholders.call(staker)).interestDate
        stakingBalance = (await contract.stakeholders.call(staker)).stakingBalance

        // Move in time
        await truffleHelpers.time.increase(truffleHelpers.time.duration.seconds((await contract.interestPeriod.call())));
        // Claim rewards on chain
        await contract.claimRewards(false, {from: staker})
        
        // Calculate the interest off-chain
        var newBalance = stakingBalance.div(interestDecimals).mul(interestRate.add(web3.utils.toBN(interestDecimals)))
        var newInterestDate = interestDate.add(await contract.interestPeriod.call())

        // Compare balance after claiming
        assert.equal(newBalance.toString(), (await contract.stakeholders.call(staker)).stakingBalance.toString(),
            "Staking reward not updated correctly")
            
        // Make sure interestdate was changed
        assert.equal(newInterestDate.toString(), (await contract.stakeholders.call(staker)).interestDate.toString(),
            "Interest date not updated correctly")
    }),
    it("Rewarding 1 compounding period with withdrawl", async function() {

        // *** Move 1 compounding period forward and check 
    
        interestDate = (await contract.stakeholders.call(staker)).interestDate
        stakerBalance = await token.balanceOf(staker)

        // Move in time
        await truffleHelpers.time.increase(truffleHelpers.time.duration.seconds((await contract.interestPeriod.call())));
        // Claim rewards on chain
        await contract.claimRewards(true, {from: staker})
        
        // Calculate the rewards off-chain
        var reward = stakingBalance.div(interestDecimals).mul(interestRate)
        var newBalance = stakerBalance.add(reward)
        var newInterestDate = interestDate.add(await contract.interestPeriod.call())

        // Compare balance after claiming
        assert.equal(newBalance.toString(), (await token.balanceOf(staker)).toString(),
            "Staking reward not updated correctly")
            
        // Make sure interestdate was changed
        assert.equal(newInterestDate.toString(), (await contract.stakeholders.call(staker)).interestDate.toString(),
            "Interest date not updated correctly")
    }),
    it("Reward in between compounding periods", async function() {

        //*** Move 1.5 compounding period. Verify that:
        // - 1 period was rewarded
        // - 0.5 period is left for next compounding period
        var oneAndHalfPeriod = (await contract.interestPeriod.call()).mul(web3.utils.toBN('3')).div(web3.utils.toBN('2'))

        interestDate = (await contract.stakeholders.call(staker)).interestDate
        stakingBalance = (await contract.stakeholders.call(staker)).stakingBalance

        // Move in time
        await truffleHelpers.time.increase(truffleHelpers.time.duration.seconds(oneAndHalfPeriod));
        
        // Claim rewards on chain
        await contract.claimRewards(false, {from: staker})
        
        // Calculate the interest off-chain
        var newBalance = stakingBalance.div(interestDecimals).mul(interestRate.add(web3.utils.toBN(interestDecimals)))
        var newInterestDate = interestDate.add(await contract.interestPeriod.call())

        // Compare balance after claiming
        assert.equal(newBalance.toString(), (await contract.stakeholders.call(staker)).stakingBalance.toString(),
            "Staking reward not updated correctly")

        assert.equal(newInterestDate.toString(), (await contract.stakeholders.call(staker)).interestDate.toString(),
            "Interest date not updated correctly")

        }),
        it("Reward one year", async function() {

        //*** Move 22.3 compounding periods (approx year). Verify that:
        // - 22 period were rewarded
        // - 3 period is left for next compounding period
        var twentyPointOnePeriod = (await contract.interestPeriod.call()).mul(web3.utils.toBN('22')).div(web3.utils.toBN('1'))

        interestDate = (await contract.stakeholders.call(staker)).interestDate
        stakingBalance = (await contract.stakeholders.call(staker)).stakingBalance

        // Move in time
        await truffleHelpers.time.increase(truffleHelpers.time.duration.seconds(twentyPointOnePeriod));
        
        // Claim rewards on chain
        await contract.claimRewards(false, {from: staker})
        
        // Calculate the interest off-chain
        var compoundedInterestRate = web3.utils.toBN(Math.round(((1 + interestRate.toNumber()/interestDecimals.toNumber()) ** 22) * interestDecimals.toNumber()))

        var newBalance = stakingBalance.div(interestDecimals).mul(compoundedInterestRate)
        var newInterestDate = interestDate.add((await contract.interestPeriod.call()).mul(web3.utils.toBN('22')))

        // Compare balance after claiming
        // 4 decimals are applied (1 ENV is lost a year with on 10.000 ENV staked)
        assert.equal(newBalance.div(web3.utils.toBN(10**8)).toString(),
            (await contract.stakeholders.call(staker)).stakingBalance.div(web3.utils.toBN(10**8)).toString(),
            "Staking reward not updated correctly")

        assert.equal(newInterestDate.toString(), (await contract.stakeholders.call(staker)).interestDate.toString(),
            "Interest date not updated correctly")      
    })

    it("Stress test rewarding: ", async () => {
        // *** Global test constants

        stake = web3.utils.toWei('1000000')

        // Claim test tokens
        await token.claim(staker, stake)
        await token.claim(contract.address, stake)

        // After approving, staking is possible
        await token.approve(contract.address, stake, {from: staker})
        await contract.stake(stake, true, {from: staker})


        interestDate = (await contract.stakeholders.call(staker)).interestDate
        stakingBalance = (await contract.stakeholders.call(staker)).stakingBalance

        //** */ Move 100 periods (4 years)
        var period = (await contract.interestPeriod.call()).mul(web3.utils.toBN('100'))
        await truffleHelpers.time.increase(truffleHelpers.time.duration.seconds(period));
        
        // Claim rewards on chain
        await contract.claimRewards(false, {from: staker})
        
        // Calculate the interest off-chain
        var compoundedInterestRate = web3.utils.toBN(Math.round(((1 + interestRate.toNumber()/interestDecimals.toNumber()) ** 100) * interestDecimals.toNumber()))

        var newBalance = stakingBalance.div(interestDecimals).mul(compoundedInterestRate)
        var newInterestDate = interestDate.add(period)

        // Compare balance after claiming
        assert.equal(newBalance.div(web3.utils.toBN(10**12)).toString(),
            (await contract.stakeholders.call(staker)).stakingBalance.div(web3.utils.toBN(10**12)).toString(),
            "Staking reward not updated correctly")

        assert.equal(newInterestDate.toString(), (await contract.stakeholders.call(staker)).interestDate.toString(),
            "Interest date not updated correctly")

    })
})