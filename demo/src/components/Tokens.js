import React, {Component}  from 'react'
import {useNavigate} from 'react-router-dom'
import Web3 from 'web3'
import {connectWallet, getConnectedNetwork} from './utils'

/**
 * Component to update stakeholder data
 */
class Tokens extends Component{
    constructor(props){
        super(props)
        this.state = {
            connectedWallet: null,
            connectedNetwork: null,
            web3: null,
            web3ReadOnly: null,
            token: null,
            tokenReadOnly: null,
            tokenProperties: {
                balance: 0,
                approved: 0,
            },
            tokensToClaim: 0,
            tokensToApprove: 0
        }
        this.handleChange = this.handleChange.bind(this);
        this.claimTokens = this.claimTokens.bind(this);
        this.approveTokens = this.approveTokens.bind(this);

    }
    
    handleChange(event) {
        let state = this.state
        console.log(event)
        console.log(event.target)
        state[event.target.name] = event.target.value
        this.setState(state);
    }

    async claimTokens(event){
        event.preventDefault()
        let state = this.state
        console.log(event.tar)
        console.log(event.target.tokensToApprove)
        console.log(event.target.elements)
        console.log(event.target[0], event.target.length)
        console.log(event.target.name)
        try{
            console.log()
            let receipt = await state.token.methods.claim(state.connectedWallet, state.tokensToClaim).send({from: state.connectedWallet})
            await receipt
            state.tokensToClaim = 0
            //state.tokenProperties.balance = await state.tokenReadOnly.methods.balanceOf(state.connectedWallet).call()
            //his.setState(state)
            alert('Claimed tokens');
            this.forceUpdate()
        }
        catch (error){
            await error
            alert(error)
        }     
    }

    async approveTokens(event){
        event.preventDefault()
        let state = this.state
        try{
            let receipt = await state.token.methods.approve(this.props.contractAddress, state.tokensToApprove).send({from: state.connectedWallet})
            await receipt
            state.tokensToApprove = 0
            state.tokenProperties.approved = await state.tokenReadOnly.methods.allowance(state.connectedWallet, this.props.contractAddress).call()
            this.setState(state)
            alert('Approved tokens');
            this.forceUpdate()
        }
        catch (error){
            await error
            alert(error)
        }     
    }
    /**
     * Handle all the asynchronous calls to the smart contract on Ethereum.
     */
    async componentDidMount(){
        let state = this.state

        // Get read version and write version (connected via wallet) of web3
        
        state.web3ReadOnly = new Web3(this.props.web3Provider);
        state.tokenReadOnly = new state.web3ReadOnly.eth.Contract(this.props.abiToken, this.props.tokenAddress);
        
        // First we need to check if a Web3 browser extension was found
        if (!window.ethereum) {
            alert("Web3 wallet not found");
        } else {
            state.web3 = new Web3(window.ethereum);
            state.token = new state.web3.eth.Contract(this.props.abiToken, this.props.tokenAddress);
            state = await connectWallet(state);
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
                    Envoy staking token
                </div>
                <div className='Subtitle'>
                    Token info
                </div>
                <div>
                    The contract address of the staking token is '{this.props.tokenAddress}' on network {getConnectedNetwork(state.connectedNetwork)}
                </div>
                <div>
                    <ul>
                        <li>Token balance: {state.tokenProperties.balance}</li>
                        <li>Approved: {state.tokenProperties.approved}</li>
                    </ul>
                </div>
                <div className='Subtitle'>
                    Claim or approve tokens
                </div>
                Claim test tokens for your account for free. Before you can stake the tokens, you need to give approval to the staking contract for the amount you want to stake. The funds will be withdrawn when you trigger the 'stake' function of the staking contract.
                
                <form  onSubmit={this.claimTokens} name="tokensToClaim">
                    <label>
                        Tokens to claim:
                        <input type="text" name="tokensToClaim" value={state.tokensToClaim} onChange={this.handleChange}/>
                    </label>       
                    <input type="submit" value="Claim"/>
                </form>
                <form  onSubmit={this.approveTokens}>
                    <label>
                        Tokens to approve:
                        <input type="text" name="tokensToApprove" value={state.tokensToApprove} onChange={this.handleChange}/>
                    </label>       
                    <input type="submit" value="Approve"/>
                </form>
            </div>
            )
    }
}

function TokensWithNavigate(props) {
    let navigate = useNavigate();
    return <Tokens {...props} navigate={navigate} />
}
export default TokensWithNavigate