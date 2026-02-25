const { withAppBuildGradle } = require('@expo/config-plugins');

module.exports = function withAndroidSupportExclude(config) {
    return withAppBuildGradle(config, config => {
        if (config.modResults.language === 'groovy') {
            const snippet = `
configurations.all {
    exclude group: "com.android.support", module: "support-compat"
    exclude group: "com.android.support", module: "versionedparcelable"
}
`;
            // Append snippet if it doesn't already exist
            if (!config.modResults.contents.includes('exclude group: "com.android.support"')) {
                config.modResults.contents += snippet;
            }
        }
        return config;
    });
};
