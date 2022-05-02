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
  handleApiRequests.time.get(req, res, options);
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
    options.hysteresis
  );
});
app.delete("/devices", (req, res) => {
  handleApiRequests.devices.delete(req, res, devices);
});
app.put("/devices", (req, res) => {
  handleApiRequests.devices.put(req, res, devices);
});

//Decision backend loop.
setInterval(() => {
  makeDecisions(devices, newDevices, furnace, options, client);
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
