const mqtt = require("mqtt");
const express = require("express");
const app = express();
const fs = require("fs");
const cors = require("cors");
const schedule = require("node-schedule");
const { InfluxDB, Point, HttpError } = require("@influxdata/influxdb-client");

const loadDevices = require("./tools/loadDevices");
const loadOptions = require("./tools/loadOptions");
const handleMqttMessage = require("./tools/handleMqttMessage");
const handleApiRequests = require("./tools/handleApiRequests");

const corsOptions = {
  origin: "*",
};

app.use(express.json());
app.use(cors(corsOptions));

const devices = loadDevices(); //Stores devices set by user.
const newDevices = []; //Stores devices that wait for setting up.
const { options, optionsSetByUser } = loadOptions();
const furnace = { on: 0, ip: "", alive: 0, timeStamp: 0 };

const client = mqtt.connect(options.mqttaddress, {
  username: options.mqttuser,
  password: options.mqttpassword,
});
client.on("connect", () => {
  client.subscribe(options.mqtttopic);
  client.subscribe(options.mqttfurnacetopic + "/send");
});

//Dealing with mqtt messages
client.on("message", (topic, message) => {
  handleMqttMessage(topic, message, devices, newDevices, furnace, options);
});

//Web backend
app.get("/devices", (req, res) => {
  res.send(devices);
});
app.get("/newdevices", (req, res) => {
  res.send(newDevices);
});
app.get("/options", (req, res) => {
  handleApiRequests.options.get(req, res, options);
});
app.get("/options/set", (req, res) => {
  res.send(optionsSetByUser);
});
app.get("/mqttConnected", (req, res) => {
  res.send(client.connected);
});
app.get("/furnace", (req, res) => {
  res.send(furnace);
});
app.get("/time", (req, res) => {
  handleApiRequests.time.get(req, res, isnight);
});
app.put("/options", (res, req) => {
  handleApiRequests.options.put(res, req, options);
});
app.post("/devices", (req, res) => {
  handleApiRequests.devices.post(
    req,
    res,
    devices,
    newDevices,
    client,
    getSetTemp,
    options.hysteresis
  );
});
app.delete("/devices", (req, res) => {
  handleApiRequests.devices.delete(req, res, devices);
});
app.put("/devices", (req, res) => {
  handleApiRequests.devices.put(req, res, devices);
});

//Returns number of active devices with opened valve.
function howMany() {
  if (!devices[0]) return 0;
  let count = 0;
  for (let z = devices.length - 1; z >= 0; z -= 1) {
    count += parseInt(devices[z].opened);
  }
  return count;
}

//Returns true when it's night according to hours set by user.
function isnight() {
  const hours = new Date(Date.now()).getHours().toString();
  let minutes = new Date(Date.now()).getMinutes().toString();
  if (minutes.length === 1) minutes = "0" + minutes;
  let now = hours + minutes;
  now = parseInt(now);
  if (
    now >= parseInt(options.night) ||
    (now >= 0 && now < parseInt(options.day))
  )
    return true;
  return false;
}
function getSetTemp(device) {
  const days = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];
  const now = new Date(Date.now());
  let timeInt = now.toLocaleTimeString();
  timeInt = timeInt.slice(0, 5);
  timeInt = parseInt(timeInt.replace(":", ""));

  const schedule = { ...device.schedule[days[now.getDay()]] };
  for (let i = 0; i < schedule.times.length; ++i) {
    if (parseInt(schedule.times[i].end) > timeInt) {
      return parseInt(schedule.times[i].temp);
    }
  }
  return parseInt(schedule.lastTemp);
}

//Decision backend loop.
let settemp;
setInterval(() => {
  //Removing devices that were waiting for pairing if they are not doing so anymore.
  for (let i = newDevices.length - 1; i >= 0; i -= 1) {
    if (newDevices[i].alive > 0) {
      newDevices[i].alive -= 1;
    } else {
      newDevices.splice(i, 1);
    }
  }

  //Furnace
  if (furnace.alive > 0) {
    client.publish(options.mqttfurnacetopic + "/receive", "heartbeat");
    furnace.alive -= 1;
  } else furnace.on = 0;

  //If there is no devices with open valve turn off the furnace - it never happens in normal circumstances only eg. when last device with open valve loose connection.
  if (howMany() == 0 && furnace.on) {
    client.publish(options.mqttfurnacetopic + "/receive", "off");
    furnace.on = 0;
  }

  //Dealing with devices.
  for (let i = devices.length - 1; i >= 0; i -= 1) {
    if (devices[i].alive > 0) {
      devices[i].alive -= 1;
      //Setted temperature according to agenda.
      settemp = getSetTemp(devices[i]);
      //Heartbeat
      client.publish(
        devices[i].id,
        "heartbeat:" + settemp + ";" + options.hysteresis
      );
      //If furnace is turned on we need to open the heater valve in rooms where temperature is below set temperature, and close the valve in those where temperature is above the set temperature hysteresis also turn off the furnace if temperatures in all rooms (in wich the valve was opened) is above this level.
      if (furnace.on) {
        //Opening the valve
        if (
          parseFloat(devices[i].temp) < parseFloat(settemp) &&
          devices[i].opened == 0
        ) {
          client.publish(devices[i].id, "open");
          devices[i].opened = 1;
        }

        //Closing the valve or if last room turning off furnace. - we want to keep the heater valve in the last room open.
        else if (
          parseFloat(devices[i].temp) >
            parseFloat(settemp) + parseFloat(options.hysteresis) &&
          devices[i].opened == 1
        ) {
          if (howMany() == 1) {
            client.publish(options.mqttfurnacetopic + "/receive", "off");
            furnace.on = 0;
          } else {
            client.publish(devices[i].id, "close");
            devices[i].opened = 0;
          }
        }
        //If the furnace is off we need to turn it on when the temperature in one or more rooms drop below the set temperature histeresis.
      } else {
        if (
          parseFloat(devices[i].temp) <
          parseFloat(settemp) - parseFloat(options.hysteresis)
        ) {
          if (devices[i].opened == 0) {
            client.publish(devices[i].id, "open");
          }
          client.publish(options.mqttfurnacetopic + "/receive", "on");
        }
      }
    } else {
      devices[i].opened = 0; //If device is not alive assume the valve is closed.
    }
  }
}, 60000);

//Writing into db
if (options.usedb) {
  const writeApi = new InfluxDB({
    url: options.influxdb.url,
    token: options.influxdb.key,
  }).getWriteApi(options.influxdb.organisation, options.influxdb.bucket, "s", {
    batchSize: devices.length + 1,
  });
  const job = schedule.scheduleJob("*/15 * * * *", function () {
    //Send "force" to force publication of latest measurement
    devices.forEach((device) => {
      client.publish(device.id, "force");
    });

    //Wait for responses
    setTimeout(() => {
      devices.forEach((device) => {
        const tempPoint = new Point("Devices")
          .tag("Name", device.name)
          .tag("ID", device.id)
          .intField("Opened", device.opened)
          .timestamp(device.timeStamp)
          .floatField("Temperature", device.temp);
        writeApi.writePoint(tempPoint);
      });

      const tempPoint = new Point("Furnace")
        .timestamp(furnace.timeStamp)
        .intField("On", furnace.on);
      writeApi.writePoint(tempPoint);
    }, 10000);
  });
}

app.listen(8080, () => {
  console.log("Web API running at port 8080");
});
