import React, {Component}  from 'react'
import {useNavigate} from 'react-router-dom'
import Web3 from 'web3'
import {connectWallet, getConnectedNetwork, getContractProperties, getUserProperties} from './utils'

/**
 * Component to update stakeholder data
 */
class UserProperties extends Component{
    constructor(props){
        super(props)
        this.state = {
            connectedWallet: null,
            connectedNetwork: null,
            web3: null,
            contract: null,
            token: null,
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
            },
            tokenProperties: {
                balance: 0,
                approved: 0,
            },
            formProperties: {
                stakeInstantly: false,
                updateWeightInstantly: false,
                signature: '',
                newStake: '',
                newWeight: '',
                withdrawAmount: '',
                withdrawWhenClaiming: false
            }
        }
    

        this.handleChange = this.handleChange.bind(this);
        this.submitChange = this.submitChange.bind(this);

    }

    handleChange(event) {
        let state = this.state
        let name = event.target.name
        const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
        console.log(name, value)
        state.formProperties[name] = value
        this.setState(state);
    }

    async submitChange(event){
        event.preventDefault()
        console.log(event.target[0], event.target.length)
        console.log(event.target.name)
        let state = this.state

        let args = []
        for(let i=0;i<event.target.length-1;i++){
            args.push(event.target[i].value)
        }
        console.log(args)
        try{
            let receipt = await state.contract.methods[event.target.name](...args).send({from: state.connectedWallet})
            await receipt
            alert('Staked tokens!');
            state.formProperties.newStake = 0
            state.formProperties.stakeInstantly = 0
            this.setState(state)
            
        }
        catch (error){
            await error
            alert(error)
        }
    }

    async componentDidMount(){
        let state = this.state

        // Get read version and write version (connected via wallet) of web3
        
        state.web3ReadOnly = new Web3(this.props.web3Provider);
        state.contractReadOnly = new state.web3ReadOnly.eth.Contract(this.props.abiContract, this.props.contractAddress);
        state.tokenReadOnly = new state.web3ReadOnly.eth.Contract(this.props.abiToken, this.props.tokenAddress);

        // First we need to check if a Web3 browser extension was found
        if (!window.ethereum) {
            alert("Web3 wallet not found");
        } else {
            state.web3 = new Web3(window.ethereum);
            state.contract = new state.web3.eth.Contract(this.props.abiContract, this.props.contractAddress);
            state = await connectWallet(state);
            state = await getContractProperties(state)
            state = await getUserProperties(state.connectedWallet, state)
            state.tokenProperties.balance = await state.tokenReadOnly.methods.balanceOf(state.connectedWallet).call()
            state.tokenProperties.approved = await state.tokenReadOnly.methods.allowance(state.connectedWallet, this.props.contractAddress).call()
        }
        this.setState(state)
    }
    render(){
        let state = this.state
        return(
        <div>
            <button onClick={() => this.props.navigate('/main')}>Back to overview</button>
            <div className='Title'>
                Updating stake positions as stakeholder
            </div>
            <div>
                Update your staking position as a stakeholder. The wallet connected is: '{state.connectedWallet}'.
                <ul>
                    <li>Testing contract with address '{this.props.contractAddress}' on network {getConnectedNetwork(state.connectedNetwork)}</li>
                    <li>The contract address of the staking token is '{this.props.tokenAddress}' on network {getConnectedNetwork(state.connectedNetwork)}</li>
                </ul>
                The current state is:
                <ul>
                    <li>Remaining token balance outside the contract: {state.tokenProperties.balance}</li>
                    <li>Remaining token balance that is approved for staking: {state.tokenProperties.approved}</li>
                    <li>Staked balance: {state.userProperties.stakingBalance} ENVOY</li>
                    <li>Interest for the user (base interest + extra interest x weight): {(parseInt(state.contractProperties.baseInterest)+parseInt(state.contractProperties.extraInterest)*parseInt(state.userProperties.weight))/state.contractProperties.interestDecimals*100}%</li>
                    <li>Rewards to be claimed: {state.userProperties.rewardsToClaim} ENVOY</li>                 
                    <li>User level: {state.userProperties.weight}</li>                   
                    <li>Start date of staking (UNIX): {state.userProperties.startDate}</li> 
                    <li>Date of last reward (UNIX): {state.userProperties.startDate}</li>
                </ul>

            </div>
            <div className='Subtitle'>
                Stake funds
            </div>
            <form  onSubmit={this.submitChange} name="stake">
                <label>
                    Additional amount to stake:
                    <input type="text" name="newStake" value={state.formProperties.newStake} onChange={this.handleChange}/>
                </label>
                <br/>
                <label>
                    Update instantly?
                    <input type="checkBox" name="stakeInstantly" value={state.formProperties.stakeInstantly} onChange={this.handleChange}/>
                </label>
                <br/>
                <input type="submit" value="Stake"/>
            </form>
            <div className='Subtitle'>
                Update user level
            </div>
            <form  onSubmit={this.submitChange} name="updateWeight">
                <label>
                    New user level:
                    <input type="text" name="newWeight" value={state.formProperties.newWeight} onChange={this.handleChange}/>
                </label>
                <br/>
                <label>
                    Signature to verify update is allowed:
                    <input type="text" name="signature" value={state.formProperties.signature} onChange={this.handleChange}/>
                </label>
                <br/>
                <label>
                    Update instantly?
                    <input type="checkBox" name="updateWeightInstantly" value={state.formProperties.updateWeightInstantly} onChange={this.handleChange}/>
                </label>
                <br/>
                <input type="submit" value="Update user level"/>
            </form>
            <div className='Subtitle'>
                Claim rewards
            </div>
            <form  onSubmit={this.submitChange} name="claimRewards">
                <label>
                    Withdraw rewards from contract?
                    <input type="checkBox" name="withdrawWhenClaiming" value={state.formProperties.withdrawWhenClaiming} onChange={this.handleChange}/>
                </label>
                <br/>
                <input type="submit" value="Claim rewards"/>
            </form>  
            <div className='Subtitle'>
                Withdraw funds
            </div>
            <form  onSubmit={this.submitChange} name="withdrawFunds">
                <label>
                    Amount to withdraw:
                    <input type="text" name="withdrawAmount" value={state.formProperties.withdrawAmount} onChange={this.handleChange}/>
                </label>
                <br/>
                <input type="submit" value="WithDraw"/>
            </form>            
        </div>)
        
    }
}

function UserPropertiesWithNavigate(props) {
    let navigate = useNavigate();
    return <UserProperties {...props} navigate={navigate} />
}

export default UserPropertiesWithNavigate