const mqtt = require("mqtt");
const express = require("express");
const app = express();
const Device = require("./classes/Device");
const NewDevice = require("./classes/NewDevice");
const fs = require("fs");
const cors = require("cors");
const schedule = require("node-schedule");
const { InfluxDB, Point, HttpError } = require("@influxdata/influxdb-client");

const corsOptions = {
  origin: "*",
};

app.use(express.json());
app.use(cors(corsOptions));

let devices = []; //Stores devices set by user.
const newdevices = []; //Stores devices that wait for setting up.
//default options
let options = {
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
const furnace = { on: 0, ip: "", alive: 0, timeStamp: 0 };
let options_set_by_user = true;

//Reading devices from file
try {
  devices = JSON.parse(
    fs.readFileSync("./server/data/devices.json", {
      encoding: "utf8",
      flag: "r",
    })
  );
} catch (e) {}

devices.forEach((device) => {
  device.opened = 0;
  device.alive = 0;
});

//Reading options from file
try {
  options = JSON.parse(
    fs.readFileSync("./server/data/options.json", {
      encoding: "utf8",
      flag: "r",
    })
  );
} catch (e) {
  options_set_by_user = false;
}

if (
  options.mqttaddress.substring(0, 7) !== "mqtt://" &&
  options.mqttaddress.substring(0, 8) !== "mqtts://"
) {
  console.log(
    "You forgot mqtt:// or mqtts:// in the begining of mqtt adress. Setting default."
  );
  options.mqttaddress = "mqtt://127.0.0.1";
}

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
  if (topic == options.mqtttopic) {
    const received = JSON.parse(message.toString());
    const current = devices.find((c) => c.id === received.id);
    if (!current) {
      const current = newdevices.find((c) => c.id === received.id);
      if (!current) {
        newdevices.push(new NewDevice(received));
      } else {
        current.ip = received.ip;
        current.temp = received.temp;
        current.opened = received.opened;
        current.timeStamp = received.timestamp;
        current.alive = 5;
      }
    } else {
      current.ip = received.ip;
      current.temp = received.temp;
      current.opened = received.opened;
      current.timeStamp = received.timestamp;
      current.alive = 5;
    }
  } else {
    const received = JSON.parse(message.toString());
    furnace.on = parseInt(received.on);
    furnace.ip = received.ip;
    furnace.timeStamp = received.timestamp;
    furnace.alive = 5;
  }
});

//Web backend
app.get("/devices", (req, res) => {
  res.send(devices);
});

app.get("/newdevices", (req, res) => {
  res.send(newdevices);
});

app.get("/options", (req, res) => {
  const response = { ...options };
  let temp = response.day.toString();
  if (temp.length === 3) temp = "0" + temp;
  response.day = temp.slice(0, 2) + ":" + temp.slice(2);
  temp = response.night.toString();
  if (temp.length === 3) temp = "0" + temp;
  response.night = temp.slice(0, 2) + ":" + temp.slice(2);
  res.send(response);
});

app.get("/options/set", (req, res) => {
  res.send(options_set_by_user);
});

app.get("/mqttConnected", (req, res) => {
  res.send(client.connected);
});

app.get("/furnace", (req, res) => {
  res.send(furnace);
});

app.get("/time", (req, res) => {
  const now = new Date(Date.now());
  let hours = now.getHours().toString();
  let minutes = now.getMinutes().toString();
  const dayOfWeek = now.getDay();
  if (minutes.length === 1) minutes = "0" + minutes;
  if (hours.length === 1) hours = "0" + hours;
  let time = hours + ":" + minutes;
  const response = {
    time: time,
    isNight: isnight(),
    dayOfWeek: dayOfWeek,
  };
  res.send(response);
});

app.put("/options", (req, res) => {
  if (req.body.day) {
    let day = req.body.day.replace(":", "");
    day = parseInt(day);
    if (day) options.day = day;
  }
  if (req.body.night) {
    let night = req.body.night.replace(":", "");
    night = parseInt(night);
    if (night) options.night = night;
  }
  if (req.body.hysteresis) {
    let hysteresis = req.body.hysteresis;
    if (typeof hysteresis === "string") {
      hysteresis = hysteresis.replace(",", ".");
    }
    hysteresis = parseFloat(hysteresis);
    if (hysteresis) options.hysteresis = hysteresis;
  }
  if (typeof req.body.mqttaddress === "string")
    options.mqttaddress = req.body.mqttaddress;
  if (typeof req.body.mqtttopic === "string")
    options.mqtttopic = req.body.mqtttopic;
  if (typeof req.body.mqttuser === "string")
    options.mqttuser = req.body.mqttuser;
  if (typeof req.body.mqttpassword === "string")
    options.mqttpassword = req.body.mqttpassword;
  if (typeof req.body.mqttfurnacetopic === "string")
    options.mqttfurnacetopic = req.body.mqttfurnacetopic;
  if (typeof req.body.usedb === "boolean") options.usedb = req.body.usedb;
  if (req.body.influxdb) {
    if (typeof req.body.influxdb.bucket === "string")
      options.influxdb.bucket = req.body.influxdb.bucket;
    if (typeof req.body.influxdb.organisation === "string")
      options.influxdb.organisation = req.body.influxdb.organisation;
    if (typeof req.body.influxdb.url === "string")
      options.influxdb.url = req.body.influxdb.url;
    if (typeof req.body.influxdb.key === "string")
      options.influxdb.key = req.body.influxdb.key;
  }
  fs.writeFile(
    "./server/data/options.json",
    JSON.stringify(options),
    function (err) {
      if (err) console.log(err);
      process.exit();
    }
  );
  const response = { ...options };
  let temp = response.day.toString();
  if (temp.length === 3) temp = "0" + temp;
  response.day = temp.slice(0, 2) + ":" + temp.slice(2);
  temp = response.night.toString();
  if (temp.length === 3) temp = "0" + temp;
  response.night = temp.slice(0, 2) + ":" + temp.slice(2);
  res.send(response);
});

app.post("/devices", (req, res) => {
  if (!req.body.id) return res.status(404).send({ error: 1 });
  if (!req.body.schedule) return res.status(404).send({ error: 2 });
  if (!req.body.name) return res.status(404).send({ error: 3 });

  const current = newdevices.find((c) => c.id === req.body.id);
  if (!current) return res.status(404).send({ error: 1 });
  const temp = new Device(current, req.body.schedule, req.body.name);
  newdevices.splice(newdevices.indexOf(current), 1);
  devices.push(temp);
  fs.writeFile(
    "./server/data/devices.json",
    JSON.stringify(devices),
    function (err) {
      if (err) console.log(err);
    }
  );
  client.publish(
    temp.id,
    "heartbeat:" + getSetTemp(temp) + ";" + options.hysteresis
  );
  res.send(temp);
});

app.delete("/devices", (req, res) => {
  if (!req.body.id) return res.status(404).send({ error: "No id specified!" });
  const current = devices.find((c) => c.id === req.body.id);
  if (!current)
    return res.status(404).send({ error: "No device with this id exists!" });
  devices.splice(devices.indexOf(current), 1);
  fs.writeFile(
    "./server/data/devices.json",
    JSON.stringify(devices),
    function (err) {
      if (err) console.log(err);
    }
  );
  res.send(current);
});

app.put("/devices", (req, res) => {
  if (!req.body.id) return res.status(404).send({ error: 1 });
  if (!req.body.schedule) return res.status(404).send({ error: 2 });
  if (!req.body.name) return res.status(404).send({ error: 3 });
  const current = devices.find((c) => c.id === req.body.id);
  if (!current) return res.status(404).send({ error: 4 });

  current.name = req.body.name;
  current.schedule = req.body.schedule;

  fs.writeFile(
    "./server/data/devices.json",
    JSON.stringify(devices),
    function (err) {
      if (err) console.log(err);
    }
  );
  res.send(current);
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
  for (let i = newdevices.length - 1; i >= 0; i -= 1) {
    if (newdevices[i].alive > 0) {
      newdevices[i].alive -= 1;
    } else {
      newdevices.splice(i, 1);
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
