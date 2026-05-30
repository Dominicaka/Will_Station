/*
Copyright (C) 2026 Yong Wang (Dominicaka)

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see Licenses.txt in the root directory.
*/

package main

import (
	"context"
	"embed"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
)

// 使用 Go 原生 embed 机制，将前端的所有 HTML、CSS、JS、字体和图标
// 在编译时 100% 封锁打包进单个 .exe 内部，运行时完全不依赖外部物理文件，彻底实现离线化。
//
//go:embed all:frontend
var assets embed.FS

// App 结构体定义了应用生命周期和本地桥接方法
type App struct {
	ctx context.Context
}

// NewApp 创建一个应用实例
func NewApp() *App {
	return &App{}
}

// startup 在应用启动时被调用，用来保存上下文
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

func main() {
	// 初始化应用实例
	app := NewApp()

	// 配置 Wails 运行参数，打造纯净的 Windows 原生独立桌面窗口
	err := wails.Run(&options.App{
		Title:             "Will Station",
		Width:             1024,
		Height:            768,
		MinWidth:          800,
		MinHeight:         600,
		DisableResize:     false,
		Fullscreen:        false,
		Frameless:         false, // 保持标准边框，确保拖拽、缩放及最大最小化完美兼容
		StartHidden:       false,
		HideWindowOnClose: false,
		BackgroundColour:  &options.RGBA{R: 255, G: 255, B: 255, A: 255},
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		OnStartup: app.startup,
		Bind: []interface{}{
			app, // 预留本地方法绑定槽位，当前纯前端 LocalStorage 已足够离线沙盒化运行
		},
		Windows: &windows.Options{
			WebviewIsTransparent: false,
			DisableWindowIcon:    false, // 绝不禁用图标，确保左上角完美显示
			Theme:                windows.SystemDefault,
			CustomTheme:          nil,
			Messages:             nil,
			ResizeDebounceMS:     0,
			OnSuspend:            nil,
			OnResume:             nil,
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}
