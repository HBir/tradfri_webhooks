const express = require('express');
const tradfriLib = require('node-tradfri-client');
const nodeCleanup = require('node-cleanup');

const {
  executeCommand,
  deviceUpdated,
  deviceRemoved,
  groupUpdated,
  registerDevicesAndGroups,
} = require('./src/tradfri_handler');

// Copy envfile(copy_this).js and rename to envfile.js
const {
  PORT, PASS, HUBIP, APIUSER, APIKEY,
} = require('./resources/envfile');

const app = express();

const { TradfriClient } = tradfriLib;

const options = {
  watchConnection: true,
};

const tradfri = new TradfriClient(HUBIP, options);

nodeCleanup(() => {
  console.log('Cleaning up...');
  if (tradfri) {
    console.log('Destroying tradfri connection');
    tradfri.destroy();
  }
});

app.get('/health', async (req, res) => {
  console.log('health check');
  const success = await tradfri.ping(10);
  res.send(JSON.stringify({
    serverRunning: true,
    gatewayConnected: success,
  }));
});

app.get('/rebootGateway', async (req, res) => {
  console.log('Rebooting gateway...');
  const reboot = await tradfri.rebootGateway();
  res.send(`Reboot succesfully started: ${reboot}`);
});

app.get('/api/:command/:id/:state', (req, res) => {
  if (req.query.password !== PASS) {
    console.log('invalid password');
    res.status(403).send('wrong password');
    return;
  }

  const { command } = req.params;
  if (command === 'turn'
      || command === 'dim'
      || command === 'temp'
      || command === 'color') {
    executeCommand(tradfri, req.params.id, command, req.params.state);
    res.send('done');
    return;
  }

  console.log('unknown command', command);
  res.status(404).send('wrong command');
});

app.listen(PORT, async () => {
  console.log(`Listening on port ${PORT}`);

  tradfri.on('gateway updated', () => console.log('Gateway updated'))
    .on('ping failed', (failedPingCount) => console.log(`ping failed #${failedPingCount}`))
    // .on('ping succeeded', () => console.log('ping'))
    .on('connection alive', () => console.log('connection alive'))
    .on('connection lost', () => console.log('connection lost'))
    .on('connection failed', (attempt, max) => console.log(`connection failed #${attempt}${max === Infinity ? '' : `/${max}`}`))
    .on('gateway offline', () => console.log('gateway offline'))
    .on('give up', () => console.log('give up'))
    .on('reconnecting', (attempt, max) => console.log(`reconnecting... #${attempt}${max === Infinity ? '' : `/${max}`}`));

  await tradfri.connect(APIUSER, APIKEY);

  await registerDevicesAndGroups(tradfri);

  tradfri.on('rebooting', (reason) => console.log('Rebooting', reason))
    .on('internet connectivity changed', (connected) => console.log('internet connectivity changed connected:', connected))
    .on('firmware update available', (releaseNotes, priority) => console.log('firmware update available priority:', priority))
    .observeNotifications();
  tradfri.on('device updated', deviceUpdated)
    .on('device removed', deviceRemoved)
    .observeDevices();
  tradfri.on('group updated', groupUpdated)
    .observeGroupsAndScenes();
});
