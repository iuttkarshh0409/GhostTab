#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Emitter, Manager, WindowEvent,
};

/// When true, the window close request is a real exit (tray Exit), so the
/// close handler must not hide-to-tray.
static EXITING: AtomicBool = AtomicBool::new(false);

fn main() {
    tauri::Builder::default()
        // Enforce a single instance; a second launch focuses the running window.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let open = MenuItem::with_id(app, "open", "Open", true, None::<&str>)?;
            let toggle = MenuItem::with_id(app, "toggle", "Pause / Resume", true, None::<&str>)?;
            let exit = MenuItem::with_id(app, "exit", "Exit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &toggle, &exit])?;

            let mut builder = TrayIconBuilder::with_id("ghosttab-tray")
                .menu(&menu)
                .show_menu_on_left_click(true)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "open" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.unminimize();
                            let _ = window.set_focus();
                        }
                        let _ = app.emit("tray-menu", "open");
                    }
                    "toggle" => {
                        // Rust does NOT touch session records. It only asks the
                        // frontend to resolve pause/resume against the store.
                        let _ = app.emit("tray-menu", "resume");
                    }
                    "exit" => {
                        EXITING.store(true, Ordering::SeqCst);
                        app.exit(0);
                    }
                    _ => {}
                });

            if let Some(icon) = app.default_window_icon() {
                builder = builder.icon(icon.clone());
            }
            builder.build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                // Hide-to-tray unless the user explicitly chose Exit. Keeping
                // the WebView alive lets an ACTIVE session keep accumulating.
                // Note: genuine OS shutdown is not distinguished here (Tauri
                // does not expose WM_QUERYENDSESSION); recovery after restart is
                // still safe because session state is DB-authoritative.
                if !EXITING.load(Ordering::SeqCst) {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running GhostTab");
}
