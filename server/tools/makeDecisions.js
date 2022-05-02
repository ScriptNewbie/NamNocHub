const makeDecisions = (
  devices,
  newDevices,
  furnace,
  options,
  mqtt,
  getSetTemp
) => {
  //Returns number of active devices with opened valve.
  function howMany() {
    if (!devices[0]) return 0;
    let count = 0;
    for (let z = devices.length - 1; z >= 0; z -= 1) {
      count += parseInt(devices[z].opened);
    }
    return count;
  }

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
    mqtt.publish(options.mqttfurnacetopic + "/receive", "heartbeat");
    furnace.alive -= 1;
  } else furnace.on = 0;

  //If there is no devices with open valve turn off the furnace - it never happens in normal circumstances only eg. when last device with open valve loose connection.
  if (howMany() == 0 && furnace.on) {
    mqtt.publish(options.mqttfurnacetopic + "/receive", "off");
    furnace.on = 0;
  }

  let settemp;
  //Dealing with devices.
  for (let i = devices.length - 1; i >= 0; i -= 1) {
    if (devices[i].alive > 0) {
      devices[i].alive -= 1;
      //Setted temperature according to agenda.
      settemp = getSetTemp(devices[i]);
      //Heartbeat
      mqtt.publish(
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
          mqtt.publish(devices[i].id, "open");
          devices[i].opened = 1;
        }

        //Closing the valve or if last room turning off furnace. - we want to keep the heater valve in the last room open.
        else if (
          parseFloat(devices[i].temp) >
            parseFloat(settemp) + parseFloat(options.hysteresis) &&
          devices[i].opened == 1
        ) {
          if (howMany() == 1) {
            mqtt.publish(options.mqttfurnacetopic + "/receive", "off");
            furnace.on = 0;
          } else {
            mqtt.publish(devices[i].id, "close");
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
            mqtt.publish(devices[i].id, "open");
          }
          mqtt.publish(options.mqttfurnacetopic + "/receive", "on");
        }
      }
    } else {
      devices[i].opened = 0; //If device is not alive assume the valve is closed.
    }
  }
};

module.exports = makeDecisions;
