import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("StakingModule", (m) => {
  const deployer = m.getAccount(0);

  const stakingToken = m.getParameter("stakingToken");
  const rewardToken = m.getParameter("rewardToken");

  const staking = m.contract("Staking", [deployer, stakingToken, rewardToken]);

  return { staking };
});
