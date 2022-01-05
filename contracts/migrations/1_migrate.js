
require('dotenv').config({path: '../.env'})
const EnvoyStaking = artifacts.require("EnvoyStakingV2");
const TestToken = artifacts.require("TestToken");

module.exports = async function (deployer, network, accounts) {
  
  const signerKey = network === 'mainnet' ? process.env.PRODUCTION_SIGNATURE_KEY : process.env.DEVELOPMENT_SIGNATURE_KEY
  const signatureAddress = web3.eth.accounts.privateKeyToAccount(signerKey).address

  // Deploy a test token no token address is defined.
  // Only deploy on dev or test nets.
  var tokenAddress = process.env[network.toUpperCase()+'_TOKEN_ADDRESS']

  if(tokenAddress === '' && network != 'mainnet'){
    await deployer.deploy(TestToken)
    const token = await TestToken.deployed()
    tokenAddress = token.address
  }
  await deployer.deploy(EnvoyStaking,
                        maxNumberOfPeriods = web3.utils.toBN(1095),
                        rewardPeriodDuration = web3.utils.toBN(86400),
                        cooldown = web3.utils.toBN(86400 * 7),
                        rewardPerPeriod = web3.utils.toBN('135000000000000000000000'),
                        signatureAddress,
                        tokenAddress);    
};
