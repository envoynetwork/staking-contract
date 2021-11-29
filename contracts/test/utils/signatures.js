const signerKey = '29087b7eef74b57abe95659609151eeebac31ab7018a2a995a2f3bc1fdda89e3'
const signatureAddress = '0xb9DD1FBbeB8f29DD181223DA36A397859B02834C'

function getSignature(contract, userAddress, amount) {
    message = web3.utils.soliditySha3(web3.eth.abi.encodeParameters(['address', 'address', 'uint256'], [contract.address, userAddress,amount]))    
    sig = web3.eth.accounts.sign(message, signerKey)
    return sig
}

exports.signerKey = signerKey;
exports.signatureAddress = signatureAddress;
exports.getSignature = getSignature;