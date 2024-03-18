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
      return parseFloat(schedule.times[i].temp);
    }
  }
  return parseFloat(schedule.lastTemp);
}

module.exports = getSetTemp;
