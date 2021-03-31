/**
 * @file run命令基础模板
 * @author xiek(285985285@qq.com)
 */

const Run = require('../baseCls/Run');

module.exports = {
  command: 'run <app-name> -- [args...]',
  description: '运行插件命令',
  option: [
    ['--dev', '开发模式，方便插件开发，使用本地link开发包运行'],
  ],
  allowUnknownOption: true,
  class: Run,
};
