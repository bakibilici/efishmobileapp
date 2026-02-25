const { withAppBuildGradle } = require('@expo/config-plugins');

module.exports = function withAndroidSupportExclude(config) {
    return withAppBuildGradle(config, config => {
        if (config.modResults.language === 'groovy') {

            // Broaden the exclude to the whole group, removing any previous narrow excludes
            const regex = /configurations\.all\s*\{\s*exclude group: "com\.android\.support", module: "support-compat"\s*exclude group: "com\.android\.support", module: "versionedparcelable"\s*\}/;
            config.modResults.contents = config.modResults.contents.replace(regex, '');

            const snippet = `
configurations.all {
    exclude group: "com.android.support"
}
`;
            if (!config.modResults.contents.includes('exclude group: "com.android.support"')) {
                config.modResults.contents += snippet;
            }

            const packagingOptionsSnippet = `
android {
    packagingOptions {
        pickFirst 'META-INF/androidx.localbroadcastmanager_localbroadcastmanager.version'
        pickFirst 'META-INF/androidx.customview_customview.version'
        pickFirst 'META-INF/androidx.core_core.version'
        pickFirst 'META-INF/androidx.vectordrawable_vectordrawable.version'
    }
}
`;
            if (!config.modResults.contents.includes('pickFirst \'META-INF/androidx.localbroadcastmanager_localbroadcastmanager.version\'')) {
                config.modResults.contents += packagingOptionsSnippet;
            }
        }
        return config;
    });
};
