/// Tauri backend implementation for XMTP Bluesky Chat.
/// Implements the PlatformAPI contract defined in src/platform/types.ts.

use keyring::Entry;
use serde::{Deserialize, Serialize};
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_deep_link::DeepLinkExt;

const SERVICE_NAME: &str = "com.xmtp.bluesky-chat";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OAuthResult {
    pub code: String,
    pub state: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub iss: Option<String>,
}

/// Returns the current build mode based on compile-time configuration.
#[tauri::command]
fn get_build_mode() -> String {
    if cfg!(debug_assertions) {
        "development".to_string()
    } else {
        "production".to_string()
    }
}

/// Stores a value securely in the OS keychain.
#[tauri::command]
fn secure_store(key: String, value: String) -> Result<(), String> {
    let entry = Entry::new(SERVICE_NAME, &key).map_err(|e| e.to_string())?;
    entry.set_password(&value).map_err(|e| e.to_string())
}

/// Retrieves a value from the OS keychain.
/// Returns None if the key doesn't exist.
#[tauri::command]
fn secure_retrieve(key: String) -> Result<Option<String>, String> {
    let entry = Entry::new(SERVICE_NAME, &key).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(password) => Ok(Some(password)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Deletes a value from the OS keychain.
/// Succeeds even if the key doesn't exist (idempotent).
#[tauri::command]
fn secure_delete(key: String) -> Result<(), String> {
    let entry = Entry::new(SERVICE_NAME, &key).map_err(|e| e.to_string())?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

/// Opens the OAuth URL in a popup window.
/// The OAuth callback will be detected via URL navigation and emitted as an event.
#[tauri::command]
async fn open_oauth_window(app: tauri::AppHandle, url: String) -> Result<(), String> {
    let parsed_url = url::Url::parse(&url).map_err(|e| format!("Invalid URL: {}", e))?;

    let host = parsed_url.host_str().unwrap_or("");
    if !host.ends_with("bsky.social") && !host.ends_with("bsky.app") && !host.contains("atproto") {
        return Err(format!("Invalid OAuth domain: {}", host));
    }

    // Close any existing OAuth window
    if let Some(existing) = app.get_webview_window("oauth") {
        let _ = existing.close();
    }

    // Create OAuth popup window with navigation handler
    let app_handle = app.clone();

    // Get the main window to set as parent
    let main_window = app.get_webview_window("main");

    let mut builder = WebviewWindowBuilder::new(
        &app,
        "oauth",
        WebviewUrl::External(parsed_url),
    )
    .title("Sign in with Bluesky")
    .inner_size(600.0, 700.0)
    .min_inner_size(400.0, 500.0)
    .resizable(true)
    .center()
    .shadow(true)
    .focused(true);

    // Set parent window if available (makes it modal-like on macOS)
    #[cfg(target_os = "macos")]
    if let Some(parent) = main_window {
        builder = builder.parent(&parent).expect("Failed to set parent window");
    }

    let _oauth_window = builder.on_navigation(move |url: &url::Url| {
        let url_str = url.as_str();
        println!("[OAuth] Navigation to: {}", url_str);

        // Check if this is an OAuth callback (localhost redirect)
        if url_str.starts_with("http://127.0.0.1") && url_str.contains("code=") && url_str.contains("state=") {
            println!("[OAuth] Detected callback URL!");
            if let Some(oauth_result) = parse_oauth_callback(url_str) {
                println!("[OAuth] Parsed result - code: {}, state: {}", oauth_result.code, oauth_result.state);
                // Emit event to frontend
                match app_handle.emit("oauth-callback", oauth_result) {
                    Ok(_) => println!("[OAuth] Event emitted successfully"),
                    Err(e) => println!("[OAuth] Failed to emit event: {}", e),
                }

                // Close the OAuth window
                if let Some(window) = app_handle.get_webview_window("oauth") {
                    let _ = window.close();
                }
            }
            return false; // Don't navigate to the callback URL
        }

        true // Allow other navigation
    })
    .build()
    .map_err(|e| format!("Failed to create OAuth window: {}", e))?;

    Ok(())
}

/// Shows a native notification.
#[tauri::command]
fn show_notification(app: tauri::AppHandle, title: String, body: String) -> Result<(), String> {
    use tauri_plugin_notification::NotificationExt;

    app.notification()
        .builder()
        .title(&title)
        .body(&body)
        .show()
        .map_err(|e| e.to_string())
}

/// Sets the app badge count on macOS dock.
#[tauri::command]
fn set_badge_count(count: i32) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        use objc2::MainThreadMarker;
        use objc2_app_kit::NSApplication;
        use objc2_foundation::NSString;

        // Get main thread marker - this is safe because Tauri commands run on the main thread
        let mtm = unsafe { MainThreadMarker::new_unchecked() };

        let app = NSApplication::sharedApplication(mtm);
        let dock_tile = app.dockTile();

        if count > 0 {
            let badge_str = NSString::from_str(&count.to_string());
            dock_tile.setBadgeLabel(Some(&badge_str));
        } else {
            dock_tile.setBadgeLabel(None);
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = count;
        // Badge not supported on this platform
    }

    Ok(())
}

/// Parse OAuth callback URL and extract parameters
/// Handles both query string (?code=...) and fragment (#code=...) formats
fn parse_oauth_callback(url: &str) -> Option<OAuthResult> {
    let parsed = url::Url::parse(url).ok()?;

    // First try query parameters
    let mut params: std::collections::HashMap<_, _> = parsed.query_pairs().collect();

    // If no code in query, try parsing fragment as query string
    // OAuth can return params in fragment (after #) for implicit flow
    if !params.contains_key("code") {
        if let Some(fragment) = parsed.fragment() {
            // Parse fragment as if it were a query string
            let fragment_params: std::collections::HashMap<_, _> =
                url::form_urlencoded::parse(fragment.as_bytes()).collect();
            params = fragment_params;
        }
    }

    let code = params.get("code")?.to_string();
    let state = params.get("state")?.to_string();
    let iss = params.get("iss").map(|s| s.to_string());

    Some(OAuthResult { code, state, iss })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_deep_link::init())
        .setup(|app| {
            // Register deep link handler for OAuth callbacks (fallback)
            #[cfg(desktop)]
            {
                let handle = app.handle().clone();
                app.deep_link().on_open_url(move |event| {
                    for url in event.urls() {
                        let url_str = url.as_str();
                        // Check if this is an OAuth callback
                        if url_str.contains("code=") && url_str.contains("state=") {
                            if let Some(oauth_result) = parse_oauth_callback(url_str) {
                                // Emit event to frontend
                                let _ = handle.emit("oauth-callback", oauth_result);
                            }
                        }
                    }
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_build_mode,
            secure_store,
            secure_retrieve,
            secure_delete,
            open_oauth_window,
            show_notification,
            set_badge_count,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
