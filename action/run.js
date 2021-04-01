/**
 * @file run命令基础模板
 * @author xiek(285985285@qq.com)
 */

const Run = require('../baseCls/Run');

module.exports = {
  command: 'run <app-name> -- [args...]',
  description: '运行插件命令',
  option: [
    ['--registry <url>', '指定安装依赖项时使用的源 (只针对npm有效)'],
    ['--dev', '开发模式，方便插件开发，使用本地link开发包运行'],
  ],
  allowUnknownOption: true,
  class: Run,
};
