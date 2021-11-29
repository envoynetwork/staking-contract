const EnvoyStaking = artifacts.require("EnvoyStaking");
const TestToken = artifacts.require("TestToken");

const truffleAssert = require('truffle-assertions');

const sigs = require('../utils/signatures.js')
const signatureAddress = sigs.signatureAddress

/*
Test all owner functions.
  - Non-owner calls revert
  - Owner calls update correctly
  - Additional logic is respected
*/
contract("Update globals as admin", function(accounts) {
    
    // User addresses
    const ownerAddress = accounts[0];
    const nonOwnerAddress = accounts[1];
    // Contracts to use
    var token
    var contract;

    beforeEach(async function() {
        // Make sure contracts are deployed
        token = await TestToken.new();
        contract = await EnvoyStaking.new(signatureAddress, token.address);
    }),
    
    it("Update signature address", async function() {
        await truffleAssert.reverts(contract.updateSignatureAddress(signatureAddress, {from: nonOwnerAddress}))
        await contract.updateSignatureAddress(signatureAddress, {from: ownerAddress})
        assert.equal(signatureAddress.toString(), (await contract.signatureAddress.call()).toString())
    }),

    it("Update base interest", async function() {
        var newInterest = (await contract.baseInterest.call()).add((await contract.interestDecimals.call()))
        await truffleAssert.reverts(contract.updateBaseInterest(newInterest, {from: nonOwnerAddress}))
        await contract.updateBaseInterest(newInterest, {from: ownerAddress})
        assert.equal(newInterest.toString(), (await contract.baseInterest.call()).toString())
    }),

    it("Update extra interest", async function() {
        var newInterest = (await contract.extraInterest.call()).add((await contract.interestDecimals.call()))
        await truffleAssert.reverts(contract.updateExtraInterest(newInterest, {from: nonOwnerAddress}))
        await contract.updateExtraInterest(newInterest, {from: ownerAddress})
        assert.equal(newInterest.toString(), (await contract.extraInterest.call()).toString())
    }),
    it("Update interest decimals", async function() {
        var oldDecimals = await contract.interestDecimals.call()
        var newDecimals = web3.utils.toBN('100000000')
        var newBaseInterest = (await contract.baseInterest.call()).mul(newDecimals).div(oldDecimals)
        var newExtraInterest = (await contract.extraInterest.call()).mul(newDecimals).div(oldDecimals)
        await truffleAssert.reverts(contract.updateInterestDecimals(newDecimals, {from: nonOwnerAddress}))
        await contract.updateInterestDecimals(newDecimals, {from: ownerAddress})
        assert.equal(newDecimals.toString(), (await contract.interestDecimals.call()).toString())
        assert.equal(newBaseInterest.toString(), (await contract.baseInterest.call()).toString())
        assert.equal(newExtraInterest.toString(), (await contract.extraInterest.call()).toString())

    }),
    it("Update interest period ", async function() {
        var newPeriod = '86400' // 1 day
        await truffleAssert.reverts(contract.updateInterestPeriod(newPeriod, {from: nonOwnerAddress}))
        await contract.updateInterestPeriod(newPeriod, {from: ownerAddress})
        assert.equal(newPeriod, (await contract.interestPeriod.call()).toString())
    }),
    it("Update cooldown period", async function() {
        var newPeriod = '86400' // 1 day
        await truffleAssert.reverts(contract.updateCoolDownPeriod(newPeriod, {from: nonOwnerAddress}))
        await contract.updateCoolDownPeriod(newPeriod, {from: ownerAddress})
        assert.equal(newPeriod, (await contract.cooldown.call()).toString())
    })

})