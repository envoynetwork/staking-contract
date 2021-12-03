const EnvoyStaking = artifacts.require("EnvoyStaking");
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
        interestDate = (await contract.stakeholders.call(staker)).interestDate
        stakingBalance = (await contract.stakeholders.call(staker)).stakingBalance
        interestPeriod = await contract.interestPeriod.call()
        interestDecimals = await contract.interestDecimals.call()
        interestRate = await contract.baseInterest.call()
        
        stake = web3.utils.toWei('50')
    }),
    
    it("Staking new funds", async function() {

        // Tokens need to be approved before staking is possible
        await truffleAssert.reverts(contract.stake(stake, true, {from: staker}),
            "The staking contract is not approved to stake this amount");

        var stakerBalance = await token.balanceOf(staker)
    
        // After approving, staking is possible
        await token.approve(contract.address, stake, {from: staker})
        await contract.stake(stake, true, {from: staker})

        // Check if the tokenbalance was updated correctly for the staking contract
        assert.equal((await token.balanceOf(contract.address)).toString(), contractBalance.add(web3.utils.toBN(stake)).toString())

        // Check if the tokenbalance was updated correctly for the staking contract
        assert.equal((await token.balanceOf(staker)).toString(), stakerBalance.sub(web3.utils.toBN(stake)).toString())

        // Check if the staking balance of the stakeholder was updated
        assert.equal((await contract.stakeholders.call(staker)).stakingBalance.toString(), stake)

        // Check if the start date of the stakeholder was updated
        assert.equal((await contract.stakeholders.call(staker)).startDate.toString(), await truffleHelpers.time.latest())


    })

})