// buildSrc 是完全独立的 Gradle 构建：工程根目录 settings.gradle 里的仓库配置对它不生效。
//
// 不要在这里写 pluginManagement.repositories。Gradle 9 一旦发现自定义了插件仓库，
// 就把发行版自带的 kotlin-dsl 插件当成外部插件去解析（org.gradle.kotlin.kotlin-dsl 6.6.4）。
// 这个坐标要经过插件门户的跳转，跳转失败时整次构建报“插件不存在”。
// 正式包那次就是在这里失败的；调试包只是同一次解析碰巧成功。
//
// 依赖（kotlin-stdlib 等）改由下面的仓库直接解析，不再走插件门户的跳转。
dependencyResolutionManagement {
    repositories {
        mavenCentral()
        google()
    }
}
