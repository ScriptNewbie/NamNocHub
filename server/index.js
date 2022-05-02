const mqtt = require("mqtt");
const express = require("express");
const app = express();
const cors = require("cors");
const schedule = require("node-schedule");
const { InfluxDB, Point, HttpError } = require("@influxdata/influxdb-client");

const loadDevices = require("./tools/loadDevices");
const loadOptions = require("./tools/loadOptions");
const handleMqttMessage = require("./tools/handleMqttMessage");
const handleApiRequests = require("./tools/handleApiRequests");
const makeDecisions = require("./tools/makeDecisions");

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
setInterval(() => {
  makeDecisions(devices, newDevices, furnace, options, client, getSetTemp);
}, 6000);

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
