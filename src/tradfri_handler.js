const RGBColor = require('rgbcolor');
const tradfriLib = require('node-tradfri-client');
const _ = require('lodash');

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

function replaceAll(str, find, replace) {
  return str.replace(new RegExp(escapeRegExp(find), 'g'), replace);
}

async function operate(tradfri, device, operation) {
  if (device.type === tradfriLib.AccessoryTypes.lightbulb) {
    tradfri.operateLight(device, operation);
  } else if (device.type === tradfriLib.AccessoryTypes.plug && operation.onOff !== null) {
    tradfri.operatePlug(device, operation);
  }
}

function performOperation(tradfri, device, command, state) {
  const currentState = (device.lightList || device.plugList)[0].onOff;
  console.log(command, device.name, `(${device.instanceId})`, currentState ? 'on' : 'off', '>', state);
  if (command === 'turn') {
    operate(tradfri, device, { onOff: state === 'on' });
  } else if (command === 'dim') {
    operate(tradfri, device, { dimmer: state });
  } else if (command === 'temp') {
    operate(tradfri, device, { colorTemperature: state });
  } else if (command === 'color') {
    // Fixup color names into rgb value strings if necessary
    const color = new RGBColor(state).toHex().slice(1);
    operate(tradfri, device, { color });
  }
}

const trimCommandString = (id) =>
  (id === 'all')
    ? ''
    : replaceAll(id.replace(/the/g, '').trim().toLowerCase(), '_', ' ');

function executeCommand(tradfri, idRaw, command, state) {
  const devices = _.pickBy(tradfri.devices, (device) =>
    device.type === tradfriLib.AccessoryTypes.lightbulb
    || device.type === tradfriLib.AccessoryTypes.plug);
  const { groups } = tradfri;

  const id = trimCommandString(idRaw);

  console.log('executeCommand', command, id, state);
  const groupMatch = Object.keys(groups)
    .filter((group) => groups[group].group.name.toLowerCase().includes(id));

  if (groupMatch.length >= 1 && groupMatch[0]) {
    groupMatch.forEach((groupId) => {
      const { group } = groups[groupId];
      tradfri.operateGroup(group, { onOff: state === 'on' });
      group.deviceIDs.forEach((deviceId) => {
        const device = devices[deviceId];
        if (device) {
          performOperation(tradfri, device, command, state);
        }
      });
    });
    return `Updated ${groupMatch.length} group(s)`;
  }

  const deviceMatch = Object.keys(devices).filter((device) => devices[device].name.toLowerCase().startsWith(id));
  if (deviceMatch.length >= 1 && deviceMatch[0]) {
    deviceMatch.forEach((deviceId) => performOperation(tradfri, devices[deviceId], command, state))
    return `Updated ${deviceMatch.length} device(s)`;
  }
  return `No matches for ${id}`;
}

function deviceUpdated(device) {
  console.log('deviceUpdated', device.instanceId, device.name);
  // if (device.type === tradfriLib.AccessoryTypes.lightbulb ||
  //   device.type === tradfriLib.AccessoryTypes.plug) {
  //   devices[device.instanceId] = {
  //     onOff: (device.lightList || device.plugList)[0].onOff,
  //     dimmer: (device.lightList || device.plugList)[0].dimmer,
  //     name: device.name,
  //     deviceID: device.instanceId
  //   };
  // }
}

function deviceRemoved(instanceId) {
  if (instanceId in devices) {
    console.log('deviceRemoved', instanceId, devices[instanceId].name);
    // delete devices[instanceId];
  }
}

function groupUpdated(group) {
  console.log('groupUpdated', group.instanceId, group.name);
  // groups[group.instanceId] = group;
}

function groupRemoved(group) {
  console.log('groupRemoved', group.instanceId, group.name);
  // delete groups[group.instanceId];
}

const getGroups = (tradfri) =>  Object.keys(tradfri.groups).reduce((prev, key) => ({
  [key]: tradfri.groups[key].group.name,
  ...prev,
}), {});

const getDevices = (tradfri) => Object.keys(tradfri.devices).reduce((prev, key) => ({
    ...prev,
    [tradfriLib.AccessoryTypes[tradfri.devices[key].type]]: {
      ...prev[tradfriLib.AccessoryTypes[tradfri.devices[key].type]],
      [key]: tradfri.devices[key].name,
    },
  }
), {});

module.exports = {
  executeCommand,
  deviceUpdated,
  deviceRemoved,
  groupUpdated,
  groupRemoved,
  getGroups,
  getDevices,
};
