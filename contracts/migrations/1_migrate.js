const EnvoyStaking = artifacts.require("EnvoyStaking");
const TestToken = artifacts.require("TestToken");


module.exports = async function (deployer, network, accounts) {
  if(network === 'development' || network === 'rinkeby'){
    // Deploy a test token 
    const signatureAddress = '0xb9DD1FBbeB8f29DD181223DA36A397859B02834C' //29087b7eef74b57abe95659609151eeebac31ab7018a2a995a2f3bc1fdda89e3
    await deployer.deploy(TestToken)
    const token = await TestToken.deployed()
    await deployer.deploy(EnvoyStaking, signatureAddress, token.address);
    
  }
};
