const NewDevice = require("../classes/NewDevice");

const getTimestamp = () => {
  return Math.floor(new Date().getTime() / 1000);
};

const handleMqttMessage = (
  topic,
  message,
  devices,
  newDevices,
  furnace,
  options
) => {
  if (topic == options.mqtttopic) {
    const received = JSON.parse(message.toString());
    const current = devices.find((c) => c.id === received.id);
    if (!current) {
      const current = newDevices.find((c) => c.id === received.id);
      if (!current) {
        newDevices.push(new NewDevice(received));
      } else {
        current.ip = received.ip;
        current.temp = received.temp;
        current.opened = received.opened;
        current.timeStamp = getTimestamp();
        current.alive = 5;
      }
    } else {
      current.ip = received.ip;
      current.temp = received.temp;
      current.opened = received.opened;
      current.timeStamp = getTimestamp();
      current.alive = 5;
    }
  } else {
    const received = JSON.parse(message.toString());
    furnace.on = parseInt(received.on);
    furnace.ip = received.ip;
    furnace.timeStamp = received.timestamp;
    furnace.alive = 5;
  }
};

module.exports = handleMqttMessage;
