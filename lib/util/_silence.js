module.exports = function silence (logName, exports) {
  const logs = {};
  Object.keys(exports).forEach(key => {
    if (key !== 'error') {
      exports[key] = (...args) => {
        if (!logs[key]) logs[key] = [];
        logs[key].push(args);
      }
    }
  });
  // 导出所有操作和入参，但是未记录操作顺序，所以意义是啥？
  exports[logName] = logs;
}
