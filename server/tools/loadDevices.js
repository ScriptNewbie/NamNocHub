const fs = require("fs");

const loadDevices = () => {
  try {
    const devices = JSON.parse(
      fs.readFileSync("./server/data/devices.json", {
        encoding: "utf8",
        flag: "r",
      })
    );
    devices.forEach((device) => {
      device.opened = 0;
      device.alive = 0;
    });
    return devices;
  } catch (e) {
    return [];
  }
};

module.exports = loadDevices;
