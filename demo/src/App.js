import React from 'react'
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate
} from 'react-router-dom'

import './App.css';
// The ABI (Application Binary Interface) is the interface of the smart contract
import contractABIJSON from './abi/abi-contract.json'
import tokenABIJSON from './abi/abi-token.json'

// Settings will be differ


import StakingOverviewWithNavigate from './components/StakingOverview';
import ContractProperties from './components/ContractProperties';
import UserProperties from './components/UserProperties';


const web3Provider = process.env.REACT_APP_WEB3PROVIDER
const contractAddress = process.env.REACT_APP_STAKING_ADDRESS
const tokenAddress = process.env.REACT_APP_TOKEN_ADDRESS
const abiContract = contractABIJSON.abi
const abiToken = tokenABIJSON.abi

function App() {
  return (
    <Router>
      <Routes>
        <Route exact path='/' element={<Navigate to='/main' replace={true} />} />
        <Route path='/main' element = { <StakingOverviewWithNavigate abiContract={abiContract}
                                        abiToken={abiToken}
                                        contractAddress={contractAddress}
                                        tokenAddress={tokenAddress}
                                        web3Provider={web3Provider}/>}/>
        <Route path='/contractproperties' element = { <ContractProperties abiContract={abiContract}
                                        abiToken={abiToken}
                                        contractAddress={contractAddress}
                                        tokenAddress={tokenAddress}
                                        web3Provider={web3Provider}/>}/>

        <Route path='/userproperties' element = { <UserProperties abiContract={abiContract}
                                        abiToken={abiToken}
                                        contractAddress={contractAddress}
                                        tokenAddress={tokenAddress}
                                        web3Provider={web3Provider}/>}/>
      </Routes>
    </Router>
  );
}

export default App;
