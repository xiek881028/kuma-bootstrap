/**
* @file add命令基础模板
* @author xiek(285985285@qq.com)
*/

const Add = require('../baseCls/Add');

module.exports = {
  command: 'add <plugin-name> [pluginOptions]',
  description: '添加一个插件',
  option: [
    ['--registry <url>', '指定安装依赖项时使用的源 (只针对npm有效)'],
    ['--dev', '开发模式，方便插件开发，会link本地开发包'],
  ],
  allowUnknownOption: true,
  class: Add,
};
