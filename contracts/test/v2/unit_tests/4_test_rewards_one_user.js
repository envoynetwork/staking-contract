const EnvoyStaking = artifacts.require("EnvoyStakingV2");
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
        }
        await token.claim(contract.address, web3.utils.toWei('1000000'))
        
        // Store initial contract values
        rewardPeriodDuration = await contract.rewardPeriodDuration.call()
        
        stake = web3.utils.toWei('50')
        
        // Should work: tested in ./2_test_staking.js
        await token.approve(contract.address, stake, {from: staker})
        await contract.stake(stake, {from: staker})
        contractBalance = await token.balanceOf(contract.address)

    }),

    it("Rewarding 1st reward period and add to staking balance", async function() {

        // *** Move 1 compounding period forward and check 

        stakingBalance = (await contract.stakeholders.call(staker)).stakingBalance
    
        // Move in time
        await truffleHelpers.time.increase(truffleHelpers.time.duration.seconds(rewardPeriodDuration.muln(2)));

        assert.equal(await contract.currentPeriod.call(), 2, "The period was not updated correctly")

        // Claim rewards on chain
        var stakerInfo = await contract.stakeholders.call(staker)

        await contract.claimRewards(false, {from: staker})
        
        // Calculate the rewards off-chain
        var updatedInitialRewardPeriod = await contract.rewardPeriods.call((await contract.getRewardPeriodsLength.call()).subn(2))
        var latestRewardPeriod = await contract.rewardPeriods.call((await contract.getRewardPeriodsLength.call()).subn(1))

        var newStakerInfo = await contract.stakeholders.call(staker)
        var newBalance = stakerInfo.newStake.add(latestRewardPeriod.rewardPerPeriod)

        // Compare balance after claiming
        assert.equal(newBalance.toString(), newStakerInfo.stakingBalance.toString(),
            "Staking reward not updated correctly")
            
        // Make sure last period definition and last claimed period are changed
        assert.equal(newStakerInfo.lastClaimed.toString(), (await contract.currentPeriod.call()).toString(),
            "Claim period not updated correctly")

        assert.equal(newStakerInfo.rewardPeriod.toString(), (await contract.getRewardPeriodsLength.call()).subn(1).toString(),
            "Reward period not updated correctly")    
        
        for(var i=0;i<3;i++){console.log(i, (await contract.rewardPeriods.call(i)).startDate,(await contract.rewardPeriods.call(i)).endDate)}
        // Make sure a new reward period was added (because the total stake was updated)
        assert.equal('3', (await contract.getRewardPeriodsLength.call()).toString(),
            "Reward period not added")
        
        // Make sure the reward periods were updated correctly
        assert.equal(updatedInitialRewardPeriod.endDate.toString(), '1',
            "End date for initial period not set")
        assert.equal(latestRewardPeriod.startDate.toString(), '2',
            "Start date for latest period not set correctly")
        
        assert.equal(latestRewardPeriod.totalStakingBalance.toString(), '958050000000000000000000',
            "Total stake for latest period not set correctly")
        assert.equal(latestRewardPeriod.totalWeightedStakingBalance.toString(), '958050000000000000000000',
            "Total weighted stake for latest period not set correctly")
        assert.equal(latestRewardPeriod.totalWeightedRewardsClaimed.toString(), '958000000000000000000000',
            "Total rewards for latest period not set correctly")
        
    }),
    it("Rewarding 1st reward period and withdraw the funds", async function() {

        // *** Move 1 compounding period forward and check 

        stakingBalance = (await contract.stakeholders.call(staker)).stakingBalance
        initialTokenBalance = await token.balanceOf(staker)

        // Move in time
        await truffleHelpers.time.increase(truffleHelpers.time.duration.seconds(rewardPeriodDuration.muln(2)));

        assert.equal(await contract.currentPeriod.call(), 2, "The period was not updated correctly")

        // Claim rewards on chain
        var stakerInfo = await contract.stakeholders.call(staker)

        await contract.claimRewards(true, {from: staker})
        
        // Calculate the rewards off-chain
        var updatedInitialRewardPeriod = await contract.rewardPeriods.call((await contract.getRewardPeriodsLength.call()).subn(2))
        var latestRewardPeriod = await contract.rewardPeriods.call((await contract.getRewardPeriodsLength.call()).subn(1))

        var newStakerInfo = await contract.stakeholders.call(staker)
        var newBalance = stakerInfo.newStake.add(latestRewardPeriod.rewardPerPeriod)

        // Compare balance after claiming
        assert.equal(stakerInfo.newStake.toString(), newStakerInfo.stakingBalance.toString(),
            "Staked amount not updated correctly")

        assert.equal(initialTokenBalance.add(latestRewardPeriod.rewardPerPeriod).toString(),
            (await token.balanceOf(staker)).toString(),
            "Funds not withdrawn correctly")
            
        // Make sure last period definition and last claimed period are changed
        assert.equal(newStakerInfo.lastClaimed.toString(), (await contract.currentPeriod.call()).toString(),
            "Claim period not updated correctly")

        assert.equal(newStakerInfo.rewardPeriod.toString(), (await contract.getRewardPeriodsLength.call()).subn(1).toString(),
            "Reward period not updated correctly")    
        
        for(var i=0;i<3;i++){console.log(i, (await contract.rewardPeriods.call(i)).startDate,(await contract.rewardPeriods.call(i)).endDate)}
        // Make sure a new reward period was added (because the total stake was updated)
        assert.equal('3', (await contract.getRewardPeriodsLength.call()).toString(),
            "Reward period not added")
        
        // Make sure the reward periods were updated correctly
        assert.equal(updatedInitialRewardPeriod.endDate.toString(), '1',
            "End date for initial period not set")
        assert.equal(latestRewardPeriod.startDate.toString(), '2',
            "Start date for latest period not set correctly")
        
        assert.equal(latestRewardPeriod.totalStakingBalance.toString(), '50000000000000000000',
            "Total stake for latest period not set correctly")
        assert.equal(latestRewardPeriod.totalWeightedStakingBalance.toString(), '50000000000000000000',
            "Total weighted stake for latest period not set correctly")
        assert.equal(latestRewardPeriod.totalWeightedRewardsClaimed.toString(), '958000000000000000000000',
            "Total rewards for latest period not set correctly")
        
    })
    // it("Rewarding 1 compounding period with withdrawl", async function() {

    //     // *** Move 1 compounding period forward and check 
    
    //     interestDate = (await contract.stakeholders.call(staker)).interestDate
    //     stakerBalance = await token.balanceOf(staker)

    //     // Move in time
    //     await truffleHelpers.time.increase(truffleHelpers.time.duration.seconds((await contract.interestPeriod.call())));
    //     // Claim rewards on chain
    //     await contract.claimRewards(true, {from: staker})
        
    //     // Calculate the rewards off-chain
    //     var reward = stakingBalance.div(interestDecimals).mul(interestRate)
    //     var newBalance = stakerBalance.add(reward)
    //     var newInterestDate = interestDate.add(await contract.interestPeriod.call())

    //     // Compare balance after claiming
    //     assert.equal(newBalance.toString(), (await token.balanceOf(staker)).toString(),
    //         "Staking reward not updated correctly")
            
    //     // Make sure interestdate was changed
    //     assert.equal(newInterestDate.toString(), (await contract.stakeholders.call(staker)).interestDate.toString(),
    //         "Interest date not updated correctly")
    // }),
    // it("Reward in between compounding periods", async function() {

    //     //*** Move 1.5 compounding period. Verify that:
    //     // - 1 period was rewarded
    //     // - 0.5 period is left for next compounding period
    //     var oneAndHalfPeriod = (await contract.interestPeriod.call()).mul(web3.utils.toBN('3')).div(web3.utils.toBN('2'))

    //     interestDate = (await contract.stakeholders.call(staker)).interestDate
    //     stakingBalance = (await contract.stakeholders.call(staker)).stakingBalance

    //     // Move in time
    //     await truffleHelpers.time.increase(truffleHelpers.time.duration.seconds(oneAndHalfPeriod));
        
    //     // Claim rewards on chain
    //     await contract.claimRewards(false, {from: staker})
        
    //     // Calculate the interest off-chain
    //     var newBalance = stakingBalance.div(interestDecimals).mul(interestRate.add(web3.utils.toBN(interestDecimals)))
    //     var newInterestDate = interestDate.add(await contract.interestPeriod.call())

    //     // Compare balance after claiming
    //     assert.equal(newBalance.toString(), (await contract.stakeholders.call(staker)).stakingBalance.toString(),
    //         "Staking reward not updated correctly")

    //     assert.equal(newInterestDate.toString(), (await contract.stakeholders.call(staker)).interestDate.toString(),
    //         "Interest date not updated correctly")

    //     }),
    //     it("Reward one year", async function() {

    //     //*** Move 22.3 compounding periods (approx year). Verify that:
    //     // - 22 period were rewarded
    //     // - 3 period is left for next compounding period
    //     var twentyPointOnePeriod = (await contract.interestPeriod.call()).mul(web3.utils.toBN('22')).div(web3.utils.toBN('1'))

    //     interestDate = (await contract.stakeholders.call(staker)).interestDate
    //     stakingBalance = (await contract.stakeholders.call(staker)).stakingBalance

    //     // Move in time
    //     await truffleHelpers.time.increase(truffleHelpers.time.duration.seconds(twentyPointOnePeriod));
        
    //     // Claim rewards on chain
    //     await contract.claimRewards(false, {from: staker})
        
    //     // Calculate the interest off-chain
    //     var compoundedInterestRate = web3.utils.toBN(Math.round(((1 + interestRate.toNumber()/interestDecimals.toNumber()) ** 22) * interestDecimals.toNumber()))

    //     var newBalance = stakingBalance.div(interestDecimals).mul(compoundedInterestRate)
    //     var newInterestDate = interestDate.add((await contract.interestPeriod.call()).mul(web3.utils.toBN('22')))

    //     // Compare balance after claiming
    //     // 4 decimals are applied (1 ENV is lost a year with on 10.000 ENV staked)
    //     assert.equal(newBalance.div(web3.utils.toBN(10**8)).toString(),
    //         (await contract.stakeholders.call(staker)).stakingBalance.div(web3.utils.toBN(10**8)).toString(),
    //         "Staking reward not updated correctly")

    //     assert.equal(newInterestDate.toString(), (await contract.stakeholders.call(staker)).interestDate.toString(),
    //         "Interest date not updated correctly")      
    // })

    // it("Stress test rewarding: ", async () => {
    //     // *** Global test constants

    //     stake = web3.utils.toWei('1000000')

    //     // Claim test tokens
    //     await token.claim(staker, stake)
    //     await token.claim(contract.address, stake)

    //     // After approving, staking is possible
    //     await token.approve(contract.address, stake, {from: staker})
    //     await contract.stake(stake, true, {from: staker})


    //     interestDate = (await contract.stakeholders.call(staker)).interestDate
    //     stakingBalance = (await contract.stakeholders.call(staker)).stakingBalance

    //     //** */ Move 100 periods (4 years)
    //     var period = (await contract.interestPeriod.call()).mul(web3.utils.toBN('100'))
    //     await truffleHelpers.time.increase(truffleHelpers.time.duration.seconds(period));
        
    //     // Claim rewards on chain
    //     await contract.claimRewards(false, {from: staker})
        
    //     // Calculate the interest off-chain
    //     var newBalance = stakingBalance
    //     for(i=0;i<100;i++){
    //         newBalance = newBalance.add(newBalance.mul(interestRate).div(interestDecimals))       
    //     }

    //     var newInterestDate = interestDate.add(period)

    //     // Compare balance after claiming
    //     assert.equal(newBalance.div(web3.utils.toBN(10**12)).toString(),
    //         (await contract.stakeholders.call(staker)).stakingBalance.div(web3.utils.toBN(10**12)).toString(),
    //         "Staking reward not updated correctly")

    //     assert.equal(newInterestDate.toString(), (await contract.stakeholders.call(staker)).interestDate.toString(),
    //         "Interest date not updated correctly")

    // }),

    // it("Reward with a delayed update in higher user weight", async function() {

    //     interestDate = (await contract.stakeholders.call(staker)).interestDate
    //     stakingBalance = (await contract.stakeholders.call(staker)).stakingBalance
        
    //     // Move one day
    //     await truffleHelpers.time.increase(truffleHelpers.time.duration.seconds('86400'));


    //     // Increase user weight
    //     var firstSignature = getSignature(contract, staker, 1).signature
    //     await contract.updateWeight(1, firstSignature, false, {from: staker})
        
    //     //** */ Move 2 periods: 1 for old weights, one for new
    //     var period = (await contract.interestPeriod.call()).mul(web3.utils.toBN('2'))
    //     await truffleHelpers.time.increase(truffleHelpers.time.duration.seconds(period));

    //     var newBalance = stakingBalance.add(stakingBalance.mul(interestRate).div(interestDecimals))
    //     var newInterestRate = interestRate.add((await contract.stakeholders.call(staker)).newWeight.mul(await contract.extraInterest.call()))
    //     newBalance = newBalance.add(newBalance.mul(newInterestRate).div(interestDecimals))

    //     // Claim rewards on chain
    //     await contract.claimRewards(false, {from: staker})
        
    //     // Compare balance after claiming
    //     assert.equal(newBalance.toString(), (await contract.stakeholders.call(staker)).stakingBalance.toString(),
    //         "Staking reward not updated correctly")

    //     assert.equal(interestDate.add(period).toString(), (await contract.stakeholders.call(staker)).interestDate.toString(),
    //         "Interest date not updated correctly")

    // }),
    // it("Reward with an immediate update in higher user weight", async function() {

    //     interestDate = (await contract.stakeholders.call(staker)).interestDate
    //     stakingBalance = (await contract.stakeholders.call(staker)).stakingBalance
        
    //     // Move one day
    //     await truffleHelpers.time.increase(truffleHelpers.time.duration.seconds('86400'));


    //     // Increase user weight
    //     var firstSignature = getSignature(contract, staker, 1).signature
    //     await contract.updateWeight(1, firstSignature, true, {from: staker})
        
    //     //** */ Move 1 periods, update should be immediate
    //     var period = await contract.interestPeriod.call()
    //     await truffleHelpers.time.increase(truffleHelpers.time.duration.seconds(period));

    //     var newInterestRate = interestRate.add((await contract.stakeholders.call(staker)).weight.mul(await contract.extraInterest.call()))
    //     var newBalance = stakingBalance.add(stakingBalance.mul(newInterestRate).div(interestDecimals))


    //     // Claim rewards on chain
    //     await contract.claimRewards(false, {from: staker})
        
    //     // Compare balance after claiming
    //     assert.equal(newBalance.toString(), (await contract.stakeholders.call(staker)).stakingBalance.toString(),
    //         "Staking reward not updated correctly")

    //     // The new interest day is the initial day, plus the one day we moved at the start, plus one period
    //     assert.equal(interestDate.add(web3.utils.toBN('86400')).add(period).toString(), (await contract.stakeholders.call(staker)).interestDate.toString(),
    //         "Interest date not updated correctly")

    // })    

})