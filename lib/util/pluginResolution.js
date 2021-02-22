const pluginRE = /^(@kuma\/|kuma-|@[\w-]+(\.)?[\w-]+\/kuma-)cli-plugin-/;
const scopeRE = /^@[\w-]+(\.)?[\w-]+\//;

exports.isPlugin = id => pluginRE.test(id);

exports.toShortPluginId = id => id.replace(pluginRE, '');

exports.matchesPluginId = (input, full) => {
  const short = full.replace(pluginRE, '');
  return (
    // input is full
    full === input ||
    // input is short without scope
    short === input ||
    // input is short with scope
    short === input.replace(scopeRE, '')
  );
}
