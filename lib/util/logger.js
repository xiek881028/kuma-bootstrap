const chalk = require('chalk');
// 裁剪字符串中的ansi码
const stripAnsi = require('strip-ansi');
const readline = require('readline');
const EventEmitter = require('events');

const { stopSpinner } = require('./spinner');

exports.events = new EventEmitter();

function _log (type, tag, message) {
  if (process.env.KUMA_CLI_API_MODE && message) {
    exports.events.emit('log', {
      message,
      type,
      tag
    });
  }
}

const format = (label, msg) => {
  return msg.split('\n').map((line, i) => {
    // 提示格式美化，padStart新方法get~
    return i === 0
      ? `${label} ${line}`
      : line.padStart(stripAnsi(label).length + line.length + 1);
  }).join('\n');
}

const chalkTag = msg => chalk.bgBlackBright.white.dim(` ${msg} `);

exports.log = (msg = '', tag = null) => {
  tag ? console.log(format(chalkTag(tag), msg)) : console.log(msg);
  _log('log', tag, msg);
}

exports.info = (msg, tag = null) => {
  console.log(format(chalk.bgBlue.black(' INFO ') + (tag ? chalkTag(tag) : ''), msg));
  _log('info', tag, msg);
}

exports.done = (msg, tag = null) => {
  console.log(format(chalk.bgGreen.black(' DONE ') + (tag ? chalkTag(tag) : ''), msg));
  _log('done', tag, msg);
}

exports.warn = (msg, tag = null) => {
  console.warn(format(chalk.bgYellow.black(' WARN ') + (tag ? chalkTag(tag) : ''), chalk.yellow(msg)));
  _log('warn', tag, msg);
}

exports.error = (msg, tag = null) => {
  stopSpinner();
  console.error(format(chalk.bgRed(' ERROR ') + (tag ? chalkTag(tag) : ''), chalk.red(msg)));
  _log('error', tag, msg);
  if (msg instanceof Error) {
    console.error(msg.stack);
    _log('error', tag, msg.stack);
  }
}

exports.clearConsole = title => {
  if (process.stdout.isTTY) {
    const blank = '\n'.repeat(process.stdout.rows);
    console.log(blank);
    readline.cursorTo(process.stdout, 0, 0);
    readline.clearScreenDown(process.stdout);
    if (title) {
      console.log(title);
    }
  }
}

// 测试模式下静默所有日志输出，怀疑是为了规整单元测试的输出
if (process.env.KUMA_TEST) {
  require('./_silence')('logs', exports);
}
