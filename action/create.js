/**
* @file create命令基础模板
* @author xiek(285985285@qq.com)
*/

const Create = require('../baseCls/Create');

module.exports = {
  command: 'create <app-name>',
  description: '创建一个新的工程',
  option: [
    ['-s, --single', '创建一个单页应用'],
    ['-m, --multiple', '创建一个多页应用'],
    ['-g, --git [message]', '使用初始提交信息强制进行git初始化'],
    ['-n, --no-git', '跳过git初始化阶段'],
    ['-f, --force', '如果目标文件夹已存在强制覆写'],
    ['--merge', '如果目标文件夹已存在则合并（忽略已存在文件）'],
    ['--dev', '开发模式，优先使用本地link插件包'],
  ],
  class: Create,
};
