const fs = require("fs");

const loadOptions = () => {
  try {
    const options = JSON.parse(
      fs.readFileSync("./server/data/options.json", {
        encoding: "utf8",
        flag: "r",
      })
    );
    if (
      !options.mqttaddress.startsWith("mqtt://") &&
      !options.mqttaddress.startsWith("mqtts://")
    ) {
      if (options.mqttaddress.length > 0) {
        options.mqttaddress = "mqtt://" + options.mqttaddress;
      } else options.mqttaddress = "mqtt://127.0.0.1";
    }
    return { options: options, optionsSetByUser: true };
  } catch (e) {
    const newOptions = {
      day: 700,
      night: 2200,
      hysteresis: 0.2,
      mqttaddress: "mqtt://127.0.0.1:1883",
      mqtttopic: "NamNoc",
      mqttuser: "",
      mqttpassword: "",
      mqttfurnacetopic: "furnace",
      usedb: false,
      influxdb: {
        url: "",
        organisation: "",
        bucket: "",
        key: "",
      },
    };
    return { options: newOptions, optionsSetByUser: false };
  }
};

module.exports = loadOptions;
