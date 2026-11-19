# Tauri 的 Android 层由 Rust 通过 JNI 按“类名 + 方法名”调用，混淆或改名后名字对不上，
# 应用会在启动时直接退出（R8 甚至会把 app.tauri.* 搬进应用的包名里）。这里全部保留原名。
-keep class app.tauri.** { *; }
-keep class io.github.ricky2022.qyplayer.** { *; }
-keepclassmembers class * { native <methods>; }

# 生成出来的 JNI 桥接代码和注解也要保留（Tauri 用注解收集插件与命令）
-keepattributes *Annotation*, Signature, InnerClasses, EnclosingMethod
