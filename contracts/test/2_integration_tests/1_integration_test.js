const EnvoyStaking = artifacts.require("EnvoyStaking");
const TestToken = artifacts.require("TestToken");

const truffleAssert = require('truffle-assertions');
const truffleHelpers = require('openzeppelin-test-helpers');


const sigs = require('../utils/signatures.js');
const { assertion } = require('openzeppelin-test-helpers/src/expectRevert');
const { web3 } = require('openzeppelin-test-helpers/src/setup');
const signerKey = sigs.signerKey
const signatureAddress = sigs.signatureAddress
const getSignature = sigs.getSignature

contract("Integration test", function(accounts) {

    // User addresses
    const ownerAddress = accounts[0];

    var token
    var contract
    
    // Keep staker status off-chain
    var Staker = {
        tokenBalance: web3.utils.toBN('0'),
        stakingBalance: web3.utils.toBN('0'),
        weight: web3.utils.toBN('0'),
        startDate: web3.utils.toBN('0'),
        interestDate: web3.utils.toBN('0')
    }
    
    var stakers = []

    function totalStake(){
        var sum = web3.utils.toBN('0')
        for(i in stakers){
            sum = sum.add(stakers[i].stakingBalance)
        }
        return sum
    }
    
    // Store initial contract values
    var interestPeriod
    var interestDecimals
    var baseInterestRate
    var extraInterestRate

    var contractBalance
    
    before(async function(){
    
        token = await TestToken.new();
        contract = await EnvoyStaking.new(signatureAddress, token.address);
        
        // Store initial contract values
        interestPeriod = await contract.interestPeriod.call()
        interestDecimals = await contract.interestDecimals.call()
        baseInterestRate = await contract.baseInterest.call()
        extraInterestRate = await contract.extraInterest.call()

        // Instantiate stakers
        var amount = web3.utils.toBN(web3.utils.toWei('100'))
        for(account in accounts){
            stakers[account] = Object.assign({}, Staker)
            await token.claim(accounts[account], amount)
            await token.approve(contract.address, amount, {from: accounts[account]})
            stakers[account].tokenBalance = amount
        }

        contractBalance = web3.utils.toBN(web3.utils.toWei('1000'))
        await token.claim(contract.address, contractBalance)
        
    }),

     beforeEach(async function() {
            // Move one day in time
        await truffleHelpers.time.increase(truffleHelpers.time.duration.seconds('86400'));
    }),
    
    it("Day 1: staking of first 5 stakers", async function(){
        for(i=1;i<6; i++){
            var amount = web3.utils.toBN(web3.utils.toWei((10*i).toString()))
            await contract.stake(amount, true, {from: accounts[i]})
            stakers[i].stakingBalance =  stakers[i].stakingBalance.add(amount)
            stakers[i].tokenBalance = stakers[i].tokenBalance.sub(amount)
            stakers[i].startDate = await truffleHelpers.time.latest()
            stakers[i].interestDate = await truffleHelpers.time.latest()
            contractBalance=contractBalance.add(amount)
        }
        
        assert.equal((await token.balanceOf(contract.address)).toString(), web3.utils.toWei('1150'))
        assert.equal((await contract.totalStake()).toString(), web3.utils.toWei('150'))
    }),

    it("Day 2: staking of next 4 stakers. First staker cannot withdraw yet due to cooldown", async function(){
        
        for(i=6;i<10; i++){
            var amount = web3.utils.toBN(web3.utils.toWei((10*(i-5)).toString()))
            await contract.stake(amount, true, {from: accounts[i]})
            stakers[i].stakingBalance =  stakers[i].stakingBalance.add(amount)
            stakers[i].tokenBalance = stakers[i].tokenBalance.sub(amount)
            stakers[i].startDate = await truffleHelpers.time.latest()
            stakers[i].interestDate = await truffleHelpers.time.latest()
            contractBalance=contractBalance.add(amount)

        }

        assert.equal((await token.balanceOf(contract.address)).toString(), web3.utils.toWei('1250'))
        assert.equal((await contract.totalStake()).toString(), web3.utils.toWei('250'))

        await truffleAssert.reverts(contract.withdrawFunds(web3.utils.toWei('10'), {from: accounts[1]}))

    }),

    it("Day 4: First staker can withdraw", async function(){
        await truffleHelpers.time.increase(truffleHelpers.time.duration.seconds('86400'));
        await contract.withdrawFunds(web3.utils.toWei('10'), {from: accounts[1]})
        contractBalance=contractBalance.sub(web3.utils.toBN(web3.utils.toWei('10')))
        stakers[1].stakingBalance = stakers[1].stakingBalance.sub(web3.utils.toBN(web3.utils.toWei('10')))


        assert.equal('0', (await contract.stakeholders.call(accounts[1])).stakingBalance.toString())
        assert.equal('0', (await contract.stakeholders.call(accounts[1])).startDate.toString())
        assert.equal((await token.balanceOf(contract.address)).toString(), contractBalance.toString())
        assert.equal(web3.utils.toWei('240'), (await contract.totalStake.call()).toString())
    }),

    it("Day 5: staker 2 and 3 can update their weight", async function(){

        var firstSignature = getSignature(contract, accounts[2], 1).signature
        var secondSignature = getSignature(contract, accounts[3], 1).signature

        // Staker should be able to update the weigth with the correct sig
        // Staker 2 goes for instant update, 3 for delayed
        await contract.updateWeight(1, firstSignature, true, {from: accounts[2]})
        await contract.updateWeight(1, secondSignature, false, {from: accounts[3]})

        stakers[2].interestDate =  await truffleHelpers.time.latest()
        stakers[2].weight = web3.utils.toBN('1')
        stakers[3].weight = web3.utils.toBN('1')

    }),

    it("Day 16: staker 4 claims and withdraws rewards after 1 period", async function(){
        await truffleHelpers.time.increase(truffleHelpers.time.duration.seconds((10*86400).toString()));

        var staker = stakers[4]
        
        await contract.claimRewards(true, {from: accounts[4]})
        var reward = staker.stakingBalance.mul(baseInterestRate.add(extraInterestRate.mul(staker.weight))).div(interestDecimals)

        staker.tokenBalance = staker.tokenBalance.add(reward)
        staker.interestDate = staker.interestDate.add(interestPeriod)
        
        // Check user balances
        assert.equal(staker.tokenBalance.toString(), (await token.balanceOf(accounts[4])).toString())
        assert.equal(staker.stakingBalance.toString(), (await contract.stakeholders.call(accounts[4])).stakingBalance.toString())
        assert.equal(staker.interestDate.toString(), (await contract.stakeholders.call(accounts[4])).interestDate.toString())
        
        // Check contract balance
        assert.equal((await token.balanceOf(contract.address)).add(reward).toString(), contractBalance.toString())
        assert.equal((await contract.totalStake()).toString(), totalStake().toString())

    }),

    it("Day 35: staker 2 and 3 claim rewards after 2 periods with new weight", async function(){
        await truffleHelpers.time.increase(truffleHelpers.time.duration.seconds((18*86400).toString()));

        // STAKER 2 - used an instant update
        var staker = stakers[2]
        
        await contract.claimRewards(false, {from: accounts[2]})

        // Add reward for periods with weight 1
        var reward1 = staker.stakingBalance.mul(baseInterestRate.add(extraInterestRate.mul(staker.weight))).div(interestDecimals)
        var tempStake = staker.stakingBalance.add(reward1)
        var reward2 = tempStake.mul(baseInterestRate.add(extraInterestRate.mul(staker.weight))).div(interestDecimals)
        var reward = reward1.add(reward2)

        staker.stakingBalance = staker.stakingBalance.add(reward)
        staker.interestDate = staker.interestDate.add(interestPeriod).add(interestPeriod)
        
        // Check user balances
        assert.equal(staker.stakingBalance.toString(), (await contract.stakeholders.call(accounts[2])).stakingBalance.toString())
        assert.equal(staker.interestDate.toString(), (await contract.stakeholders.call(accounts[2])).interestDate.toString())
        
        // Check contract balance
        assert.equal((await contract.totalStake()).toString(), totalStake().toString())

        // STAKER 3 - used a delayed update
        var staker = stakers[3]
        
        await contract.claimRewards(false, {from: accounts[3]})

        // Add reward for periods with weigth 0 and weight 1
        reward1 = staker.stakingBalance.mul(baseInterestRate).div(interestDecimals)
        tempStake = staker.stakingBalance.add(reward1)
        reward2 = tempStake.mul(baseInterestRate.add(extraInterestRate.mul(staker.weight))).div(interestDecimals)
        reward = reward1.add(reward2)

        staker.stakingBalance = staker.stakingBalance.add(reward)
        staker.interestDate = staker.interestDate.add(interestPeriod).add(interestPeriod)
        
        // Check user balances
        assert.equal(staker.stakingBalance.toString(), (await contract.stakeholders.call(accounts[3])).stakingBalance.toString())
        assert.equal(staker.interestDate.toString(), (await contract.stakeholders.call(accounts[3])).interestDate.toString())
        
        // Check contract balance
        assert.equal((await contract.totalStake()).toString(), totalStake().toString())
    })

})