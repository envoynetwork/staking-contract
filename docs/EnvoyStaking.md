
# `EnvoyStaking`





## Variables:
- [`mapping(address => struct EnvoyStaking.StakeHolder) stakeholders`](#EnvoyStaking-stakeholders-mapping-address----struct-EnvoyStaking-StakeHolder-)
- [`address signatureAddress`](#EnvoyStaking-signatureAddress-address)
- [`contract IERC20 stakingToken`](#EnvoyStaking-stakingToken-contract-IERC20)
- [`uint256 interestDecimals`](#EnvoyStaking-interestDecimals-uint256)
- [`uint256 baseInterest`](#EnvoyStaking-baseInterest-uint256)
- [`uint256 extraInterest`](#EnvoyStaking-extraInterest-uint256)
- [`uint256 interestPeriod`](#EnvoyStaking-interestPeriod-uint256)
- [`uint256 cooldown`](#EnvoyStaking-cooldown-uint256)
- [`uint256 totalStake`](#EnvoyStaking-totalStake-uint256)
- [`uint256 maxWeight`](#EnvoyStaking-maxWeight-uint256)



## Functions:
- [`constructor(address signatureAddress_, address stakingTokenAddress)`](#EnvoyStaking-constructor-address-address-)
- [`updateWeight(uint256 weight_, bytes signature, bool instant)`](#EnvoyStaking-updateWeight-uint256-bytes-bool-)
- [`stake(uint256 amount, bool instant)`](#EnvoyStaking-stake-uint256-bool-)
- [`withdrawFunds(uint256 amount)`](#EnvoyStaking-withdrawFunds-uint256-)
- [`claimRewards(bool withdrawl)`](#EnvoyStaking-claimRewards-bool-)
- [`_recoverSigner(address sender, uint256 weight, bytes signature)`](#EnvoyStaking-_recoverSigner-address-uint256-bytes-)
- [`withdrawRemainingFunds(uint256 amount)`](#EnvoyStaking-withdrawRemainingFunds-uint256-)
- [`updateSignatureAddress(address value)`](#EnvoyStaking-updateSignatureAddress-address-)
- [`updateInterestDecimals(uint256 value)`](#EnvoyStaking-updateInterestDecimals-uint256-)
- [`updateBaseInterest(uint256 value)`](#EnvoyStaking-updateBaseInterest-uint256-)
- [`updateExtraInterest(uint256 value)`](#EnvoyStaking-updateExtraInterest-uint256-)
- [`updateInterestPeriod(uint256 value)`](#EnvoyStaking-updateInterestPeriod-uint256-)
- [`updateCoolDownPeriod(uint256 value)`](#EnvoyStaking-updateCoolDownPeriod-uint256-)

## Events:
- [`ConfigUpdate(string field, uint256 value)`](#EnvoyStaking-ConfigUpdate-string-uint256-)
- [`Staking(address stakeholder_, uint256 stake_)`](#EnvoyStaking-Staking-address-uint256-)
- [`Rewarding(address stakeholder_, uint256 reward_)`](#EnvoyStaking-Rewarding-address-uint256-)

## Functions:
### Function `constructor(address signatureAddress_, address stakingTokenAddress)` (public) {#EnvoyStaking-constructor-address-address-}




### Function `updateWeight(uint256 weight_, bytes signature, bool instant)` (public) {#EnvoyStaking-updateWeight-uint256-bytes-bool-}

Increase the stake of the sender by a value.



#### Parameters:
- `weight_`: The new weight.

- `signature`: A signature proving the sender
 is allowed to update his weight.

- `instant`: if false, finish current period with
 old values and start new period with new value.
 If true, end current period without rewards and
 start a new period with the new values.
### Function `stake(uint256 amount, bool instant)` (public) {#EnvoyStaking-stake-uint256-bool-}

Increase the stake of the sender by a value.



#### Parameters:
- `amount`: The amount to stake

- `instant`: if false, finish current period with
 old values and start new period with new value.
 If true, end current period without rewards and
 start a new period with the new values.
 If the current stake is 0, this should be instant.
### Function `withdrawFunds(uint256 amount)` (public) {#EnvoyStaking-withdrawFunds-uint256-}

Withdraw staked funds from the contract.
This will calculate the owed rewards for previous periods,
the current interest period will end without reward.



#### Parameters:
- `amount`: The amount to withdraw, capped by stakingbalance
### Function `claimRewards(bool withdrawl) → uint256 reward` (public) {#EnvoyStaking-claimRewards-bool-}

Calculate the rewards owed to a stakeholder.
The interest will be calculated based on:
 - The amount staked of the stakeholder
 - The weight of the stakeholder
 - The amount of interest periods staked
 - The base and extra interest of the contract
The formula of compounding interest is applied.



#### Parameters:
- `withdrawl`: if true, send the rewards to the stakeholder.
 if false, add the rewards to the staking balance of the stakeholder.

#### Return Values:
- reward The rewards of the stakeholder for previous periods.
### Function `_recoverSigner(address sender, uint256 weight, bytes signature) → address` (public) {#EnvoyStaking-_recoverSigner-address-uint256-bytes-}

Checks if the signature is created out of the contract address, sender and new weight,
signed by the private key of the signerAddress



#### Parameters:
- `sender`: the address of the message sender

- `weight`: amount of tokens to mint

- `signature`: a signature of the contract address, senderAddress and tokensId.
  Should be signed by the private key of signerAddress.
### Function `withdrawRemainingFunds(uint256 amount)` (public) {#EnvoyStaking-withdrawRemainingFunds-uint256-}

Owner function to transfer the staking token from the contract
address to the contract owner.
The amount cannot exceed the amount staked by the stakeholders,
making sure the funds of stakeholders stay in the contract.



#### Parameters:
- `amount`: the amount to withraw as owner
### Function `updateSignatureAddress(address value)` (public) {#EnvoyStaking-updateSignatureAddress-address-}




### Function `updateInterestDecimals(uint256 value)` (public) {#EnvoyStaking-updateInterestDecimals-uint256-}




### Function `updateBaseInterest(uint256 value)` (public) {#EnvoyStaking-updateBaseInterest-uint256-}




### Function `updateExtraInterest(uint256 value)` (public) {#EnvoyStaking-updateExtraInterest-uint256-}




### Function `updateInterestPeriod(uint256 value)` (public) {#EnvoyStaking-updateInterestPeriod-uint256-}




### Function `updateCoolDownPeriod(uint256 value)` (public) {#EnvoyStaking-updateCoolDownPeriod-uint256-}





## Events

### Event `ConfigUpdate(string field, uint256 value)` {#EnvoyStaking-ConfigUpdate-string-uint256-}
No description
### Event `Staking(address stakeholder_, uint256 stake_)` {#EnvoyStaking-Staking-address-uint256-}
No description
### Event `Rewarding(address stakeholder_, uint256 reward_)` {#EnvoyStaking-Rewarding-address-uint256-}
No description
