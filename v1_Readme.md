# Envoy staking contract

This repository contains the source code for the staking contract created for the ENVOY token. Users can stake their token to receive a periodic interest reward on their investment. This depends on following parameters:

* The **token amount** staked
* The **time** staked
* The **user level** of the stakeholder determined based on off-chain actions.

The formula for reward for each period is the staked amount multiplied by the interest:

``` javascript
reward = stakedAmount * interestRate
```

With:

```javascript
interestRate = baseInterest + extraInterest * userLevel
```

Initially, both base interest and extra interest are 0.4% on a 15 day basis, which is approximately 10% on an anual basis. The user levels range from 0 till 9, making the max return 100*. The variables can be adjusted later on.

With `N` consecutive interest periods, the rewards will automatically become part of the staked amount, compounded interest is applied. The formula becomes:

``` javascript
newStakedAmount = stakedAmount;
for(i = 1; i<=N; i++){
    newStakedAmount += newStakedAmount interestRate) 
}
reward = newStakedAmount - stakedAmount
```

With the compounded interest, stakeholders virtually earn the rewards at the end of each interest period.  By default, this is 15 days. If the staked amount is withdrawn before the staking period is at the end, no reward will be given for this period. To receive the ENVOY tokens earned, stakeholders must manually claim them from the contract after one or multiple staking periods are over.

## Increasing the off-chain user level

The interest of the stakeholder is dependent on a weight based on user level, assigned by ENVOY off-chain. The stakeholders have to manually update their level themselves. The steps to level up are:

* Interact on the platform and earn points
* Once a certain level is used, a signature for a certain level can be requested. This signature will contain the stakeholders address, the level he is at and the staking contract. It will be singed by a private key of Envoy.
* The stakeholder provides the signature in the on-chain function to level up. The smart contract verifies if this signature for the specific input was signed by the Envoy key. If the signature is valid, the stakeholder's interest weight increases. If a malicious signature is used, the transaction will be reverted.

## Adjusting stake or increase weights in between staking periods

When people want to increase the amount staked, increase their user level or withdrawl funds, it probably happens in the middle of a staking period. There are 2 options for an update: **instant** or **delayed to next period**.

Delayed updates will be applied when the period is over. If a user increases his stake, the current period will still use the old staked amount for reward calculation. Starting from next period, the new staked amount will be used. The advantage is that the user is still rewarded for each day tokens were staked. This is beneficial when the increase in reward will be relatively small.

Instant updates will update the staked amount immediately. The current interest period is ended without reward, and the new period starts at the same moment. This is beneficial when the increase in reward will be relatively high.

When withdrawing funds, all updates are immediate as we are otherwise 'lending' funds for the remainder of the period. For withdrawing, there is a 2 day cooldown since the start of the staking.
