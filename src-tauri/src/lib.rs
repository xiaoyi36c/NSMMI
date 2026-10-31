mod commands;
mod config;
mod game;
mod install;
mod mods;
mod paths;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
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
            commands::install,
            commands::uninstall,
            commands::launch_game,
            commands::open_folder,
            commands::open_mods_dir,
            commands::open_shaderfixes_dir,
            commands::list_mods,
            commands::toggle_mod
        ])
        .run(tauri::generate_context!())
        .expect("启动 NSMMI 失败");
}
