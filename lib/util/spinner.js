// 控制台显示信息控制插件
const ora = require('ora');
// 日志颜色控制插件
const chalk = require('chalk');

const spinner = ora();
let lastMsg = null;
let isPaused = false;

exports.logWithSpinner = (symbol, msg) => {
  if (!msg) {
    msg = symbol;
    symbol = chalk.green('✔');
  }
  if (lastMsg) {
    spinner.stopAndPersist({
      symbol: lastMsg.symbol,
      text: lastMsg.text,
    });
  }
  spinner.text = ' ' + msg
  lastMsg = {
    symbol: symbol + ' ',
    text: msg,
  };
  spinner.start();
}

exports.stopSpinner = (persist) => {
  if (!spinner.isSpinning) {
    return;
  }

  if (lastMsg && persist !== false) {
    spinner.stopAndPersist({
      symbol: lastMsg.symbol,
      text: lastMsg.text,
    });
  } else {
    spinner.stop();
  }
  lastMsg = null;
}

exports.pauseSpinner = () => {
  if (spinner.isSpinning) {
    spinner.stop();
    isPaused = true;
  }
}

exports.resumeSpinner = () => {
  if (isPaused) {
    spinner.start();
    isPaused = false;
  }
}

exports.failSpinner = (text) => {
  spinner.fail(text);
}

// 测试模式下静默所有日志输出，怀疑是为了规整单元测试的输出
if (process.env.KUMA_TEST) {
  require('./_silence')('spinner', exports);
}
