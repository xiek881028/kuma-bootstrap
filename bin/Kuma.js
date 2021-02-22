#!/usr/bin/env node

const chalk = require('chalk');
const semver = require('semver');
const leven = require('leven');
const pkg = require('../package.json');
const Create = require('./Create');

module.exports = class Cli {
  constructor(ops = {}) {
    const { needNodeVersion, packageName } = ops;
    this.checkNodeVersion(needNodeVersion ?? pkg.engines.node, packageName ?? pkg.name);

    this.cfg = this.config();

    const program = require('commander');

    const suggestCommands = (unknownCommand) => {
      const availableCommands = program.commands.map(cmd => cmd._name);

      let suggestion;

      availableCommands.forEach(cmd => {
        // 错误命令与标准命令最小路径 < 错误命令与空命令的最小路径
        const isBestMatch = leven(cmd, unknownCommand) < leven(suggestion || '', unknownCommand);
        if (leven(cmd, unknownCommand) < 3 && isBestMatch) {
          suggestion = cmd;
        }
      });

      if (suggestion) {
        console.log(`  ` + chalk.red(`您是否是想运行 ${chalk.yellow(suggestion)}？`));
      }
    };

    program
      .version(`${pkg.name} ${pkg.version}`, '-v, --version', '查看版本')
      .helpOption('-h, --help', '获取帮助')
      .addHelpCommand('help [command]', '获取对应[command]命令的帮助信息')
      .usage('<command> [options]');

    // console.log('this.cfg: ', this.cfg);
    for (const key in this.cfg) {
      const el = this.cfg[key];
      const _program = program
        .command(el.command)
        .description(el.description)
        .action((key, options) => {
          // class 与 action 二选一执行，class优先级高于action
          if (el.class) {
            const cls = new el.class({ key, options, config: el });
            cls.run({ key, options, config: el });
          } else {
            (el.action ?? (() => { }))(key, options);
          }
        });
      (el.options ?? []).map(item => _program.option(...item));
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
      console.log(`  运行 ${chalk.cyan(`${pkg.name} <command> --help`)} 查看对应 command 的帮助信息。`);
      console.log();
    });

    program.commands.forEach(c => c.on('--help', () => console.log()));
    this.program = program;
  }

  config() {
    return {
      create: {
        command: 'create <app-name>',
        description: '创建一个新的工程',
        options: [
          ['-g, --git [message]', '使用初始提交信息强制进行git初始化'],
          ['-f, --force', '如果目标文件夹已存在强制覆写'],
          ['--merge', '如果目标文件夹已存在则合并（忽略已存在文件）'],
        ],
        class: Create,
      },
      info: {
        command: 'info',
        description: '显示当前环境的调试信息',
        action: () => {
          console.log(chalk.bold('\n环境信息：'));
          require('envinfo').run(
            {
              System: ['OS', 'CPU', 'Memory'],
              Binaries: ['Node', 'Yarn', 'npm'],
              Browsers: ['Chrome', 'Edge', 'Firefox', 'Safari'],
              npmGlobalPackages: [`${pkg.name}`],
            },
            {
              showNotFound: true,
              duplicates: true,
              fullTree: true
            }
          ).then(console.log);
        },
      },
    };
  }

  // node版本检测
  checkNodeVersion(wanted, id) {
    if (!semver.satisfies(process.version, wanted, { includePrerelease: true })) {
      console.log(chalk.red(
        '您使用的Node版本为 ' + process.version + ', 但插件包 ' + id +
        ' 需要使用Node版本为 ' + wanted + '。\n请升级您的Node版本。'
      ));
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
      return `选项option 缺少必传配置项 ${chalk.yellow(option.flags)}` + (
        flag ? `, got ${chalk.yellow(flag)}` : ``
      );
    });

    this.program.parse(process.argv);

    // 没有捕获参数直接输出帮助列表
    if (!process.argv.slice(2).length) {
      this.program.outputHelp();
    }
  }
};
