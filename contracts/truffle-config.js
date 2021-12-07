/**
 * Envoy staking deployment config
 */

// MAKE SURE ALL NECESSARY VARIABLES ARE DEFINED IN .ENV
require('dotenv').config({path: '../.env'})

const HDWalletProvider = require('@truffle/hdwallet-provider');

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
    // Goerlestnet
    goerli: {
      provider: function() {
        return new HDWalletProvider({
          privateKeys: process.env.PRIVATE_KEYS.split(' '),
          providerOrUrl: "https://goerli.infura.io/v3/" + process.env.INFURA_KEY})
      },
      network_id: 5,
      gas: 4000000
    },

    // Rinkeby testnet
    rinkeby: {
      provider: function() {
        return new HDWalletProvider({
          privateKeys: process.env.PRIVATE_KEYS.split(' '),
          providerOrUrl: "https://rinkeby.infura.io/v3/" + process.env.INFURA_KEY})      
        },
      network_id: 4
    },

    // Mainnet

    mainnet: {
      provider: function() {
        return new HDWalletProvider({
          privateKeys: process.env.PRIVATE_KEYS.split(' '),
          providerOrUrl: "https://mainnet.infura.io/v3/" + process.env.INFURA_KEYProduction})      
        },
      network_id: 1
    },

    // Polygon
    polygon: {
      provider: function() {
        return new HDWalletProvider({
          privateKeys: process.env.PRIVATE_KEYS.split(' '),
          providerOrUrl: "https://polygon-mainnet.infura.io/v3/" + process.env.INFURA_KEY})
      },
      network_id: 137,
    },

    // Polygon Mumbai testnet
    mumbai: {
      provider: function() {
        return new HDWalletProvider({
          privateKeys: process.env.PRIVATE_KEYS.split(' '),
          providerOrUrl: "https://polygon-mumbai.infura.io/v3/" + process.env.INFURA_KEY})
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
    etherscan: process.env.ETHERSCAN_KEY
  }
};
 