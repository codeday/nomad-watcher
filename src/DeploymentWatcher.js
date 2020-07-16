const axios = require('axios');
const { default: setRandomInterval } = require('set-random-interval');

module.exports = class Deployment {
  constructor(jobId, onDeploy, onPromote, isFirstRun) {
    this.jobId = jobId;
    this.onDeploy = onDeploy;
    this.onPromote = onPromote;

    this.lastDeploymentId = null;
    this.lastDeploymentStatus = null;
    this.taskGroupPromotionStatus = {};

    this.isFirstRun = isFirstRun || false;

    this.interval = setRandomInterval(() => this.update(), 10000, 20000);
  }

  stop() {
    if (this.interval) {
      this.interval.clear();
      this.interval = null;
    }
  }

  getTaskPromotionStatus(deployment) {
    return Object.keys(deployment.TaskGroups)
      .reduce((accum, taskGroupId) => ({
        ...accum,
        [taskGroupId]: deployment.TaskGroups[taskGroupId].Promoted,
      }), {});
  }

  filterUpdatedTaskPromotions(deployment) {
    const newPromotion = this.getTaskPromotionStatus(deployment);

    return Object.keys(newPromotion)
      .filter((k) => !(k in newPromotion) || (newPromotion[k] && !this.taskGroupPromotionStatus[k]));
  }

  async update() {
    const { data } = await axios({
      method: 'GET',
      url: `${process.env.NOMAD_ADDR}/v1/job/${this.jobId}/deployment?index=1`,
      responseType: 'json',
    });

    if (data === null) {
      return;
    }

    if (this.isFirstRun && this.lastDeploymentId === null) {
      this.lastDeploymentId = data.ID;
      this.lastDeploymentStatus = data.Status;
      this.taskGroupPromotionStatus = this.getTaskPromotionStatus(data);
      return;
    }

    const changedPromotion = this.filterUpdatedTaskPromotions(data);
    if (changedPromotion.length > 0) {
      this.taskGroupPromotionStatus = this.getTaskPromotionStatus(data);
      this.onPromote(data, changedPromotion);
    }

    if (this.lastDeploymentId !== data.ID || this.lastDeploymentStatus !== data.Status) {
      this.lastDeploymentId = data.ID;
      this.lastDeploymentStatus = data.Status;
      this.taskGroupPromotionStatus = this.getTaskPromotionStatus(data);
      this.onDeploy(data);
    }
  }
};
