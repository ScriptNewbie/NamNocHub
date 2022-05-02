const NewDevice = class {
  constructor(data) {
    this.id = data.id;
    this.ip = data.ip;
    this.temp = data.temp;
    this.timeStamp = data.timestamp;
    this.opened = data.opened;
    this.alive = 5;
  }
};

module.exports = NewDevice;
