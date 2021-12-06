import React, {Component}  from 'react'
import {Route, Navigate, useNavigate} from 'react-router-dom'
import Web3 from 'web3'

import './StakingOverview.css';
import {connectWallet, getConnectedNetwork, getContractProperties, getUserProperties} from './utils'

/**
 * Component to get an overview of the staking contract state
 */
class StakingOverview extends Component{
    
    /**
     * Sets the initial state
     * @param {*} props Should contain the contract ABI, address and web provider 
     */
    constructor(props){
        super(props)
        this.state = {
            connectedWallet: null,
            connectedNetwork: null,
            web3: null,
            contract: null,
            web3ReadOnly: null,
            contractReadOnly: null,
            tokenReadOnly: null,
            contractProperties: {
                balance: 0,
                _contractOwner: 0,
                baseInterest: 0,
                extraInterest: 0,
                interestDecimals: 0,
                interestPeriod: 0,
                cooldown: 0,
                totalStake: 0,
                maxWeight: 0
            },
            userProperties: {
                stakingBalance: 0,
                weight: 0,
                interestDate: 0,
                startDate: 0,
                newWeigth: 0,
                newStake: 0,
                rewardsToClaim: 0
            }
        }

    }

    /**
     * Handle all the asynchronous calls to the smart contract on Ethereum.
     */
    async componentDidMount(){
        let state = this.state

        // Get read version and write version (connected via wallet) of web3
        state.web3 = new Web3(window.ethereum);
        state.contract = new state.web3.eth.Contract(this.props.abiContract, this.props.contractAddress);

        state.web3ReadOnly = new Web3(this.props.web3Provider);
        state.contractReadOnly = new state.web3ReadOnly.eth.Contract(this.props.abiContract, this.props.contractAddress);
        state.tokenReadOnly = new state.web3ReadOnly.eth.Contract(this.props.abiToken, this.props.tokenAddress);
        
        // First we need to check if a Web3 browser extension was found
        if (!window.ethereum) {
            alert("Web3 wallet not found");
        } else {
            state = await connectWallet(state);
            state = await getContractProperties(state)
            state = getUserProperties(state.connectedWallet, state)
        }
        this.setState(state)
    }

    render() {
        let state = this.state
        return (
        <div>
            <div className='Title'>
                Envoy staking contract demo
            </div>
            <div className='Subtitle'>
                Info
            </div>
            <div>
                This contract will be used to reward Envoy stakers with staking rewards. The source code can be found on: <a href="url">https://github.com/envoynetwork/staking-contract</a>
            </div>
            <div className='Subtitle'>
                Contract and network data:
            </div>
            <div>
                <ul>
                    <li>Testing contract with address '{this.props.contractAddress}' on network {getConnectedNetwork(state.connectedNetwork)}</li>
                    <li>The contract address of the staking token is '{this.props.tokenAddress}' on network {getConnectedNetwork(state.connectedNetwork)}</li>
                    <li>The address of the contract owner able to update the contract state is: '{state.contractProperties._contractOwner}'.</li>
                </ul>
            </div>
            <div className='Subtitle'>
                Contract properties:
            </div>
            <div>
                <ul>
                    <li>Testing contract with address '{this.props.contractAddress}' on network {getConnectedNetwork(state.connectedNetwork)}</li>
                    <li>BaseInterest: {state.contractProperties.baseInterest/state.contractProperties.interestDecimals}</li>
                    <li>ExtraInterest: {state.contractProperties.extraInterest/state.contractProperties.interestDecimals}</li>
                    <li>Period between rewards: {state.contractProperties.interestPeriod/86400} days</li>
                    <li>Cooldown period before withdrawl: {state.contractProperties.cooldown/86400} days</li>
                    <li>Total staked funds: {state.contractProperties.totalStake}</li>
                    <li>Max weight: {state.contractProperties.maxWeight}</li>
                </ul>
                <button onClick={() => this.props.navigate('/contractproperties')}>Update properties as owner</button>


            </div>
            <div className='Subtitle'>
                Staking data for connected user: {state.connectedWallet}:
            </div>
            <div>
                <ul>
                    <li>Staked balance: {state.userProperties.stakingBalance} ENVOY</li> 
                    <li>Rewards to be claimed: {state.userProperties.rewardsToClaim} ENVOY</li>                 
                    <li>Users weight: {state.userProperties.weight}</li>                   
                    <li>Start date of staking (UNIX): {state.userProperties.startDate} days</li> 
                    <li>Date of last reward (UNIX): {state.userProperties.startDate} days</li>
                </ul>
                <button onClick={() => this.props.navigate('/userproperties')}>Update properties as stakeholder</button>
            </div>        
        </div>

        )
    }
    

}

function StakingOverviewWithNavigate(props) {
    let navigate = useNavigate();
    return <StakingOverview {...props} navigate={navigate} />
}

export default StakingOverviewWithNavigate