mod commands;
mod config;
mod debug;
mod game;
mod inject;
mod injector;
mod install;
mod keys;
mod launcher_ui;
mod loader;
mod mods;
mod net;
mod overlay;
mod paths;
mod shortcut;
mod spawn;
mod window;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_shortcuts(["ctrl+shift+h"])
                .expect("注册全局快捷键 Ctrl+Shift+H 失败")
                .with_handler(|app, _shortcut, event| {
                    if event.state() == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                        // handler 在主线程（事件循环）里执行，不能同步建窗，
                        // 否则与 toggle_overlay 一样会死锁；转发到后台线程。
                        let app = app.clone();
                        tauri::async_runtime::spawn(async move {
                            if let Err(e) = overlay::toggle(&app) {
                                eprintln!("切换悬浮窗失败: {}", e);
                            }
                        });
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            commands::app_info,
            commands::get_status,
            commands::detect_game,
            commands::pick_game_folder,
            commands::validate_game_root,
            commands::save_game_path,
            commands::get_wallpaper,
            commands::set_wallpaper,
            commands::pick_wallpaper,
            commands::wallpaper_titlebar_light,
            commands::get_ui_settings,
            commands::set_ui_settings,
            commands::get_debug_state,
            commands::set_debug_option,
            commands::send_game_key,
            commands::check_loader_update,
            commands::update_loader,
            commands::toggle_overlay,
            commands::read_loader_log,
            commands::list_dumps,
            commands::save_model_note,
            commands::install,
            commands::uninstall,
            commands::launch_game,
            commands::restore_loader,
            commands::get_launch_settings,
            commands::set_launch_settings,
            commands::get_inject_mode,
            commands::set_inject_mode,
            commands::get_injector_info,
            commands::open_folder,
            commands::open_mods_dir,
            commands::open_shaderfixes_dir,
            commands::list_mods,
            commands::toggle_mod,
            commands::create_desktop_shortcut
        ])
        .setup(|app| {
            // 初始化 3Dm 工作目录（%APPDATA%\NSMMI\Loader）：
            // 必须在任何命令使用 paths::d3m_dir() 之前完成，否则会退化成相对路径
            let loader_dir = paths::init_d3m_dir(app.handle());
            eprintln!("[nsmmi] 工作目录: {}", loader_dir.display());

            // 残留自愈：旧版把加载器拷进游戏目录，升级后启动时顺手清掉
            let cfg = config::load(app.handle());
            if let Some(root) = cfg.game_path.filter(|p| !p.is_empty()) {
                for line in inject::cleanup_legacy(std::path::Path::new(&root)) {
                    eprintln!("[nsmmi] {}", line);
                }
            }

            // 桌面快捷方式带 `--launch` 打开：等前端挂载并订阅事件后，
            // 通知它自动执行「启动游戏」（前端走同一套注入流程与日志）
            if std::env::args().any(|arg| arg == shortcut::LAUNCH_ARG) {
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(1500));
                    use tauri::Emitter;
                    if let Err(e) = handle.emit("auto-launch", ()) {
                        eprintln!("[nsmmi] 发送 auto-launch 事件失败: {}", e);
                    }
                });
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("启动 NSMMI 失败")
        .run(|_app, event| {
            // 退出前卸载注入钩子：否则 3dmloader 的互斥体会残留，
            // 下次启动游戏会报「注入器被占用」
            if let tauri::RunEvent::Exit = event {
                let _ = inject::stop();
            }
        });
}
