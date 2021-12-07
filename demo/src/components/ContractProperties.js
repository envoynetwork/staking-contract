import React, {Component}  from 'react'
import {useNavigate} from 'react-router-dom'
import Web3 from 'web3'
import {connectWallet, getConnectedNetwork, getContractProperties} from './utils'

/**
 * Component to update stake properties in the contract
 */
class ContractProperties extends Component{
    constructor(props){
        super(props)
        this.state = {
            connectedWallet: null,
            connectedNetwork: null,
            web3: null,
            contract: null,
            web3ReadOnly: null,
            contractReadOnly: null,
            contractProperties: {
                balance: 0,
                _contractOwner: 0,
                baseInterest: 0,
                extraInterest: 0,
                interestDecimals: 0,
                interestDecimalsExp: 0,
                interestPeriod: 0,
                cooldown: 0,
                totalStake: 0,
                maxWeight: 0
            }
        }
        this.handleChange = this.handleChange.bind(this);
        this.submitChange = this.submitChange.bind(this);

    }
    
    handleChange(event) {
        let state = this.state
        let name = event.target.name
        let value = event.target.value
        console.log(value)
        if(name === 'cooldown' || name === 'interestPeriod'){
            value = parseFloat(value)*86400 || ''
        }
        console.log(value)
        
        
        state.contractProperties[name] = value
        this.setState(state);
    }

    async submitChange(event){
        event.preventDefault()
        console.log(event.target[0], event.target.length)
        console.log(event.target.name)
        let state = this.state
        let name = event.target[0].name
        let value = event.target[0].value
        if(name === 'cooldown' || name === 'interestPeriod'){
            value = value*86400
        }
        try{
            let receipt = await state.contract.methods[event.target.name](value).send({from: state.connectedWallet})
            await receipt
            this.setState(state)
            alert('Updated field!');
            //this.forceUpdate()
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
        
        // First we need to check if a Web3 browser extension was found
        if (!window.ethereum) {
            alert("Web3 wallet not found");
        } else {
            state.web3 = new Web3(window.ethereum);
            state.contract = new state.web3.eth.Contract(this.props.abiContract, this.props.contractAddress);
            state = await connectWallet(state);
            state = await getContractProperties(state)
            state.contractProperties.interestDecimalsExp = Math.log10(state.contractProperties.interestDecimals)
        }
        this.setState(state)
    }

    render(){
        let state = this.state
        if(state.contractProperties._contractOwner !== state.connectWallet){
            alert('You are not connected with the owner address! Change to the owner address in your wallet to use this page.')
        }
        return(
        <div>
            <button onClick={() => this.props.navigate('/main')}>Back to overview</button>
            <div className='Title'>
                Update global parameters
            </div>
            <div>
                Update the global parameters as contract owner. The address of the contract owner able to update the contract state is: '{state.contractProperties._contractOwner}'.
                <ul>
                    <li>Testing contract with address '{this.props.contractAddress}' on network {getConnectedNetwork(state.connectedNetwork)}</li>
                    <li>The contract address of the staking token is '{this.props.tokenAddress}' on network {getConnectedNetwork(state.connectedNetwork)}</li>
                </ul>
            </div>

            <form  onSubmit={this.submitChange} name="updateBaseInterest">
                <label>
                    Update base interest ({state.contractProperties.baseInterest/state.contractProperties.interestDecimals*100}% after dividing by {state.contractProperties.interestDecimals}):
                    <input type="text" name="baseInterest" value={state.contractProperties.baseInterest} onChange={this.handleChange}/>
                </label>
                <input type="submit" value="Update"/>
            </form>
            <form  onSubmit={this.submitChange} name="updateExtraInterest">
                <label>
                    Update extra interest ({state.contractProperties.extraInterest/state.contractProperties.interestDecimals*100}% after dividing by {state.contractProperties.interestDecimals}):
                    <input type="text" name="extraInterest" value={state.contractProperties.extraInterest} onChange={this.handleChange}/>
                </label>
                <input type="submit" value="Update"/>
            </form>
            <form  onSubmit={this.submitChange} name="updateCoolDownPeriod">
                <label>
                    Update cooldown period (in days):
                    <input type="text" name="cooldown" value={state.contractProperties.cooldown/86400} onChange={this.handleChange}/>
                </label>
                <input type="submit" value="Update"/>
            </form>
            <form  onSubmit={this.submitChange} name="updateInterestPeriod">
                <label>
                    Update interest rewarding period (in days):
                    <input type="text" name="interestPeriod" value={state.contractProperties.interestPeriod/86400} onChange={this.handleChange}/>
                </label>
                <input type="submit" value="Update"/>
            </form>
            <form  onSubmit={this.submitChange} name="updateInterestDecimals">
                <label>
                    Decimal used for accuracy in interest calculation:
                    <input type="text" name="interestDecimalsExp" value={state.contractProperties.interestDecimalsExp} onChange={this.handleChange}/>
                </label>
                <input type="submit" value="Update"/>
            </form>
        </div>
    )}
}

function ContractPropertiesWithNavigate(props) {
    let navigate = useNavigate();
    return <ContractProperties {...props} navigate={navigate} />
}

export default ContractPropertiesWithNavigate