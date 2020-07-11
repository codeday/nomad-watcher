require('dotenv').config();
const axios = require('axios');
const { Webhook, MessageBuilder } = require('discord-webhook-node');
const DeploymentWatcher = require('./DeploymentWatcher');

const webhook = new Webhook(process.env.DISCORD_WEBHOOK);

function onDeploy(deployment) {
  const colors = {
    successful: 1938535,
    running: 14408667,
    failed: 13123636,
  };

  const embed = new MessageBuilder()
    .setURL(`${process.env.NOMAD_ADDR}/ui/jobs/${deployment.JobID}`)
    .setTitle(deployment.JobID)
    .setDescription(deployment.StatusDescription)
    .setColor(colors[deployment.Status] || colors.running)
    .setTimestamp();

  webhook.send(embed);
}

function onPromote(deployment, promoted) {
  promoted.forEach((f) => {
    const embed = new MessageBuilder()
      .setURL(`${process.env.NOMAD_ADDR}/ui/jobs/${deployment.JobID}/${f}`)
      .setTitle(`${deployment.JobID}/${f}`)
      .setDescription('Canary promoted')
      .setColor(14408667)
      .setTimestamp();
    webhook.send(embed);
  });
}

const jobWatchers = {};
function updateJobWatchers(jobs, isFirstRun) {
  // Stop watchers for non-existent jobs
  Object.keys(jobWatchers)
    .filter((k) => !(k in jobWatchers))
    .forEach((k) => {
      jobWatchers[k].stop();
      delete jobWatchers[k];
    });

  // Start new watchers
  jobs
    .map((j) => j.ID)
    .filter((k) => !(k in jobWatchers))
    .forEach((k) => {
      jobWatchers[k] = new DeploymentWatcher(k, onDeploy, onPromote, isFirstRun);
    });
}

async function update(isFirstRun) {
  const { data } = await axios({
    method: 'GET',
    url: `${process.env.NOMAD_ADDR}/v1/jobs`,
  });
  updateJobWatchers(data, isFirstRun);
}

update(true);
setInterval(() => update(), 10000);
