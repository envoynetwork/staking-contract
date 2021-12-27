const EnvoyStaking = artifacts.require("EnvoyStakingV2");
const TestToken = artifacts.require("TestToken");

const truffleAssert = require('truffle-assertions');
const truffleHelpers = require('openzeppelin-test-helpers');


const sigs = require('../utils/signatures.js')
const signerKey = sigs.signerKey
const signatureAddress = sigs.signatureAddress
const getSignature = sigs.getSignature

/*
Make sure stakeholders can update their level if they are allowed.
They should have a correct signature for the correct contract and weight specified.
Other users cannot use the signature.
Users have the choice between instant changes and changes that are applied next period.
*/
contract("Weighted stakeholders", function(accounts) {
    
    // Current time
    var startTime
    var currentTime
    
    // User addresses
    const ownerAddress = accounts[0];
    const staker = accounts[1];
    const notTheStaker = accounts[2]
    
    // Contracts to use
    var contract
    var token

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

        // Should work, tested in ./1_test_admin_updates.js
        await contract.updateSignatureAddress(signatureAddress, {from: ownerAddress})
        
        // Make sure the contract and accounts have funds
        for(account in accounts){
            await token.claim(accounts[account], web3.utils.toWei('100'))
        }
        await token.claim(contract.address, web3.utils.toWei('1000'))

        var stake = web3.utils.toWei('50')

        // Should work: tested in ./2_test_staking.js
        await token.approve(contract.address, stake, {from: staker})
        await contract.stake(stake, {from: staker})

    }),
    
    it("Increase weight instantly", async function() {
        
        await truffleHelpers.time.increase(truffleHelpers.time.duration.seconds('86400'));

        var latestRewardPeriodsIndex = await contract.getRewardPeriodsLength()
        var totalWeightedStakingBalance = (await contract.rewardPeriods.call(latestRewardPeriodsIndex.toNumber()-1)).totalWeightedStakingBalance
        var totalNewWeightedStake = (await contract.rewardPeriods.call(latestRewardPeriodsIndex.toNumber()-1)).totalNewWeightedStake

        // Get signature for level 1
        var firstSignature = getSignature(contract, staker, 1).signature

        // Only staker can use signature
        await truffleAssert.reverts(contract.updateWeight(1, firstSignature, {from: notTheStaker}),
            "Signature of the input was not signed by 'signatureAddress'");

        // Staker should not be able to select a wrong weight
        await truffleAssert.reverts(contract.updateWeight(2, firstSignature, {from: staker}),
            "Signature of the input was not signed by 'signatureAddress'");
        
        // Staker should be able to instantly update the weigth with the correct sig
        await contract.updateWeight(1, firstSignature, {from: staker})

        // Check if everything was updated correctly
        assert.equal('1', (await contract.stakeholders.call(staker)).weight.toString())
        assert.equal('1', (await contract.maxWeight.call()).toString())
        
        // Make sure the increased weight is taken into account for total weighted stake
        var stake = web3.utils.toWei('50')

        assert.equal(totalNewWeightedStake.add(web3.utils.toBN(stake)).toString(), (await contract.rewardPeriods.call(latestRewardPeriodsIndex.toNumber()-1)).totalNewWeightedStake.toString())

    })

})