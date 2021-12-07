/**
     * Connect the Ethereum wallet (e.g. Metamask) to the web application.
     */
 async function connectWallet(state){
    try {
    
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        
        state.connectedWallet = await accounts[0];
        state.connectedNetwork = await window.ethereum.networkVersion;

        return state

    } catch (error){
        if (error.code === 4001) {
            alert('User rejected the request') // User rejected request
        }
        console.error(error);
    }
}

/**
 * Mapping to translate network ID into a name
 * @param {*} networkId number of the network ID to connect to
 * @returns the name of the network to connect to
 */
function getConnectedNetwork(networkId){
    if (networkId === '1'){
        return "Ethereum Mainnet";
    } else if (networkId === "4") {
        return "Rinkeby Testnet";
    } else if (networkId === "5") {
        return "Goerli Testnet";
    } else {
        return "Unknown network - probably local";
    }
}

/**
 * Load the smart contract properties and put them into the state under 'contractProperties'
 */
async function getContractProperties(state){
    state.contractProperties._contractOwner = await state.contractReadOnly.methods.owner().call()
    state.contractProperties.interestDecimals = await state.contractReadOnly.methods.interestDecimals().call()
    state.contractProperties.baseInterest = await state.contractReadOnly.methods.baseInterest().call()
    state.contractProperties.extraInterest = await state.contractReadOnly.methods.extraInterest().call()
    state.contractProperties.cooldown = await state.contractReadOnly.methods.cooldown().call()
    state.contractProperties.interestPeriod = await state.contractReadOnly.methods.interestPeriod().call()
    state.contractProperties.totalStake = await state.contractReadOnly.methods.totalStake().call()
    state.contractProperties.maxWeight = await state.contractReadOnly.methods.maxWeight().call()
    return state
}

async function getUserProperties(sender, state){
    state.userProperties = await state.contractReadOnly.methods.stakeholders(sender).call()
    state.userProperties.rewardsToClaim = (await state.contractReadOnly.methods.calculateRewards(sender).call())[0]
    return state
}

export {connectWallet, getConnectedNetwork, getContractProperties, getUserProperties}