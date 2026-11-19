// buildSrc 是完全独立的 Gradle 构建：工程根目录 settings.gradle 里的仓库配置对它不生效。
//
// kotlin-dsl 插件自身要拉 kotlin-stdlib、kotlin-gradle-plugin 等构件，而默认只有插件门户
// （plugins.gradle.org 会把请求跳到 Maven Central，跳转后取不到元数据）。这里补上 Maven Central
// 和 Google，插件门户放在最后用来解析插件本身。
pluginManagement {
    repositories {
        mavenCentral()
        google()
        gradlePluginPortal()
    }
}
