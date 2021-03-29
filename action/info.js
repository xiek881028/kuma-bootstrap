/**
* @file info命令基础模板
* @author xiek(285985285@qq.com)
*/

const chalk = require('chalk');
const pkg = require('../package.json');

module.exports = {
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
};
