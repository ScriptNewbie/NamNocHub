const Device = class {
  constructor(data, schedule, name) {
    this.name = name;
    this.id = data.id;
    this.ip = data.ip;
    this.temp = data.temp;
    this.timeStamp = data.timeStamp;
    this.schedule = schedule;
    this.opened = data.opened;
    this.alive = data.alive;
  }
};

module.exports = Device;
