function isNight(options) {
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

module.exports = isNight;
