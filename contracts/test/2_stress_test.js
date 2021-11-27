const EnvoyStaking = artifacts.require("EnvoyStaking");
const TestToken = artifacts.require("TestToken");

const truffleAssert = require('truffle-assertions');
const truffleHelpers = require('openzeppelin-test-helpers');


const sigs = require('./signatures.js')
const signerKey = sigs.signerKey
const signatureAddress = sigs.signatureAddress
const getSignature = sigs.getSignature

contract("Stress test staking", function(accounts) {
    
    
    it("Stress test staking", async () => {
        // *** Global test constants

        var currentTime = await truffleHelpers.time.latest();

        const staker = accounts[1];

        const contract = await EnvoyStaking.deployed();
        const token = await TestToken.deployed(); 
        const contractBalance = await token.balanceOf(contract.address)

        var stake = web3.utils.toWei('100000')

        await token.claim(staker, stake)
        await token.claim(contract.address, stake)


        // After approving, staking is possible
        await token.approve(contract.address, stake, {from: staker})
        await contract.stake(stake, true, {from: staker})

        //*** Move 100 periods (4 years)
        var period = (await contract.interestPeriod.call()).mul(web3.utils.toBN('100'))

        var interestDate = (await contract.stakeholders.call(staker)).interestDate
        var stakingBalance = (await contract.stakeholders.call(staker)).stakingBalance
        var interestPeriod = await contract.interestPeriod.call()
        var interestDecimals = await contract.interestDecimals.call()
        var interestRate = await contract.baseInterest.call()

        // Move in time
        var currentTime = await truffleHelpers.time.latest();
        await truffleHelpers.time.increase(truffleHelpers.time.duration.seconds(period));
        
        // Claim rewards on chain
        await contract.claimRewards(false, {from: staker})
        
        // Calculate the interest off-chain
        var compoundedInterestRate = web3.utils.toBN(Math.round(((1 + interestRate.toNumber()/interestDecimals.toNumber()) ** 100) * interestDecimals.toNumber()))
        console.log(compoundedInterestRate.toString())

        var newBalance = stakingBalance.div(interestDecimals).mul(compoundedInterestRate)
        var newInterestDate = interestDate.add((await contract.interestPeriod.call()).mul(web3.utils.toBN('100')))

        // Compare balance after claiming
        // 4 decimals are applied (1 ENV is lost a year with on 10.000 ENV staked)
        assert.equal(newBalance.div(web3.utils.toBN(10**12)).toString(),
            (await contract.stakeholders.call(staker)).stakingBalance.div(web3.utils.toBN(10**12)).toString(),
            "Staking reward not updated correctly")

        assert.equal(newInterestDate.toString(), (await contract.stakeholders.call(staker)).interestDate.toString(),
            "Interest date not updated correctly")

    })
})