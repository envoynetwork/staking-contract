/**
 * Envoy Dino Warriors deployment config
 */

 const HDWalletProvider = require('@truffle/hdwallet-provider');

 const fs = require('fs');
 const privateKeys = [fs.readFileSync("../secrets/.secret").toString().trim()];
 const infuraKey = fs.readFileSync("../secrets/.infuraKey").toString().trim();
 const infuraKeyProduction = fs.readFileSync("../secrets/.infuraKeyProduction").toString().trim();
 const etherscanKey = fs.readFileSync("../secrets/.etherscanKey").toString().trim();
 module.exports = {
 
   // Ethereum networks
   networks: {
 
    // Development
    development: {
      host: "127.0.0.1",
      port: 8545,
      network_id: "*",
      gas: 1000000000000000
    },
    // Testnet
    goerli: {
      provider: function() {
        return new HDWalletProvider({
          privateKeys: privateKeys,
          providerOrUrl: "https://goerli.infura.io/v3/" + infuraKey})
      },
      network_id: 5,
      gas: 4000000
    },

    // Testnet
    rinkeby: {
      provider: function() {
        return new HDWalletProvider({
          privateKeys: privateKeys,
          providerOrUrl: "https://rinkeby.infura.io/v3/" + infuraKey})      
        },
      network_id: 4
    },

    // Mainnet

    mainnet: {
      provider: function() {
        return new HDWalletProvider({
          privateKeys: privateKeys,
          providerOrUrl: "https://mainnet.infura.io/v3/" + infuraKeyProduction})      
        },
      network_id: 1
    },

    polygon: {
      provider: function() {
        return new HDWalletProvider({
          privateKeys: privateKeys,
          providerOrUrl: "https://polygon-mainnet.infura.io/v3/" + infuraKey})
      },
      network_id: 137,
    },
    mumbai: {
      provider: function() {
        return new HDWalletProvider({
          privateKeys: privateKeys,
          providerOrUrl: "https://polygon-mumbai.infura.io/v3/" + infuraKey})
      },
      network_id: 80001,
    },


  },
 
  // Default mocha options
  mocha: {
    // timeout: 100000
  },

  // Configure compilers
  compilers: {
    solc: {
      version: "0.8.0",
      // optimizer: {
      //   enabled: true,
      //   runs: 1500
      // }
    }
  },

  // Truffle DB is not needed
  db: {
    enabled: false
  },
  plugins: [
    'truffle-plugin-verify'
  ],  
  api_keys: {
    etherscan: etherscanKey
  }
};
 