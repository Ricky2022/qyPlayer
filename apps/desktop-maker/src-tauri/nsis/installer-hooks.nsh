; 青云制作器的安装包常量。模板见 apps/desktop-common/nsis/installer.nsi。
; 本文件必须保存为带 BOM 的 UTF-8，否则 NSIS 会把中文当成乱码。
!define QY_NAME_ZH "青云制作器"
!define QY_NAME_EN "qyMaker"
; 制作器不关联文件类型，下面两个常量只是为了让模板里的文案定义完整
!define QY_FILETYPE_ZH "青云制作器文件"
!define QY_FILETYPE_EN "qyMaker file"
; 中文安装时协议页使用的文本：中文说明加英文原文，两个程序共用
!define QY_LICENSE_ZH "${__FILEDIR__}\..\..\..\desktop-common\nsis\license.zh-CN.txt"
