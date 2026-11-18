; 青云播放器的安装包常量与钩子。模板见 apps/desktop-common/nsis/installer.nsi。
; 本文件必须保存为带 BOM 的 UTF-8，否则 NSIS 会把中文当成乱码。
!define QY_NAME_ZH "青云播放器"
!define QY_NAME_EN "qyPlayer"
!define QY_FILETYPE_ZH "青云播放器回忆影片"
!define QY_FILETYPE_EN "qyPlayer memory film"
; 中文安装时协议页使用的文本：中文说明加英文原文，两个程序共用
!define QY_LICENSE_ZH "${__FILEDIR__}\..\..\..\desktop-common\nsis\license.zh-CN.txt"

; 卸载（非升级）后清理 .qyp 文件关联和“打开方式”留下的注册表项
!macro NSIS_HOOK_POSTUNINSTALL
  ${If} $UpdateMode <> 1
    ReadRegStr $0 HKCU "Software\Classes\.qyp" ""
    ${If} $0 == ""
    ${OrIf} $0 == "qyPlayer.Film"
      DeleteRegKey HKCU "Software\Classes\.qyp"
    ${EndIf}
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.qyp\OpenWithProgids" "qyPlayer.Film"
    DeleteRegKey /ifempty HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.qyp\OpenWithProgids"
    DeleteRegKey HKCU "Software\Classes\Applications\${MAINBINARYNAME}.exe"
  ${EndIf}
!macroend
