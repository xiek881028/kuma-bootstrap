/**
 * @file 脚手架命令基类
 * @author xiek(285985285@qq.com)
 */

const chalk = require('chalk');
const path = require('path');
const semver = require('semver');
const leven = require('leven');
const pkg = require('../package.json');

module.exports = class Cli {
  constructor(ops = {}) {
    const { needNodeVersion, packageName } = ops;
    this.checkNodeVersion(
      needNodeVersion ?? pkg.engines.node,
      packageName ?? pkg.name
    );

    this.bin = this.binName();
    this.command = this.register();

    const program = require('commander');

    const suggestCommands = unknownCommand => {
      const availableCommands = program.commands.map(cmd => cmd._name);

      let suggestion;

      availableCommands.forEach(cmd => {
        // 错误命令与标准命令最小路径 < 错误命令与空命令的最小路径
        const isBestMatch =
          leven(cmd, unknownCommand) < leven(suggestion || '', unknownCommand);
        if (leven(cmd, unknownCommand) < 3 && isBestMatch) {
          suggestion = cmd;
        }
      });

      if (suggestion) {
        console.log(
          `  ` + chalk.red(`您是否是想运行 ${chalk.yellow(suggestion)}？`)
        );
      }
    };

    program
      .version(`${pkg.name} ${pkg.version}`, '-v, --version', '查看版本')
      .helpOption('-h, --help', '获取帮助')
      .addHelpCommand('help [command]', '获取对应[command]命令的帮助信息')
      .usage('<command> [options]');

    for (const key in this.command) {
      // 特殊处理 class 和 action，其他循环处理
      const { class: Cls, action, ...keys } = this.command[key];
      let _program = program;
      for (const ops in keys) {
        if (Object.hasOwnProperty.call(keys, ops)) {
          const val = keys[ops];
          if (Array.isArray(val)) {
            val.map(item => (_program = _program[ops](...item)));
          } else if (typeof val === 'string') {
            _program = _program[ops](val);
          } else if (typeof val === 'function') {
            _program = _program[ops](val());
          } else if (val) {
            _program = _program[ops]();
          }
          _program.action((key, options) => {
            // class 与 action 二选一执行，action优先级高于class
            if (action) {
              (action ?? (() => {}))(key, options);
            } else {
              const cls = new Cls(key, options);
              cls.run(key, options);
            }
          });
        }
      }
      // const _program = program
      //   .command(el.command)
      //   .description(el.description)
      //   .action((key, options) => {
      //     // class 与 action 二选一执行，action优先级高于class
      //     if (el.action) {
      //       (el.action ?? (() => {}))(key, options);
      //     } else {
      //       const cls = new el.class({ key, options });
      //       cls.run({ key, options });
      //     }
      //   });
      // (el.options ?? []).map(item => _program.option(...item));
    }

    // 在用户输入未知命令时显示帮助信息
    program.on('command:*', ([cmd]) => {
      // program.outputHelp()
      console.log(`  ` + chalk.red(`未知的命令 ${chalk.yellow(cmd)}.`));
      console.log();
      suggestCommands(cmd);
      process.exitCode = 1;
    });

    program.on('--help', () => {
      console.log();
      console.log(
        `  运行 ${chalk.cyan(
          `${this.bin} <command> --help`
        )} 查看对应 command 的帮助信息。`
      );
      console.log();
    });

    program.commands.forEach(c => c.on('--help', () => console.log()));
    this.program = program;
  }

  register() {
    return {};
  }

  binName() {
    const scriptPath = process.argv[1];
    return (
      this.bin ||
      (scriptPath && path.basename(scriptPath, path.extname(scriptPath)))
    );
  }

  // node版本检测
  checkNodeVersion(wanted, id) {
    if (
      !semver.satisfies(process.version, wanted, { includePrerelease: true })
    ) {
      console.log(
        chalk.red(
          '您使用的Node版本为 ' +
            process.version +
            ', 但插件包 ' +
            id +
            ' 需要使用Node版本为 ' +
            wanted +
            '。\n请升级您的Node版本。'
        )
      );
      process.exit(1);
    }
  }

  run() {
    // 公用错误处理
    const enhanceErrorMessages = require('../lib/util/enhanceErrorMessages');

    enhanceErrorMessages('missingArgument', argName => {
      return `缺少必传配置项 ${chalk.yellow(`<${argName}>`)}.`;
    });

    enhanceErrorMessages('unknownOption', optionName => {
      return `未知的选项option ${chalk.yellow(optionName)}`;
    });

    enhanceErrorMessages('optionMissingArgument', (option, flag) => {
      return (
        `选项option 缺少必传配置项 ${chalk.yellow(option.flags)}` +
        (flag ? `, got ${chalk.yellow(flag)}` : ``)
      );
    });

    this.program.parse(process.argv);

    // 没有捕获参数直接输出帮助列表
    if (!process.argv.slice(2).length) {
      this.program.outputHelp();
    }
  }
};
