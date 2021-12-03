
require('dotenv').config({path: '../.env'})
const EnvoyStaking = artifacts.require("EnvoyStaking");
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
  
  await deployer.deploy(EnvoyStaking, signatureAddress, tokenAddress);    
};
