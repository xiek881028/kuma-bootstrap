/**
 * @file info命令基础模板
 * @author xiek(285985285@qq.com)
 */

const chalk = require('chalk');
const pkg = require('../package.json');

module.exports = {
  command: 'run <app-name> -- [args...]',
  description: '运行插件命令',
  // options: [
  //   ['-- [args...]', '创建一个单页应用'],
  // ],
  action: (key, options) => {
    console.log('key: ', key);
  },
};
