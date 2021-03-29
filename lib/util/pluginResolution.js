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
};

exports.resolvePluginId = id => {
  // already full id
  // e.g. vue-cli-plugin-foo, @vue/cli-plugin-foo, @bar/vue-cli-plugin-foo
  if (pluginRE.test(id)) {
    return id;
  }

  // scoped short
  // e.g. @vue/foo, @bar/foo
  if (id.charAt(0) === '@') {
    const scopeMatch = id.match(scopeRE);
    if (scopeMatch) {
      const scope = scopeMatch[0];
      const shortId = id.replace(scopeRE, '');
      return `${scope}${scope === '@kuma/' ? `` : `kuma-`}cli-plugin-${shortId}`;
    }
  }
  // default short
  // e.g. foo
  return `kuma-cli-plugin-${id}`;
};
