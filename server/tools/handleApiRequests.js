const fs = require("fs");
const getSetTemp = require("./getSetTemp");
const isNight = require("./isNight");
const Device = require("../classes/Device");

const handleApiRequests = {
  options: {
    get: (req, res, options) => {
      const response = { ...options };
      let temp = response.day.toString();
      if (temp.length === 3) temp = "0" + temp;
      response.day = temp.slice(0, 2) + ":" + temp.slice(2);
      temp = response.night.toString();
      if (temp.length === 3) temp = "0" + temp;
      response.night = temp.slice(0, 2) + ":" + temp.slice(2);
      res.send(response);
    },
    put: (req, res, options) => {
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
    },
  },
  time: {
    get: (req, res, options) => {
      const now = new Date(Date.now());
      let hours = now.getHours().toString();
      let minutes = now.getMinutes().toString();
      const dayOfWeek = now.getDay();
      if (minutes.length === 1) minutes = "0" + minutes;
      if (hours.length === 1) hours = "0" + hours;
      let time = hours + ":" + minutes;
      const response = {
        time: time,
        isNight: isNight(options),
        dayOfWeek: dayOfWeek,
      };
      res.send(response);
    },
  },
  devices: {
    post: (req, res, devices, newDevices, mqtt, hysteresis) => {
      if (!req.body.id) return res.status(404).send({ error: 1 });
      if (!req.body.schedule) return res.status(404).send({ error: 2 });
      if (!req.body.name) return res.status(404).send({ error: 3 });

      const current = newDevices.find((c) => c.id === req.body.id);
      if (!current) return res.status(404).send({ error: 1 });
      const temp = new Device(current, req.body.schedule, req.body.name);
      newDevices.splice(newDevices.indexOf(current), 1);
      devices.push(temp);
      fs.writeFile(
        "./server/data/devices.json",
        JSON.stringify(devices),
        function (err) {
          if (err) console.log(err);
        }
      );
      mqtt.publish(temp.id, "heartbeat:" + getSetTemp(temp) + ";" + hysteresis);
      res.send(temp);
    },
    delete: (req, res, devices) => {
      if (!req.body.id)
        return res.status(404).send({ error: "No id specified!" });
      const current = devices.find((c) => c.id === req.body.id);
      if (!current)
        return res
          .status(404)
          .send({ error: "No device with this id exists!" });
      devices.splice(devices.indexOf(current), 1);
      fs.writeFile(
        "./server/data/devices.json",
        JSON.stringify(devices),
        function (err) {
          if (err) console.log(err);
        }
      );
      res.send(current);
    },
    put: (req, res, devices) => {
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
    },
  },
};

module.exports = handleApiRequests;
