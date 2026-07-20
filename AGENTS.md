先读一下 ./CLAUDE.md
如果终端里看到中文乱码，先用原始字节或 UTF-8 方式校验文件内容，不要直接判断文件编码有问题或文件已损坏
可用命令：
`[System.IO.File]::ReadAllBytes('.\\docs\\right_panel_doc_viewer_plan.md')[0..15] | ForEach-Object { $_.ToString('X2') }`
`[System.Text.Encoding]::UTF8.GetString([System.IO.File]::ReadAllBytes('.\\docs\\right_panel_doc_viewer_plan.md'))`
`$text = [System.IO.File]::ReadAllText('.\\docs\\right_panel_doc_viewer_plan.md',[System.Text.Encoding]::UTF8); $text.Contains('右栏文档查看器计划')`
