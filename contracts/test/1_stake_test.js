const EnvoyStaking = artifacts.require("EnvoyStaking");
const TestToken = artifacts.require("TestToken");

const truffleAssert = require('truffle-assertions');
const truffleHelpers = require('openzeppelin-test-helpers');


const sigs = require('./signatures.js')
const signerKey = sigs.signerKey
const signatureAddress = sigs.signatureAddress
const getSignature = sigs.getSignature

contract("Test staking", function(accounts) {
    
    
    it("Test staking", async () => {
        // *** Global test constants

        var currentTime = await truffleHelpers.time.latest();

        const ownerAddress = accounts[0];
        const staker = accounts[1];
        const staker2 = accounts[2];

        const contract = await EnvoyStaking.deployed();
        const token = await TestToken.deployed(); 
        const contractBalance = await token.balanceOf(contract.address)

        var stake = web3.utils.toWei('50')

        // Tokens need to be approved before staking is possible
        await truffleAssert.reverts(contract.stake(stake, true, {from: staker}),
            "The staking contract is not approved to stake this amount");

        // After approving, staking is possible
        await token.approve(contract.address, stake, {from: staker})
        await contract.stake(stake, true, {from: staker})

        // Check if the tokenbalance was updated correctly for the staking contract
        assert.equal((await token.balanceOf(contract.address)).toString(), contractBalance.add(web3.utils.toBN(stake)).toString())

        // Check if the staking balance of the stakeholder was updated
        assert.equal((await contract.stakeholders.call(staker)).stakingBalance.toString(), stake)

        // *** Move 1 compounding period forward and check 
    
        // Store initial values

        var interestDate = (await contract.stakeholders.call(staker)).interestDate
        var stakingBalance = (await contract.stakeholders.call(staker)).stakingBalance
        var interestPeriod = await contract.interestPeriod.call()
        var interestDecimals = await contract.interestDecimals.call()
        var interestRate = await contract.baseInterest.call()

        // Move in time
        currentTime = await truffleHelpers.time.latest();
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


        //*** Move 1.5 compounding period. Verify that:
        // - 1 period was rewarded
        // - 0.5 period is left for next compounding period
        var oneAndHalfPeriod = (await contract.interestPeriod.call()).mul(web3.utils.toBN('3')).div(web3.utils.toBN('2'))

        interestDate = (await contract.stakeholders.call(staker)).interestDate
        stakingBalance = (await contract.stakeholders.call(staker)).stakingBalance

        // Move in time
        currentTime = await truffleHelpers.time.latest();
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


        //*** Move 22.3 compounding periods (approx year). Verify that:
        // - 22 period were rewarded
        // - 3 period is left for next compounding period
        var twentyPointOnePeriod = (await contract.interestPeriod.call()).mul(web3.utils.toBN('22')).div(web3.utils.toBN('1'))

        interestDate = (await contract.stakeholders.call(staker)).interestDate
        stakingBalance = (await contract.stakeholders.call(staker)).stakingBalance

        // Move in time
        currentTime = await truffleHelpers.time.latest();
        await truffleHelpers.time.increase(truffleHelpers.time.duration.seconds(twentyPointOnePeriod));
        
        // Claim rewards on chain
        await contract.claimRewards(false, {from: staker})
        
        // Calculate the interest off-chain
        var compoundedInterestRate = web3.utils.toBN(Math.round(((1 + interestRate.toNumber()/interestDecimals.toNumber()) ** 22) * interestDecimals.toNumber()))
        console.log(compoundedInterestRate.toString())

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
})