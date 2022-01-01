# Envoy staking contract

This repository contains the source code for the staking contract created for the ENVOY token. Users can stake their token to receive a periodic interest reward on their investment. The duration of the reward periods is fixed global variable and cannot be altered. It is the same for all stakeholder. At the end of each period, a reward is distributed between all the shareholders with a stake. The share they receive depends on following parameters:

* The **token amount** staked by each individual stakeholder
* The **time** staked by the stakeholder, as rewards do compound. Rewards of previous periods are automatically added to the users staking balance.
* The **user weight** or **user level** of the stakeholder, which is determined based on off-chain actions.

## Table of contents

- [Envoy staking contract](#envoy-staking-contract)
  - [Table of contents](#table-of-contents)
  - [Staking logic](#staking-logic)
    - [Reward calculation](#reward-calculation)
    - [Increasing the off-chain user level](#increasing-the-off-chain-user-level)
    - [Adjusting stake or increase weights in between staking periods](#adjusting-stake-or-increase-weights-in-between-staking-periods)
    - [Withdrawing funds](#withdrawing-funds)
    - [Example](#example)
      - [Period 1](#period-1)
      - [Period 2](#period-2)
      - [Period 3](#period-3)
      - [Period 4](#period-4)
  - [Contract implementation](#contract-implementation)

## Staking logic

### Reward calculation

The goal of the contract is to periodically pay out a constant reward amongst the stakeholders. The period is hardcoded and cannot be altered after deployment, the reward per period can be adjusted by the contract owner. This allows increasing the rewards when times are good and profits are shared with the community. The complexity of the contract lies in a correct distribution.

Stakeholders will be rewarded for each *full reward period* they staked, so the period in which they stake is not taken into account.

The formula for reward calculation is:
*The reward for each period is the reward per period multiplied by the relative share of the stakeholder in the total weighted staked funds, taking previous rewards into account.*

Let's break this down.

* The *reward per period* is the value to be distributed amongst the shareholders, as mentioned earlier.
* The *share of the stakeholder* is the amount staked, multiplied by the weight of the stakeholder. Stakeholders with a higher weight, will be rewarded more. The *total weighted staked funds* is the sum of all staked amounts, multiplied by the weight of the staker. The *relative* share is the share of the stakeholder, divided by the total weighted staked funds. All relative weighted stakes combined sum to 1, and the rewards of all stakers combined sum to the reward for this period.
* *taking previous rewards into account* refers to the fact that rewards are compounded. Rewards are given on previous earned rewards. If a stakeholder stakes for multiple periods, the reward of the first periods will be added to his balance, and the reward in the second period will be calculated using the increased new balance. Even if the stakeholder did not explicitly claim the rewards, the reward calculation will implicitly adjust the reward calculation when the stakeholder claims at a later point in time. For this to work, the *total weighted staked funds* needs to take all previously earned rewards into account, wether they are already claimed or not.

In pseudocode, the formula for one period becomes:

``` javascript
reward = rewardsPerPeriod * (userStakingBalance * userWeight) / totalWeightedStakingBalance
```

With:

* `rewardsPerPeriod` the rewards to be distributed, equal for each staker
* `userStakingBalance` the staked funds of the stakeholder, *including the rewards of previous periods*. This means stakers do not have to claim there rewards after each period to have optimal return, rewards compound in the calculation.
* `userWeight` the weight of the user. This weight is an integer defaulting to 1.
* `totalWeightedStakingBalance` the total funds in the contract taking the weights of the stakers and all previous rewards that might not have been claimed into account.

Applying the formula for each stakeholder and summing up the results exactly equals the `rewardsPerPeriod` value.
To receive the ENVOY tokens earned, stakeholders must manually claim them from the contract after one or multiple staking periods are over.

### Increasing the off-chain user level

The interest of the stakeholder is dependent on a weight based on user level, assigned by ENVOY off-chain. The stakeholders have to manually update their level themselves. The steps to level up are:

* Interact on the platform and earn points
* Once a certain level is used, a signature for a certain level can be requested. This signature will contain the stakeholders address, the level he is at and the staking contract. It will be singed by a private key of Envoy.
* The stakeholder provides the signature in the on-chain function to level up. The smart contract verifies if this signature for the specific input was signed by the Envoy key. If the signature is valid, the stakeholder's interest weight increases. If a malicious signature is used, the transaction will be reverted.

### Adjusting stake or increase weights in between staking periods

When people want to increase the amount staked, increase their user level or withdrawl funds, it probably happens in the middle of a staking period. For adjusting the stake, the update is *delayed* and will be applied from the *next* period. If a user increases his stake, the current period will still use the old staked amount for reward calculation. Starting from next period, the new staked amount will be used. This is to avoid misuse of last-minute stakers gaining full rewards.

Updating the user weight will be applied immediately. This is because users who are rewarded with a higher weight deserve the update and the feature cannot be misused.

### Withdrawing funds

When people want to stop staking, they can request a withdrawl for a certain amount. The amount can be a part of the staking balance and will be capped by the total staking balance. The amount will be reduced from the balance immediately. The funds are not considered for rewards anymore. However, the actual tokens remain in the contract until a cooldown period is over. After the cooldown, the stakeholder can safely transfer the tokens to his wallet again. The aim of the measure is to avoid people gaining big rewards and immediately dumping the token afterwards. The cooldown period can be set by the contract owner.

### Example

An diagram with an example of the staking contract can be in this
[link](https://viewer.diagrams.net/?tags=%7B%7D&highlight=0000ff&edit=_blank&layers=1&nav=1#G1G9_XUMuq-GtGyMKJSU8PSFtl_lu2kOql). In the example, there are 4 stakers. In reality, there are probably more.

#### Period 1

In the first period, the reward per period is set to 30. 3 stakeholders invest for 50, 30 and 20 tokens. In this period, no rewards are distributed as nothing was staked the period before.

#### Period 2

The first 3 stakers start their first full rewarding period. From this period and onwards they will start gaining rewards. A forth stakers joins the system for 50 ENV.

#### Period 3

Stakeholder 1 updates his weight from 1 to 2. The update is done instantly, from this period and onwards rewards will be calculated with weight 3. His rewards with the old weight are calculated for the previous periods.

In period 1, the staker did not earn anything as nothing was staked. In period 2, the staker had 50 from a total pool of 100 tokens staked with a reward per period of 30, so the staker receives 15 tokens. Period 3 is ongoing, so no rewards are rewarded yet. The next reward calculation in later periods will start from period 3 for stakeholder 1.

#### Period 4

Stakeholder 2 stakes another 50. As with each user update, the rewards using previous state is rewarded first before updating the values.

* For period 1, the staker is not rewarded as he did not stake the full period.
* For period 2, the staker owned 30 out of 100 shares with a reward of 30 per period, so the staker is rewarded 9 tokens.
* For period 3, the staker owned 39 tokens (the initial 30 and 9 from period 2) out of 240 shares (50 initial of stakeholder 1, 15 claimed by stakeholder 1. These need to be multiplied with weight 2, resulting in 130. We need to add his own 30, 20 of stakeholder 3 and 50 of stakeholder 4) 15 out of 30 tokens that are reserved to be paid as reward also need to be added to the total stake, because they are implicitly part of the stake. The final share is 39 tokens out of 180. Multiplied with 30 as reward per period, we get a reward of 4,77 for this period.

Combined, stakeholder 2 receives 13.77 tokens.

The update of the new stake is not done instantly. The rewards for this period will be calculated using the *old* stake. From period 5 and onwards, the new stake will be used. Stakeholders need to have the stake for a full period before it is rewarded.

## Contract implementation

The contract is implemented to keep track of two states in 2 mappings of structs:

* The state of each staker, mapping the stakeholder's address to a struct containing:

  * The **staking balance** or amount staked
  * The **new staking balance**, the amount that is staked but not yet used in the reward calculation because it was not staked for a full period.
  * The **weight** or level of each stakeholder to multiply the staking balance with in the reward calculation
  * The **start date** or date the staker joined
  * The date the stakeholder claimed the last rewards
  * The **release date** on which the stakeholder is able to withdraw the staked funds
  * The amount the staker can withdraw after the release date

* The state of each interval for which rewards are divided, mapping the sequential number of the reward period to a struct containing:

  * The **reward per period** or amount to distribute over all   stakeholders based on their weighted stake
  * The **total staking balance** for each weight, kept in a mapping. It is kept in a small mapping instead of a single integer to be able to calculate the total weighted reward each period.
  * The **total new staking balance** for each weight in a mapping, similar to the new staking balance field in the struct for single stakeholders
  * The **total rewards claimed** for each weight, keeping track of how many rewards were actually claimed (and indirectly how many rewards still need to be distributed.

  The key is how many reward periods have passed during the life time of the contract. The current period is calculated based on two state variables (the **start time of the contract** and the **duration** of a reward period set in the constructor) and the current block time. The formula is the difference of the start time and the current time,  divided by the duration of a period. The formula is triggered by the `currentPeriod` function. When a period ends, a struct for the next period will be initialized in the mapping, based on the previous period and all changes to be applied. This happens in the `handleNewPeriod` function. The function can be triggered manually, but is also triggerd when users interact with the contract to update the state (for example when .staking, updating weight, claiming or initializing a withdraw).
  