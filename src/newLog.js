class Logger {
  constructor(index) {
    this.index = index;
  }

  sendLogToMainProcess(level, message) {
    process.send({
      type: "log",
      pid: this.index,
      level: level,
      msg: message,
    });
  }

  debug(message) {
    this.sendLogToMainProcess("debug", message);
  }

  success(message) {
    this.sendLogToMainProcess("info", message);
  }

  info(message) {
    this.sendLogToMainProcess("info", message);
  }

  error(message) {
    this.sendLogToMainProcess("error", message);
  }

  warn(message) {
    this.sendLogToMainProcess("warn", message);
  }
}

module.exports = { Logger };
