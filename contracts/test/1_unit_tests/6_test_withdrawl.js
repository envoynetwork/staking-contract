const EnvoyStaking = artifacts.require("EnvoyStaking");
const TestToken = artifacts.require("TestToken");

const truffleAssert = require('truffle-assertions');
const truffleHelpers = require('openzeppelin-test-helpers');


const sigs = require('../utils/signatures.js')
const signerKey = sigs.signerKey
const signatureAddress = sigs.signatureAddress
const getSignature = sigs.getSignature

contract("Withdraw funds", function(accounts) {
    
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
        
        contractBalance = await token.balanceOf(contract.address)
        stakingBalance = (await contract.stakeholders.call(staker)).stakingBalance
        totalStake = await contract.totalStake.call()
        initialInterestDate = (await contract.stakeholders.call(staker)).interestDate
    }),

    it("No withdrawls before cooldown", async function() {

        // Move one day
        await truffleHelpers.time.increase(truffleHelpers.time.duration.seconds('86400'));

        // Withdrawing is not possible yet
        await truffleAssert.reverts(contract.withdrawFunds(stakingBalance, {from: staker}))

        // Move beyond cooldown period
        await truffleHelpers.time.increase(truffleHelpers.time.duration.seconds((await contract.cooldown.call()).toString()));

        await contract.withdrawFunds(stakingBalance, {from: staker})

        assert.equal('0', (await contract.stakeholders.call(staker)).stakingBalance.toString())
        assert.equal('0', (await contract.stakeholders.call(staker)).startDate.toString())
        assert.equal('0', (await contract.totalStake.call()).toString())

    }),

    it("Wait 10 reward periods, withdraw less than stake and rewards", async function() {

        // Move 10 periods
        var period = interestPeriod.mul(web3.utils.toBN('10'))
        var startDate = (await contract.stakeholders.call(staker)).startDate

        await truffleHelpers.time.increase(truffleHelpers.time.duration.seconds(period));

        var withdrawAmount = stakingBalance.div(web3.utils.toBN('2'))

        var initialTokenBalance = await token.balanceOf(staker)
        await contract.withdrawFunds(withdrawAmount, {from: staker})
        
        
        // Calculate the rewards off-chain
        var newBalance = stakingBalance
        for(i=0;i<10;i++){
            newBalance = newBalance.add(newBalance.mul(interestRate).div(interestDecimals))       
        }

        // Stakeholder's staked balance and contract's token balance should drop with the withrawn amount,
        // the token balance should go up with the same amount.
        // The interest date should be updated, start date should stay the same.
        assert.equal(contractBalance.sub(withdrawAmount).toString(), (await token.balanceOf(contract.address)).toString(),
            "Contract's token balance was not updated correctly")
        assert.equal(newBalance.sub(withdrawAmount).toString(), (await contract.stakeholders.call(staker)).stakingBalance.toString(),
            "Stakeholder's staked balance was not updated correctly")
        assert.equal(initialTokenBalance.add(withdrawAmount).toString(), (await token.balanceOf(staker)).toString(),
            "Stakeholder's token balance was not updated correctly")
        assert.equal(await truffleHelpers.time.latest(), (await contract.stakeholders.call(staker)).interestDate.toString(),
            "Stakeholder's interest date was not updated correctly")
        assert.equal(startDate, (await contract.stakeholders.call(staker)).startDate.toString(),
            "Stakeholder's start date should not be updated.")

    })

    it("Wait 10 reward periods, withdraw more than stake and rewards", async function() {

        // Move 10 periods
        var period = interestPeriod.mul(web3.utils.toBN('10'))

        await truffleHelpers.time.increase(truffleHelpers.time.duration.seconds(period));
        
        // Calculate the rewards off-chain
        var newBalance = stakingBalance
        for(i=0;i<10;i++){
            newBalance = newBalance.add(newBalance.mul(interestRate).div(interestDecimals))       
        }
        
        // Withdraw amount exceeding stake+rewards
        var initialTokenBalance = await token.balanceOf(staker)
        await contract.withdrawFunds(newBalance.mul(web3.utils.toBN('10')), {from: staker})

        // Stakeholder's staked balance and should be 0,
        // the stakeholder token balance should go up with the staked amount + rewards,
        // the contract token balance should go down with the same amount..
        // The interest date should not be updated, start date should be set to 0.
        assert.equal(contractBalance.sub(newBalance).toString(), (await token.balanceOf(contract.address)).toString(),
            "Contract's token balance was not updated correctly")
        assert.equal('0', (await contract.stakeholders.call(staker)).stakingBalance.toString(),
            "Stakeholder's staked balance was not updated correctly")
        assert.equal(initialTokenBalance.add(newBalance).toString(), (await token.balanceOf(staker)).toString(),
            "Stakeholder's token balance was not updated correctly")
        assert.equal(await truffleHelpers.time.latest(), (await contract.stakeholders.call(staker)).interestDate.toString(),
            "Stakeholder's interest date was not updated correctly")
        assert.equal('0', (await contract.stakeholders.call(staker)).startDate.toString(),
            "Stakeholder's start date should not be updated.")

    }),

    it("Withdraw funds as owner", async function() {

        // Move 10 periods
        var period = interestPeriod.mul(web3.utils.toBN('10'))        
        await truffleHelpers.time.increase(truffleHelpers.time.duration.seconds(period));
        
        await contract.claimRewards(false, {from: staker})
        
        var initialOwnerBalance = await token.balanceOf(ownerAddress)
        var fundsNotStaked = contractBalance.sub(await contract.totalStake.call())

        // Only owner can withdraw funds that are not staked from the contract
        await truffleAssert.reverts(contract.withdrawRemainingFunds(fundsNotStaked, {from: staker}))

        // Owner can withdraw all funds that are not staked
        // Try to withdraw 1 token more than possible, the amount should be capped.
        await contract.withdrawRemainingFunds(fundsNotStaked.add(web3.utils.toBN('1')).toString(), {from: ownerAddress})

        // TokenBalance of the contract should have gone down
        assert.equal(contractBalance.sub(fundsNotStaked).toString(), (await token.balanceOf(contract.address)).toString())
        // TokenBalance of the owner should have gone up
        assert.equal(initialOwnerBalance.add(fundsNotStaked).toString(), (await token.balanceOf(ownerAddress)).toString())


    })

})